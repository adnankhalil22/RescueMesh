import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { Prisma } from '@prisma/client';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do that') => new ApiError(403, msg);

/** Wraps async route handlers so rejected promises reach the error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'Validation failed', result.error.flatten());
  }
  return result.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { message: 'Validation failed', details: err.flatten() } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: { message: 'A record with this unique value already exists' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { message: 'Record not found' } });
      return;
    }
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ error: { message: 'Malformed JSON body' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
}

export const safeJson = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
