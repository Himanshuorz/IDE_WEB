// ===== State =====
const state = {
  workspacePath: "",
  selectedFilePath: "",
  files: [],
  activeSessionId: "",
  removeJudgeListener: null,
  isDirty: false,
  testCases: [],
  testCounter: 1,
  runningTests: false,
};

// ===== DOM =====
const pickWorkspaceBtn = document.getElementById("pickWorkspaceBtn");
const workspacePathEl = document.getElementById("workspacePath");
const fileTreeEl = document.getElementById("fileTree");
const activeFileLabel = document.getElementById("activeFileLabel");
const editorTextarea = document.getElementById("editor");
const outputPanel = document.getElementById("outputPanel");
const terminalInput = document.getElementById("terminalInput");
const languageSelect = document.getElementById("languageSelect");
const saveBtn = document.getElementById("saveBtn");
const runBtn = document.getElementById("runBtn");
const runTestsBtn = document.getElementById("runTestsBtn");
const testToolbarBadge = document.getElementById("testToolbarBadge");
const testBadgeEl = document.getElementById("testBadge");
const testListEl = document.getElementById("testList");
const testSummaryBarEl = document.getElementById("testSummaryBar");
const dirtyIndicator = document.getElementById("dirtyIndicator");
const newFileBtn = document.getElementById("newFileBtn");
const newFileRow = document.getElementById("newFileRow");
const newFileInput = document.getElementById("newFileInput");
const newFileConfirm = document.getElementById("newFileConfirm");
const newFileCancel = document.getElementById("newFileCancel");
const newFileChips = document.getElementById("newFileChips");
const panelExplorerBtn = document.getElementById("panelExplorerBtn");
const panelTestsBtn = document.getElementById("panelTestsBtn");
const openTestsPanelBtn = document.getElementById("openTestsPanelBtn");
const jumpTestsFromExplorer = document.getElementById("jumpTestsFromExplorer");
const explorerPanel = document.getElementById("explorerPanel");
const testsPanel = document.getElementById("testsPanel");
const addTestBtn = document.getElementById("addTestBtn");
const runAllTestsBtn = document.getElementById("runAllTestsBtn");

let codeMirror = null;

const extLangMap = {
  c: "c",
  cpp: "cpp",
  h: "c",
  py: "python",
  js: "javascript",
  sql: "sql",
  pgsql: "pgsql",
};

// ===== Helpers =====
function setOutput(text) {
  outputPanel.textContent = text;
}
function appendOutput(text) {
  outputPanel.textContent += text;
  outputPanel.scrollTop = outputPanel.scrollHeight;
}
function getLangFromPath(fp) {
  const ext = fp.split(".").pop().toLowerCase();
  return extLangMap[ext] || "cpp";
}
function cmModeFromLang(lang) {
  if (lang === "python") return "python";
  if (lang === "javascript") return "javascript";
  if (lang === "sql" || lang === "pgsql") return "text/x-sql";
  return "text/x-c++src";
}
function getEditorValue() {
  return codeMirror ? codeMirror.getValue() : editorTextarea.value;
}
function setEditorValue(text) {
  if (codeMirror) codeMirror.setValue(text ?? "");
  else editorTextarea.value = text ?? "";
  if (codeMirror) codeMirror.refresh();
}
function basename(p) {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || p;
}
function joinWorkspace(relPath) {
  const root = state.workspacePath.replace(/[/\\]+$/, "");
  const sep = root.includes("\\") ? "\\" : "/";
  return root + sep + relPath.replace(/^[/\\]+/, "");
}
function setDirty(val) {
  state.isDirty = val;
  dirtyIndicator.style.display = val ? "flex" : "none";
}

function showExplorerPanel() {
  explorerPanel.style.display = "flex";
  explorerPanel.style.flexDirection = "column";
  explorerPanel.style.flex = "1";
  explorerPanel.style.overflow = "hidden";
  testsPanel.style.display = "none";
  panelExplorerBtn.classList.add("sidebarPanelTabActive");
  panelTestsBtn.classList.remove("sidebarPanelTabActive");
}

