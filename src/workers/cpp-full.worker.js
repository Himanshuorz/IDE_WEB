/* eslint-disable no-restricted-globals */
import { readInputSync } from "../lib/input-buffer.js";

let inputBuffer = null;

const PISTON_API = "https://emkc.org/api/v2/piston/execute";
const JUDGE0_CE_API = "https://ce.judge0.com";
const JUDGE0_LANGUAGE_IDS = {
  c: 50,
  cpp: 54,
};

function needsInput(code) {
  return /\b(scanf|gets|getchar|fgets|getline|cin)\b|std::cin/.test(code);
}

function readProgramInput(code) {
  if (!needsInput(code)) {
    return "";
  }

  if (!inputBuffer) {
    self.postMessage({
      type: "stderr",
      text: "[Full C++] Input buffer unavailable. Using empty stdin.",
    });
    return "";
  }

  self.postMessage({ type: "input_request" });
  self.postMessage({ type: "stdout", text: "[Full C++] Waiting for input..." });

  try {
    return readInputSync(inputBuffer);
  } catch (error) {
    self.postMessage({
      type: "stderr",
      text: `[Full C++] Failed to read input: ${error.message}. Using empty stdin.`,
    });
    return "";
  }
}

async function executeWithPiston(lang, code, stdin) {
  const runtime = lang === "c" ? "c" : "cpp";
  const version = lang === "c" ? "10.2.0" : "10.2.0";

  const response = await fetch(PISTON_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: runtime,
      version,
      files: [{ content: code }],
      stdin: stdin || "",
      compile_timeout: 10000,
      run_timeout: 10000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Piston request failed (${response.status} ${response.statusText}).`);
  }

  const payload = await response.json();
  return {
    provider: "Piston",
    compileOutput: payload?.compile?.stderr || payload?.compile?.output || "",
    stdout: payload?.run?.stdout || "",
    stderr: payload?.run?.stderr || "",
    success: (payload?.run?.code ?? 1) === 0,
    status: (payload?.run?.code ?? 1) === 0 ? "Accepted" : "Runtime/Compilation Error",
  };
}

async function submitJudge0(lang, code, stdin) {
  const languageId = JUDGE0_LANGUAGE_IDS[lang] || JUDGE0_LANGUAGE_IDS.cpp;

  const response = await fetch(`${JUDGE0_CE_API}/submissions?base64_encoded=false&wait=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language_id: languageId,
      source_code: code,
      stdin: stdin || "",
    }),
  });

  if (!response.ok) {
    throw new Error(`Judge0 submission failed (${response.status} ${response.statusText}).`);
  }

  const payload = await response.json();
  if (!payload?.token) {
    throw new Error("Judge0 did not return a submission token.");
  }

  return payload.token;
}

async function pollJudge0(token, maxAttempts = 60) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(`${JUDGE0_CE_API}/submissions/${token}?base64_encoded=false`);
    if (!response.ok) {
      throw new Error(`Judge0 result fetch failed (${response.status} ${response.statusText}).`);
    }

    const payload = await response.json();
    if ((payload?.status?.id ?? 0) > 2) {
      return payload;
    }

    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Judge0 execution timed out after 30 seconds.");
}

async function executeWithJudge0(lang, code, stdin) {
  const token = await submitJudge0(lang, code, stdin);
  const payload = await pollJudge0(token);

  return {
    provider: "Judge0 CE",
    compileOutput: payload?.compile_output || "",
    stdout: payload?.stdout || "",
    stderr: payload?.stderr || "",
    success: (payload?.status?.id ?? 0) === 3,
    status: payload?.status?.description || "Unknown status",
  };
}

async function executeRemotely(lang, code, stdin) {
  try {
    return await executeWithPiston(lang, code, stdin);
  } catch (pistonError) {
    try {
      return await executeWithJudge0(lang, code, stdin);
    } catch (judge0Error) {
      throw new Error(
        `Full mode failed on both remote sandboxes. Piston: ${toErrorMessage(pistonError)} | Judge0: ${toErrorMessage(judge0Error)}`,
      );
    }
  }
}

function toErrorMessage(error) {
  return error?.message || String(error);
}

self.onmessage = async (event) => {
  const { id, code, type, buffer, lang = "cpp" } = event.data;

  if (type === "init") {
    if (buffer) {
      inputBuffer = buffer;
    }

    self.postMessage({
      type: "stdout",
      text: "[Full C++] Remote sandbox ready (Piston/Judge0). Full C/C++ with STL enabled.",
    });
    self.postMessage({ type: "ready" });
    return;
  }

  if (type === "exec") {
    try {
      if (buffer) {
        inputBuffer = buffer;
      }

      self.postMessage({
        id,
        type: "stdout",
        text: `[Full C++] Compiling ${lang === "c" ? "C" : "C++"} in remote sandbox...`,
      });

      const stdin = readProgramInput(code);

      const result = await executeRemotely(lang, code, stdin);

      self.postMessage({
        id,
        type: "system",
        text: `[Full C++] Provider: ${result.provider}`,
      });

      if (result.compileOutput) {
        self.postMessage({
          id,
          type: "stderr",
          text: result.compileOutput.trimEnd(),
        });
      }

      if (result.stdout) {
        self.postMessage({
          id,
          type: "stdout",
          text: result.stdout.trimEnd(),
        });
      }

      if (result.stderr) {
        self.postMessage({
          id,
          type: "stderr",
          text: result.stderr.trimEnd(),
        });
      }

      const statusMsg = result.status || (result.success ? "Accepted" : "Execution failed");
      self.postMessage({
        id,
        type: "system",
        text: `[Full C++] ${statusMsg}`,
      });

      self.postMessage({ id, type: "done" });
    } catch (error) {
      const message = toErrorMessage(error);
      self.postMessage({ id, type: "stderr", text: message });
      self.postMessage({ id, type: "done", error: message });
    }
  }
};
