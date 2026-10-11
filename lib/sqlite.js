// Opens the SQLite database.
// Uses better-sqlite3 when it is installed and working. If it is not (on Windows it needs Visual Studio
// build tools to compile), falls back to the SQLite that is built into Node 22.5+ and Node 24.
function open(file) {
  try {
    const BetterSqlite3 = require("better-sqlite3");
    return new BetterSqlite3(file);
  } catch (e) {
    // fall through to the built-in one
  }
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch (e) {
    throw new Error("No SQLite available. Install Node 22.5 or newer (or fix the better-sqlite3 install).");
  }
  const d = new DatabaseSync(file);
  let depth = 0;
  return {
    pragma(s) { return d.prepare("PRAGMA " + s).all(); },
    exec(s) { d.exec(s); },
    prepare(s) {
      const st = d.prepare(s);
      return { run: (...a) => st.run(...a), get: (...a) => st.get(...a), all: (...a) => st.all(...a) };
    },
    // Same behaviour as better-sqlite3: all-or-nothing, and safe to nest
    transaction(fn) {
      return (...args) => {
        const name = "sp" + depth;
        d.exec(depth === 0 ? "BEGIN" : "SAVEPOINT " + name);
        depth++;
        try {
          const r = fn(...args);
          depth--;
          d.exec(depth === 0 ? "COMMIT" : "RELEASE " + name);
          return r;
        } catch (err) {
          depth--;
          d.exec(depth === 0 ? "ROLLBACK" : "ROLLBACK TO " + name);
          throw err;
        }
      };
    },
    close() { d.close(); },
  };
}
module.exports = { open };