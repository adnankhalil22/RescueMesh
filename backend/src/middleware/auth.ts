import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';
import type { Role } from '../domain/constants';
import { ApiError } from '../utils/http';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: { id: string; role: string }): string {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

/** Requires a valid bearer token for an active account. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new ApiError(401, 'Invalid or expired token');
    }
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!user) throw new ApiError(401, 'Account no longer exists');
    if (!user.isActive) throw new ApiError(403, 'Account is deactivated');
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role as Role };
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, `Requires role: ${roles.join(' or ')}`));
    next();
  };
