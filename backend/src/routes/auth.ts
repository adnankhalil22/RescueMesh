import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, signToken } from '../middleware/auth';
import { clearLoginFailures, loginLimiter, recordLoginFailure } from '../middleware/loginLimiter';
import { ApiError, asyncHandler, parse } from '../utils/http';
import { serializeUser } from './users';

export const authRouter = Router();

const password = z.string().min(8, 'Password must be at least 8 characters').max(100);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).optional(),
  password,
  bloodGroup: z.string().trim().max(5).optional(),
  emergencyContact: z.string().trim().max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** Public registration always creates a VICTIM (citizen) account. Responder/admin roles are granted by an administrator. */
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = parse(registerSchema, req.body);
    if (await prisma.user.findUnique({ where: { email: body.email } })) {
      throw new ApiError(409, 'An account with this email already exists');
    }
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        bloodGroup: body.bloodGroup || null,
        emergencyContact: body.emergencyContact || null,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: 'VICTIM',
      },
    });
    res.status(201).json({ data: { token: signToken(user), user: serializeUser(user) } });
  }),
);

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      recordLoginFailure(req);
      throw new ApiError(401, 'Invalid email or password');
    }
    clearLoginFailures(req);
    if (!user.isActive) throw new ApiError(403, 'Account is deactivated. Contact an administrator.');
    const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.json({ data: { token: signToken(updated), user: serializeUser(updated) } });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({ data: serializeUser(user) });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new ApiError(400, 'Current password is incorrect');
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    res.json({ data: { ok: true } });
  }),
);
