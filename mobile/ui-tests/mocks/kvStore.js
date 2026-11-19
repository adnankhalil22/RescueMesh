// expo-sqlite/kv-store test double: a process-wide map (survives a simulated app restart).
const store = new Map();
const Storage = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => void store.set(k, String(v)),
  removeItem: async (k) => void store.delete(k),
  getItemSync: (k) => (store.has(k) ? store.get(k) : null),
  setItemSync: (k, v) => void store.set(k, String(v)),
  clear: async () => store.clear(),
};
module.exports = { __esModule: true, default: Storage, __store: store };
