// Single entry point for every message that reaches the server — whether a
// phone synchronises its offline outbox over HTTP or a (simulated) LoRa
// gateway hands over a packet. Idempotent: message IDs are unique, so a
// retried or re-forwarded message is acknowledged but never stored twice.

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { DEFAULT_PRIORITY, EMERGENCY_TYPES, type EmergencyType } from '../domain/constants';
import type { MeshPacket } from '../mesh/packet';

export type Transport = 'HTTP' | 'LORA_SIM';

export interface IngestOptions {
  transport: Transport;
  senderId?: string | null;
  path?: string[];
}

export interface IngestResult {
  messageId: string;
  result: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  deliveryStatus: 'DELIVERED' | 'FAILED';
  requestId?: string;
  requestStatus?: string;
  error?: string;
}

const sosPayloadSchema = z.object({
  requestId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  category: z.enum(EMERGENCY_TYPES),
  description: z.string().max(1000).optional().default(''),
  peopleCount: z.number().int().min(1).max(1000).optional().default(1),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
  reporterName: z.string().max(80).optional(),
  queuedOffline: z.boolean().optional(),
});

const locationPayloadSchema = z.object({
  requestId: z.string().min(8).max(64),
  accuracy: z.number().nullable().optional(),
});

async function logEvent(messageId: string, result: IngestResult['result'], transport: Transport, detail?: string) {
  await prisma.syncEvent.create({ data: { messageId, result, transport, detail } });
}

/** Delivery later than this after creation counts as offline synchronisation. */
export const OFFLINE_DELAY_MS = 2 * 60_000;
/** Allowed device-clock drift into the future before the timestamp is replaced by server time. */
export const MAX_CLOCK_AHEAD_MS = 5 * 60_000;

