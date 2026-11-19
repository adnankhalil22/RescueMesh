// In-memory OutboxStore with the same semantics as the SQLite store
// (src/storage/database.ts), plus snapshot/restore to simulate an app restart.
import type { OutboxItem, OutboxPatch, OutboxStore, SyncResult } from '../src/sync/syncEngine';
import type { MeshPacket } from '../src/mesh/packet';
import type { DeliveryStatus } from '../src/types';

export class MemoryStore implements OutboxStore {
  items = new Map<string, OutboxItem>();
  delivered: SyncResult[] = [];

  add(packet: MeshPacket, status: DeliveryStatus = 'PENDING', requestId: string | null = null) {
    if (this.items.has(packet.messageId)) return; // INSERT OR IGNORE
    const now = Date.now();
    this.items.set(packet.messageId, {
      id: packet.messageId,
      packet,
      status,
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      requestId,
      createdAt: now,
      updatedAt: now,
    });
  }

  async listSendable(now: number, limit: number) {
    return [...this.items.values()]
      .filter((i) => ['PENDING', 'QUEUED', 'SENT'].includes(i.status) && i.nextAttemptAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit)
      .map((i) => ({ ...i }));
  }

  async update(id: string, patch: OutboxPatch, now: number) {
    const cur = this.items.get(id);
    if (cur) this.items.set(id, { ...cur, ...patch, updatedAt: now });
  }

  async onDelivered(_item: OutboxItem, r: SyncResult) {
    this.delivered.push(r);
  }

  status(id: string) {
    return this.items.get(id)?.status;
  }

  /** Serialise to a string and rebuild — what survives an app restart. */
  static restart(prev: MemoryStore): MemoryStore {
    const next = new MemoryStore();
    for (const [k, v] of JSON.parse(JSON.stringify([...prev.items])) as [string, OutboxItem][]) next.items.set(k, v);
    return next;
  }
}

let n = 0;
export function makeSos(overrides: Partial<MeshPacket> = {}): MeshPacket {
  n++;
  const id = `${Date.now().toString(36)}${n}${Math.random().toString(36).slice(2, 8)}`;
  return {
    messageId: `MSG-test-${id}`,
    sourceNodeId: 'PHONE-TEST',
    destinationNodeId: 'SERVER',
    type: 'SOS',
    latitude: 33.879, // Beirut demonstration area (records created by the integration test show up on the dashboard map)
    longitude: 35.545,
    timestamp: Date.now(),
    priority: 'HIGH',
    hopCount: 0,
    maxHops: 6,
    payload: { requestId: `SOS-test-${id}`, category: 'MEDICAL', description: 'mobile sync test', peopleCount: 1, queuedOffline: true },
    ...overrides,
  };
}