function showTestsPanel() {
  explorerPanel.style.display = "none";
  testsPanel.style.display = "flex";
  testsPanel.style.flexDirection = "column";
  testsPanel.style.flex = "1";
  testsPanel.style.overflow = "hidden";
  panelExplorerBtn.classList.remove("sidebarPanelTabActive");
  panelTestsBtn.classList.add("sidebarPanelTabActive");
}

// ===== CodeMirror =====
function initCodeMirror() {
  if (typeof CodeMirror === "undefined") {
    console.error("CodeMirror failed to load; falling back to plain textarea.");
    return;
  }
  codeMirror = CodeMirror.fromTextArea(editorTextarea, {
    lineNumbers: true,
    theme: "dracula",
    mode: "text/x-c++src",
    tabSize: 2,
    indentUnit: 2,
    lineWrapping: true,
  });
  codeMirror.setSize("100%", "100%");
  codeMirror.on("change", () => {
    if (!state.isDirty) setDirty(true);
  });
  languageSelect.addEventListener("change", () => {
    codeMirror.setOption("mode", cmModeFromLang(languageSelect.value));
  });
  window.addEventListener("resize", () => {
    codeMirror.refresh();
  });
}

// ===== Panel Toggle =====
panelExplorerBtn.addEventListener("click", showExplorerPanel);
panelTestsBtn.addEventListener("click", showTestsPanel);
openTestsPanelBtn.addEventListener("click", showTestsPanel);
jumpTestsFromExplorer.addEventListener("click", (e) => {
  e.preventDefault();
  showTestsPanel();
});

// ===== File Tree =====
async function loadDirectory(dirPath) {
  const response = await window.electronAPI.listDirectory(dirPath);
  if (!response.ok) throw new Error(response.error || "Failed to list directory.");
  state.files = response.items;
  renderFileTree();
}

function renderFileTree() {
  fileTreeEl.innerHTML = "";
  state.files.forEach((item) => {
    const row = document.createElement("div");
    row.className = `file-item${state.selectedFilePath === item.path ? " active" : ""}`;

    const nameSpan = document.createElement("span");
    nameSpan.className = "file-item-name";
    nameSpan.textContent = item.isDirectory ? `📁 ${item.name}` : item.name;

    row.appendChild(nameSpan);

    if (!item.isDirectory) {
      const actions = document.createElement("div");
      actions.className = "fileActions";

      const renameBtn = document.createElement("button");
      renameBtn.className = "fileActionBtn";
      renameBtn.title = "Rename";
      renameBtn.textContent = "✏️";
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startRenameFile(item);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "fileActionBtn fileDeleteBtn";
      deleteBtn.title = "Delete";
      deleteBtn.textContent = "🗑";
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${item.name}"?`)) return;
        const res = await window.electronAPI.deleteFile(item.path);
        if (!res.ok) {
          appendOutput(`\nDelete error: ${res.error}`);
          return;
        }
        if (state.selectedFilePath === item.path) {
          state.selectedFilePath = "";
          activeFileLabel.textContent = "No file opened";
          setEditorValue("");
          setDirty(false);
        }
        await loadDirectory(state.workspacePath);
        appendOutput(`\nDeleted: ${item.name}\n`);
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(actions);
    }

    row.addEventListener("click", async () => {
      if (item.isDirectory) {
        state.workspacePath = item.path;
        workspacePathEl.textContent = state.workspacePath;
        await loadDirectory(item.path);
        return;
      }
      await openFile(item.path);
    });

    fileTreeEl.appendChild(row);
  });
}

