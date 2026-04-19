/* eslint-disable no-restricted-globals */
import { readInputSync } from "../lib/input-buffer.js";

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
