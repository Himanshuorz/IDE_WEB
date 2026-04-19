"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import Editor from "@monaco-editor/react";
import {
  FileCode2, TerminalSquare, Database, Cog, Folder, FolderOpen,
  Play, Square, RotateCcw, Trash2, FilePlus, Pencil, Check, X,
  FlaskConical, ChevronRight, ChevronDown, PlusCircle, PlayCircle,
  CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { ExecutionRouter } from "../../lib/execution-router";
import { runCodeWithStdin } from "../../lib/test-runner";
import { vfs } from "../../lib/vfs";
import styles from "./ide.module.css";

const Terminal = dynamic(() => import("../components/Terminal/Terminal"), { ssr: false });

const EXT_TO_LANG = {
  py: "python", js: "javascript", ts: "typescript",
  sql: "sql", pgsql: "pgsql", c: "c", cpp: "cpp", h: "c",
};
const EXT_TO_ICON = {
  py: "PY", js: "JS", ts: "JS",
  sql: "DB", pgsql: "PG", c: "C+", cpp: "C+", h: "C+",
};

function getFileIcon(iconStr) {
  switch (iconStr) {
    case "PY": return <FileCode2 size={16} />;
    case "JS": return <TerminalSquare size={16} />;
    case "DB": return <Database size={16} />;
    case "C+": return <Cog size={16} />;
    case "PG": return <Database size={16} />;
    default:   return <FileCode2 size={16} />;
  }
}

const SUPPORTED_TEST_LANGS = ["python", "javascript", "typescript", "c", "cpp"];

const defaultFiles = [{
  name: "workspace", type: "folder", expanded: true,
  children: [
    { name: "main.py",  type: "file", icon: "PY", lang: "python",
      content: '# WebIDE\ndef greet(name):\n    return f"Hello, {name}!"\n\nname = input("Your name: ")\nprint(greet(name))\n' },
    { name: "app.js",   type: "file", icon: "JS", lang: "javascript",
      content: "const nums = [1,2,3,4,5];\nconsole.log('Squared:', nums.map(n=>n*n));\n" },
    { name: "main.cpp", type: "file", icon: "C+", lang: "cpp",
      content: '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n    int n; cin>>n;\n    vector<int> v(n);\n    for(int i=0;i<n;i++) cin>>v[i];\n    sort(v.begin(),v.end());\n    for(int x:v) cout<<x<<" ";\n    cout<<"\\n";\n}\n' },
  ],
}];

const PANEL_EXPLORER = "explorer";
const PANEL_TESTS    = "tests";

function mkTest(id) {
  return { id, label: `Test ${id}`, input: "", expectedOutput: "", status: "idle", actualOutput: "", expanded: true };
}

export default function IDEPage() {
  const [files,             setFiles]             = useState(defaultFiles);
  const [activeFile,        setActiveFile]        = useState("main.py");
  const [openTabs,          setOpenTabs]          = useState([{ name: "main.py", icon: "PY" }]);
  const [terminalOutput,    setTerminalOutput]    = useState([
    { type: "system", text: "WebIDE Terminal - Ready" },
    { type: "info",   text: "Runtimes: Python · JS/TS · C/C++ · SQLite · PostgreSQL" },
  ]);
  const [isInputRequested,  setIsInputRequested]  = useState(false);
  const [expandedFolders,   setExpandedFolders]   = useState({ workspace: true });
  const [isCreatingFile,    setIsCreatingFile]    = useState(false);
  const [newFileName,       setNewFileName]       = useState("");
  const [cppMode,           setCppMode]           = useState("full");
  const [sidebarPanel,      setSidebarPanel]      = useState(PANEL_EXPLORER);
  const [dirtyFiles,        setDirtyFiles]        = useState(new Set());
  const [renamingFile,      setRenamingFile]      = useState(null);
  const [renameValue,       setRenameValue]       = useState("");

  // Test cases
  const [testCases,         setTestCases]         = useState([mkTest(1)]);
  const [testCounter,       setTestCounter]       = useState(2);
  const [runningAll,        setRunningAll]        = useState(false);
  const [runningId,         setRunningId]         = useState(null); // single test running

  const routerRef       = useRef(null);
  const newFileInputRef = useRef(null);
  const renameInputRef  = useRef(null);
  const saveTimerRef    = useRef(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    routerRef.current = new ExecutionRouter((output) => {
      if (output.type === "input_request") setIsInputRequested(true);
      setTerminalOutput((prev) => [...prev, output]);
    });

    vfs.readFile("workspace").then((saved) => {
      if (!saved) return;
      try {
        const pf = JSON.parse(saved);
        setFiles(pf);
        const ff = pf?.[0]?.children?.[0];
        if (ff?.name) { setActiveFile(ff.name); setOpenTabs([{ name: ff.name, icon: ff.icon }]); }
      } catch (e) { console.error(e); }
    });

    vfs.readFile("testcases").then((saved) => {
      if (!saved) return;
      try {
        const p = JSON.parse(saved);
        if (Array.isArray(p.cases) && p.cases.length > 0) {
          setTestCases(p.cases);
          setTestCounter(p.counter ?? p.cases.length + 1);
        }
      } catch {}
    });

    return () => { routerRef.current?.stopAll(); routerRef.current = null; };
  }, []);

  const allFiles    = files[0]?.children || [];
  const currentFile = allFiles.find((f) => f.name === activeFile);

  const persistFiles = (nf) => vfs.saveFile("workspace", JSON.stringify(nf)).catch(console.error);
  const persistTests = (cases, counter) => {
    const data = { cases, counter };
    console.log('[VFS] Persisting tests:', cases.length, 'tests, counter:', counter);
    return vfs.saveFile("testcases", JSON.stringify(data)).catch((err) => {
      console.error('[VFS] Failed to persist tests:', err);
    });
  };

  // ── Editor ────────────────────────────────────────────────────────────────
  const handleEditorChange = (value) => {
    if (!activeFile) return;
    
    // Mark as dirty immediately
    setDirtyFiles((prev) => {
      const newSet = new Set(prev);
      newSet.add(activeFile);
      return newSet;
    });
    
    // Update file content in state
    setFiles((prevFiles) => {
      const nf = JSON.parse(JSON.stringify(prevFiles)); // Deep clone
      const nc = nf[0]?.children || [];
      const fi = nc.findIndex((f) => f.name === activeFile);
      
      if (fi !== -1) {
        nc[fi] = { ...nc[fi], content: value || "" };
        nf[0] = { ...nf[0], children: nc };
      }
      
      // Debounced save
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      
      const currentFileName = activeFile; // Capture current file name
      saveTimerRef.current = setTimeout(() => {
        persistFiles(nf).then(() => {
          setDirtyFiles((prev) => {
            const newSet = new Set(prev);
            newSet.delete(currentFileName);
            return newSet;
          });
        });
      }, 800);
      
      return nf;
    });
  };

  const openFile = useCallback((file) => {
    setActiveFile(file.name);
    setOpenTabs((prev) => prev.some((t) => t.name === file.name) ? prev : [...prev, { name: file.name, icon: file.icon }]);
  }, []);

  const closeTab = useCallback((e, tabName) => {
    e.stopPropagation();
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.name !== tabName);
      if (activeFile === tabName && next.length > 0) setActiveFile(next[next.length - 1].name);
      return next;
    });
  }, [activeFile]);

  const toggleFolder = (name) => setExpandedFolders((prev) => ({ ...prev, [name]: !prev[name] }));

  // ── File: Create ──────────────────────────────────────────────────────────
  const startCreateFile = () => {
    setIsCreatingFile(true); setNewFileName("");
    setExpandedFolders((p) => ({ ...p, workspace: true }));
    setTimeout(() => newFileInputRef.current?.focus(), 50);
  };
  const doCreateFile = () => {
    const name = newFileName.trim();
    if (!name) { setIsCreatingFile(false); return; }
    if (allFiles.some((f) => f.name === name)) {
      setTerminalOutput((p) => [...p, { type: "error", text: `File "${name}" already exists.` }]);
      setIsCreatingFile(false); return;
    }
    const ext = name.split(".").pop().toLowerCase();
    const lang = EXT_TO_LANG[ext] || "plaintext";
    const icon = EXT_TO_ICON[ext] || "PY";
    setFiles((pf) => {
      const nf = [...pf], nc = [...(nf[0]?.children || [])];
      nc.push({ name, type: "file", icon, lang, content: "" });
      nf[0] = { ...nf[0], children: nc }; persistFiles(nf); return nf;
    });
    setActiveFile(name); setOpenTabs((p) => [...p, { name, icon }]);
    setIsCreatingFile(false); setNewFileName("");
  };
  const onCreateKeyDown = (e) => { if (e.key === "Enter") doCreateFile(); if (e.key === "Escape") setIsCreatingFile(false); };

  // ── File: Delete ──────────────────────────────────────────────────────────
  const deleteFile = (e, fileName) => {
    e.stopPropagation();
    if (!confirm(`Delete "${fileName}"?`)) return;
    setFiles((pf) => {
      const nf = [...pf];
      nf[0] = { ...nf[0], children: (nf[0]?.children || []).filter((f) => f.name !== fileName) };
      persistFiles(nf); return nf;
    });
    setOpenTabs((p) => p.filter((t) => t.name !== fileName));
    if (activeFile === fileName) {
      const rem = allFiles.filter((f) => f.name !== fileName);
      setActiveFile(rem.length > 0 ? rem[0].name : "");
    }
  };

  // ── File: Rename ──────────────────────────────────────────────────────────
  const startRename = (e, fileName) => {
    e.stopPropagation(); setRenamingFile(fileName); setRenameValue(fileName);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };
  const confirmRename = () => {
    const newName = renameValue.trim();
    if (!newName || newName === renamingFile) { setRenamingFile(null); return; }
    if (allFiles.some((f) => f.name === newName)) {
      setTerminalOutput((p) => [...p, { type: "error", text: `File "${newName}" already exists.` }]);
      setRenamingFile(null); return;
    }
    const ext = newName.split(".").pop().toLowerCase();
    const lang = EXT_TO_LANG[ext] || "plaintext", icon = EXT_TO_ICON[ext] || "PY";
    setFiles((pf) => {
      const nf = [...pf];
      nf[0] = { ...nf[0], children: (nf[0]?.children || []).map((f) => f.name === renamingFile ? { ...f, name: newName, lang, icon } : f) };
      persistFiles(nf); return nf;
    });
    setOpenTabs((p) => p.map((t) => t.name === renamingFile ? { ...t, name: newName, icon } : t));
    if (activeFile === renamingFile) setActiveFile(newName);
    setRenamingFile(null);
  };
  const onRenameKeyDown = (e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingFile(null); };

  // ── Run (terminal) ────────────────────────────────────────────────────────
  const handleRun = () => {
    if (!currentFile) return;
    if (!["python","javascript","typescript","sql","pgsql","c","cpp"].includes(currentFile.lang)) {
      setTerminalOutput((p) => [...p, { type: "error", text: `[${currentFile.lang}] Not supported.` }]); return;
    }
    setIsInputRequested(false);
    routerRef.current?.runCode(currentFile.lang, currentFile.content, { cppMode });
  };
  const handleStop = () => { setIsInputRequested(false); routerRef.current?.stopAll(); };
  const handleClear = () => { setIsInputRequested(false); setTerminalOutput([{ type: "system", text: "Terminal cleared." }]); };
  const handleTerminalInput = (text) => {
    if (!routerRef.current || !isInputRequested) return;
    routerRef.current.provideInput(text); setIsInputRequested(false);
    setTerminalOutput((p) => [...p, { type: "system", text }]);
  };

  // ── Test Cases ────────────────────────────────────────────────────────────
  const addTest = () => {
    setTestCases((prev) => {
      const id = testCounter;
      const next = [...prev, mkTest(id)];
      setTestCounter(id + 1);
      console.log('[Test] Adding test:', id, 'Total tests:', next.length);
      persistTests(next, id + 1);
      return next;
    });
  };

  const removeTest = (id) => {
    setTestCases((prev) => {
      const next = prev.filter((t) => t.id !== id);
      console.log('[Test] Removing test:', id, 'Remaining:', next.length);
      persistTests(next, testCounter);
      return next;
    });
  };

  const updateTest = (id, field, value) => {
    setTestCases((prev) => {
      const next = prev.map((t) => t.id === id ? { ...t, [field]: value } : t);
      console.log('[Test] Updating test:', id, field, '=', value?.substring?.(0, 50));
      persistTests(next, testCounter);
      return next;
    });
  };

  const toggleTestExpand = (id) => {
    const next = testCases.map((t) => t.id === id ? { ...t, expanded: !t.expanded } : t);
    setTestCases(next);
  };

  // Reset all test statuses before a new run batch
  const resetTestStatuses = (ids) => {
    setTestCases((prev) =>
      prev.map((t) => ids.includes(t.id) ? { ...t, status: "running", actualOutput: "" } : t)
    );
  };

  const runSingleTest = async (tc) => {
    if (!currentFile) return;
    if (!SUPPORTED_TEST_LANGS.includes(currentFile.lang)) {
      setTestCases((prev) => prev.map((t) =>
        t.id === tc.id ? { ...t, status: "fail", actualOutput: `Language "${currentFile.lang}" not supported in test runner.` } : t
      ));
      return;
    }

    setRunningId(tc.id);
    setTestCases((prev) => prev.map((t) => t.id === tc.id ? { ...t, status: "running", actualOutput: "" } : t));

    try {
      const actual = await runCodeWithStdin(currentFile.lang, currentFile.content, tc.input, { cppMode });
      const expected = tc.expectedOutput.trim();
      const passed   = actual === expected;
      setTestCases((prev) => prev.map((t) =>
        t.id === tc.id ? { ...t, status: passed ? "pass" : "fail", actualOutput: actual } : t
      ));
    } catch (err) {
      setTestCases((prev) => prev.map((t) =>
        t.id === tc.id ? { ...t, status: "fail", actualOutput: `Error: ${err.message}` } : t
      ));
    } finally {
      setRunningId(null);
    }
  };

  const runAllTests = async () => {
    if (!currentFile || runningAll) return;
    setRunningAll(true);
    for (const tc of testCases) {
      await runSingleTest(tc);
    }
    setRunningAll(false);
  };

  const summary = {
    total:  testCases.length,
    passed: testCases.filter((t) => t.status === "pass").length,
    failed: testCases.filter((t) => t.status === "fail").length,
  };

  const statusIcon = (tc) => {
    if (tc.status === "pass")    return <CheckCircle2 size={13} style={{ color: "#22c55e" }} />;
    if (tc.status === "fail")    return <XCircle size={13}      style={{ color: "#ef4444" }} />;
    if (tc.status === "running") return <Clock size={13}        style={{ color: "#f5c518", animation: "spin 1s linear infinite" }} />;
    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.ide}>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarLogo}>WEBIDE</span>
          <button className={`${styles.toolbarBtn} ${styles.runBtn}`} onClick={handleRun}>
            <Play size={14} style={{ marginRight: 6 }} /> Run
          </button>
          <button className={`${styles.toolbarBtn} ${styles.stopBtn}`} onClick={handleStop}>
            <Square size={14} style={{ marginRight: 6 }} /> Stop
          </button>
          <button className={styles.toolbarBtn} onClick={handleClear}>
            <RotateCcw size={14} style={{ marginRight: 6 }} /> Clear
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${styles.toolbarOpenTests}`}
            onClick={() => setSidebarPanel(PANEL_TESTS)}
            title="Open the test cases panel (stdin + expected output)"
          >
            <FlaskConical size={15} style={{ marginRight: 6 }} />
            Test cases
          </button>
          <button
            className={`${styles.toolbarBtn} ${styles.testRunBtn}`}
            onClick={runAllTests}
            disabled={runningAll || !currentFile}
            title="Run all test cases against current file"
          >
            <FlaskConical size={14} style={{ marginRight: 6 }} />
            {runningAll ? "Running…" : "Run suite"}
            {summary.failed > 0
              ? <span className={styles.testBtnBadge} style={{ background: "#ef4444" }}>{summary.failed} ✗</span>
              : summary.passed > 0
              ? <span className={styles.testBtnBadge} style={{ background: "#22c55e" }}>{summary.passed} ✓</span>
              : <span className={styles.testBtnBadge} style={{ background: "#444" }}>{summary.total}</span>
            }
          </button>
        </div>
        <div className={styles.toolbarRight}>
          {(currentFile?.lang === "c" || currentFile?.lang === "cpp") && (
            <div className={styles.modeSwitch}>
              <button className={`${styles.modeBtn} ${cppMode === "light" ? styles.modeBtnActive : ""}`} onClick={() => setCppMode("light")}>Light</button>
              <button className={`${styles.modeBtn} ${cppMode === "full"  ? styles.modeBtnActive : ""}`} onClick={() => setCppMode("full")}>Full C++</button>
            </div>
          )}
          {currentFile && <span className={styles.langIndicator}>{currentFile.lang}</span>}
        </div>
      </div>

      <div className={styles.mainContent}>

        {/* ── Sidebar ── */}
        <div className={styles.sidebar}>

          {/* Panel icons */}
          <div className={styles.sidebarPanelTabs}>
            <button
              type="button"
              className={`${styles.sidebarPanelTab} ${styles.sidebarPanelTabWide} ${sidebarPanel === PANEL_EXPLORER ? styles.sidebarPanelTabActive : ""}`}
              onClick={() => setSidebarPanel(PANEL_EXPLORER)}
              title="Files in workspace"
            >
              <Folder size={16} className={styles.sidebarTabIcon} />
              <span className={styles.sidebarTabLabel}>Files</span>
            </button>
            <button
              type="button"
              className={`${styles.sidebarPanelTab} ${styles.sidebarPanelTabWide} ${styles.sidebarPanelTabTests} ${sidebarPanel === PANEL_TESTS ? styles.sidebarPanelTabActive : ""}`}
              onClick={() => setSidebarPanel(PANEL_TESTS)}
              title="Test cases — stdin & expected stdout"
              style={{ position: "relative" }}
            >
              <FlaskConical size={16} className={styles.sidebarTabIcon} />
              <span className={styles.sidebarTabLabel}>Tests</span>
              {(summary.passed > 0 || summary.failed > 0) && (
                <span className={styles.testBadge} style={{ background: summary.failed > 0 ? "#ef4444" : "#22c55e" }}>
                  {summary.failed > 0 ? summary.failed : summary.passed}
                </span>
              )}
            </button>
          </div>

          {/* ── Explorer panel ── */}
          {sidebarPanel === PANEL_EXPLORER && (
            <>
              <div className={styles.sidebarHeader}>
                <span>Explorer</span>
                <div className={styles.sidebarHeaderActions}>
                  <button
                    type="button"
                    className={styles.explorerJumpTests}
                    onClick={() => setSidebarPanel(PANEL_TESTS)}
                    title="Switch to test cases"
                  >
                    Tests →
                  </button>
                  <button type="button" className={`${styles.sidebarHeaderBtn} ${styles.sidebarHeaderBtnPrimary}`} onClick={startCreateFile} title="New file">
                    <FilePlus size={14} />
                  </button>
                </div>
              </div>
              <div className={styles.fileTree}>
                {files.map((folder) => (
                  <div key={folder.name}>
                    <div className={`${styles.fileItem} ${styles.folderItem}`} onClick={() => toggleFolder(folder.name)}>
                      <span className={styles.fileIcon}>
                        {expandedFolders[folder.name] ? <FolderOpen size={16} /> : <Folder size={16} />}
                      </span>
                      <span>{folder.name}</span>
                    </div>

                    {expandedFolders[folder.name] && (
                      <>
                        {folder.children.map((file) => (
                          <div
                            key={file.name}
                            className={`${styles.fileItem} ${styles.nestedItem} ${activeFile === file.name ? styles.fileItemActive : ""}`}
                            onClick={() => renamingFile !== file.name && openFile(file)}
                          >
                            <span className={styles.fileIcon}>{getFileIcon(file.icon)}</span>

                            {renamingFile === file.name ? (
                              <div className={styles.renameRow} onClick={(e) => e.stopPropagation()}>
                                <input
                                  ref={renameInputRef}
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={onRenameKeyDown}
                                  className={styles.newFileInput}
                                  style={{ flex: 1 }}
                                />
                                <button className={styles.renameConfirmBtn} onClick={confirmRename} title="Confirm rename"><Check size={11} /></button>
                                <button className={styles.renameCancelBtn} onClick={() => setRenamingFile(null)} title="Cancel"><X size={11} /></button>
                              </div>
                            ) : (
                              <>
                                <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {file.name}
                                  {dirtyFiles.has(file.name) && <span className={styles.dirtyDot} title="Unsaved changes" />}
                                </span>
                                <div className={styles.fileActions}>
                                  <button className={styles.fileActionBtn} onClick={(e) => startRename(e, file.name)} title="Rename file"><Pencil size={11} /></button>
                                  <button className={`${styles.fileActionBtn} ${styles.fileDeleteBtn}`} onClick={(e) => deleteFile(e, file.name)} title="Delete file"><Trash2 size={11} /></button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}

                        {isCreatingFile && (
                          <div className={`${styles.fileItem} ${styles.nestedItem} ${styles.newFileCard}`}>
                            <div className={styles.newFileCardInner}>
                              <span className={styles.fileIcon}><FilePlus size={14} /></span>
                              <div className={styles.newFileFields}>
                                <span className={styles.newFileTitle}>New file</span>
                                <input
                                  ref={newFileInputRef}
                                  type="text"
                                  value={newFileName}
                                  onChange={(e) => setNewFileName(e.target.value)}
                                  onKeyDown={onCreateKeyDown}
                                  onBlur={doCreateFile}
                                  placeholder="e.g. solution.cpp"
                                  className={styles.newFileInput}
                                />
                                <span className={styles.newFileHint}>Enter — create · Esc — cancel</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Test Cases panel ── */}
          {sidebarPanel === PANEL_TESTS && (
            <>
              <div className={`${styles.sidebarHeader} ${styles.testsSidebarHeader}`}>
                <span>Test cases</span>
                <div className={styles.testsHeaderActions}>
                  <button
                    type="button"
                    className={`${styles.addTestPrimary} ${styles.sidebarHeaderBtn}`}
                    onClick={addTest}
                    title="Add a new test case"
                  >
                    <PlusCircle size={14} style={{ marginRight: 4 }} />
                    Add test
                  </button>
                  <button type="button" className={styles.sidebarHeaderBtn} onClick={runAllTests} disabled={runningAll || !currentFile} title="Run all tests">
                    <PlayCircle size={14} />
                  </button>
                </div>
              </div>

              <div className={styles.testsPromoStrip}>
                <FlaskConical size={14} className={styles.testsPromoIcon} />
                <span>Compare <strong>stdin</strong> → run → <strong>expected stdout</strong> for the open file.</span>
              </div>

              {/* Summary strip */}
              {(summary.passed > 0 || summary.failed > 0) && (
                <div className={styles.testSummaryBar}>
                  <span style={{ color: "#22c55e" }}>✓ {summary.passed}</span>
                  {summary.failed > 0 && <span style={{ color: "#ef4444" }}>✗ {summary.failed}</span>}
                  <span style={{ color: "#666" }}>/ {summary.total}</span>
                </div>
              )}

              <div className={styles.testList}>
                {testCases.length === 0 && (
                  <div className={styles.testEmpty}>
                    <div className={styles.testEmptyVisual} aria-hidden="true">
                      <FlaskConical size={28} />
                    </div>
                    <p className={styles.testEmptyTitle}>Build your first check</p>
                    <p className={styles.testEmptyCopy}>
                      Add stdin and the exact output you expect. Use the violet <strong>Add test</strong> button above or the toolbar.
                    </p>
                    <button type="button" className={styles.testAddFirstBtn} onClick={addTest}>
                      <PlusCircle size={14} style={{ marginRight: 6 }} /> Add test case
                    </button>
                  </div>
                )}

                {testCases.map((tc) => (
                  <div
                    key={tc.id}
                    className={`${styles.testCase} ${tc.status === "pass" ? styles.testCasePass : tc.status === "fail" ? styles.testCaseFail : ""}`}
                  >
                    {/* Header */}
                    <div className={styles.testCaseHeader} onClick={() => toggleTestExpand(tc.id)}>
                      <span className={styles.testCaseChevron}>
                        {tc.expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </span>
                      <span className={styles.testCaseLabel}>{tc.label}</span>
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                        {statusIcon(tc)}
                        <button
                          className={styles.testRunSingleBtn}
                          onClick={(e) => { e.stopPropagation(); runSingleTest(tc); }}
                          disabled={runningAll || runningId === tc.id}
                          title="Run this test"
                        >
                          <Play size={9} />
                        </button>
                        <button
                          className={styles.testDeleteBtn}
                          onClick={(e) => { e.stopPropagation(); removeTest(tc.id); }}
                          title="Remove test"
                        >
                          <X size={9} />
                        </button>
                      </span>
                    </div>

                    {/* Body */}
                    {tc.expanded && (
                      <div className={styles.testCaseBody}>
                        <label className={styles.testLabel}>
                          Label
                          <input className={styles.testInput} value={tc.label}
                            onChange={(e) => updateTest(tc.id, "label", e.target.value)} />
                        </label>

                        <label className={styles.testLabel}>
                          Input (stdin)
                          <textarea className={styles.testTextarea} rows={3} value={tc.input}
                            onChange={(e) => updateTest(tc.id, "input", e.target.value)}
                            placeholder="Leave empty if no stdin needed" />
                        </label>

                        <label className={styles.testLabel}>
                          Expected Output
                          <textarea className={styles.testTextarea} rows={3} value={tc.expectedOutput}
                            onChange={(e) => updateTest(tc.id, "expectedOutput", e.target.value)}
                            placeholder="Expected stdout (trimmed for comparison)" />
                        </label>

                        {/* Result */}
                        {tc.status !== "idle" && (
                          <div className={`${styles.testResult} ${
                            tc.status === "pass"    ? styles.testResultPass :
                            tc.status === "fail"    ? styles.testResultFail :
                                                      styles.testResultRunning}`}>
                            <div className={styles.testResultLabel}>
                              {tc.status === "running" && "⏳ Running…"}
                              {tc.status === "pass"    && "✓ Passed"}
                              {tc.status === "fail"    && "✗ Failed — Actual output:"}
                            </div>
                            {tc.actualOutput !== "" && tc.status !== "running" && (
                              <pre className={styles.testActualOutput}>
                                {tc.actualOutput || "(no output)"}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Editor + Terminal ── */}
        <div className={styles.editorTerminalSplit}>
          <div className={styles.tabBar}>
            {openTabs.map((tab) => (
              <div
                key={tab.name}
                className={`${styles.tab} ${activeFile === tab.name ? styles.tabActive : ""}`}
                onClick={() => openFile({ name: tab.name, icon: tab.icon })}
              >
                <span className={styles.tabIcon}>{getFileIcon(tab.icon)}</span>
                {tab.name}
                {dirtyFiles.has(tab.name) && <span className={styles.tabDirty} />}
                <button className={styles.tabClose} onClick={(e) => closeTab(e, tab.name)}>×</button>
              </div>
            ))}
          </div>

          <div className={styles.editorArea}>
            {currentFile ? (
              <Editor
                height="100%"
                language={currentFile.lang}
                theme="vs-dark"
                value={currentFile.content}
                onChange={handleEditorChange}
                path={currentFile.name}
                options={{
                  minimap: { enabled: false }, fontSize: 14,
                  fontFamily: "var(--font-mono)", padding: { top: 16 },
                  scrollBeyondLastLine: false, smoothScrolling: true,
                }}
                loading={<div style={{ padding: 20, color: "#888" }}>Loading editor…</div>}
              />
            ) : (
              <div style={{ padding: 20, color: "#888" }}>Select a file to edit</div>
            )}
          </div>

          <div className={styles.hResizeHandle} />

          <div className={styles.terminalArea} style={{ padding: 0, overflow: "hidden" }}>
            <Terminal
              output={terminalOutput}
              onClear={handleClear}
              isInputRequested={isInputRequested}
              onInputSubmit={handleTerminalInput}
            />
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={`${styles.statusItem} ${styles.statusReady}`}>Ready</span>
          <span className={styles.statusItem}>{currentFile?.lang || "—"}</span>
          {(currentFile?.lang === "c" || currentFile?.lang === "cpp") && (
            <span className={styles.statusItem}>{cppMode === "full" ? "Full C++" : "Light C/C++"}</span>
          )}
          {dirtyFiles.has(activeFile) && (
            <span className={styles.statusItem} style={{ color: "#f5c518" }}>● Saving…</span>
          )}
        </div>
        <div className={styles.statusRight}>
          <span className={styles.statusItem} style={{
            color: summary.failed > 0 ? "#ef4444" : summary.passed > 0 ? "#22c55e" : "#888"
          }}>
            Tests {summary.passed}/{summary.total}
          </span>
          <span className={styles.statusItem}>UTF-8</span>
          <span className={styles.statusItem}>OPFS</span>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
