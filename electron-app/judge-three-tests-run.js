const { JudgeEngine } = require("./engine/judge-engine");

const engine = new JudgeEngine();

function collect(events, type) {
  return events.filter((e) => e.type === type).map((e) => e.text || "").join("");
}

async function runTest({ name, language, code, input, sendDelayMs = 200 }) {
  const events = [];
  const started = await engine.start({ language, code }, (event) => events.push(event));

  if (!started.sessionId) {
    return {
      name,
      accepted: started.status === "Accepted",
      exitSeen: false,
      exitCode: null,
      stdout: collect(events, "stdout"),
      stderr: collect(events, "stderr"),
      note: "No sessionId returned"
    };
  }

  await new Promise((resolve) => setTimeout(resolve, sendDelayMs));

  try {
    engine.sendInput(started.sessionId, input);
  } catch (error) {
    events.push({ type: "sendInputError", text: error.message });
  }

  const done = await Promise.race([
    new Promise((resolve) => {
      const timer = setInterval(() => {
        const exitEvent = events.find((e) => e.type === "exit");
        if (exitEvent) {
          clearInterval(timer);
          resolve({ timedOut: false, exitEvent });
        }
      }, 20);
    }),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true, exitEvent: null }), 15000))
  ]);

  const stdout = collect(events, "stdout");
  const stderr = collect(events, "stderr");
  const exitEvent = done.exitEvent || events.find((e) => e.type === "exit") || null;

  return {
    name,
    accepted: Boolean(exitEvent && exitEvent.status === "Accepted"),
    exitSeen: Boolean(exitEvent),
    timedOut: done.timedOut,
    exitCode: exitEvent ? exitEvent.exitCode : null,
    stdout: stdout.replace(/\r?\n/g, "\\n"),
    stderr: stderr.replace(/\r?\n/g, "\\n"),
    status: exitEvent ? exitEvent.status : started.status || null,
    sendInputErrors: events.filter((e) => e.type === "sendInputError").map((e) => e.text || e.message || "")
  };
}

(async () => {
  const tests = [
    {
      name: "Python",
      language: "python",
      code: "name = input('Py: '); print('P', name)",
      input: "Amy",
      sendDelayMs: 200,
    },
    {
      name: "C",
      language: "c",
      code: [
        "#include <stdio.h>",
        "int main(void){",
        "  int n;",
        "  scanf(\"%d\", &n);",
        "  printf(\"C %d\", n);",
        "  return 0;",
        "}",
      ].join("\n"),
      input: "7",
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
      sendDelayMs: 500,
    }
  ];

  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
  }

  console.log("RESULTS_START");
  for (const r of results) {
    const payload = {
      name: r.name,
      accepted: r.accepted,
      exitSeen: r.exitSeen,
      exitCode: r.exitCode,
      status: r.status,
      timedOut: Boolean(r.timedOut),
      stdout: r.stdout,
      stderr: r.stderr,
      sendInputErrors: r.sendInputErrors,
      jsExitedAfterFirstInput: r.name === "JavaScript" ? r.exitSeen && !r.timedOut : undefined
    };
    console.log(JSON.stringify(payload));
  }
  console.log("RESULTS_END");

  engine.shutdown();
})().catch((error) => {
  console.error(error);
  engine.shutdown();
  process.exit(1);
});
