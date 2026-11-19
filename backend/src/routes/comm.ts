import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { DEFAULT_PRIORITY, EMERGENCY_TYPES, NODE_KINDS, PRIORITIES, SERVER_NODE_ID } from '../domain/constants';
import { requireAuth, requireRole } from '../middleware/auth';
import { encodeCompact, fitToFrame, LORA_MAX_FRAME_BYTES, type MeshPacket } from '../mesh/packet';
import { meshTransport } from '../mesh/simulatedLoRaTransport';
import { computeLinks } from '../mesh/simulator';
import { getSettings } from '../services/settingsService';
import { ApiError, asyncHandler, notFound, parse, safeJson } from '../utils/http';

export const commRouter = Router();
commRouter.use(requireAuth, requireRole('RESPONDER', 'ADMIN'));

commRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const [nodes, totalMessages, httpMessages, loraMessages, duplicates, rejected, pendingPackets, pendingRequests] = await Promise.all([
      prisma.commNode.findMany(),
      prisma.message.count(),
      prisma.message.count({ where: { transport: 'HTTP' } }),
      prisma.message.count({ where: { transport: 'LORA_SIM' } }),
      prisma.syncEvent.count({ where: { result: 'DUPLICATE' } }),
      prisma.syncEvent.count({ where: { result: 'REJECTED' } }),
      prisma.pendingPacket.count(),
      prisma.emergencyRequest.count({ where: { status: 'PENDING', archived: false } }),
    ]);
    const sum = (k: 'packetsSent' | 'packetsReceived' | 'packetsDropped') => nodes.reduce((a, n) => a + n[k], 0);
    res.json({
      data: {
        api: { online: true, serverTime: new Date().toISOString(), database: 'connected' },
        transport: meshTransport.status(),
        nodes: {
          total: nodes.length,
          online: nodes.filter((n) => n.online).length,
          gatewaysOnline: nodes.filter((n) => n.online && n.kind === 'GATEWAY').length,
          simulated: nodes.every((n) => n.simulated),
        },
        messages: {
          receivedTotal: totalMessages,
          receivedHttp: httpMessages,
          receivedLora: loraMessages,
          duplicatesBlocked: duplicates,
          rejected,
        },
        lora: {
          packetsSent: sum('packetsSent'),
          packetsReceived: sum('packetsReceived'),
          packetsDropped: sum('packetsDropped'),
          pendingPackets,
        },
        pendingRequests,
      },
    });
  }),
);

commRouter.get(
  '/nodes',
  asyncHandler(async (_req, res) => {
    const nodes = await prisma.commNode.findMany({ orderBy: [{ kind: 'asc' }, { id: 'asc' }] });
    const links = computeLinks(nodes.map((n) => ({ ...n, kind: n.kind as (typeof NODE_KINDS)[number] })));
    const pending = await prisma.pendingPacket.findMany();
    res.json({
      data: {
        nodes: nodes.map((n) => ({
          ...n,
          lastSeen: n.lastSeen.toISOString(),
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt.toISOString(),
          heldPackets: pending.filter((p) => p.heldByNode === n.id).length,
        })),
        links,
      },
    });
  }),
);

const nodePatch = z.object({
  online: z.boolean().optional(),
  name: z.string().trim().min(2).max(60).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  rangeKm: z.number().min(0.1).max(20).optional(),
});

/** Change a simulated node (e.g. power it off to partition the mesh). Held packets are retried afterwards. */
commRouter.patch(
  '/nodes/:id',
  asyncHandler(async (req, res) => {
    const body = parse(nodePatch, req.body);
    const node = await prisma.commNode.findUnique({ where: { id: req.params.id } });
    if (!node) throw notFound('Node');
    const updated = await prisma.commNode.update({ where: { id: node.id }, data: body });
    const retried = await meshTransport.retryPending();
    res.json({
      data: {
        node: updated,
        retried: retried.map((r) => ({ messageId: r.simulation?.messageId, delivered: r.delivered, ingest: r.ingest })),
      },
    });
  }),
);

