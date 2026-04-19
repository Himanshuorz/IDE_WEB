const { JudgeEngine } = require("./engine/judge-engine");

const engine = new JudgeEngine();

function collectText(events, type) {
  return events.filter((e) => e.type === type).map((e) => e.text || "").join("");
}

async function runTest(name, language, code, input, expectedOutput, sendDelayMs) {
  const events = [];
  const result = await engine.start({ language, code }, (event) => {
    events.push(event);
  });

  if (!result.sessionId) {
    return { name, result, events, expectedOutput, accepted: result.status === "Accepted", stdoutText: "", stderrText: "", exitCode: null };
  }

  await new Promise((resolve) => setTimeout(resolve, sendDelayMs));

  try {
    engine.sendInput(result.sessionId, input);
  } catch (error) {
    events.push({ type: "sendInputError", message: error.message });
  }

  await Promise.race([
    new Promise((resolve) => {
      const timer = setInterval(() => {
        if (events.some((event) => event.type === "exit")) {
          clearInterval(timer);
          resolve();
        }
      }, 10);
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timed out waiting for exit`)), 15000)),
  ]);

  const exitEvent = events.find((event) => event.type === "exit");
  const stdoutText = collectText(events, "stdout");
  const stderrText = collectText(events, "stderr");
  const accepted = Boolean(exitEvent && exitEvent.status === "Accepted");

  return {
    name,
    result,
    events,
    expectedOutput,
    accepted,
    stdoutText,
    stderrText,
    exitCode: exitEvent ? exitEvent.exitCode : null,
  };
}

(async () => {
  const tests = [
    {
      name: "Python",
      language: "python",
      code: "name = input('Py: '); print('P', name)",
      input: "Amy",
      expectedOutput: "Py: P Amy",
      sendDelayMs: 200,
    },
    {
      name: "C",
      language: "c",
      code: [
        "#include <stdio.h>",
        "int main(void) {",
        "  int n;",
        "  scanf(\"%d\", &n);",
        "  printf(\"C %d\", n);",
        "  return 0;",
        "}",
      ].join("\n"),
      input: "7",
      expectedOutput: "C 7",
      sendDelayMs: 200,
    },
    {
      name: "JavaScript",
      language: "javascript",
      code: [
        "const readline = require('node:readline');",
        "const rl = readline.createInterface({ input: process.stdin, output: process.stdout });",
        "rl.question('Name: ', (name) => {",
        "  console.log('Hello, ' + name + '!');",
        "  rl.close();",
        "});",
      ].join("\n"),
      input: "Bob",
      expectedOutput: "Name: Hello, Bob!",
      sendDelayMs: 500,
    },
  ];

  for (const test of tests) {
    const run = await runTest(test.name, test.language, test.code, test.input, test.expectedOutput, test.sendDelayMs);
    const stdout = run.stdoutText.replace(/\r?\n/g, "\\n");
    const stderr = run.stderrText ? run.stderrText.replace(/\r?\n/g, "\\n") : "";
    const summary = {
      name: run.name,
      status: run.accepted ? "Accepted" : "Not Accepted",
      exitCode: run.exitCode,
      stdout,
      stderr,
      eventCount: run.events.length,
      stdoutEvents: run.events.filter((e) => e.type === "stdout").length,
      stderrEvents: run.events.filter((e) => e.type === "stderr").length,
      expectedOutput: run.expectedOutput,
      matchesExpected: run.stdoutText.replace(/\r?\n/g, "") === run.expectedOutput.replace(/\r?\n/g, ""),
    };
    console.log(`TEST ${run.name}`);
    console.log(JSON.stringify(summary, null, 2));
  }

  engine.shutdown();
})().catch((error) => {
  console.error(error);
  engine.shutdown();
  process.exit(1);
});
