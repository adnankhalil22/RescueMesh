// Brute-force protection for /auth/login: after MAX_FAILURES failed attempts
// for the same email from the same IP within WINDOW_MS, further attempts are
// refused with 429 until the window expires. A successful login clears the count.
// In-memory (per process) — sufficient for a single-server deployment.

import type { NextFunction, Request, Response } from 'express';

export const MAX_FAILURES = 8;
export const WINDOW_MS = 15 * 60_000;

const failures = new Map<string, { count: number; first: number }>();

const keyOf = (req: Request) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`;

export function loginLimiter(req: Request, res: Response, next: NextFunction): void {
  const entry = failures.get(keyOf(req));
  if (entry && Date.now() - entry.first < WINDOW_MS && entry.count >= MAX_FAILURES) {
    const retryAfter = Math.ceil((entry.first + WINDOW_MS - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: { message: `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` } });
    return;
  }
  next();
}

export function recordLoginFailure(req: Request): void {
  const key = keyOf(req);
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now - entry.first >= WINDOW_MS) failures.set(key, { count: 1, first: now });
  else entry.count++;
  // keep the map bounded
  if (failures.size > 10_000) {
    for (const [k, v] of failures) if (now - v.first >= WINDOW_MS) failures.delete(k);
  }
}

export function clearLoginFailures(req: Request): void {
  failures.delete(keyOf(req));
}

/** Test helper. */
export function resetLoginLimiter(): void {
  failures.clear();
}