const simulateSchema = z.object({
  sourceNodeId: z.string().min(1),
  destinationNodeId: z.string().min(1).default(SERVER_NODE_ID),
  type: z.enum(['SOS', 'CHAT', 'STATUS']).default('SOS'),
  category: z.enum(EMERGENCY_TYPES).default('TRAPPED'),
  priority: z.enum(PRIORITIES).optional(),
  description: z.string().max(200).default(''),
  peopleCount: z.number().int().min(1).max(100).default(1),
  /** Re-send a previous message ID to demonstrate duplicate suppression. */
  messageId: z.string().min(8).max(64).optional(),
});

/** Inject a packet at a simulated node and return the full hop-by-hop trace. */
commRouter.post(
  '/simulate',
  asyncHandler(async (req, res) => {
    const body = parse(simulateSchema, req.body);
    const source = await prisma.commNode.findUnique({ where: { id: body.sourceNodeId } });
    if (!source) throw new ApiError(400, `Unknown source node ${body.sourceNodeId}`);
    if (body.destinationNodeId !== SERVER_NODE_ID && !(await prisma.commNode.findUnique({ where: { id: body.destinationNodeId } }))) {
      throw new ApiError(400, `Unknown destination node ${body.destinationNodeId}`);
    }

    const { maxHops } = await getSettings();
    let packet: MeshPacket;
    const previous = body.messageId ? meshTransport.recent.find((r) => r.messageId === body.messageId) : undefined;
    const stored = body.messageId ? await prisma.message.findUnique({ where: { id: body.messageId } }) : null;
    if (body.messageId && (previous || stored)) {
      // Rebuild the same packet so the mesh sees an identical message ID.
      packet = {
        messageId: body.messageId,
        sourceNodeId: source.id,
        destinationNodeId: body.destinationNodeId,
        type: (stored?.type as MeshPacket['type']) ?? 'SOS',
        latitude: stored?.latitude ?? source.latitude,
        longitude: stored?.longitude ?? source.longitude,
        timestamp: stored?.createdAt.getTime() ?? Date.now(),
        priority: (stored?.priority as MeshPacket['priority']) ?? 'HIGH',
        hopCount: 0,
        maxHops,
        payload: stored ? safeJson(stored.payload, {}) : {},
      };
    } else {
      // Short IDs (48 random bits) keep the packet inside one LoRa frame.
      const shortId = () => randomUUID().replace(/-/g, '').slice(0, 12);
      const requestId = `lora-${shortId()}`;
      packet = fitToFrame({
        messageId: body.messageId ?? `m-${shortId()}`,
        sourceNodeId: source.id,
        destinationNodeId: body.destinationNodeId,
        type: body.type,
        // small jitter so markers from the same node do not overlap exactly
        latitude: source.latitude + (Math.random() - 0.5) * 0.002,
        longitude: source.longitude + (Math.random() - 0.5) * 0.002,
        timestamp: Date.now(),
        priority: body.priority ?? DEFAULT_PRIORITY[body.category],
        hopCount: 0,
        maxHops,
        payload:
          body.type === 'SOS'
            ? {
                requestId,
                category: body.category,
                description: (body.description || `SOS from field node ${source.id}`).slice(0, 60),
                peopleCount: body.peopleCount,
              }
            : { text: body.description.slice(0, 60) },
      });
    }

    const result = await meshTransport.transmit(packet, source.id);
    res.json({
      data: {
        simulated: true,
        packet,
        onAirBytes: Buffer.byteLength(encodeCompact(packet)),
        maxFrameBytes: LORA_MAX_FRAME_BYTES,
        delivered: result.delivered,
        queued: result.queued,
        ingest: result.ingest,
        trace: result.simulation,
      },
    });
  }),
);

commRouter.get('/transmissions', (_req, res) => {
  res.json({ data: meshTransport.recent });
});

commRouter.get(
  '/pending',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.pendingPacket.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ data: rows.map((r) => ({ ...r, packet: safeJson(r.packet, {}) })) });
  }),
);
