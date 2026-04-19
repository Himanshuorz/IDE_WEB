/* eslint-disable no-restricted-globals */

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

self.onmessage = async (event) => {
  const { id, code, type } = event.data;

  if (type === "init") {
    self.postMessage({ type: "ready" });
    return;
  }

  if (type === "exec") {
    currentRunId = id;
    try {
      self.postMessage({ id, type: "stdout", text: `[JS Worker] Starting execution...` });
      
      // We use an AsyncFunction to allow top-level await if needed
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const executable = new AsyncFunction(code);
      
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
