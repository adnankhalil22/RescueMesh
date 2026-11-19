import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { DEFAULT_PRIORITY, EMERGENCY_STATUSES, EMERGENCY_TYPES, PRIORITIES, SERVER_NODE_ID } from '../domain/constants';
import { requireAuth, requireRole } from '../middleware/auth';
import { ingestPacket } from '../services/ingestService';
import {
  assertCanView,
  changeStatus,
  emergencyDetailInclude,
  emergencyInclude,
  serializeEmergency,
} from '../services/emergencyService';
import { ApiError, asyncHandler, notFound, parse } from '../utils/http';

export const emergenciesRouter = Router();
emergenciesRouter.use(requireAuth);

const SORT_FIELDS = ['createdAt', 'priority', 'status', 'type', 'updatedAt'] as const;
const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const listQuery = z.object({
  status: z.enum(EMERGENCY_STATUSES).optional(),
  type: z.enum(EMERGENCY_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  search: z.string().trim().max(100).optional(),
  mine: z.enum(['true', 'false']).optional(),
  assignedToMe: z.enum(['true', 'false']).optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
  sort: z.enum(SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

emergenciesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parse(listQuery, req.query);
    const me = req.user!;
    const where: Prisma.EmergencyRequestWhereInput = {
      status: q.status,
      type: q.type,
      priority: q.priority,
      archived: q.includeArchived === 'true' ? undefined : false,
    };
    if (me.role === 'VICTIM' || q.mine === 'true') where.reporterId = me.id;
    if (q.assignedToMe === 'true') where.responderId = me.id;
    if (q.search) {
      where.OR = [
        { id: { contains: q.search } },
        { description: { contains: q.search } },
        { reporterName: { contains: q.search } },
        { reporter: { name: { contains: q.search } } },
      ];
    }
    const rows = await prisma.emergencyRequest.findMany({
      where,
      include: emergencyInclude,
      orderBy: q.sort === 'priority' ? { createdAt: 'desc' } : { [q.sort]: q.order },
      take: q.limit,
    });
    if (q.sort === 'priority') {
      const dir = q.order === 'asc' ? -1 : 1; // desc = most urgent first
      rows.sort((a, b) => dir * (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]));
    }
    res.json({ data: rows.map(serializeEmergency) });
  }),
);

const createSchema = z.object({
  id: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  type: z.enum(EMERGENCY_TYPES),
  priority: z.enum(PRIORITIES).optional(),
  description: z.string().max(1000).optional().default(''),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).nullable().optional(),
  peopleCount: z.number().int().min(1).max(1000).optional().default(1),
  createdAt: z.string().datetime().optional(),
});

/** Direct online submission. Goes through the same idempotent ingest pipeline as offline sync. */
emergenciesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parse(createSchema, req.body);
    const requestId = body.id ?? randomUUID();
    const result = await ingestPacket(
      {
        messageId: `api-${requestId}`,
        sourceNodeId: `user-${req.user!.id}`,
        destinationNodeId: SERVER_NODE_ID,
        type: 'SOS',
        latitude: body.latitude,
        longitude: body.longitude,
        timestamp: body.createdAt ? Date.parse(body.createdAt) : Date.now(),
        priority: body.priority ?? DEFAULT_PRIORITY[body.type],
        hopCount: 0,
        maxHops: 1,
        payload: {
          requestId,
          category: body.type,
          description: body.description,
          peopleCount: body.peopleCount,
          accuracy: body.accuracy ?? null,
        },
      },
      { transport: 'HTTP', senderId: req.user!.id },
    );
    if (result.result === 'REJECTED') throw new ApiError(400, result.error ?? 'Rejected');
    const created = await prisma.emergencyRequest.findUniqueOrThrow({ where: { id: requestId }, include: emergencyDetailInclude });
    res.status(result.result === 'ACCEPTED' ? 201 : 200).json({ data: serializeEmergency(created), meta: { result: result.result } });
  }),
);

emergenciesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.emergencyRequest.findUnique({ where: { id: req.params.id }, include: emergencyDetailInclude });
    if (!r) throw notFound('Emergency request');
    assertCanView(req.user!, r);
    res.json({ data: serializeEmergency(r) });
  }),
);

emergenciesRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ status: z.enum(EMERGENCY_STATUSES), note: z.string().max(500).optional() }), req.body);
    res.json({ data: await changeStatus(req.user!, req.params.id, body.status, body.note) });
  }),
);

/** Assign a responder. Omit responderId to assign yourself (accept). */
emergenciesRouter.patch(
  '/:id/assign',
  requireRole('RESPONDER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ responderId: z.string().nullable().optional(), note: z.string().max(500).optional() }), req.body);
    const me = req.user!;
    const responderId = body.responderId === undefined ? me.id : body.responderId;
    if (responderId !== me.id && me.role !== 'ADMIN') throw new ApiError(403, 'Only administrators can assign other responders');
    const current = await prisma.emergencyRequest.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound('Emergency request');
    if (['RESOLVED', 'CANCELLED'].includes(current.status)) throw new ApiError(409, `Request is already ${current.status}`);

    let responderName = 'nobody';
    if (responderId) {
      const responder = await prisma.user.findUnique({ where: { id: responderId } });
      if (!responder || !['RESPONDER', 'ADMIN'].includes(responder.role) || !responder.isActive) {
        throw new ApiError(400, 'Assignee must be an active responder or administrator');
      }
      responderName = responder.name;
    }
    const status = responderId && current.status === 'PENDING' ? 'ACCEPTED' : current.status;
    await prisma.$transaction([
      prisma.emergencyRequest.update({
        where: { id: current.id },
        data: {
          responderId: responderId ?? null,
          status,
          acceptedAt: responderId && !current.acceptedAt ? new Date() : current.acceptedAt,
        },
      }),
      prisma.statusUpdate.create({
        data: { requestId: current.id, status, note: body.note || `Assigned to ${responderName}`, userId: me.id },
      }),
    ]);
    const r = await prisma.emergencyRequest.findUniqueOrThrow({ where: { id: current.id }, include: emergencyDetailInclude });
    res.json({ data: serializeEmergency(r) });
  }),
);

/** Archive (default) or permanently delete (?hard=true). Admin only. */
emergenciesRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const r = await prisma.emergencyRequest.findUnique({ where: { id: req.params.id } });
    if (!r) throw notFound('Emergency request');
    if (req.query.hard === 'true') {
      await prisma.emergencyRequest.delete({ where: { id: r.id } });
      res.json({ data: { id: r.id, deleted: true } });
      return;
    }
    await prisma.emergencyRequest.update({ where: { id: r.id }, data: { archived: !r.archived } });
    res.json({ data: { id: r.id, archived: !r.archived } });
  }),
);
