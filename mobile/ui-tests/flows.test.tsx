// UI integration tests: the real App (screens, navigation, contexts, sync engine,
// SQLite SQL) driven like a user, against the real backend on localhost:4000.
// Only device hardware is simulated: GPS, network on/off, native SQLite bridge.
// Requires: backend running with seed data (npm run dev / npm --prefix backend run dev).
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';
import { closeDb } from '../src/storage/database';

/* eslint-disable @typescript-eslint/no-require-imports */
const netinfo = require('./mocks/netinfo');
const location = require('./mocks/location');
const kv = require('./mocks/kvStore');
const API: string = (globalThis as unknown as { __RM_API__: string }).__RM_API__;

const LONG = { timeout: 25000 };

async function http<T = unknown>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json()) as { data: T; error?: { message: string } };
  if (!res.ok) throw new Error(`${res.status} ${json.error?.message}`);
  return json.data;
}
const tokenFor = async (email: string, password: string) =>
  (await http<{ token: string }>('/auth/login', { method: 'POST', body: { email, password } })).token;
const findOnServer = async (token: string, text: string) => http<Array<{ id: string; status: string; channel: string; latitude: number }>>(`/emergencies?search=${encodeURIComponent(text)}`, { token });

function signOutDevice() {
  kv.__store.delete('session.token');
  kv.__store.delete('session.user');
}

async function boot() {
  await render(<App />);
}

async function signIn(email: string, password: string) {
  signOutDevice();
  await boot();
  await screen.findByLabelText('Connection: Online', {}, LONG);
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
}

const tag = () => Math.random().toString(36).slice(2, 8);
let responderToken: string;

beforeAll(async () => {
  responderToken = await tokenFor('responder@rescuemesh.org', 'Responder@123');
});
afterEach(() => {
  netinfo.__setConnected(true);
  location.__setPermission('granted');
});

test('victim: log in -> SOS with GPS -> appears on server/dashboard API -> responder update visible on phone', async () => {
  await signIn('victim@rescuemesh.org', 'Victim@1234');
  expect(await screen.findByText('Hello, Ali', {}, LONG)).toBeTruthy();
  // header layout: fixed status-bar backdrop outside the scroll view; greeting limited to one line
  expect(screen.getByTestId('status-bar-backdrop')).toBeTruthy();
  expect(screen.getByText('Hello, Ali').props.numberOfLines).toBe(1);

  await fireEvent.press(screen.getByLabelText('SOS. Request emergency help'));
  expect(await screen.findByText('Location found', {}, LONG)).toBeTruthy(); // GPS permission granted + fix
  await fireEvent.press(screen.getByText('Trapped person'));
  const desc = `UI online test ${tag()}`;
  await fireEvent.changeText(screen.getByPlaceholderText(/Water rising/), desc);
  await fireEvent.press(screen.getByRole('button', { name: 'SEND SOS' }));

  expect(await screen.findByText('Your SOS has reached the emergency operations center.', {}, LONG)).toBeTruthy();
  // nobody assigned yet -> explicit "Not assigned", no responder phone shown
  expect(await screen.findByText('Not assigned', {}, LONG)).toBeTruthy();
  expect(screen.queryByText('Responder phone')).toBeNull();

  const [onServer] = await findOnServer(responderToken, desc);
  expect(onServer).toBeTruthy();
  expect(onServer.channel).toBe('ONLINE');
  expect(onServer.latitude).toBeCloseTo(33.556, 4);

  // responder acts (as from the dashboard)
  await http(`/emergencies/${onServer.id}/assign`, { method: 'PATCH', token: responderToken, body: {} });
  await http(`/emergencies/${onServer.id}/status`, { method: 'PATCH', token: responderToken, body: { status: 'RESOLVED' } });
  // the open details screen refreshes every 10 s
  await waitFor(() => expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0), { timeout: 30000 });
  // the responder shown is exactly the one assigned in the backend, with their (fictional demo) phone
  expect(screen.getAllByText('Ayesha Malik').length).toBeGreaterThan(0);
  expect(screen.getByText('+961 70 000 101')).toBeTruthy();
  expect(screen.queryByText('Not assigned')).toBeNull();
});

