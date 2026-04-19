/* eslint-disable no-restricted-globals */

let currentRunId = null;

// ── Console interception ─────────────────────────────────────────────────────
function sendOutput(type, ...args) {
  const text = args.map((arg) => {
    if (arg === null) return "null";
    if (arg === undefined) return "undefined";
    if (typeof arg === "object") {
      try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
    }
    return String(arg);
  }).join(" ");

  self.postMessage({ id: currentRunId, type, text });
}

console.log   = (...args) => sendOutput("stdout", ...args);
console.info  = (...args) => sendOutput("stdout", ...args);
console.warn  = (...args) => sendOutput("stderr", ...args);
console.error = (...args) => sendOutput("stderr", ...args);

// ── TypeScript transpiler (loaded on-demand, only for .ts files) ─────────────
async function transpileTypeScript(code) {
  // Dynamically import typescript — only when we actually need it.
  // Static top-level import crashes browser Workers because `typescript`
  // ships as a CommonJS bundle that is incompatible with ES-module Workers.
  let ts;
  try {
    const mod = await import("typescript");
    ts = mod.default ?? mod;
  } catch (e) {
    throw new Error(
      "TypeScript compiler could not be loaded in this browser environment. " +
      "Rename your file to .js to run it as plain JavaScript."
    );
  }

  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,  // CommonJS keeps top-level await working via AsyncFunction
      strict: false,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });

  const blockingErrors = (result.diagnostics || []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error,
  );

  if (blockingErrors.length > 0) {
    const msg = blockingErrors.map((d) => {
      const text = ts.flattenDiagnosticMessageText(d.messageText, "\n");
      if (!d.file || typeof d.start !== "number") return text;
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      return `TS${d.code} (${line + 1},${character + 1}): ${text}`;
    }).join("\n");
    throw new Error(msg);
  }

  return result.outputText;
}

// ── Worker message handler ───────────────────────────────────────────────────
self.onmessage = async (event) => {
  const { id, code, type, lang } = event.data;

  // Handshake — always reply "ready" immediately; no heavy init needed for JS
  if (type === "init") {
    self.postMessage({ type: "ready" });
    return;
  }

  if (type === "exec") {
    currentRunId = id;
    try {
      let executableCode = code;

      if (lang === "typescript") {
        self.postMessage({
          id,
          type: "stdout",
          text: "[JS Worker] Transpiling TypeScript…",
        });
        executableCode = await transpileTypeScript(code);
      } else {
        self.postMessage({
          id,
          type: "stdout",
          text: "[JS Worker] Starting JavaScript execution…",
        });
      }

      // AsyncFunction lets user code use top-level await
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      await new AsyncFunction(executableCode)();

      self.postMessage({ id, type: "done" });
    } catch (error) {
      self.postMessage({ id, type: "stderr", text: error.stack || error.message });
      self.postMessage({ id, type: "done", error: error.message });
    } finally {
      currentRunId = null;
    }
  }
};
