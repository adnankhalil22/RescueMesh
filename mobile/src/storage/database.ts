// Local SQLite database: the persistent outbox and the user's SOS requests.
// Everything an SOS needs is written here BEFORE any network attempt, so a
// request survives the app closing, the phone restarting, or no signal.

import * as SQLite from 'expo-sqlite';
import type { MeshPacket } from '../mesh/packet';
import type { OutboxItem, OutboxPatch, OutboxStore, SyncResult } from '../sync/syncEngine';
import type { DeliveryStatus, EmergencyStatus, LocalRequest, ServerEmergency } from '../types';

const SCHEMA_VERSION = 1;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('rescuemesh.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS outbox (
            id TEXT PRIMARY KEY NOT NULL,
            type TEXT NOT NULL,
            packet TEXT NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            request_id TEXT,
            user_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, next_attempt_at);
          CREATE TABLE IF NOT EXISTS requests (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL,
            message_id TEXT,
            type TEXT NOT NULL,
            priority TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            accuracy REAL,
            people_count INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'PENDING',
            responder_name TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id, created_at);
          PRAGMA user_version = ${SCHEMA_VERSION};
        `);
      }
      return db;
    })();
  }
  return dbPromise;
}

interface OutboxRow {
  id: string;
  type: string;
  packet: string;
  status: DeliveryStatus;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  request_id: string | null;
  created_at: number;
  updated_at: number;
}

const toItem = (r: OutboxRow): OutboxItem => ({
  id: r.id,
  packet: JSON.parse(r.packet) as MeshPacket,
  status: r.status,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  lastError: r.last_error,
  requestId: r.request_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Adds a message to the outbox (idempotent on message id). */
export async function enqueue(userId: string, packet: MeshPacket, status: DeliveryStatus, requestId: string | null) {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT OR IGNORE INTO outbox (id, type, packet, status, attempts, next_attempt_at, request_id, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
    [packet.messageId, packet.type, JSON.stringify(packet), status, requestId, userId, now, now],
  );
}

/** Saves a new SOS and its outbox message atomically. */
export async function saveSos(userId: string, req: Omit<LocalRequest, 'deliveryStatus' | 'attempts' | 'lastError' | 'responderName' | 'userId'>, packet: MeshPacket, initial: DeliveryStatus) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO requests (id, user_id, message_id, type, priority, description, latitude, longitude, accuracy, people_count, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.id, userId, req.messageId, req.type, req.priority, req.description, req.latitude, req.longitude, req.accuracy, req.peopleCount, req.status, req.createdAt, req.updatedAt],
    );
    await txn.runAsync(
      `INSERT INTO outbox (id, type, packet, status, attempts, next_attempt_at, request_id, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      [packet.messageId, packet.type, JSON.stringify(packet), initial, req.id, userId, req.createdAt, req.createdAt],
    );
  });
}

/** OutboxStore implementation for the sync engine, scoped to one user. */
export function createOutboxStore(userId: string): OutboxStore {
  return {
    async listSendable(now, limit) {
      const db = await getDb();
      const rows = await db.getAllAsync<OutboxRow>(
        `SELECT * FROM outbox WHERE user_id = ? AND status IN ('PENDING','QUEUED','SENT') AND next_attempt_at <= ?
         ORDER BY created_at ASC LIMIT ?`,
        [userId, now, limit],
      );
      return rows.map(toItem);
    },
    async update(id: string, patch: OutboxPatch, now: number) {
      const db = await getDb();
      const sets: string[] = ['updated_at = ?'];
      const vals: (string | number | null)[] = [now];
      if (patch.status !== undefined) (sets.push('status = ?'), vals.push(patch.status));
      if (patch.attempts !== undefined) (sets.push('attempts = ?'), vals.push(patch.attempts));
      if (patch.nextAttemptAt !== undefined) (sets.push('next_attempt_at = ?'), vals.push(patch.nextAttemptAt));
      if (patch.lastError !== undefined) (sets.push('last_error = ?'), vals.push(patch.lastError));
      await db.runAsync(`UPDATE outbox SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
    },
    async onDelivered(item: OutboxItem, result: SyncResult) {
      if (item.requestId && result.requestStatus) {
        const db = await getDb();
        await db.runAsync('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?', [result.requestStatus, Date.now(), item.requestId]);
      }
    },
  };
}

export async function outboxCounts(userId: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: DeliveryStatus; n: number }>(
    'SELECT status, COUNT(*) AS n FROM outbox WHERE user_id = ? GROUP BY status',
    [userId],
  );
  const counts: Record<DeliveryStatus, number> = { PENDING: 0, QUEUED: 0, SENT: 0, DELIVERED: 0, FAILED: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return { ...counts, unsent: counts.PENDING + counts.QUEUED + counts.SENT };
}

export async function listOutbox(userId: string, limit = 50): Promise<OutboxItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM outbox WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  return rows.map(toItem);
}

/** Re-queue a message (manual retry, also for FAILED). */
export async function requeue(messageId: string) {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET status = 'QUEUED', next_attempt_at = 0, last_error = NULL, updated_at = ? WHERE id = ?", [Date.now(), messageId]);
}

export async function clearDelivered(userId: string) {
  const db = await getDb();
  const res = await db.runAsync(
    "DELETE FROM outbox WHERE user_id = ? AND status = 'DELIVERED' AND type <> 'SOS'",
    [userId],
  );
  return res.changes;
}

interface RequestRow {
  id: string;
  user_id: string;
  message_id: string;
  type: LocalRequest['type'];
  priority: LocalRequest['priority'];
  description: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  people_count: number;
  status: EmergencyStatus;
  responder_name: string | null;
  created_at: number;
  updated_at: number;
  delivery_status: DeliveryStatus | null;
  attempts: number | null;
  last_error: string | null;
}

const toRequest = (r: RequestRow): LocalRequest => ({
  id: r.id,
  userId: r.user_id,
  messageId: r.message_id,
  type: r.type,
  priority: r.priority,
  description: r.description,
  latitude: r.latitude,
  longitude: r.longitude,
  accuracy: r.accuracy,
  peopleCount: r.people_count,
  status: r.status,
  responderName: r.responder_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  // requests downloaded from the server (e.g. made on another device) have no outbox row
  deliveryStatus: r.delivery_status ?? 'DELIVERED',
  attempts: r.attempts ?? 0,
  lastError: r.last_error,
});

const REQUEST_SELECT = `SELECT r.*, o.status AS delivery_status, o.attempts, o.last_error
  FROM requests r LEFT JOIN outbox o ON o.id = r.message_id`;

export async function listRequests(userId: string, limit = 100): Promise<LocalRequest[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RequestRow>(`${REQUEST_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT ?`, [userId, limit]);
  return rows.map(toRequest);
}

export async function getRequest(id: string): Promise<LocalRequest | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<RequestRow>(`${REQUEST_SELECT} WHERE r.id = ?`, [id]);
  return row ? toRequest(row) : null;
}

/** Merge authoritative server state into the local copy. */
export async function upsertFromServer(userId: string, items: ServerEmergency[]) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const e of items) {
      await txn.runAsync(
        `INSERT INTO requests (id, user_id, message_id, type, priority, description, latitude, longitude, accuracy, people_count, status, responder_name, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, responder_name = excluded.responder_name,
           latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at`,
        [
          e.id,
          userId,
          e.type,
          e.priority,
          e.description,
          e.latitude,
          e.longitude,
          e.accuracy,
          e.peopleCount,
          e.status,
          e.responder?.name ?? null,
          Date.parse(e.createdAt),
          Date.parse(e.updatedAt),
        ],
      );
    }
  });
}
