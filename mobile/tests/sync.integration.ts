// End-to-end check of the mobile sync engine against a RUNNING backend.
// Usage: (backend running) npx tsx tests/sync.integration.ts [http://localhost:4000]
//
// Scenario:
//   1. victim logs in
//   2. SOS created while "offline" → stays QUEUED, server has nothing
//   3. "app restart" → queue rebuilt from storage
//   4. connectivity returns → engine syncs → DELIVERED, visible to a responder
//   5. same message uploaded again → server reports DUPLICATE, no second record
//   6. responder accepts / resolves → victim sees updated status

import assert from 'node:assert/strict';
import { flushOutbox, NetworkUnavailableError, AuthRequiredError, type SyncApi, type SyncResult } from '../src/sync/syncEngine';
import type { MeshPacket } from '../src/mesh/packet';
import { MemoryStore, makeSos } from './memoryStore';

const BASE = (process.argv[2] ?? 'http://localhost:4000').replace(/\/$/, '');

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json()) as { data: T; error?: { message: string } };
  if (!res.ok) throw new Error(`${res.status} ${json.error?.message}`);
  return json.data;
}

class HttpApi implements SyncApi {
  online = true;
  constructor(private token: string) {}
  async postMessages(messages: MeshPacket[]): Promise<SyncResult[]> {
    if (!this.online) throw new NetworkUnavailableError('simulated: no connectivity');
    const res = await fetch(`${BASE}/api/sync/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ messages }),
    });
    if (res.status === 401) throw new AuthRequiredError('401');
    const json = (await res.json()) as { data: { results: SyncResult[] } };
    return json.data.results;
  }
}

async function main() {
  const victim = await call<{ token: string; user: { id: string } }>('/auth/login', { method: 'POST', body: { email: 'victim@rescuemesh.org', password: 'Victim@1234' } });
  const responder = await call<{ token: string }>('/auth/login', { method: 'POST', body: { email: 'responder@rescuemesh.org', password: 'Responder@123' } });
  console.log('✔ victim and responder logged in');

  const api = new HttpApi(victim.token);
  let store = new MemoryStore();
  const sos = makeSos({ priority: 'CRITICAL', payload: { ...makeSos().payload, category: 'TRAPPED', description: 'Integration test: created offline' } });
  const requestId = sos.payload.requestId as string;

  api.online = false;
  store.add(sos, 'QUEUED', requestId);
  const offline = await flushOutbox({ store, api });
  assert.equal(store.status(sos.messageId), 'QUEUED');
  assert.equal(offline.retrying, 1);
  await assert.rejects(call(`/emergencies/${requestId}`, { token: responder.token }), /404/);
  console.log('✔ offline: SOS QUEUED on device, not on server');

  store = MemoryStore.restart(store);
  assert.equal(store.status(sos.messageId), 'QUEUED');
  console.log('✔ restart: queue restored from storage');

  api.online = true;
  const synced = await flushOutbox({ store, api, ignoreBackoff: true });
  assert.equal(synced.delivered, 1);
  assert.equal(store.status(sos.messageId), 'DELIVERED');
  const onServer = await call<{ status: string; channel: string; createdAt: string }>(`/emergencies/${requestId}`, { token: responder.token });
  assert.equal(onServer.channel, 'OFFLINE_SYNC');
  assert.equal(new Date(onServer.createdAt).getTime(), sos.timestamp);
  console.log('✔ online: synced → DELIVERED, visible to responder as OFFLINE_SYNC with original timestamp');

  const again = await api.postMessages([sos]);
  assert.equal(again[0].result, 'DUPLICATE');
  const list = await call<{ id: string }[]>(`/emergencies?search=${requestId}`, { token: responder.token });
  assert.equal(list.length, 1);
  console.log('✔ duplicate upload acknowledged as DUPLICATE, stored once');

  await call(`/emergencies/${requestId}/assign`, { method: 'PATCH', token: responder.token, body: {} });
  await call(`/emergencies/${requestId}/status`, { method: 'PATCH', token: responder.token, body: { status: 'IN_PROGRESS' } });
  await call(`/emergencies/${requestId}/status`, { method: 'PATCH', token: responder.token, body: { status: 'RESOLVED', note: 'integration test' } });
  const mine = await call<{ id: string; status: string }[]>('/emergencies?mine=true', { token: victim.token });
  assert.equal(mine.find((m) => m.id === requestId)?.status, 'RESOLVED');
  console.log('✔ responder accepted → in progress → resolved; victim sees RESOLVED');

  console.log('\nAll integration checks passed.');
}

main().catch((e) => {
  console.error('✖ integration test failed:', e);
  process.exit(1);
});
