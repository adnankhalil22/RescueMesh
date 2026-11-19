// Regression tests for problems found in the technical audit (AUDIT_REPORT.md).
import { app, login, prisma, request, resetDb, sosPacket } from './helpers';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FAILURES } from '../src/middleware/loginLimiter';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const sync = (token: string, messages: unknown[]) => request(app).post('/api/sync/messages').set(auth(token)).send({ messages });

describe('audit fixes', () => {
  let admin: string, resp: string, victim: string, other: string;

  before(async () => {
    await resetDb();
    [admin, resp, victim, other] = await Promise.all(['admin@test.io', 'resp@test.io', 'victim@test.io', 'other@test.io'].map((e) => login(e)));
  });
  after(() => prisma.$disconnect());

  test('A1: a victim cannot move the location of a mesh-originated (ownerless) request', async () => {
    const sim = await request(app).post('/api/comm/simulate').set(auth(resp)).send({ sourceNodeId: 'EP-A' });
    const meshId = sim.body.data.packet.payload.requestId;
    const loc = sosPacket({ type: 'LOCATION', latitude: 10, longitude: 10 });
    loc.payload = { requestId: meshId };
    const res = await sync(victim, [loc]);
    assert.equal(res.body.data.results[0].result, 'REJECTED');
    const r = await prisma.emergencyRequest.findUnique({ where: { id: meshId } });
    assert.notEqual(r!.latitude, 10);
  });

  test('A2: another user cannot reuse an existing request ID or learn its status', async () => {
    const mine = sosPacket();
    await sync(victim, [mine]);
    const reuse = sosPacket({}, { requestId: mine.payload.requestId });
    const res = await sync(other, [reuse]);
    assert.equal(res.body.data.results[0].result, 'REJECTED');
    assert.equal(res.body.data.results[0].requestStatus, undefined);
    assert.equal(await prisma.message.count({ where: { id: reuse.messageId } }), 0);
    // replaying the victim's own message id from another account reveals nothing either
    const replay = await sync(other, [mine]);
    assert.equal(replay.body.data.results[0].result, 'DUPLICATE');
    assert.equal(replay.body.data.results[0].requestStatus, undefined);
    // the owner may still re-send under a new message id (normal retry path)
    const again = sosPacket({}, { requestId: mine.payload.requestId });
    assert.notEqual((await sync(victim, [again])).body.data.results[0].result, 'REJECTED');
  });

  test('A3: repeated failed logins are throttled with 429; other accounts unaffected', async () => {
    const attempt = (password: string, email = 'victim@test.io') => request(app).post('/api/auth/login').send({ email, password });
    for (let i = 0; i < MAX_FAILURES; i++) assert.equal((await attempt('wrong-' + i)).status, 401);
    const blocked = await attempt('Password123'); // even the right password is refused while locked
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers['retry-after']);
    assert.equal((await attempt('Password123', 'other@test.io')).status, 200);
  });

  test('A4: security headers are set', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });

  test('A5: a future device timestamp is clamped to server time (SOS still accepted)', async () => {
    const p = sosPacket({ timestamp: Date.now() + 365 * 86_400_000 });
    const res = await sync(other, [p]);
    assert.equal(res.body.data.results[0].result, 'ACCEPTED');
    const r = await prisma.emergencyRequest.findUnique({ where: { id: p.payload.requestId as string } });
    assert.ok(r!.createdAt.getTime() <= Date.now());
  });

  test('A6: an SOS delivered late is labelled OFFLINE_SYNC even if the phone thought it was online', async () => {
    const p = sosPacket({ timestamp: Date.now() - 30 * 60_000 }, { queuedOffline: false });
    await sync(other, [p]);
    const r = await prisma.emergencyRequest.findUnique({ where: { id: p.payload.requestId as string } });
    assert.equal(r!.channel, 'OFFLINE_SYNC');
    const fresh = sosPacket();
    await sync(other, [fresh]);
    assert.equal((await prisma.emergencyRequest.findUnique({ where: { id: fresh.payload.requestId as string } }))!.channel, 'ONLINE');
  });

  test('A7: raising max hops releases packets held by the hop limit', async () => {
    await request(app).put('/api/settings').set(auth(admin)).send({ maxHops: 2 });
    const res = await request(app).post('/api/comm/simulate').set(auth(resp)).send({ sourceNodeId: 'EP-A' });
    assert.equal(res.body.data.delivered, false, 'gateway is 3 hops away');
    assert.equal(res.body.data.queued, true);
    await request(app).put('/api/settings').set(auth(admin)).send({ maxHops: 6 });
    const pending = await prisma.pendingPacket.count();
    assert.equal(pending, 0, 'released after max hops was raised');
    assert.ok(await prisma.emergencyRequest.findUnique({ where: { id: res.body.data.packet.payload.requestId } }));
  });
});
