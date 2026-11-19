import { Router } from 'express';
import { prisma } from '../db';
import { EMERGENCY_STATUSES, EMERGENCY_TYPES, PRIORITIES, CHANNELS } from '../domain/constants';
import { requireAuth, requireRole } from '../middleware/auth';
import { emergencyInclude, serializeEmergency } from '../services/emergencyService';
import { asyncHandler } from '../utils/http';

export const statsRouter = Router();
statsRouter.use(requireAuth, requireRole('RESPONDER', 'ADMIN'));

const DAYS = 14;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** All numbers are computed from the database on every request. */
statsRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const all = await prisma.emergencyRequest.findMany({
      where: { archived: false },
      select: { type: true, priority: true, status: true, channel: true, createdAt: true, acceptedAt: true, resolvedAt: true },
    });
    const countBy = <K extends string>(keys: readonly K[], pick: (r: (typeof all)[number]) => string) =>
      keys.map((k) => ({ key: k, count: all.filter((r) => pick(r) === k).length }));

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (DAYS - 1));
    const daily = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      return { date: dayKey(d), reported: 0, resolved: 0 };
    });
    const byDate = new Map(daily.map((d) => [d.date, d]));
    for (const r of all) {
      const rep = byDate.get(dayKey(r.createdAt));
      if (rep) rep.reported++;
      if (r.resolvedAt) {
        const resd = byDate.get(dayKey(r.resolvedAt));
        if (resd) resd.resolved++;
      }
    }

    const responseTimes = all.filter((r) => r.acceptedAt).map((r) => (r.acceptedAt!.getTime() - r.createdAt.getTime()) / 60000);
    const avgResponseMinutes = responseTimes.length
      ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
      : null;

    const [recent, users, nodes] = await Promise.all([
      prisma.emergencyRequest.findMany({ where: { archived: false }, orderBy: { createdAt: 'desc' }, take: 8, include: emergencyInclude }),
      prisma.user.groupBy({ by: ['role'], _count: true, where: { isActive: true } }),
      prisma.commNode.findMany({ select: { online: true } }),
    ]);

    res.json({
      data: {
        totals: {
          total: all.length,
          pending: all.filter((r) => r.status === 'PENDING').length,
          active: all.filter((r) => r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS').length,
          resolved: all.filter((r) => r.status === 'RESOLVED').length,
          cancelled: all.filter((r) => r.status === 'CANCELLED').length,
          criticalOpen: all.filter((r) => r.priority === 'CRITICAL' && !['RESOLVED', 'CANCELLED'].includes(r.status)).length,
        },
        byType: countBy(EMERGENCY_TYPES, (r) => r.type),
        byPriority: countBy(PRIORITIES, (r) => r.priority),
        byStatus: countBy(EMERGENCY_STATUSES, (r) => r.status),
        byChannel: countBy(CHANNELS, (r) => r.channel),
        daily,
        avgResponseMinutes,
        users: Object.fromEntries(users.map((u) => [u.role, u._count])),
        nodes: { total: nodes.length, online: nodes.filter((n) => n.online).length, simulated: true },
        recent: recent.map(serializeEmergency),
      },
    });
  }),
);