// ===== Inline Rename =====
function startRenameFile(item) {
  const row = [...fileTreeEl.querySelectorAll(".file-item")].find(
    (el) => el.querySelector(".file-item-name")?.textContent.trim() === item.name
  );
  if (!row) return;

  const nameSpan = row.querySelector(".file-item-name");
  const origName = item.name;
  const input = document.createElement("input");
  input.type = "text";
  input.value = origName;
  input.className = "newFileInput";
  input.style.flex = "1";
  nameSpan.replaceWith(input);

  const actions = row.querySelector(".fileActions");
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "renameConfirmBtn";
  confirmBtn.textContent = "✓";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "renameCancelBtn";
  cancelBtn.textContent = "✗";

  if (actions) {
    actions.style.display = "flex";
    actions.innerHTML = "";
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
  }

  input.focus();
  input.select();

  async function doRename() {
    const newName = input.value.trim();
    if (!newName || newName === origName) {
      await loadDirectory(state.workspacePath);
      return;
    }
    const dir = item.path.substring(0, item.path.length - origName.length);
    const newPath = dir + newName;
    const res = await window.electronAPI.renameFile(item.path, newPath);
    if (!res.ok) {
      appendOutput(`\nRename error: ${res.error}\n`);
      await loadDirectory(state.workspacePath);
      return;
    }
    if (state.selectedFilePath === item.path) {
      state.selectedFilePath = newPath;
      activeFileLabel.textContent = basename(newPath);
      languageSelect.value = getLangFromPath(newPath);
      if (codeMirror) codeMirror.setOption("mode", cmModeFromLang(languageSelect.value));
    }
    await loadDirectory(state.workspacePath);
  }

  confirmBtn.addEventListener("click", doRename);
  cancelBtn.addEventListener("click", () => loadDirectory(state.workspacePath));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doRename();
    if (e.key === "Escape") loadDirectory(state.workspacePath);
  });
}

// ===== New File =====
function openNewFileDrawer() {
  newFileRow.style.display = "flex";
  newFileRow.setAttribute("aria-hidden", "false");
  newFileInput.value = "";
  newFileInput.focus();
}

function closeNewFileDrawer() {
  newFileRow.style.display = "none";
  newFileRow.setAttribute("aria-hidden", "true");
}

newFileBtn.addEventListener("click", openNewFileDrawer);

newFileChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".fileChip");
  if (!chip || !chip.dataset.name) return;
  newFileInput.value = chip.dataset.name;
  newFileInput.focus();
  newFileInput.select();
});

async function doCreateFile() {
  const name = newFileInput.value.trim();
  if (!name) {
    closeNewFileDrawer();
    return;
  }
  if (!state.workspacePath) {
    appendOutput("\nOpen a workspace folder first.\n");
    closeNewFileDrawer();
    return;
  }
  const newPath = joinWorkspace(name);
  const res = await window.electronAPI.writeFile(newPath, "");
  if (!res.ok) {
    appendOutput(`\nCreate error: ${res.error}\n`);
    closeNewFileDrawer();
    return;
  }
  closeNewFileDrawer();
  await loadDirectory(state.workspacePath);
  await openFile(newPath);
}

newFileConfirm.addEventListener("click", doCreateFile);
newFileCancel.addEventListener("click", closeNewFileDrawer);
newFileInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doCreateFile();
  if (e.key === "Escape") closeNewFileDrawer();
});

// ===== Open / Save =====
async function openFile(filePath) {
  const result = await window.electronAPI.readFile(filePath);
  if (!result.ok) {
    setOutput(`Error opening file: ${result.error}`);
    return;
  }
  state.selectedFilePath = filePath;
  activeFileLabel.textContent = basename(filePath);
  setEditorValue(result.content);
  languageSelect.value = getLangFromPath(filePath);
  if (codeMirror) {
    codeMirror.setOption("mode", cmModeFromLang(languageSelect.value));
    codeMirror.refresh();
  }
  setDirty(false);
  renderFileTree();
}

async function saveFile() {
  if (!state.selectedFilePath) {
    setOutput("Select a file first.");
    return;
  }
  const result = await window.electronAPI.writeFile(state.selectedFilePath, getEditorValue());
  if (!result.ok) {
    setOutput(`Save failed: ${result.error}`);
    return;
  }
  setDirty(false);
  appendOutput("\n[Saved]\n");
}

