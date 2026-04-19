/* eslint-disable no-restricted-globals */

let db = null;

async function initPGlite() {
  // Import PGlite ESM from CDN
  const { PGlite } = await import("https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js");
  db = new PGlite();
  return db;
}

let dbReadyPromise = null;

function formatPgResult(result) {
  if (!result || !result.rows || result.rows.length === 0) {
    return `Query OK. ${result?.affectedRows ?? 0} row(s) affected.`;
  }

  const rows = result.rows;
  const fields = result.fields.map(f => f.name);

  // Calculate column widths
  const colWidths = fields.map(f => f.length);
  rows.forEach(row => {
    fields.forEach((f, i) => {
      const val = row[f] === null ? "NULL" : String(row[f]);
      if (val.length > colWidths[i]) {
        colWidths[i] = val.length;
      }
    });
  });

  const sep = "+" + colWidths.map(w => "-".repeat(w + 2)).join("+") + "+";
  const header = "|" + fields.map((f, i) => ` ${f.padEnd(colWidths[i])} `).join("|") + "|";

  let output = sep + "\n" + header + "\n" + sep + "\n";

  rows.forEach(row => {
    const line = "|" + fields.map((f, i) => {
      const val = row[f] === null ? "NULL" : String(row[f]);
      return ` ${val.padEnd(colWidths[i])} `;
    }).join("|") + "|";
    output += line + "\n";
  });

  output += sep + "\n";
  output += `(${rows.length} row${rows.length !== 1 ? "s" : ""})`;

  return output;
}

self.onmessage = async (event) => {
  const { id, code, type } = event.data;

  if (type === "init") {
    try {
      self.postMessage({ id, type: "stdout", text: "[PGlite] Loading Postgres WASM runtime..." });
      if (!dbReadyPromise) {
        dbReadyPromise = initPGlite();
      }
      await dbReadyPromise;
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", error: error.message });
    }
    return;
  }

  if (type === "exec") {
    try {
      if (!dbReadyPromise) {
        dbReadyPromise = initPGlite();
      }
      await dbReadyPromise;

      self.postMessage({ id, type: "stdout", text: "[PGlite] Executing PostgreSQL query..." });

      // Split by semicolons to run multiple statements
      const statements = code
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        const result = await db.query(stmt);
        const formatted = formatPgResult(result);
        self.postMessage({ id, type: "stdout", text: formatted });
      }

      self.postMessage({ id, type: "done" });
    } catch (error) {
      self.postMessage({ id, type: "stderr", text: error.message });
      self.postMessage({ id, type: "done", error: error.message });
    }
  }
};
