/* eslint-disable no-restricted-globals */

// Inlined readInputSync to avoid ES6 module import, allowing this to run as a classic worker from /public
function readInputSync(buffer) {
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0);
  const length = view[1];
  const uint8View = new Uint8Array(buffer, 8, length);
  const copy = new Uint8Array(uint8View);
  const decoder = new TextDecoder();
  const text = decoder.decode(copy);
  Atomics.store(view, 0, 0);
  return text;
}

let pyodideReadyPromise;
let inputBuffer = null;

async function loadPyodideAndPackages() {
  self.importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js");
  const pyodide = await self.loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/",
    stdout: (text) => self.postMessage({ type: "stdout", text }),
    stderr: (text) => self.postMessage({ type: "stderr", text }),
    stdin: () => {
      if (inputBuffer) {
        try {
          self.postMessage({ type: "input_request" });
          return readInputSync(inputBuffer);
        } catch (e) {
          self.postMessage({ type: "stderr", text: `\n[System] Synchronous I/O failed: ${e.message}. Using mock input.\n` });
          return "Simulated Input\n";
        }
      }
      self.postMessage({ type: "stderr", text: "\n[System] SharedArrayBuffer not supported in browser. Using mock input.\n" });
      return "Simulated Input\n";
    }
  });
  
  return pyodide;
}

pyodideReadyPromise = loadPyodideAndPackages();

self.onmessage = async (event) => {
  const { id, code, type, buffer } = event.data;

  if (type === "init") {
    try {
      if (buffer) {
        inputBuffer = buffer;
      }
      await pyodideReadyPromise;
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", error: error.message });
    }
    return;
  }

  if (type === "exec") {
    try {
      if (buffer) {
        inputBuffer = buffer;
      }
      const pyodide = await pyodideReadyPromise;
      self.postMessage({ id, type: "stdout", text: `[Python Worker] Starting execution...` });
      
      // Execute the code
      await pyodide.runPythonAsync(code);
      
      self.postMessage({ id, type: "done" });
    } catch (error) {
      self.postMessage({ id, type: "stderr", text: error.message });
      self.postMessage({ id, type: "done", error: error.message });
    }
  }
};
