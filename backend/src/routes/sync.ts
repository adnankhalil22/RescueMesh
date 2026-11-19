import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { meshPacketSchema } from '../mesh/packet';
import { ingestPacket, type IngestResult } from '../services/ingestService';
import { asyncHandler, parse, safeJson } from '../utils/http';

export const syncRouter = Router();
syncRouter.use(requireAuth);

/**
 * Batch upload of a device's offline outbox. Each message is processed
 * independently and idempotently; the response tells the device, per message
 * ID, whether it is DELIVERED (accepted or already known) or FAILED (rejected
 * — do not retry).
 */
syncRouter.post(
  '/messages',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ messages: z.array(z.unknown()).min(1).max(100) }), req.body);
    const results: IngestResult[] = [];
    for (const raw of body.messages) {
      const parsed = meshPacketSchema.safeParse(raw);
      if (!parsed.success) {
        const id = typeof (raw as { messageId?: unknown })?.messageId === 'string' ? (raw as { messageId: string }).messageId : 'unknown';
        results.push({
          messageId: id,
          result: 'REJECTED',
          deliveryStatus: 'FAILED',
          error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
        continue;
      }
      results.push(await ingestPacket(parsed.data, { transport: 'HTTP', senderId: req.user!.id }));
    }
    res.json({
      data: {
        results,
        summary: {
          accepted: results.filter((r) => r.result === 'ACCEPTED').length,
          duplicates: results.filter((r) => r.result === 'DUPLICATE').length,
          rejected: results.filter((r) => r.result === 'REJECTED').length,
        },
        serverTime: new Date().toISOString(),
      },
    });
  }),
);

/** Message log for monitoring (responders/admins). */
syncRouter.get(
  '/messages',
  requireRole('RESPONDER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const q = parse(
      z.object({ transport: z.enum(['HTTP', 'LORA_SIM']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }),
      req.query,
    );
    const rows = await prisma.message.findMany({
      where: { transport: q.transport },
      orderBy: { receivedAt: 'desc' },
      take: q.limit,
      include: { sender: { select: { id: true, name: true } } },
    });
    res.json({
      data: rows.map((m) => ({
        ...m,
        path: safeJson<string[]>(m.path, []),
        payload: safeJson<Record<string, unknown>>(m.payload, {}),
        createdAt: m.createdAt.toISOString(),
        receivedAt: m.receivedAt.toISOString(),
      })),
    });
  }),
);
