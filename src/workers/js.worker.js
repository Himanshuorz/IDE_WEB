/* eslint-disable no-restricted-globals */
import ts from "typescript";

// Intercept console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

let currentRunId = null;

function sendOutput(type, ...args) {
  const text = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  self.postMessage({
    id: currentRunId,
    type: type,
    text: text
  });
}

console.log = (...args) => sendOutput("stdout", ...args);
console.info = (...args) => sendOutput("stdout", ...args);
console.warn = (...args) => sendOutput("stderr", ...args);
console.error = (...args) => sendOutput("stderr", ...args);

function transpileTypeScript(code) {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: false,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });

  const diagnostics = result.diagnostics || [];
  const blockingDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (blockingDiagnostics.length > 0) {
    const message = blockingDiagnostics.map((diagnostic) => {
      const rendered = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      if (!diagnostic.file || typeof diagnostic.start !== "number") {
        return rendered;
      }

      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `TS${diagnostic.code} (${line + 1},${character + 1}): ${rendered}`;
    }).join("\n");

    throw new Error(message);
  }

  return result.outputText;
}

self.onmessage = async (event) => {
  const { id, code, type, lang } = event.data;

  if (type === "init") {
    self.postMessage({ type: "ready" });
    return;
  }

  if (type === "exec") {
    currentRunId = id;
    try {
      const effectiveCode = lang === "typescript" ? transpileTypeScript(code) : code;
      self.postMessage({
        id,
        type: "stdout",
        text: lang === "typescript"
          ? "[JS Worker] Transpiling TypeScript and starting execution..."
          : "[JS Worker] Starting execution...",
      });
      
      // We use an AsyncFunction to allow top-level await if needed
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const executable = new AsyncFunction(effectiveCode);
      
      await executable();
      
      self.postMessage({ id, type: "done" });
    } catch (error) {
      self.postMessage({ id, type: "stderr", text: error.stack || error.message });
      self.postMessage({ id, type: "done", error: error.message });
    } finally {
      currentRunId = null;
    }
  }
};
