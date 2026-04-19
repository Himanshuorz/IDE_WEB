export const getPythonWorker = () => new Worker("/workers/python.worker.js");
export const getJsWorker = () => new Worker(new URL("../workers/js.worker.js", import.meta.url), { type: "module" });
export const getSqliteWorker = () => new Worker("/workers/sqlite.worker.js");
export const getPgliteWorker = () => new Worker("/workers/pglite.worker.js", { type: "module" });
export const getCCppWorker = () => new Worker(new URL("../workers/c-cpp.worker.js", import.meta.url), { type: "module" });
export const getFullCppWorker = () => new Worker(new URL("../workers/cpp-full.worker.js", import.meta.url), { type: "module" });