export async function ingestPacket(input: MeshPacket, opts: IngestOptions): Promise<IngestResult> {
  // Phones in a disaster may have wrong clocks. Never reject an SOS for that, but do not let a
  // future timestamp distort ordering and statistics: clamp it to the time of receipt.
  const packet = input.timestamp > Date.now() + MAX_CLOCK_AHEAD_MS ? { ...input, timestamp: Date.now() } : input;

  const existing = await prisma.message.findUnique({ where: { id: packet.messageId } });
  if (existing) {
    await logEvent(packet.messageId, 'DUPLICATE', opts.transport);
    return duplicateResult(packet, opts);
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      let requestId: string | undefined;
      let requestStatus: string | undefined;

      if (packet.type === 'SOS') {
        const p = sosPayloadSchema.parse(packet.payload);
        if (packet.latitude === null || packet.longitude === null) throw new z.ZodError([
          { code: 'custom', path: ['latitude'], message: 'SOS requires GPS coordinates' },
        ]);
        const already = await tx.emergencyRequest.findUnique({ where: { id: p.requestId } });
        if (already) {
          // A phone may legitimately re-send its own SOS under a new message ID, but a
          // request ID belonging to someone else must not be touched or revealed.
          if (opts.transport === 'HTTP' && already.reporterId !== (opts.senderId ?? null)) {
            throw new z.ZodError([{ code: 'custom', path: ['payload', 'requestId'], message: 'Request ID already used by another report' }]);
          }
          requestId = already.id;
          requestStatus = already.status;
        } else {
          // Late delivery means it was effectively offline, even if the phone thought it was online.
          const delayed = Date.now() - packet.timestamp > OFFLINE_DELAY_MS;
          const channel = opts.transport === 'LORA_SIM' ? 'LORA_SIM' : p.queuedOffline || delayed ? 'OFFLINE_SYNC' : 'ONLINE';
          const created = await tx.emergencyRequest.create({
            data: {
              id: p.requestId,
              type: p.category,
              priority: packet.priority ?? DEFAULT_PRIORITY[p.category as EmergencyType],
              description: p.description.trim(),
              latitude: packet.latitude,
              longitude: packet.longitude,
              accuracy: p.accuracy ?? null,
              peopleCount: p.peopleCount,
              channel,
              createdAt: new Date(packet.timestamp),
              reporterId: opts.senderId ?? null,
              // Mesh packets carry no account; name the originating node instead.
              reporterName: p.reporterName ?? (opts.transport === 'LORA_SIM' ? `Mesh node ${packet.sourceNodeId}` : null),
              history: {
                create: {
                  status: 'PENDING',
                  note:
                    channel === 'LORA_SIM'
                      ? `Received via simulated LoRa mesh (${packet.hopCount} hops)`
                      : channel === 'OFFLINE_SYNC'
                        ? 'Created offline on device; synchronised when connectivity returned'
                        : 'Submitted online',
                },
              },
            },
          });
          requestId = created.id;
          requestStatus = created.status;
        }
      } else if (packet.type === 'LOCATION') {
        const p = locationPayloadSchema.parse(packet.payload);
        if (packet.latitude === null || packet.longitude === null) throw new z.ZodError([
          { code: 'custom', path: ['latitude'], message: 'Location update requires coordinates' },
        ]);
        const req = await tx.emergencyRequest.findUnique({ where: { id: p.requestId } });
        if (!req) throw new z.ZodError([{ code: 'custom', path: ['payload', 'requestId'], message: 'Unknown emergency request' }]);
        // Over HTTP only the reporter may move their request (mesh requests have no owner → nobody).
        if (opts.transport === 'HTTP' && (!req.reporterId || req.reporterId !== opts.senderId)) {
          throw new z.ZodError([{ code: 'custom', path: ['payload', 'requestId'], message: 'Not your emergency request' }]);
        }
        await tx.emergencyRequest.update({
          where: { id: req.id },
          data: {
            latitude: packet.latitude,
            longitude: packet.longitude,
            accuracy: p.accuracy ?? req.accuracy,
            history: { create: { status: req.status, note: 'Victim shared an updated location', userId: opts.senderId ?? null } },
          },
        });
        requestId = req.id;
        requestStatus = req.status;
      }

      await tx.message.create({
        data: {
          id: packet.messageId,
          type: packet.type,
          sourceNodeId: packet.sourceNodeId,
          destinationNodeId: packet.destinationNodeId,
          latitude: packet.latitude,
          longitude: packet.longitude,
          priority: packet.priority,
          hopCount: packet.hopCount,
          path: JSON.stringify(opts.path ?? [packet.sourceNodeId]),
          payload: JSON.stringify(packet.payload ?? {}),
          transport: opts.transport,
          deliveryStatus: 'DELIVERED',
          createdAt: new Date(packet.timestamp),
          senderId: opts.senderId ?? null,
        },
      });
      return { requestId, requestStatus };
    });

    await logEvent(packet.messageId, 'ACCEPTED', opts.transport);
    return { messageId: packet.messageId, result: 'ACCEPTED', deliveryStatus: 'DELIVERED', ...outcome };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Concurrent duplicate (two retries racing): the other one won.
      await logEvent(packet.messageId, 'DUPLICATE', opts.transport, 'race');
      return duplicateResult(packet, opts);
    }
    if (err instanceof z.ZodError) {
      const detail = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      await logEvent(packet.messageId, 'REJECTED', opts.transport, detail);
      return { messageId: packet.messageId, result: 'REJECTED', deliveryStatus: 'FAILED', error: detail };
    }
    throw err;
  }
}

async function duplicateResult(packet: MeshPacket, opts: IngestOptions): Promise<IngestResult> {
  const requestId = typeof packet.payload?.requestId === 'string' ? packet.payload.requestId : undefined;
  const req = requestId ? await prisma.emergencyRequest.findUnique({ where: { id: requestId } }) : null;
  // Only tell the sender about the request if it is theirs.
  const visible = req && (opts.transport !== 'HTTP' || req.reporterId === (opts.senderId ?? null));
  return {
    messageId: packet.messageId,
    result: 'DUPLICATE',
    deliveryStatus: 'DELIVERED',
    requestId: visible ? req.id : undefined,
    requestStatus: visible ? req.status : undefined,
  };
}
