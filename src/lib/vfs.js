// Virtual Filesystem using IndexedDB

const DB_NAME = "WebIDE_VFS";
const STORE_NAME = "files";
const DB_VERSION = 1;

let dbPromise = null;

function getDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "path" });
      }
    };
  });

  return dbPromise;
}

export const vfs = {
  async saveFile(path, content, metadata = {}) {
    console.log(`[VFS] Saving file "${path}", size: ${content?.length || 0} bytes`);
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const data = { path, content, ...metadata, timestamp: Date.now() };
      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`[VFS] ✓ Saved "${path}" successfully`);
        resolve(true);
      };
      request.onerror = () => {
        console.error(`[VFS] ✗ Failed to save "${path}":`, request.error);
        reject(request.error);
      };
    });
  },

  async readFile(path) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(path);

      request.onsuccess = () => resolve(request.result ? request.result.content : null);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteFile(path) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(path);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  async listFiles() {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
};
