import { app, login, prisma, request, resetDb, sosPacket } from './helpers';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('RescueMesh API', () => {
  let admin: string, resp: string, victim: string, other: string;

  before(async () => {
    await resetDb();
    [admin, resp, victim, other] = await Promise.all(['admin@test.io', 'resp@test.io', 'victim@test.io', 'other@test.io'].map((e) => login(e)));
  });
  after(() => prisma.$disconnect());

  // ---------------------------------------------------------------- auth
  test('health endpoint', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.database, 'connected');
  });

  test('register creates a VICTIM, hashes the password, and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New Person', email: 'New@Test.io', password: 'longpassword', role: 'ADMIN' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'VICTIM', 'role in body must be ignored');
    assert.equal(res.body.data.user.email, 'new@test.io');
    assert.ok(res.body.data.token);
    const row = await prisma.user.findUnique({ where: { email: 'new@test.io' } });
    assert.notEqual(row!.passwordHash, 'longpassword');
    assert.equal((await request(app).post('/api/auth/register').send({ name: 'Dup', email: 'new@test.io', password: 'longpassword' })).status, 409);
  });

  test('login rejects bad credentials; protected routes require a token', async () => {
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'victim@test.io', password: 'nope' })).status, 401);
    assert.equal((await request(app).get('/api/emergencies')).status, 401);
    assert.equal((await request(app).get('/api/emergencies').set({ Authorization: 'Bearer junk' })).status, 401);
    const me = await request(app).get('/api/auth/me').set(auth(victim));
    assert.equal(me.body.data.email, 'victim@test.io');
  });

  test('role-based authorization', async () => {
    assert.equal((await request(app).get('/api/users').set(auth(victim))).status, 403);
    assert.equal((await request(app).get('/api/stats/overview').set(auth(victim))).status, 403);
    assert.equal((await request(app).get('/api/comm/status').set(auth(victim))).status, 403);
    assert.equal((await request(app).get('/api/users').set(auth(admin))).status, 200);
    assert.equal((await request(app).put('/api/settings').set(auth(resp)).send({ maxHops: 3 })).status, 403);
  });

  test('validation errors return 400 with details', async () => {
    const res = await request(app).post('/api/emergencies').set(auth(victim)).send({ type: 'ALIENS', latitude: 999 });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details);
  });

  // ------------------------------------------------------- SOS + sync
  test('online SOS via sync appears for responders and only its owner', async () => {
    const p = sosPacket();
    const res = await request(app).post('/api/sync/messages').set(auth(victim)).send({ messages: [p] });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.results[0].result, 'ACCEPTED');
    assert.equal(res.body.data.results[0].deliveryStatus, 'DELIVERED');
    const id = p.payload.requestId as string;

    const list = await request(app).get('/api/emergencies').set(auth(resp));
    const found = list.body.data.find((e: { id: string }) => e.id === id);
    assert.ok(found, 'responder sees the SOS');
    assert.equal(found.channel, 'ONLINE');
    assert.equal(found.latitude, 31.52);

    assert.equal((await request(app).get(`/api/emergencies/${id}`).set(auth(other))).status, 403);
    const mine = await request(app).get('/api/emergencies').set(auth(other));
    assert.ok(!mine.body.data.some((e: { id: string }) => e.id === id));
  });

  test('duplicate message IDs are acknowledged but stored once', async () => {
    const p = sosPacket();
    const first = await request(app).post('/api/sync/messages').set(auth(victim)).send({ messages: [p] });
    const second = await request(app).post('/api/sync/messages').set(auth(victim)).send({ messages: [p, p] });
    assert.equal(first.body.data.results[0].result, 'ACCEPTED');
    assert.deepEqual(second.body.data.results.map((r: { result: string }) => r.result), ['DUPLICATE', 'DUPLICATE']);
    assert.equal(second.body.data.results[0].deliveryStatus, 'DELIVERED');
    assert.equal(await prisma.message.count({ where: { id: p.messageId } }), 1);
    assert.equal(await prisma.emergencyRequest.count({ where: { id: p.payload.requestId as string } }), 1);
    // same request re-sent under a new message id still creates no second request
    const again = sosPacket({}, { requestId: p.payload.requestId });
    await request(app).post('/api/sync/messages').set(auth(victim)).send({ messages: [again] });
    assert.equal(await prisma.emergencyRequest.count({ where: { id: p.payload.requestId as string } }), 1);
  });

  test('offline batch sync: accepted, marked OFFLINE_SYNC, invalid ones FAILED', async () => {
    const created = Date.now() - 30 * 60_000;
    const good = [1, 2].map(() => sosPacket({ timestamp: created }, { queuedOffline: true, category: 'TRAPPED' }));
    const bad = sosPacket({ latitude: null, longitude: null });
    const malformed = { messageId: 'bad', type: 'SOS' };
    const res = await request(app).post('/api/sync/messages').set(auth(victim)).send({ messages: [...good, bad, malformed] });
    assert.deepEqual(res.body.data.summary, { accepted: 2, duplicates: 0, rejected: 2 });
    assert.equal(res.body.data.results[2].deliveryStatus, 'FAILED');
    const r = await prisma.emergencyRequest.findUnique({ where: { id: good[0].payload.requestId as string } });
    assert.equal(r!.channel, 'OFFLINE_SYNC');
    assert.equal(r!.createdAt.getTime(), created, 'keeps the device timestamp');
    assert.ok(r!.receivedAt.getTime() > created);
  });

  test('location update attaches to the victim’s own request only', async () => {
    const p = sosPacket();
    await request(app).post('/api/sync/messages').set(auth(victim)).send({ messages: [p] });
    const loc = sosPacket({ type: 'LOCATION', latitude: 31.6, longitude: 74.4 }, {});
    loc.payload = { requestId: p.payload.requestId };
    const stolen = await request(app).post('/api/sync/messages').set(auth(other)).send({ messages: [loc] });
    assert.equal(stolen.body.data.results[0].result, 'REJECTED');
    const ok = await request(app).post('/api/sync/messages').set(auth(victim)).send({ messages: [{ ...loc, messageId: loc.messageId + 'x' }] });
    assert.equal(ok.body.data.results[0].result, 'ACCEPTED');
    const r = await prisma.emergencyRequest.findUnique({ where: { id: p.payload.requestId as string } });
    assert.equal(r!.latitude, 31.6);
  });

  // ------------------------------------------------------- status flow
  test('responder accepts, progresses and resolves; history recorded', async () => {
    const created = await request(app)
      .post('/api/emergencies')
      .set(auth(victim))
      .send({ type: 'FIRE', latitude: 31.5, longitude: 74.3, description: 'smoke' });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.priority, 'CRITICAL', 'default priority from category');
    const id = created.body.data.id;

    const accept = await request(app).patch(`/api/emergencies/${id}/assign`).set(auth(resp)).send({});
    assert.equal(accept.body.data.status, 'ACCEPTED');
    assert.equal(accept.body.data.responder.email, 'resp@test.io');

    assert.equal((await request(app).patch(`/api/emergencies/${id}/status`).set(auth(victim)).send({ status: 'IN_PROGRESS' })).status, 403);
    const prog = await request(app).patch(`/api/emergencies/${id}/status`).set(auth(resp)).send({ status: 'IN_PROGRESS', note: 'on site' });
    assert.equal(prog.body.data.status, 'IN_PROGRESS');
    const done = await request(app).patch(`/api/emergencies/${id}/status`).set(auth(resp)).send({ status: 'RESOLVED' });
    assert.equal(done.body.data.status, 'RESOLVED');
    assert.ok(done.body.data.resolvedAt);
    assert.deepEqual(done.body.data.history.map((h: { status: string }) => h.status), ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'RESOLVED']);

    const invalid = await request(app).patch(`/api/emergencies/${id}/status`).set(auth(resp)).send({ status: 'IN_PROGRESS' });
    assert.equal(invalid.status, 409);

    // victim sees the updated status
    const seen = await request(app).get(`/api/emergencies/${id}`).set(auth(victim));
    assert.equal(seen.body.data.status, 'RESOLVED');
  });

  test('victim can cancel own pending request; admin archives', async () => {
    const c = await request(app).post('/api/emergencies').set(auth(victim)).send({ type: 'OTHER', latitude: 31.5, longitude: 74.3 });
    const id = c.body.data.id;
    assert.equal((await request(app).patch(`/api/emergencies/${id}/status`).set(auth(other)).send({ status: 'CANCELLED' })).status, 403);
    const cancel = await request(app).patch(`/api/emergencies/${id}/status`).set(auth(victim)).send({ status: 'CANCELLED' });
    assert.equal(cancel.body.data.status, 'CANCELLED');
    assert.equal((await request(app).delete(`/api/emergencies/${id}`).set(auth(resp))).status, 403);
    const arch = await request(app).delete(`/api/emergencies/${id}`).set(auth(admin));
    assert.equal(arch.body.data.archived, true);
    const list = await request(app).get('/api/emergencies').set(auth(admin));
    assert.ok(!list.body.data.some((e: { id: string }) => e.id === id));
  });

  test('list filters, search and priority sort', async () => {
    const res = await request(app).get('/api/emergencies?type=TRAPPED&sort=priority').set(auth(resp));
    assert.ok(res.body.data.length >= 2);
    assert.ok(res.body.data.every((e: { type: string }) => e.type === 'TRAPPED'));
    const crit = await request(app).get('/api/emergencies?priority=CRITICAL&status=RESOLVED').set(auth(resp));
    assert.ok(crit.body.data.every((e: { priority: string; status: string }) => e.priority === 'CRITICAL' && e.status === 'RESOLVED'));
    const search = await request(app).get('/api/emergencies?search=smoke').set(auth(resp));
    assert.equal(search.body.data.length, 1);
  });

  // ---------------------------------------------------------- users
  test('admin manages roles and deactivation; deactivated users cannot log in', async () => {
    const users = await request(app).get('/api/users').set(auth(admin));
    const target = users.body.data.find((u: { email: string }) => u.email === 'other@test.io');
    const upd = await request(app).patch(`/api/users/${target.id}`).set(auth(admin)).send({ role: 'RESPONDER', isActive: false });
    assert.equal(upd.body.data.role, 'RESPONDER');
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'other@test.io', password: 'Password123' })).status, 403);
    assert.equal((await request(app).get('/api/auth/me').set(auth(other))).status, 403, 'existing token stops working');
    // victims cannot escalate themselves
    const me = await request(app).get('/api/auth/me').set(auth(victim));
    const esc = await request(app).patch(`/api/users/${me.body.data.id}`).set(auth(victim)).send({ role: 'ADMIN', name: 'Vic' });
    assert.equal(esc.status, 200);
    assert.equal(esc.body.data.role, 'VICTIM');
    assert.equal(esc.body.data.name, 'Vic');
    await request(app).patch(`/api/users/${target.id}`).set(auth(admin)).send({ isActive: true, role: 'VICTIM' });
  });

  // ---------------------------------------------------- stats/settings
  test('stats are computed from the database', async () => {
    const res = await request(app).get('/api/stats/overview').set(auth(resp));
    const total = await prisma.emergencyRequest.count({ where: { archived: false } });
    assert.equal(res.body.data.totals.total, total);
    assert.equal(res.body.data.byType.reduce((a: number, b: { count: number }) => a + b.count, 0), total);
    assert.equal(res.body.data.daily.length, 14);
  });

  test('admin updates settings with validation', async () => {
    assert.equal((await request(app).put('/api/settings').set(auth(admin)).send({ maxHops: 99 })).status, 400);
    const ok = await request(app).put('/api/settings').set(auth(admin)).send({ maxHops: 5 });
    assert.equal(ok.body.data.maxHops, 5);
  });
});
