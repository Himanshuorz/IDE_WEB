import { InputBuffer } from "./input-buffer";
import {
  getPythonWorker,
  getJsWorker,
  getSqliteWorker,
  getPgliteWorker,
  getCCppWorker,
  getFullCppWorker,
} from "./worker-factory";

export class ExecutionRouter {
  constructor(onOutput) {
    this.onOutput = onOutput;
    this.workers = {};
    this.workerReadyPromises = {};
    this.runningWorkers = new Set();
    this.currentRunId = 0;
    this.inputBuffer = new InputBuffer();
  }

  resolveWorkerSpec(lang, options = {}) {
    if ((lang === "c" || lang === "cpp") && options.cppMode === "full") {
      return { key: "cpp-full", label: "cpp" };
    }

    return { key: lang, label: lang };
  }

  getWorker(workerKey) {
    if (this.workers[workerKey]) {
      return this.workers[workerKey];
    }

    if (typeof window === "undefined") {
      return null;
    }

    let workerFile;
    if (workerKey === "python") {
      workerFile = getPythonWorker();
    } else if (workerKey === "javascript" || workerKey === "typescript") {
      workerFile = getJsWorker();
    } else if (workerKey === "sql") {
      workerFile = getSqliteWorker();
    } else if (workerKey === "pgsql") {
      workerFile = getPgliteWorker();
    } else if (workerKey === "c" || workerKey === "cpp") {
      workerFile = getCCppWorker();
    } else if (workerKey === "cpp-full") {
      workerFile = getFullCppWorker();
    } else {
      throw new Error(`Unsupported language: ${workerKey}`);
    }

    workerFile.onmessage = (event) => this.handleMessage(workerKey, event.data);
    workerFile.onerror = (event) => {
      this.onOutput({ type: "error", text: `Worker Error: ${event.message}` });
    };

    this.workers[workerKey] = workerFile;
    return workerFile;
  }

  ensureWorkerReady(workerKey) {
    if (this.workerReadyPromises[workerKey]) {
      return this.workerReadyPromises[workerKey];
    }

    const worker = this.getWorker(workerKey);

    this.workerReadyPromises[workerKey] = new Promise((resolve, reject) => {
      const handleReady = (event) => {
        const { type, error } = event.data || {};

        if (type === "ready") {
          cleanup();
          resolve(worker);
        } else if (type === "error") {
          cleanup();
          reject(new Error(error || `Failed to initialize ${workerKey} runtime.`));
        }
      };

      const cleanup = () => {
        worker.removeEventListener("message", handleReady);
      };

      worker.addEventListener("message", handleReady);
      worker.postMessage({
        type: "init",
        buffer: this.inputBuffer.getBuffer(),
      });
    }).catch((error) => {
      delete this.workerReadyPromises[workerKey];
      throw error;
    });

    return this.workerReadyPromises[workerKey];
  }

  handleMessage(workerKey, data) {
    const { type, text, error } = data;
    const displayLabel = workerKey === "cpp-full" ? "cpp" : workerKey;

    if (type === "stdout" || type === "stderr" || type === "system") {
      this.onOutput({
        type: type === "stderr" ? "error" : "system",
        text,
      });
    } else if (type === "done") {
      this.runningWorkers.delete(workerKey);
      this.onOutput({ type: "system", text: `[${displayLabel}] Execution finished.` });
      if (error) {
        this.onOutput({ type: "error", text: `Error: ${error}` });
      }
    } else if (type === "ready") {
      this.onOutput({ type: "system", text: `[${displayLabel}] Runtime initialized and ready.` });
    } else if (type === "error") {
      this.runningWorkers.delete(workerKey);
      this.onOutput({ type: "error", text: error || `Failed to initialize ${displayLabel} runtime.` });
    } else if (type === "input_request") {
      this.onOutput({ type: "input_request" });
    }
  }

  provideInput(text) {
    if (this.inputBuffer) {
      this.inputBuffer.writeInput(`${text}\n`);
    }
  }

  async runCode(lang, code, options = {}) {
    this.currentRunId += 1;
    const runId = this.currentRunId;
    const workerSpec = this.resolveWorkerSpec(lang, options);
    const modeSuffix = options.cppMode === "full" && (lang === "c" || lang === "cpp")
      ? " (full mode)"
      : "";

    try {
      if (this.runningWorkers.has(workerSpec.key)) {
        this.onOutput({
          type: "error",
          text: `[${lang}] A run is already in progress${modeSuffix}. Wait for it to finish or press Stop.`,
        });
        return;
      }

      this.onOutput({ type: "run", text: `> Starting ${lang} execution${modeSuffix}...` });

      const worker = await this.ensureWorkerReady(workerSpec.key);
      this.runningWorkers.add(workerSpec.key);
      worker.postMessage({
        type: "exec",
        id: runId,
        lang,
        code,
        buffer: this.inputBuffer.getBuffer(),
      });
    } catch (error) {
      this.onOutput({ type: "error", text: error.message });
    }
  }

  stopAll() {
    for (const lang in this.workers) {
      this.workers[lang].terminate();
      delete this.workers[lang];
      delete this.workerReadyPromises[lang];
      this.runningWorkers.delete(lang);
      this.onOutput({ type: "system", text: `[${lang}] Worker terminated.` });
    }
  }
}
