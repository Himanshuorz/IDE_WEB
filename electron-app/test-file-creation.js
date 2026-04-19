/**
 * test-file-creation.js
 * Verifies that files created by a C++ program at runtime
 * are copied back to the workspace after execution.
 *
 * Run with:  node test-file-creation.js
 */

const path  = require("node:path");
const fs    = require("node:fs/promises");
const os    = require("node:os");
const { JudgeEngine } = require("./engine/judge-engine");

const WORKSPACE = path.join(os.tmpdir(), "webide-test-workspace");
const OUTPUT_FILE = path.join(WORKSPACE, "output.txt");

const CPP_CODE = `
#include <iostream>
#include <fstream>
using namespace std;

int main() {
    ofstream file("output.txt");
    if (file.is_open()) {
        file << "Hello, this is a file created using C++.\\n";
        file.close();
        cout << "File created successfully." << endl;
    } else {
        cout << "Failed to create file." << endl;
    }
    return 0;
}
`.trim();

async function main() {
  // Setup fresh workspace
  await fs.mkdir(WORKSPACE, { recursive: true });
  try { await fs.unlink(OUTPUT_FILE); } catch {}

  console.log("=".repeat(50));
  console.log("Test: Runtime file creation copy-back");
  console.log("=".repeat(50));
  console.log(`Workspace: ${WORKSPACE}`);
  console.log("");

  const engine = new JudgeEngine();

  const events = [];
  let done = false;

  const jobPromise = engine.start(
    {
      language: "cpp",
      code: CPP_CODE,
      stdin: "",
      workspacePath: WORKSPACE,
    },
    (event) => {
      events.push(event);
      if (event.type === "stdout") process.stdout.write(`[stdout] ${event.text}`);
      if (event.type === "stderr") process.stderr.write(`[stderr] ${event.text}`);
      if (event.type === "exit")   {
        console.log(`\n[exit]   status=${event.status}  exitCode=${event.exitCode}`);
        done = true;
      }
    }
  );

  await jobPromise;

  // Wait up to 8s for the process to finish and files to be copied
  const deadline = Date.now() + 8000;
  while (!done && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
  }

  // Give copy-back a moment to finish
  await new Promise(r => setTimeout(r, 500));

  console.log("\n" + "=".repeat(50));

  let fileFound = false;
  try {
    const content = await fs.readFile(OUTPUT_FILE, "utf8");
    fileFound = true;
    console.log("✅ PASS — output.txt was copied to workspace!");
    console.log(`   Content: ${content.trim()}`);
  } catch {
    console.log("❌ FAIL — output.txt was NOT found in workspace.");
  }

  // Cleanup
  await fs.rm(WORKSPACE, { recursive: true, force: true }).catch(() => {});
  engine.shutdown();

  process.exit(fileFound ? 0 : 1);
}

main().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
