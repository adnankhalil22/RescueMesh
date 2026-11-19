import type { EmergencyRequest, Prisma, StatusUpdate, User } from '@prisma/client';
import { prisma } from '../db';
import { STATUS_TRANSITIONS, type EmergencyStatus } from '../domain/constants';
import { ApiError } from '../utils/http';
import type { AuthUser } from '../middleware/auth';

type PublicUser = Pick<User, 'id' | 'name' | 'phone' | 'email'>;
type RequestWithRelations = EmergencyRequest & {
  reporter?: PublicUser | null;
  responder?: PublicUser | null;
  history?: (StatusUpdate & { user?: Pick<User, 'id' | 'name' | 'role'> | null })[];
};

export const emergencyInclude = {
  reporter: { select: { id: true, name: true, phone: true, email: true } },
  responder: { select: { id: true, name: true, phone: true, email: true } },
} satisfies Prisma.EmergencyRequestInclude;

export const emergencyDetailInclude = {
  ...emergencyInclude,
  history: { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true, role: true } } } },
} satisfies Prisma.EmergencyRequestInclude;

export function serializeEmergency(r: RequestWithRelations) {
  return {
    id: r.id,
    code: r.id.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase(),
    type: r.type,
    priority: r.priority,
    status: r.status,
    description: r.description,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracy: r.accuracy,
    peopleCount: r.peopleCount,
    channel: r.channel,
    archived: r.archived,
    createdAt: r.createdAt.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    reporter: r.reporter ?? null,
    reporterName: r.reporter?.name ?? r.reporterName ?? 'Unknown (mesh)',
    responder: r.responder ?? null,
    history: r.history?.map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
      user: h.user ?? null,
    })),
  };
}

/** Ensures the current user may view the request. */
export function assertCanView(user: AuthUser, r: EmergencyRequest): void {
  if (user.role === 'VICTIM' && r.reporterId !== user.id) {
    throw new ApiError(403, 'You can only view your own emergency requests');
  }
}

export async function changeStatus(user: AuthUser, id: string, status: EmergencyStatus, note?: string) {
  const current = await prisma.emergencyRequest.findUnique({ where: { id } });
  if (!current) throw new ApiError(404, 'Emergency request not found');

  if (user.role === 'VICTIM') {
    if (current.reporterId !== user.id) throw new ApiError(403, 'You can only update your own requests');
    if (status !== 'CANCELLED' || !['PENDING', 'ACCEPTED'].includes(current.status)) {
      throw new ApiError(403, 'Victims can only cancel a request that is not yet in progress');
    }
  } else {
    const allowed = STATUS_TRANSITIONS[current.status as EmergencyStatus] ?? [];
    if (current.status === status) throw new ApiError(409, `Request is already ${status}`);
    if (!allowed.includes(status)) {
      throw new ApiError(409, `Cannot change status from ${current.status} to ${status}`);
    }
  }

  const now = new Date();
  const data: Prisma.EmergencyRequestUpdateInput = { status };
  if (status === 'ACCEPTED' || status === 'IN_PROGRESS') {
    if (!current.acceptedAt) data.acceptedAt = now;
    // Taking an unassigned request assigns it to the responder doing so.
    if (!current.responderId && user.role !== 'VICTIM') data.responder = { connect: { id: user.id } };
  }
  if (status === 'RESOLVED') data.resolvedAt = now;
  if (status === 'PENDING') {
    data.resolvedAt = null;
    data.acceptedAt = null;
    data.responder = { disconnect: true };
  }

  const [updated] = await prisma.$transaction([
    prisma.emergencyRequest.update({ where: { id }, data, include: emergencyDetailInclude }),
    prisma.statusUpdate.create({ data: { requestId: id, status, note: note?.trim() || null, userId: user.id } }),
  ]);
  // re-read so the history includes the update just written
  const fresh = await prisma.emergencyRequest.findUniqueOrThrow({ where: { id: updated.id }, include: emergencyDetailInclude });
  return serializeEmergency(fresh);
}
