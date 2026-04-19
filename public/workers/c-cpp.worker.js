/* eslint-disable no-restricted-globals */

// C/C++ Execution Worker
// Uses JSCPP (JavaScript C++ interpreter) to run basic C/C++ code entirely in the browser

// Inlined readInputSync for SharedArrayBuffer-based stdin
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

let jscppReady = false;
let inputBuffer = null;

const UNSUPPORTED_CPP_CHECKS = [
  {
    pattern: /#\s*include\s*<\s*bits\/stdc\+\+\.h\s*>/,
    reason: "`#include <bits/stdc++.h>` is not supported by the browser C++ runtime.",
  },
  {
    pattern: /#\s*include\s*<\s*(vector|set|map|unordered_map|unordered_set|queue|deque|stack|list)\s*>/,
    reason: "STL container headers like `<vector>`, `<set>`, and `<map>` are not supported by this browser C++ runtime.",
  },
  {
    pattern: /\b(vector|set|multiset|map|unordered_map|unordered_set|queue|deque|stack|list|priority_queue)\s*</,
    reason: "STL containers like `vector`, `multiset`, and `map` are not supported by this browser C++ runtime.",
  },
];

function getCppCompatibilityError(code) {
  for (const check of UNSUPPORTED_CPP_CHECKS) {
    if (check.pattern.test(code)) {
      return `${check.reason} Use basic C/C++ only, such as iostream/cstdio/cstring/cmath with arrays, loops, functions, cin/cout, and scanf/printf.`;
    }
  }

  return null;
}

self.onmessage = async (event) => {
  const { id, code, type, buffer } = event.data;

  if (type === "init") {
    try {
      self.postMessage({ id, type: "stdout", text: "[C/C++ Worker] Loading C/C++ Interpreter..." });
      
      if (buffer) {
        inputBuffer = buffer;
      }

      // Load JSCPP from CDN
      self.importScripts("https://cdn.jsdelivr.net/npm/JSCPP@2.0.9/dist/JSCPP.es5.min.js");
      
      if (typeof JSCPP !== "undefined") {
        jscppReady = true;
        self.postMessage({ type: "ready" });
      } else {
        throw new Error("Failed to load JSCPP");
      }
    } catch (error) {
      self.postMessage({ type: "error", error: error.message });
    }
    return;
  }

  if (type === "exec") {
    try {
      if (!jscppReady) {
        throw new Error("C/C++ Interpreter not ready");
      }
      
      if (buffer) {
        inputBuffer = buffer;
      }

      self.postMessage({ id, type: "stdout", text: "[C/C++ Worker] Compiling & Executing..." });

      const compatibilityError = getCppCompatibilityError(code);
      if (compatibilityError) {
        throw new Error(compatibilityError);
      }
      
      // Build an input string for JSCPP using SharedArrayBuffer-based stdin
      // JSCPP accepts all input upfront as a string, so for scanf we need to 
      // collect input before running. We use a workaround: request input from 
      // the user if scanf patterns are detected.
      let stdinText = "";
      
      // Check if code uses scanf/gets/getchar 
      const needsInput = /\b(scanf|gets|getchar|fgets|getline)\b/.test(code);
      
      if (needsInput && inputBuffer) {
        // Request input from the user
        self.postMessage({ type: "input_request" });
        self.postMessage({ id, type: "stdout", text: "[C/C++ Worker] Waiting for input..." });
        try {
          stdinText = readInputSync(inputBuffer);
        } catch (e) {
          stdinText = "0\n";
          self.postMessage({ id, type: "stderr", text: "[System] Input not available, using default." });
        }
      }

      // Configure IO for JSCPP
      const config = {
        stdio: {
          write: (s) => {
            self.postMessage({ id, type: "stdout", text: s.replace(/\n$/, '') });
          }
        }
      };

      // Run the C/C++ code with collected stdin
      const exitCode = JSCPP.run(code, stdinText, config);
      
      self.postMessage({ 
        id, 
        type: "system", 
        text: `[C/C++ Worker] Process exited with code ${exitCode}` 
      });
      
      self.postMessage({ id, type: "done" });
    } catch (error) {
      self.postMessage({ id, type: "stderr", text: error.message || String(error) });
      self.postMessage({ id, type: "done", error: error.message || String(error) });
    }
  }
};