test('victim offline: SOS queued in SQLite, survives app restart, syncs automatically when network returns', async () => {
  await signIn('victim@rescuemesh.org', 'Victim@1234');
  await screen.findByText('Hello, Ali', {}, LONG);

  netinfo.__setConnected(false); // like airplane mode
  expect(await screen.findByLabelText('Connection: Offline', {}, LONG)).toBeTruthy();
  expect(screen.getByText(/No network connection/)).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('SOS. Request emergency help'));
  await screen.findByText('Location found', {}, LONG); // GPS works offline
  await fireEvent.press(screen.getByText('Fire'));
  const desc = `UI offline test ${tag()}`;
  await fireEvent.changeText(screen.getByPlaceholderText(/Water rising/), desc);
  await fireEvent.press(screen.getByRole('button', { name: 'SAVE SOS (send when online)' }));
  expect(await screen.findByText(/saved on this phone and will be sent/, {}, LONG)).toBeTruthy();
  expect(screen.getAllByText(/^Queued .* will send when online$/).length).toBeGreaterThan(0);
  expect(await findOnServer(responderToken, desc)).toHaveLength(0);

  // --- app closed and reopened (database connection closed and re-opened from the file)
  screen.unmount();
  await closeDb();
  await boot();
  expect(await screen.findByText('Hello, Ali', {}, LONG)).toBeTruthy(); // session restored offline
  expect(await screen.findByText('Pending offline messages', {}, LONG)).toBeTruthy();
  // the queued SOS was read back from the database file after the restart
  expect(await screen.findByText('Saved on this phone. Will send automatically when online.', {}, LONG)).toBeTruthy();

  // --- network returns -> automatic sync, no user action
  netinfo.__setConnected(true);
  await waitFor(async () => expect(await findOnServer(responderToken, desc)).toHaveLength(1), { timeout: 30000, interval: 1000 });
  const [synced] = await findOnServer(responderToken, desc);
  expect(synced.channel).toBe('OFFLINE_SYNC');
  await waitFor(() => expect(screen.getByText(/Nothing waiting to be sent|All delivered/)).toBeTruthy(), LONG);
});

test('responder: incoming list -> accept -> in progress -> resolved from the mobile app', async () => {
  const victimToken = await tokenFor('fatima@example.com', 'Victim@1234');
  const desc = `UI responder test ${tag()}`;
  const created = await http<{ id: string }>('/emergencies', {
    method: 'POST',
    token: victimToken,
    body: { type: 'MEDICAL', priority: 'CRITICAL', description: desc, latitude: 33.5535, longitude: 35.4035 },
  });

  await signIn('responder@rescuemesh.org', 'Responder@123');
  expect(await screen.findByText('Incoming emergencies', {}, LONG)).toBeTruthy();
  expect(screen.getByTestId('status-bar-backdrop')).toBeTruthy();
  await fireEvent.press(await screen.findByText(desc, {}, LONG));

  await fireEvent.press(await screen.findByRole('button', { name: 'Accept emergency' }, LONG));
  expect(await screen.findAllByText('Responder assigned', {}, LONG)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Mark In Progress' }));
  expect(await screen.findAllByText('Rescue in progress', {}, LONG)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Mark Resolved' }));
  expect(await screen.findByText('This request is resolved.', {}, LONG)).toBeTruthy();

  const final = await http<{ status: string; responder: { email: string } }>(`/emergencies/${created.id}`, { token: responderToken });
  expect(final.status).toBe('RESOLVED');
  expect(final.responder.email).toBe('responder@rescuemesh.org');
});

test('GPS permission blocked: SOS cannot be sent without location and the app offers phone settings', async () => {
  location.__setPermission('blocked');
  await signIn('victim@rescuemesh.org', 'Victim@1234');
  await screen.findByText('Hello, Ali', {}, LONG);
  expect(await screen.findByText('Permission denied', {}, LONG)).toBeTruthy(); // home GPS tile
  await fireEvent.press(screen.getByLabelText('SOS. Request emergency help'));
  expect(await screen.findByText(/Location access is blocked/, {}, LONG)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open phone settings' })).toBeTruthy();
  await fireEvent.press(screen.getByText('Medical emergency'));
  expect(screen.getByRole('button', { name: 'SEND SOS' })).toBeDisabled();
});

test('every victim screen renders; registration creates a working account', async () => {
  signOutDevice();
  await boot();
  await screen.findByLabelText('Connection: Online', {}, LONG);
  await fireEvent.press(screen.getByText('Create an account', { exact: false }));
  const email = `ui-${tag()}@example.com`;
  await fireEvent.changeText(await screen.findByLabelText('Full name', {}, LONG), 'Test Citizen');
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), 'Password123');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Password123');
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByText('Hello, Test', {}, LONG)).toBeTruthy();

  await fireEvent.press(screen.getByText('My Requests'));
  expect(await screen.findByText('No emergency requests yet.', {}, LONG)).toBeTruthy();
  await fireEvent.press(screen.getByText('My Location'));
  expect(await screen.findByRole('button', { name: 'Share my location' }, LONG)).toBeTruthy();
  expect(await screen.findByText('33.55600, 35.39200', {}, LONG)).toBeTruthy();
  await fireEvent.press(screen.getAllByText('Profile')[0]);
  expect(await screen.findByText(email, { exact: false }, LONG)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  expect(await screen.findByLabelText('Simulate no connectivity', {}, LONG)).toBeTruthy();
  expect(screen.getByText(/No LoRa hardware paired/)).toBeTruthy();
});
