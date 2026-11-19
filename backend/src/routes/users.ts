import { Router } from 'express';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { ROLES } from '../domain/constants';
import { requireAuth, requireRole } from '../middleware/auth';
import { ApiError, asyncHandler, forbidden, notFound, parse } from '../utils/http';

export const usersRouter = Router();
usersRouter.use(requireAuth);

export function serializeUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    bloodGroup: u.bloodGroup,
    emergencyContact: u.emergencyContact,
    organization: u.organization,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  };
}

usersRouter.get(
  '/',
  requireRole('ADMIN', 'RESPONDER'),
  asyncHandler(async (req, res) => {
    const q = parse(
      z.object({ role: z.enum(ROLES).optional(), search: z.string().max(80).optional() }),
      req.query,
    );
    const users = await prisma.user.findMany({
      where: {
        role: q.role,
        OR: q.search ? [{ name: { contains: q.search } }, { email: { contains: q.search } }] : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { reportedRequests: true, assignedRequests: true } } },
    });
    res.json({
      data: users.map((u) => ({
        ...serializeUser(u),
        reportedCount: u._count.reportedRequests,
        assignedCount: u._count.assignedRequests,
      })),
    });
  }),
);

usersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    if (me.role === 'VICTIM' && me.id !== req.params.id) throw forbidden();
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound('User');
    res.json({ data: serializeUser(user) });
  }),
);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  bloodGroup: z.string().trim().max(5).nullable().optional(),
  emergencyContact: z.string().trim().max(80).nullable().optional(),
  organization: z.string().trim().max(80).nullable().optional(),
});
const adminSchema = profileSchema.extend({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
});

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const isSelf = me.id === req.params.id;
    if (!isSelf && me.role !== 'ADMIN') throw forbidden('Only administrators can edit other accounts');
    const body = parse(me.role === 'ADMIN' ? adminSchema : profileSchema, req.body) as z.infer<typeof adminSchema>;
    if (isSelf && (body.role !== undefined || body.isActive === false)) {
      throw new ApiError(400, 'You cannot change your own role or deactivate yourself');
    }
    const exists = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!exists) throw notFound('User');
    const user = await prisma.user.update({ where: { id: req.params.id }, data: body });
    res.json({ data: serializeUser(user) });
  }),
);
