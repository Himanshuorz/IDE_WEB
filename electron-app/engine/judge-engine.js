const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");

class JudgeEngine {
  constructor() {
    this.sessions = new Map();
    this.defaultRunTimeoutMs = 0;
  }

  async start(job, emit) {
    const jobId = randomUUID();
    const lang = this.resolveLanguage(job?.language);
    const code = typeof job?.code === "string" ? job.code : "";
    const initialInput = typeof job?.stdin === "string" ? job.stdin : "";
    const workspacePath = typeof job?.workspacePath === "string" ? job.workspacePath : "";
    const autoCloseStdin = job?.autoCloseStdin !== false && lang === "javascript";

    if (!code.trim()) {
      throw new Error("No source code provided.");
    }

    const sandboxRoot = path.join(os.tmpdir(), "electron-judge");
    const workDir = path.join(sandboxRoot, `job-${jobId}`);
    await fs.mkdir(workDir, { recursive: true });

    try {
      if (lang === "sql") {
        return await this._runSqlite(code, workDir, jobId, emit);
      }

      if (lang === "pgsql") {
        return await this._runPostgres(code, workDir, jobId, emit);
      }

      const sourceName = lang === "c" ? "main.c" : lang === "python" ? "main.py" : "main.cpp";
      const sourcePath = path.join(workDir, sourceName);
      await fs.writeFile(sourcePath, code, "utf8");

      if (lang === "python") {
        const child = this.spawnInteractive("python", [sourcePath], { cwd: workDir, workspacePath, sourceFileName: sourceName }, jobId, lang, emit, { autoCloseStdin: false });
        if (initialInput) {
          child.stdin.write(initialInput.endsWith("\n") ? initialInput : `${initialInput}\n`);
        }

        return {
          completed: false,
          engine: "local-judge",
          language: lang,
          sessionId: jobId,
          status: "Running",
        };
      }

      if (lang === "javascript") {
        const child = this.spawnInteractive("node", [sourcePath], { cwd: workDir, workspacePath, sourceFileName: sourceName }, jobId, lang, emit, { autoCloseStdin });
        if (initialInput) {
          child.stdin.write(initialInput.endsWith("\n") ? initialInput : `${initialInput}\n`);
          if (autoCloseStdin) {
            child.stdin.end();
          }
        }

        return {
          completed: false,
          engine: "local-judge",
          language: lang,
          sessionId: jobId,
          status: "Running",
        };
      }

      const outputName = process.platform === "win32" ? "program.exe" : "program.out";
      const outputPath = path.join(workDir, outputName);
      const compileArgs = lang === "c"
        ? ["-x", "c", sourcePath, "-O2", "-std=gnu11", "-o", outputPath]
        : [sourcePath, "-O2", "-std=c++17", "-o", outputPath];

      const compile = await this.runProcess("g++", compileArgs, {
        cwd: workDir,
        timeoutMs: 20000,
      });

      if (compile.code !== 0) {
        return {
          completed: true,
          engine: "local-judge",
          language: lang,
          exitCode: compile.code,
          stdout: "",
          stderr: "",
          compileStdout: compile.stdout,
          compileStderr: compile.stderr,
          status: "Compilation Error",
        };
      }

      const child = this.spawnInteractive(outputPath, [], { cwd: workDir, workspacePath, sourceFileName: sourceName }, jobId, lang, emit, { autoCloseStdin: false });
      if (initialInput) {
        child.stdin.write(initialInput.endsWith("\n") ? initialInput : `${initialInput}\n`);
      }

      return {
        completed: false,
        engine: "local-judge",
        language: lang,
        compileStdout: compile.stdout || "",
        compileStderr: compile.stderr || "",
        sessionId: jobId,
        status: "Running",
      };
    } finally {
      // Cleanup is done when interactive process exits.
      if (!this.sessions.has(jobId)) {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  resolveLanguage(language) {
    if (language === "c") {
      return "c";
    }

    if (language === "python") {
      return "python";
    }

    if (language === "javascript" || language === "js") {
      return "javascript";
    }

    if (language === "sql" || language === "sqlite") {
      return "sql";
    }

    if (language === "pgsql" || language === "postgres" || language === "postgresql") {
      return "pgsql";
    }

    return "cpp";
  }

  /**
   * Runs SQL against an ephemeral in-memory DB via the sqlite3 CLI.
   */
  async _runSqlite(code, workDir, jobId, emit) {
    const stdin = code.endsWith("\n") ? code : `${code}\n`;
    try {
      const r = await this.runProcess("sqlite3", [":memory:"], {
        cwd: workDir,
        stdin,
        timeoutMs: 120000,
      });
      if (r.stdout) {
        emit({ type: "stdout", sessionId: jobId, text: r.stdout });
      }
      if (r.stderr) {
        emit({ type: "stderr", sessionId: jobId, text: r.stderr });
      }
      emit({
        type: "exit",
        sessionId: jobId,
        exitCode: r.code,
        status: r.code === 0 ? "Accepted" : "Runtime Error",
      });
      return {
        completed: true,
        engine: "local-judge",
        language: "sql",
        exitCode: r.code,
        stdout: r.stdout || "",
        stderr: r.stderr || "",
        status: r.code === 0 ? "Accepted" : "Runtime Error",
      };
    } catch (err) {
      const msg = err?.message || String(err);
      const hint =
        /ENOENT|spawn/i.test(msg)
          ? "Install the SQLite command-line tool (sqlite3) and ensure it is on your PATH.\n"
          : "";
      const full = `${msg}\n${hint}`;
      emit({ type: "stderr", sessionId: jobId, text: full });
      emit({ type: "exit", sessionId: jobId, exitCode: 1, status: "Runtime Error" });
      return {
        completed: true,
        engine: "local-judge",
        language: "sql",
        exitCode: 1,
        stdout: "",
        stderr: full,
        status: "Runtime Error",
      };
    }
  }

  /**
   * Runs SQL against PostgreSQL using psql. Requires DATABASE_URL or WEBIDE_DATABASE_URL.
   */
  async _runPostgres(code, workDir, jobId, emit) {
    const conn = String(process.env.WEBIDE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
    if (!conn) {
      const err =
        "PostgreSQL: set WEBIDE_DATABASE_URL or DATABASE_URL (example: postgresql://user:pass@localhost:5432/dbname)\n";
      emit({ type: "stderr", sessionId: jobId, text: err });
      emit({ type: "exit", sessionId: jobId, exitCode: 1, status: "Configuration Error" });
      return {
        completed: true,
        engine: "local-judge",
        language: "pgsql",
        exitCode: 1,
        stdout: "",
        stderr: err,
        status: "Configuration Error",
      };
    }

    const sqlPath = path.join(workDir, "query.sql");
    await fs.writeFile(sqlPath, code, "utf8");

    try {
      const r = await this.runProcess("psql", ["-v", "ON_ERROR_STOP=1", "-f", sqlPath, conn], {
        cwd: workDir,
        timeoutMs: 120000,
      });
      if (r.stdout) {
        emit({ type: "stdout", sessionId: jobId, text: r.stdout });
      }
      if (r.stderr) {
        emit({ type: "stderr", sessionId: jobId, text: r.stderr });
      }
      emit({
        type: "exit",
        sessionId: jobId,
        exitCode: r.code,
        status: r.code === 0 ? "Accepted" : "Runtime Error",
      });
      return {
        completed: true,
        engine: "local-judge",
        language: "pgsql",
        exitCode: r.code,
        stdout: r.stdout || "",
        stderr: r.stderr || "",
        status: r.code === 0 ? "Accepted" : "Runtime Error",
      };
    } catch (err) {
      const msg = err?.message || String(err);
      const hint =
        /ENOENT|spawn/i.test(msg)
          ? "Install PostgreSQL client tools (psql) and ensure they are on your PATH.\n"
          : "";
      const full = `${msg}\n${hint}`;
      emit({ type: "stderr", sessionId: jobId, text: full });
      emit({ type: "exit", sessionId: jobId, exitCode: 1, status: "Runtime Error" });
      return {
        completed: true,
        engine: "local-judge",
        language: "pgsql",
        exitCode: 1,
        stdout: "",
        stderr: full,
        status: "Runtime Error",
      };
    }
  }

  spawnInteractive(command, args, options, sessionId, language, emit, sessionOptions = {}) {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
    });

    const session = {
      sessionId,
      language,
      workDir: options.cwd,
      child,
      autoCloseStdin: sessionOptions.autoCloseStdin === true,
    };

    this.sessions.set(sessionId, session);

    const timeout = this.defaultRunTimeoutMs > 0
      ? setTimeout(() => {
          const active = this.sessions.get(sessionId);
          if (!active) {
            return;
          }

          emit({ type: "stderr", sessionId, text: `Process timed out after ${this.defaultRunTimeoutMs}ms.\n` });
          active.child.kill();
        }, this.defaultRunTimeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      emit({ type: "stdout", sessionId, text: chunk.toString() });
    });

    child.stderr.on("data", (chunk) => {
      emit({ type: "stderr", sessionId, text: chunk.toString() });
    });

    child.on("error", async (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      emit({ type: "stderr", sessionId, text: `${error.message || String(error)}\n` });
      emit({ type: "exit", sessionId, exitCode: -1, status: "Runtime Error" });
      this.sessions.delete(sessionId);
      await fs.rm(options.cwd, { recursive: true, force: true }).catch(() => {});
    });

    child.on("close", async (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      emit({
        type: "exit",
        sessionId,
        exitCode: code,
        status: code === 0 ? "Accepted" : "Runtime Error",
      });

      this.sessions.delete(sessionId);

      // Copy any files the program created back to the workspace
      if (options.workspacePath) {
        await this._copyNewFilesToWorkspace(options.cwd, options.workspacePath, options.sourceFileName).catch(() => {});
      }

      await fs.rm(options.cwd, { recursive: true, force: true }).catch(() => {});
    });

    return child;
  }

  sendInput(sessionId, text) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("No active run session found.");
    }

