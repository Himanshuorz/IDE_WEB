import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const runtime = "nodejs";

function runProcess(command, args, options = {}) {
  const {
    cwd,
    stdin = "",
    timeoutMs = 10000,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
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
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (finished) return;
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

export async function POST(request) {
  let workDir;

  try {
    const body = await request.json();
    const lang = body?.lang === "c" ? "c" : "cpp";
    const code = typeof body?.code === "string" ? body.code : "";
    const stdin = typeof body?.stdin === "string" ? body.stdin : "";

    if (!code.trim()) {
      return NextResponse.json(
        { ok: false, error: "No source code provided." },
        { status: 400 },
      );
    }

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "webide-cpp-"));
    const sourceName = lang === "c" ? "main.c" : "main.cpp";
    const outputName = process.platform === "win32" ? "program.exe" : "program.out";
    const sourcePath = path.join(workDir, sourceName);
    const outputPath = path.join(workDir, outputName);

    await fs.writeFile(sourcePath, code, "utf8");

    const compileArgs = lang === "c"
      ? ["-x", "c", sourcePath, "-O2", "-std=gnu11", "-o", outputPath]
      : [sourcePath, "-O2", "-std=c++17", "-o", outputPath];

    const compileResult = await runProcess("g++", compileArgs, {
      cwd: workDir,
      timeoutMs: 20000,
    });

    if (compileResult.code !== 0) {
      return NextResponse.json({
        ok: false,
        error: compileResult.stderr || "Compilation failed.",
        compileStdout: compileResult.stdout,
        compileStderr: compileResult.stderr,
      });
    }

    const runResult = await runProcess(outputPath, [], {
      cwd: workDir,
      stdin,
      timeoutMs: 10000,
    });

    return NextResponse.json({
      ok: runResult.code === 0,
      exitCode: runResult.code,
      compileStdout: compileResult.stdout,
      compileStderr: compileResult.stderr,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      error: runResult.code === 0 ? null : (runResult.stderr || `Program exited with code ${runResult.code}.`),
      runId: randomUUID(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 },
    );
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
