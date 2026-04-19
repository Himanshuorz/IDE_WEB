const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const { constants } = require("node:fs");
const { JudgeEngine } = require("./engine/judge-engine");

let mainWindow;
const judgeEngine = new JudgeEngine();

// Force writable app data/cache locations to avoid Windows cache permission errors.
const writableRoot = path.join(app.getPath("temp"), "webide-electron");
const writableUserData = path.join(writableRoot, "user-data");
const writableCache = path.join(writableRoot, "cache");

try {
  fsSync.mkdirSync(writableUserData, { recursive: true });
  fsSync.mkdirSync(writableCache, { recursive: true });
  app.setPath("userData", writableUserData);
  app.setPath("sessionData", writableCache);
  app.commandLine.appendSwitch("disk-cache-dir", writableCache);
  app.commandLine.appendSwitch("disable-http-cache");
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
  app.commandLine.appendSwitch("disable-features", "RendererCodeIntegrity,NetworkService");
  app.commandLine.appendSwitch("enable-features", "NetworkServiceInProcess");
  app.commandLine.appendSwitch("no-proxy-server");
} catch (error) {
  console.error("Failed to configure writable Electron cache paths:", error);
}

// Improve stability on some Windows machines where GPU/network service can crash.
app.disableHardwareAcceleration();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#10161d",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep secure defaults while avoiding strict sandbox crashes on some setups.
      sandbox: false,
    },
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process exited:", details);
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.error("Renderer became unresponsive.");
  });

  mainWindow.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) {
      console.error("Renderer console:", message);
    }
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  judgeEngine.shutdown();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("workspace:pick", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select Workspace Folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, error: "Workspace selection cancelled." };
  }

  return { ok: true, workspacePath: result.filePaths[0] };
});

ipcMain.handle("fs:list", async (_event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("fs:read", async (_event, filePath) => {
  try {
    await fs.access(filePath, constants.R_OK);
    const content = await fs.readFile(filePath, "utf8");
    return { ok: true, content };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("fs:write", async (_event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("fs:delete", async (_event, filePath) => {
  try {
    await fs.unlink(filePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("fs:rename", async (_event, oldPath, newPath) => {
  try {
    await fs.rename(oldPath, newPath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("judge:run", async (_event, payload) => {
  try {
    const jobResult = await judgeEngine.start(payload, () => {});
    return { ok: true, result: jobResult };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("judge:start", async (event, payload) => {
  try {
    const jobResult = await judgeEngine.start(payload, (engineEvent) => {
      event.sender.send("judge:event", engineEvent);
    });
    return { ok: true, result: jobResult };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("judge:input", async (_event, sessionId, text) => {
  try {
    const result = judgeEngine.sendInput(sessionId, text);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("judge:stop", async (_event, sessionId) => {
  try {
    const result = judgeEngine.stopSession(sessionId);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});
