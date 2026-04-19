const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  listDirectory: (dirPath) => ipcRenderer.invoke("fs:list", dirPath),
  readFile: (filePath) => ipcRenderer.invoke("fs:read", filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke("fs:write", filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke("fs:delete", filePath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke("fs:rename", oldPath, newPath),
  runJob: (payload) => ipcRenderer.invoke("judge:run", payload),
  startJob: (payload) => ipcRenderer.invoke("judge:start", payload),
  sendInput: (sessionId, text) => ipcRenderer.invoke("judge:input", sessionId, text),
  stopJob: (sessionId) => ipcRenderer.invoke("judge:stop", sessionId),
  onJudgeEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("judge:event", listener);
    return () => ipcRenderer.removeListener("judge:event", listener);
  },
});
