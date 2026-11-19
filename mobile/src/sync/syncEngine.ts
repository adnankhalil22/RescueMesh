// Offline-first synchronisation engine.
//
// Pure TypeScript (no React Native imports) so it can be unit-tested in Node.
// Storage and network are injected:
//   - OutboxStore: persistent queue (SQLite on the phone, in-memory in tests)
//   - SyncApi:     uploads a batch of packets (HTTP today; a LoRa bridge later)
//
// Delivery status lifecycle of each message:
//   PENDING  created on the device, not yet attempted
//   QUEUED   waiting for connectivity / retry back-off
//   SENT     upload in flight (persisted first, so a crash mid-upload just
//            causes a harmless re-send — the server de-duplicates by ID)
//   DELIVERED server acknowledged (accepted or already had it)
//   FAILED   server rejected the message as invalid — never retried
//            automatically; the user can re-queue it manually.

import type { MeshPacket } from '../mesh/packet';
import type { DeliveryStatus } from '../types';

export interface OutboxItem {
  id: string; // == packet.messageId
  packet: MeshPacket;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  requestId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type OutboxPatch = Partial<Pick<OutboxItem, 'status' | 'attempts' | 'nextAttemptAt' | 'lastError'>>;

export interface OutboxStore {
  /** Items with status PENDING/QUEUED/SENT whose nextAttemptAt <= now, oldest & most urgent first. */
  listSendable(now: number, limit: number): Promise<OutboxItem[]>;
  update(id: string, patch: OutboxPatch, now: number): Promise<void>;
  /** Called after the server acknowledged a message. */
  onDelivered?(item: OutboxItem, result: SyncResult): Promise<void>;
}

export interface SyncResult {
  messageId: string;
  result: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  deliveryStatus: 'DELIVERED' | 'FAILED';
  requestId?: string;
  requestStatus?: string;
  error?: string;
}

/** Thrown by SyncApi when the server cannot be reached (retry later). */
export class NetworkUnavailableError extends Error {
  readonly kind = 'network';
}
/** Thrown by SyncApi when the session is no longer valid (stop; user must log in). */
export class AuthRequiredError extends Error {
  readonly kind = 'auth';
}

export interface SyncApi {
  postMessages(packets: MeshPacket[]): Promise<SyncResult[]>;
}

export interface SyncSummary {
  attempted: number;
  delivered: number;
  failed: number;
  retrying: number;
  authRequired: boolean;
  networkError: string | null;
}

export const BASE_BACKOFF_MS = 5_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
/** SOS first, then by priority, then oldest first. */
export function sendOrder(a: OutboxItem, b: OutboxItem): number {
  const sos = Number(b.packet.type === 'SOS') - Number(a.packet.type === 'SOS');
  return sos || PRIORITY_RANK[a.packet.priority] - PRIORITY_RANK[b.packet.priority] || a.createdAt - b.createdAt;
}

export async function flushOutbox(opts: {
  store: OutboxStore;
  api: SyncApi;
  now?: () => number;
  batchSize?: number;
  /** Treat every item as due (manual "Sync now" ignores back-off). */
  ignoreBackoff?: boolean;
}): Promise<SyncSummary> {
  const now = opts.now ?? Date.now;
  const summary: SyncSummary = { attempted: 0, delivered: 0, failed: 0, retrying: 0, authRequired: false, networkError: null };
  const batchSize = opts.batchSize ?? 25;

  // Loop so a large backlog drains in several batches.
  for (let round = 0; round < 20; round++) {
    const t = now();
    const items = (await opts.store.listSendable(opts.ignoreBackoff ? Number.MAX_SAFE_INTEGER : t, batchSize)).sort(sendOrder);
    if (items.length === 0) break;
    summary.attempted += items.length;

    for (const item of items) await opts.store.update(item.id, { status: 'SENT', attempts: item.attempts + 1 }, t);

    let results: SyncResult[];
    try {
      results = await opts.api.postMessages(items.map((i) => i.packet));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const auth = err instanceof AuthRequiredError;
      for (const item of items) {
        const attempts = item.attempts + (auth ? 0 : 1);
        await opts.store.update(
          item.id,
          { status: 'QUEUED', attempts, nextAttemptAt: now() + (auth ? 0 : backoffMs(attempts)), lastError: message },
          now(),
        );
      }
      summary.retrying += items.length;
      if (auth) summary.authRequired = true;
      else summary.networkError = message;
      break;
    }

    const byId = new Map(results.map((r) => [r.messageId, r]));
    for (const item of items) {
      const r = byId.get(item.id);
      if (!r) {
        const attempts = item.attempts + 1;
        await opts.store.update(item.id, { status: 'QUEUED', nextAttemptAt: now() + backoffMs(attempts), lastError: 'No acknowledgement from server' }, now());
        summary.retrying++;
      } else if (r.deliveryStatus === 'DELIVERED') {
        await opts.store.update(item.id, { status: 'DELIVERED', lastError: null }, now());
        await opts.store.onDelivered?.(item, r);
        summary.delivered++;
      } else {
        await opts.store.update(item.id, { status: 'FAILED', lastError: r.error ?? 'Rejected by server' }, now());
        summary.failed++;
      }
    }
    if (items.length < batchSize) break;
  }
  return summary;
}
