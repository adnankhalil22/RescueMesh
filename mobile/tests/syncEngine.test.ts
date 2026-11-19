import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthRequiredError, backoffMs, flushOutbox, NetworkUnavailableError, type SyncApi, type SyncResult } from '../src/sync/syncEngine';
import type { MeshPacket } from '../src/mesh/packet';
import { MemoryStore, makeSos } from './memoryStore';

/** Fake server: de-duplicates by message id like the real backend. */
class FakeServer implements SyncApi {
  online = true;
  received = new Map<string, MeshPacket>();
  calls = 0;
  reject = new Set<string>();
  async postMessages(packets: MeshPacket[]): Promise<SyncResult[]> {
    this.calls++;
    if (!this.online) throw new NetworkUnavailableError('no network');
    return packets.map((p) => {
      if (this.reject.has(p.messageId)) return { messageId: p.messageId, result: 'REJECTED', deliveryStatus: 'FAILED', error: 'invalid' };
      const dup = this.received.has(p.messageId);
      this.received.set(p.messageId, p);
      return { messageId: p.messageId, result: dup ? 'DUPLICATE' : 'ACCEPTED', deliveryStatus: 'DELIVERED', requestStatus: 'PENDING' };
    });
  }
}

test('offline: messages stay QUEUED with back-off; nothing is lost', async () => {
  const store = new MemoryStore();
  const server = new FakeServer();
  server.online = false;
  const sos = makeSos();
  store.add(sos, 'QUEUED');
  let t = 1_000_000;
  const s = await flushOutbox({ store, api: server, now: () => t });
  assert.equal(s.retrying, 1);
  assert.ok(s.networkError);
  const item = store.items.get(sos.messageId)!;
  assert.equal(item.status, 'QUEUED');
  assert.equal(item.attempts, 1);
  assert.equal(item.nextAttemptAt, t + backoffMs(1));

  // within back-off window: not attempted again
  t += 1000;
  const s2 = await flushOutbox({ store, api: server, now: () => t });
  assert.equal(s2.attempted, 0);
});

test('persistence: queue survives an app restart and syncs when connectivity returns', async () => {
  let store = new MemoryStore();
  const server = new FakeServer();
  server.online = false;
  const a = makeSos();
  const b = makeSos({ type: 'LOCATION', payload: { requestId: 'x' } });
  store.add(a, 'QUEUED');
  store.add(b, 'QUEUED');
  await flushOutbox({ store, api: server });

  store = MemoryStore.restart(store); // app closed and reopened
  assert.equal(store.items.size, 2);

  server.online = true;
  const s = await flushOutbox({ store, api: server, ignoreBackoff: true });
  assert.equal(s.delivered, 2);
  assert.equal(store.status(a.messageId), 'DELIVERED');
  assert.equal(store.status(b.messageId), 'DELIVERED');
  assert.equal(server.received.size, 2);
});

test('crash mid-upload (SENT) is retried and the server de-duplicates', async () => {
  const store = new MemoryStore();
  const server = new FakeServer();
  const sos = makeSos();
  store.add(sos);
  // server got it but the app died before recording the ack
  server.received.set(sos.messageId, sos);
  await store.update(sos.messageId, { status: 'SENT', attempts: 1 }, Date.now());
  const s = await flushOutbox({ store, api: server });
  assert.equal(s.delivered, 1);
  assert.equal(store.delivered[0].result, 'DUPLICATE');
  assert.equal(server.received.size, 1);
});

test('duplicate enqueue of the same message id is ignored', () => {
  const store = new MemoryStore();
  const sos = makeSos();
  store.add(sos);
  store.add(sos);
  assert.equal(store.items.size, 1);
});

test('rejected messages become FAILED and are not retried automatically', async () => {
  const store = new MemoryStore();
  const server = new FakeServer();
  const bad = makeSos();
  server.reject.add(bad.messageId);
  store.add(bad);
  const s = await flushOutbox({ store, api: server });
  assert.equal(s.failed, 1);
  assert.equal(store.status(bad.messageId), 'FAILED');
  const s2 = await flushOutbox({ store, api: server, ignoreBackoff: true });
  assert.equal(s2.attempted, 0);
});

test('SOS is sent before lower-priority messages', async () => {
  const store = new MemoryStore();
  const order: string[] = [];
  const api: SyncApi = {
    async postMessages(ps) {
      order.push(...ps.map((p) => p.type));
      return ps.map((p) => ({ messageId: p.messageId, result: 'ACCEPTED', deliveryStatus: 'DELIVERED' }));
    },
  };
  store.add(makeSos({ type: 'LOCATION', priority: 'HIGH' }));
  store.add(makeSos({ priority: 'LOW' }));
  store.add(makeSos({ priority: 'CRITICAL' }));
  await flushOutbox({ store, api });
  assert.deepEqual(order, ['SOS', 'SOS', 'LOCATION']);
});

test('expired session: messages stay queued without burning retries', async () => {
  const store = new MemoryStore();
  const sos = makeSos();
  store.add(sos);
  const s = await flushOutbox({
    store,
    api: {
      postMessages: async () => {
        throw new AuthRequiredError('expired');
      },
    },
  });
  assert.equal(s.authRequired, true);
  assert.equal(store.items.get(sos.messageId)!.status, 'QUEUED');
  assert.equal(store.items.get(sos.messageId)!.attempts, 0);
});

test('back-off grows exponentially and is capped', () => {
  assert.equal(backoffMs(1), 5000);
  assert.equal(backoffMs(2), 10000);
  assert.equal(backoffMs(3), 20000);
  assert.equal(backoffMs(20), 5 * 60_000);
});
