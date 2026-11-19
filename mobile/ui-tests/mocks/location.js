// expo-location test double with a controllable permission state and a fixed GPS position (Lahore).
const GRANTED = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };
let permission = GRANTED;
let requested = 0;
const position = () => ({
  coords: { latitude: 31.5497, longitude: 74.3436, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: Date.now(),
});
module.exports = {
  __esModule: true,
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  getForegroundPermissionsAsync: async () => permission,
  requestForegroundPermissionsAsync: async () => {
    requested++;
    return permission;
  },
  hasServicesEnabledAsync: async () => true,
  getCurrentPositionAsync: async () => position(),
  getLastKnownPositionAsync: async () => null,
  __setPermission(p) {
    permission = p === 'granted' ? GRANTED : p === 'blocked' ? { granted: false, canAskAgain: false, status: 'denied', expires: 'never' } : { granted: false, canAskAgain: true, status: 'undetermined', expires: 'never' };
  },
  __requestCount: () => requested,
};
