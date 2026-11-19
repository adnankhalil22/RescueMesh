import * as Crypto from 'expo-crypto';
import { buildPacket } from '../mesh/packet';
import { enqueue, saveSos } from '../storage/database';
import { kv } from '../storage/kv';
import type { EmergencyType, Priority, User } from '../types';
import type { Fix } from './location';

export interface SosInput {
  type: EmergencyType;
  priority: Priority;
  description: string;
  peopleCount: number;
  fix: Fix;
}

/**
 * Creates an SOS completely offline: generates unique IDs, stores the request
 * and its outbox message in one SQLite transaction. Network delivery is the
 * sync service's job.
 */
export async function createSos(user: User, input: SosInput, online: boolean) {
  const now = Date.now();
  const requestId = `SOS-${Crypto.randomUUID()}`;
  const messageId = `MSG-${Crypto.randomUUID()}`;
  const deviceId = await kv.getDeviceId();

  const packet = buildPacket({
    messageId,
    sourceNodeId: deviceId,
    type: 'SOS',
    latitude: input.fix.latitude,
    longitude: input.fix.longitude,
    timestamp: now,
    priority: input.priority,
    payload: {
      requestId,
      category: input.type,
      description: input.description.trim(),
      peopleCount: input.peopleCount,
      accuracy: input.fix.accuracy,
      reporterName: user.name,
      queuedOffline: !online,
    },
  });

  await saveSos(
    user.id,
    {
      id: requestId,
      messageId,
      type: input.type,
      priority: input.priority,
      description: input.description.trim(),
      latitude: input.fix.latitude,
      longitude: input.fix.longitude,
      accuracy: input.fix.accuracy,
      peopleCount: input.peopleCount,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    },
    packet,
    online ? 'PENDING' : 'QUEUED',
  );
  return { requestId, messageId };
}

/** Queues a location update for an existing request (delivered like any SOS message). */
export async function queueLocationUpdate(user: User, requestId: string, fix: Fix, online: boolean) {
  const packet = buildPacket({
    messageId: `MSG-${Crypto.randomUUID()}`,
    sourceNodeId: await kv.getDeviceId(),
    type: 'LOCATION',
    latitude: fix.latitude,
    longitude: fix.longitude,
    timestamp: Date.now(),
    priority: 'HIGH',
    payload: { requestId, accuracy: fix.accuracy },
  });
  await enqueue(user.id, packet, online ? 'PENDING' : 'QUEUED', requestId);
  return packet.messageId;
}