    const payload = text.endsWith("\n") ? text : `${text}\n`;
    session.child.stdin.write(payload);

    if (session.autoCloseStdin) {
      session.child.stdin.end();
    }

    return { ok: true };
  }

  stopSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { ok: true };
    }

    session.child.kill();
    this.sessions.delete(sessionId);
    return { ok: true };
  }

  runProcess(command, args, options = {}) {
    const { cwd, stdin = "", timeoutMs = 10000 } = options;

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let finished = false;

      const timeout = setTimeout(() => {
        if (finished) {
          return;
        }

        finished = true;
        child.kill();
        reject(new Error(`${command} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code) => {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(timeout);
        resolve({ code, stdout, stderr });
      });

      if (stdin) {
        child.stdin.write(stdin);
      }

      child.stdin.end();
    });
  }

  /**
   * Copies files created by the program in the sandbox back to the workspace.
   * Skips the source file, compiled binary, and any pre-existing engine files.
   */
  async _copyNewFilesToWorkspace(sandboxDir, workspacePath, sourceFileName) {
    const builtinNames = new Set([
      sourceFileName,        // e.g. main.cpp
      "main.c",
      "main.cpp",
      "main.py",
      "query.sql",
      "program.exe",
      "program.out",
    ]);

    let entries;
    try {
      entries = await fs.readdir(sandboxDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      if (builtinNames.has(entry.name)) continue;

      const srcPath  = path.join(sandboxDir, entry.name);
      const destPath = path.join(workspacePath, entry.name);
      try {
        await fs.copyFile(srcPath, destPath);
      } catch (e) {
        console.error(`[JudgeEngine] Failed to copy ${entry.name} to workspace:`, e.message);
      }
    }
  }

  shutdown() {
    for (const session of this.sessions.values()) {
      session.child.kill();
    }
    this.sessions.clear();
  }
}

module.exports = {
  JudgeEngine,
};
