// Controllable NetInfo: tests switch the phone's network on and off.
let state = { isConnected: true, isInternetReachable: true, type: 'wifi' };
const listeners = new Set();
const NetInfo = {
  addEventListener(cb) {
    listeners.add(cb);
    cb(state);
    return () => listeners.delete(cb);
  },
  fetch: async () => state,
};
module.exports = {
  __esModule: true,
  default: NetInfo,
  __setConnected(connected) {
    state = { ...state, isConnected: connected, isInternetReachable: connected };
    listeners.forEach((cb) => cb(state));
  },
};
