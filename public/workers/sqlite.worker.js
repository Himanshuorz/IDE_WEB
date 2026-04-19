/* eslint-disable no-restricted-globals */

let dbReadyPromise;
let db;

async function initSqlJs() {
  self.importScripts("https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js");
  const SQL = await self.initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
  });
  db = new SQL.Database();
  return db;
}

dbReadyPromise = initSqlJs();

function formatSqlResult(resultArr) {
  if (!resultArr || resultArr.length === 0) return "No results.";

  let output = "";
  for (const result of resultArr) {
    const { columns, values } = result;
    
    // Calculate max width for each column
    const colWidths = columns.map(col => col.length);
    values.forEach(row => {
      row.forEach((val, i) => {
        const valStr = val === null ? "NULL" : String(val);
        if (valStr.length > colWidths[i]) {
          colWidths[i] = valStr.length;
        }
      });
    });

    // Build header separator
    const separator = "+" + colWidths.map(w => "-".repeat(w + 2)).join("+") + "+";
    
    // Build header row
    const headerRow = "|" + columns.map((col, i) => ` ${col.padEnd(colWidths[i])} `).join("|") + "|";

    output += separator + "\n" + headerRow + "\n" + separator + "\n";

    // Build data rows
    values.forEach(row => {
      const dataRow = "|" + row.map((val, i) => {
        const valStr = val === null ? "NULL" : String(val);
        return ` ${valStr.padEnd(colWidths[i])} `;
      }).join("|") + "|";
      output += dataRow + "\n";
    });

    output += separator + "\n\n";
  }

  return output.trim();
}

self.onmessage = async (event) => {
  const { id, code, type } = event.data;

  if (type === "init") {
    try {
      await dbReadyPromise;
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", error: error.message });
    }
    return;
  }

  if (type === "exec") {
    try {
      await dbReadyPromise;
      self.postMessage({ id, type: "stdout", text: `[SQLite Worker] Executing query...` });
      
      const results = db.exec(code);
      
      if (results && results.length > 0) {
        const tableString = formatSqlResult(results);
        self.postMessage({ id, type: "stdout", text: tableString });
      } else {
        self.postMessage({ id, type: "stdout", text: "Query executed successfully. No records returned." });
      }
      
      self.postMessage({ id, type: "done" });
    } catch (error) {
      self.postMessage({ id, type: "stderr", text: error.message });
      self.postMessage({ id, type: "done", error: error.message });
    }
  }
};