// ===== Run Code =====
async function runCurrentCode(stdinOverride) {
  const code = getEditorValue();
  if (!code.trim()) {
    setOutput("No code to run.");
    return;
  }
  if (state.activeSessionId) {
    setOutput("A run is already active.\n");
    return;
  }

  setOutput("Running in local judge sandbox...\n");

  const response = await window.electronAPI.startJob({
    language: languageSelect.value,
    code,
    stdin: stdinOverride !== undefined ? stdinOverride : "",
    sourcePath: state.selectedFilePath,
    workspacePath: state.workspacePath,
  });

  if (!response.ok) {
    appendOutput(`\nError: ${response.error}`);
    return;
  }

  const result = response.result;
  if (result.compileStdout) appendOutput(`[Compile stdout]\n${result.compileStdout}\n`);
  if (result.compileStderr) appendOutput(`[Compile stderr]\n${result.compileStderr}\n`);
  if (result.completed) {
    appendOutput(`Status: ${result.status}\n`);
    if (typeof result.exitCode !== "undefined") appendOutput(`Exit Code: ${result.exitCode}\n`);
    return result;
  }

  state.activeSessionId = result.sessionId;
  appendOutput(`Engine: ${result.engine}\nLanguage: ${result.language}\nStatus: ${result.status}\n`);
  return result;
}

// ===== Judge Listener =====
function attachJudgeListener() {
  if (state.removeJudgeListener) return;
  state.removeJudgeListener = window.electronAPI.onJudgeEvent((event) => {
    if (!event?.type) return;
    if (state.activeSessionId && event.sessionId && event.sessionId !== state.activeSessionId) return;

    if (event.type === "stdout" || event.type === "stderr") {
      appendOutput(event.text || "");
      return;
    }
    if (event.type === "exit") {
      appendOutput(`\nStatus: ${event.status}\nExit Code: ${event.exitCode}\n`);
      state.activeSessionId = "";
      if (state.workspacePath) {
        loadDirectory(state.workspacePath).catch(() => {});
      }
    }
  });
}

// ===== Test Cases =====
function saveTests() {
  if (state.workspacePath) {
    const data = JSON.stringify({ cases: state.testCases, counter: state.testCounter });
    const testsPath = joinWorkspace(".webide-tests.json");
    window.electronAPI.writeFile(testsPath, data).catch(() => {});
  }
}

async function loadTests() {
  if (!state.workspacePath) return;
  const testsPath = joinWorkspace(".webide-tests.json");
  const res = await window.electronAPI.readFile(testsPath);
  if (res.ok) {
    try {
      const parsed = JSON.parse(res.content);
      state.testCases = parsed.cases || [];
      state.testCounter = parsed.counter || 1;
    } catch {
      /* ignore */
    }
  }
  renderTestCases();
  updateTestBadge();
}

function updateTestBadge() {
  const total = state.testCases.length;
  const passed = state.testCases.filter((t) => t.status === "pass").length;
  const failed = state.testCases.filter((t) => t.status === "fail").length;

  testToolbarBadge.textContent = String(total);

  if (failed > 0) {
    testBadgeEl.textContent = String(failed);
    testBadgeEl.style.background = "#ef4444";
    testBadgeEl.style.display = "flex";
  } else if (passed > 0) {
    testBadgeEl.textContent = String(passed);
    testBadgeEl.style.background = "#22c55e";
    testBadgeEl.style.display = "flex";
  } else {
    testBadgeEl.style.display = "none";
  }

  const total2 = state.testCases.length;
  if (passed > 0 || failed > 0) {
    testSummaryBarEl.style.display = "flex";
    testSummaryBarEl.innerHTML = `<span style="color:#22c55e">✓ ${passed}</span> ${
      failed > 0 ? `<span style="color:#ef4444">✗ ${failed}</span>` : ""
    } <span style="color:#666">/ ${total2}</span>`;
  } else {
    testSummaryBarEl.style.display = "none";
  }
}

