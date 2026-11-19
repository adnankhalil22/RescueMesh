// Replace only the phone hardware/native bridges; all app code runs for real.
const path = require('node:path');
const os = require('node:os');

// Safe-area insets come from the native side; use the library's own jest mock.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-sqlite', () => require('./mocks/expoSqlite'));
jest.mock('expo-sqlite/kv-store', () => require('./mocks/kvStore'));
jest.mock('@react-native-community/netinfo', () => require('./mocks/netinfo'));
jest.mock('expo-location', () => require('./mocks/location'));
jest.mock('expo-crypto', () => ({ __esModule: true, randomUUID: () => require('node:crypto').randomUUID() }));

// Real HTTP to the backend (RN's jest preset replaces fetch with a no-op polyfill).
global.fetch = require('./mocks/nodeFetch');

// A fresh on-disk database per test file (so a simulated restart reads real persisted data).
global.__RM_DB_FILE__ = path.join(os.tmpdir(), `rescuemesh-ui-${process.pid}-${Date.now()}.db`);

// Point the app at the locally running backend (same key the Settings screen writes).
global.__RM_API__ = process.env.RESCUEMESH_API || 'http://localhost:4000';
require('./mocks/kvStore').__store.set('settings.apiUrl', global.__RM_API__);
