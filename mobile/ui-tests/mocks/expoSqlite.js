// expo-sqlite test double backed by Node's built-in SQLite (node:sqlite), so the
// app's real SQL (schema, inserts, joins, transactions) runs unchanged against a
// real database file. Only the native bridge is replaced.
const { DatabaseSync } = require('node:sqlite');

const norm = (params) => (params === undefined ? [] : Array.isArray(params) ? params : [params]);
const plain = (row) => (row ? { ...row } : null);

function wrap(db) {
  const api = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      const r = db.prepare(sql).run(...norm(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync(sql, params) {
      return db.prepare(sql).all(...norm(params)).map(plain);
    },
    async getFirstAsync(sql, params) {
      return plain(db.prepare(sql).get(...norm(params)));
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async withExclusiveTransactionAsync(task) {
      db.exec('BEGIN EXCLUSIVE');
      try {
        await task(api);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async closeAsync() {
      db.close();
    },
  };
  return api;
}

module.exports = {
  __esModule: true,
  openDatabaseAsync: async () => wrap(new DatabaseSync(global.__RM_DB_FILE__ || ':memory:')),
  openDatabaseSync: () => wrap(new DatabaseSync(global.__RM_DB_FILE__ || ':memory:')),
};