function renderTestCases() {
  testListEl.innerHTML = "";

  if (state.testCases.length === 0) {
    testListEl.innerHTML =
      '<div class="testEmpty testEmptyRich">No test cases yet.<p class="testEmptySub">Use <strong>＋ Add</strong> in the header or the toolbar <strong>Test cases</strong> button, then describe stdin and expected stdout.</p></div>';
    return;
  }

  state.testCases.forEach((tc, idx) => {
    const el = document.createElement("div");
    el.className = `testCase${tc.status === "pass" ? " testCasePass" : tc.status === "fail" ? " testCaseFail" : ""}`;

    const statusIcon = tc.status === "pass" ? "✓" : tc.status === "fail" ? "✗" : tc.status === "running" ? "⏳" : "";
    const statusColor =
      tc.status === "pass" ? "#22c55e" : tc.status === "fail" ? "#ef4444" : tc.status === "running" ? "#f5c518" : "#666";

    const isExpanded = tc._expanded !== false;

    el.innerHTML = `
      <div class="testCaseHeader" data-id="${tc.id}">
        <span class="testCaseChevron">${isExpanded ? "▾" : "▸"}</span>
        <span class="testCaseLabel">${tc.label || `Test ${idx + 1}`}</span>
        <span style="margin-left:auto;display:flex;align-items:center;gap:5px">
          <span style="color:${statusColor};font-size:0.8rem;font-weight:700">${statusIcon}</span>
          <button type="button" class="testRunSingleBtn" data-id="${tc.id}" title="Run">▶</button>
          <button type="button" class="testDeleteBtn" data-id="${tc.id}" title="Remove">✗</button>
        </span>
      </div>
      ${
        isExpanded
          ? `
      <div class="testCaseBody">
        <label class="testLabel">Label<input class="testInput" data-id="${tc.id}" data-field="label" value="${escapeHtml(
            tc.label
          )}"/></label>
        <label class="testLabel">Input (stdin)<textarea class="testTextarea" data-id="${tc.id}" data-field="input" rows="3" placeholder="Leave empty if none">${escapeHtml(
            tc.input
          )}</textarea></label>
        <label class="testLabel">Expected Output<textarea class="testTextarea" data-id="${tc.id}" data-field="expectedOutput" rows="3" placeholder="Expected stdout">${escapeHtml(
            tc.expectedOutput
          )}</textarea></label>
        ${
          tc.status !== "idle"
            ? `
        <div class="testResult testResult${capitalize(tc.status)}">
          <div class="testResultLabel">${
            tc.status === "running" ? "⏳ Running..." : tc.status === "pass" ? "✓ Passed" : "✗ Failed — Actual Output:"
          }</div>
          ${
            tc.actualOutput !== undefined && tc.status !== "running"
              ? `<pre class="testActualOutput">${escapeHtml(tc.actualOutput || "(no output)")}</pre>`
              : ""
          }
        </div>`
            : ""
        }
      </div>`
          : ""
      }
    `;

    el.querySelector(".testCaseHeader").addEventListener("click", () => {
      tc._expanded = !isExpanded;
      renderTestCases();
    });

    el.querySelector(".testRunSingleBtn").addEventListener("click", async (e) => {
      e.stopPropagation();
      await runSingleTest(tc);
    });

    el.querySelector(".testDeleteBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      state.testCases = state.testCases.filter((t) => t.id !== tc.id);
      saveTests();
      renderTestCases();
      updateTestBadge();
    });

    if (isExpanded) {
      el.querySelectorAll(".testInput,.testTextarea").forEach((input) => {
        input.addEventListener("input", () => {
          const id = parseInt(input.dataset.id, 10);
          const field = input.dataset.field;
          const tc2 = state.testCases.find((t) => t.id === id);
          if (tc2) {
            tc2[field] = input.value;
            saveTests();
          }
        });
      });
    }

    testListEl.appendChild(el);
  });
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

