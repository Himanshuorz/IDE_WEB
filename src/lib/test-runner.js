import { ExecutionRouter } from "./execution-router";

// Exact boilerplate strings emitted by the router/workers that should not
// appear in test output comparisons.
const BOILERPLATE_PATTERNS = [
  /^\[.*\] Runtime initialized and ready\.$/,
  /^\[.*\] Starting execution\.\.\..*/,
  /^\[.*\] Execution finished\.$/,
  /^\[.*\] Worker terminated\.$/,
  /^> Starting .* execution.*/,
];

function isBoilerplate(text) {
  return BOILERPLATE_PATTERNS.some((re) => re.test(text.trim()));
}

/**
 * Run code with pre-supplied stdin, collect stdout/stderr, resolve when done.
 *
 * @param {string}  lang
 * @param {string}  code
 * @param {string}  stdinText   Full stdin (newline-separated lines)
 * @param {object}  options     { cppMode }
 * @returns {Promise<string>}   Trimmed combined output
 */
export function runCodeWithStdin(lang, code, stdinText = "", options = {}) {
  return new Promise((resolve, reject) => {
    // Split into individual lines for on-demand feeding
    const stdinLines = stdinText.length > 0 ? stdinText.split("\n") : [];
    const outputParts = [];
    let settled = false;
    let router = null;

    function finish(output) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      // Terminate the dedicated worker so it doesn't linger
      try { 
        if (router) {
          router.stopAll(); 
        }
      } catch (e) {
        console.error("Error stopping router:", e);
      }
      resolve(output);
    }

    try {
      router = new ExecutionRouter((event) => {
        if (settled) return;
        
        switch (event.type) {
          case "system": {
            const text = event.text || "";
            // Check if this is the finish signal
            if (text.includes("Execution finished")) {
              finish(outputParts.join("").trim());
              return;
            }
            // Add non-boilerplate output
            if (!isBoilerplate(text)) {
              outputParts.push(text);
              if (!text.endsWith("\n")) {
                outputParts.push("\n");
              }
            }
            break;
          }
          case "error": {
            const text = event.text || "";
            outputParts.push(text);
            if (!text.endsWith("\n")) {
              outputParts.push("\n");
            }
            break;
          }
          case "input_request": {
            // Synchronously feed the next pre-loaded stdin line
            const line = stdinLines.shift();
            if (router) {
              router.provideInput(line !== undefined ? line : "");
            }
            break;
          }
          case "run": {
            // Ignore the "Starting execution" announcement
            break;
          }
          default:
            break;
        }
      });

      // Safety net: resolve after 20 s even if "done" never fires
      const timeoutId = setTimeout(() => {
        if (!settled) {
          outputParts.push("\n[Test runner: timed out after 20 s]");
          finish(outputParts.join("").trim());
        }
      }, 20000);

      // Start execution
      router.runCode(lang, code, options).catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(err);
        }
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        reject(err);
      }
    }
  });
}
