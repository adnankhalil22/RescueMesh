// Must be imported FIRST in every test file: points Prisma at the test DB.
import './env';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { meshTransport } from '../src/mesh/simulatedLoRaTransport';
import { resetLoginLimiter } from '../src/middleware/loginLimiter';

export const app = createApp();
export { prisma, request };

export async function resetDb() {
  await prisma.$transaction([
    prisma.statusUpdate.deleteMany(),
    prisma.message.deleteMany(),
    prisma.syncEvent.deleteMany(),
    prisma.pendingPacket.deleteMany(),
    prisma.emergencyRequest.deleteMany(),
    prisma.commNode.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  meshTransport.reset();
  resetLoginLimiter();
  const hash = await bcrypt.hash('Password123', 4);
  for (const [email, role] of [
    ['admin@test.io', 'ADMIN'],
    ['resp@test.io', 'RESPONDER'],
    ['victim@test.io', 'VICTIM'],
    ['other@test.io', 'VICTIM'],
  ]) {
    await prisma.user.create({ data: { email, role, name: email.split('@')[0], passwordHash: hash } });
  }
  // chain: EP-A — RL-1 — RL-2 — GW, plus RL-X (offline) linking EP-B
  const nodes = [
    { id: 'GW', kind: 'GATEWAY', latitude: 31.5, longitude: 74.3 },
    { id: 'RL-1', kind: 'RELAY', latitude: 31.5, longitude: 74.32 },
    { id: 'RL-2', kind: 'RELAY', latitude: 31.5, longitude: 74.34 },
    { id: 'EP-A', kind: 'ENDPOINT', latitude: 31.5, longitude: 74.36 },
    { id: 'RL-X', kind: 'RELAY', latitude: 31.518, longitude: 74.34, online: false },
    { id: 'EP-B', kind: 'ENDPOINT', latitude: 31.536, longitude: 74.34 },
  ];
  for (const n of nodes) await prisma.commNode.create({ data: { name: n.id, rangeKm: 2.2, online: true, ...n } });
}

export async function login(email: string, password = 'Password123'): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
}

export function sosPacket(overrides: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
  return {
    messageId: `msg-${randomUUID()}`,
    sourceNodeId: 'device-test',
    destinationNodeId: 'SERVER',
    type: 'SOS',
    latitude: 31.52,
    longitude: 74.35,
    timestamp: Date.now(),
    priority: 'HIGH',
    hopCount: 0,
    payload: { requestId: `req-${randomUUID()}`, category: 'MEDICAL', description: 'test', peopleCount: 1, ...payload },
    ...overrides,
  };
}
