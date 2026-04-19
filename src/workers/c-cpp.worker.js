/* eslint-disable no-restricted-globals */

import JSImport from "JSCPP";

const JSCPP = JSImport?.default ?? JSImport;

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

let inputBuffer = null;

self.onmessage = (event) => {
  const { id, code, type, buffer } = event.data;

  if (type === "init") {
    try {
      self.postMessage({ id, type: "stdout", text: "[C/C++ Worker] Loading C/C++ Interpreter..." });

      if (buffer) {
        inputBuffer = buffer;
      }

      if (!JSCPP || typeof JSCPP.run !== "function") {
        throw new Error("Failed to load JSCPP");
      }

      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", error: error.message || String(error) });
    }
    return;
  }

  if (type === "exec") {
    try {
      if (!JSCPP || typeof JSCPP.run !== "function") {
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

      let stdinText = "";
      const needsInput = /\b(scanf|gets|getchar|fgets|getline|cin)\b|std::cin/.test(code);

      if (needsInput && inputBuffer) {
        self.postMessage({ type: "input_request" });
        self.postMessage({ id, type: "stdout", text: "[C/C++ Worker] Waiting for input..." });

        try {
          stdinText = readInputSync(inputBuffer);
        } catch {
          stdinText = "0\n";
          self.postMessage({
            id,
            type: "stderr",
            text: "[System] Input not available, using default.",
          });
        }
      }

      const config = {
        stdio: {
          write: (text) => {
            self.postMessage({ id, type: "stdout", text: text.replace(/\n$/, "") });
          },
        },
      };

      const exitCode = JSCPP.run(code, stdinText, config);

      self.postMessage({
        id,
        type: "system",
        text: `[C/C++ Worker] Process exited with code ${exitCode}`,
      });
      self.postMessage({ id, type: "done" });
    } catch (error) {
      self.postMessage({ id, type: "stderr", text: error.message || String(error) });
      self.postMessage({ id, type: "done", error: error.message || String(error) });
    }
  }
};