addTestBtn.addEventListener("click", () => {
  const id = ++state.testCounter;
  state.testCases.push({
    id,
    label: `Test ${state.testCases.length + 1}`,
    input: "",
    expectedOutput: "",
    status: "idle",
    actualOutput: "",
    _expanded: true,
  });
  saveTests();
  renderTestCases();
  updateTestBadge();
});

async function runSingleTest(tc) {
  if (!state.selectedFilePath) {
    appendOutput("\nSelect a file first.\n");
    return;
  }
  tc.status = "running";
  tc.actualOutput = "";
  renderTestCases();
  updateTestBadge();

  return new Promise(async (resolve) => {
    const response = await window.electronAPI.startJob({
      language: languageSelect.value,
      code: getEditorValue(),
      stdin: tc.input,
      sourcePath: state.selectedFilePath,
      workspacePath: state.workspacePath,
    });

    if (!response.ok) {
      tc.status = "fail";
      tc.actualOutput = response.error || "Run error";
      renderTestCases();
      updateTestBadge();
      resolve();
      return;
    }

    const result = response.result;
    if (result.completed) {
      const actual = ((result.stdout || "") + (result.stderr || "")).trim();
      tc.status = actual === tc.expectedOutput.trim() ? "pass" : "fail";
      tc.actualOutput = actual;
      renderTestCases();
      updateTestBadge();
      resolve();
      return;
    }

    state.activeSessionId = result.sessionId;
    let collected = "";
    const cleanup = window.electronAPI.onJudgeEvent((ev) => {
      if (ev.sessionId && ev.sessionId !== result.sessionId) return;
      if (ev.type === "stdout" || ev.type === "stderr") collected += ev.text || "";
      if (ev.type === "exit") {
        state.activeSessionId = "";
        const actual = collected.trim();
        tc.status = actual === tc.expectedOutput.trim() ? "pass" : "fail";
        tc.actualOutput = actual;
        renderTestCases();
        updateTestBadge();
        cleanup();
        resolve();
      }
    });
  });
}

runAllTestsBtn.addEventListener("click", async () => {
  if (state.runningTests) return;
  state.runningTests = true;
  runAllTestsBtn.disabled = true;
  runTestsBtn.disabled = true;
  for (const tc of state.testCases) await runSingleTest(tc);
  state.runningTests = false;
  runAllTestsBtn.disabled = false;
  runTestsBtn.disabled = false;
});

runTestsBtn.addEventListener("click", async () => {
  if (state.runningTests) return;
  state.runningTests = true;
  runTestsBtn.disabled = true;
  for (const tc of state.testCases) await runSingleTest(tc);
  state.runningTests = false;
  runTestsBtn.disabled = false;
});

// ===== Workspace open =====
pickWorkspaceBtn.addEventListener("click", async () => {
  const response = await window.electronAPI.pickWorkspace();
  if (!response.ok) {
    setOutput(response.error || "Workspace selection cancelled.");
    return;
  }
  state.workspacePath = response.workspacePath;
  workspacePathEl.textContent = state.workspacePath;
  state.selectedFilePath = "";
  activeFileLabel.textContent = "No file opened";
  setEditorValue("");
  setDirty(false);
  try {
    await loadDirectory(response.workspacePath);
    await loadTests();
    setOutput("Workspace loaded.\n");
  } catch (err) {
    setOutput(`Failed to load workspace: ${err.message}`);
  }
});

saveBtn.addEventListener("click", saveFile);
runBtn.addEventListener("click", runCurrentCode);

terminalInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const text = terminalInput.value;
  terminalInput.value = "";
  if (!text.trim()) return;
  appendOutput(`> ${text}\n`);
  if (!state.activeSessionId) {
    appendOutput("No active process is waiting for input.\n");
    return;
  }
  const response = await window.electronAPI.sendInput(state.activeSessionId, text);
  if (!response.ok) appendOutput(`Input error: ${response.error}\n`);
});

initCodeMirror();
attachJudgeListener();
updateTestBadge();
