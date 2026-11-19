import { app, login, prisma, request, resetDb } from './helpers';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateFlood, type SimNode, type SeenCache } from '../src/mesh/simulator';
import { decodeCompact, encodeCompact, type MeshPacket } from '../src/mesh/packet';

const node = (id: string, lng: number, kind: SimNode['kind'] = 'RELAY', online = true): SimNode => ({
  id, name: id, kind, latitude: 0, longitude: lng, rangeKm: 1.5, online,
});
const packet = (o: Partial<MeshPacket> = {}): MeshPacket => ({
  messageId: 'msg-00000001', sourceNodeId: 'A', destinationNodeId: 'SERVER', type: 'SOS', latitude: 0, longitude: 0,
  timestamp: Date.now(), priority: 'HIGH', hopCount: 0, maxHops: 6, payload: {}, ...o,
});
// ~1.1 km between consecutive nodes at the equator (0.01° lng)
const chain = () => [node('A', 0, 'ENDPOINT'), node('B', 0.01), node('C', 0.02), node('GW', 0.03, 'GATEWAY')];

describe('LoRa flood simulator (pure)', () => {
  test('multi-hop delivery through intermediate nodes with hop count', () => {
    const r = simulateFlood(chain(), 'A', packet(), new Map());
    assert.equal(r.delivered, true);
    assert.equal(r.hopCount, 3);
    assert.deepEqual(r.path, ['A', 'B', 'C', 'GW']);
  });

  test('duplicate suppression in a loop (triangle) and on re-send', () => {
    // B, C, D form a triangle: each will hear the packet twice
    const nodes = [node('A', 0, 'ENDPOINT'), node('B', 0.01), { ...node('C', 0.01), latitude: 0.008 }, node('D', 0.02), node('GW', 0.03, 'GATEWAY')];
    const seen: SeenCache = new Map();
    const r = simulateFlood(nodes, 'A', packet(), seen);
    assert.equal(r.delivered, true);
    assert.ok(r.duplicatesDropped >= 1, 'loop copies are dropped');
    // every node forwarded at most once => no infinite loop
    for (const c of Object.values(r.counters)) assert.ok(c.sent <= 1);
    const again = simulateFlood(nodes, 'A', packet(), seen);
    assert.equal(again.delivered, false);
    assert.equal(again.events[0].type, 'DUPLICATE_DROPPED');
    assert.equal(again.transmissions, 0);
  });

  test('max hop limit stops forwarding', () => {
    const r = simulateFlood(chain(), 'A', packet({ maxHops: 2 }), new Map());
    assert.equal(r.delivered, false);
    assert.ok(r.events.some((e) => e.type === 'HOP_LIMIT' && e.nodeId === 'C'));
  });

  test('offline intermediate node partitions the mesh; holders recorded', () => {
    const nodes = chain();
    nodes[2].online = false;
    const r = simulateFlood(nodes, 'A', packet(), new Map());
    assert.equal(r.delivered, false);
    assert.deepEqual(r.holders.sort(), ['A', 'B']);
    assert.equal(r.events.at(-1)!.type, 'NO_ROUTE');
  });

  test('compact over-the-air encoding round-trips and is small', () => {
    const p = packet({ latitude: 31.52041, longitude: 74.35871, payload: { requestId: 'req-12345678', category: 'FIRE' } });
    const raw = encodeCompact(p);
    const back = decodeCompact(raw);
    assert.equal(back.latitude, 31.52041);
    assert.deepEqual(back.payload, { requestId: 'req-12345678', category: 'FIRE' }, 'abbreviated payload keys are restored');
    assert.ok(raw.includes('"r":"req-12345678"'), 'payload keys are abbreviated on air');
    assert.equal(back.type, 'SOS');
    assert.equal(back.priority, 'HIGH');
    assert.ok(Buffer.byteLength(raw) < 222, `encoded size ${Buffer.byteLength(raw)} fits a LoRa frame`);
  });
});

describe('Simulated LoRa transport via API', () => {
  let resp: string;
  before(async () => {
    await resetDb();
    resp = await login('resp@test.io');
  });
  after(() => prisma.$disconnect());
  const auth = () => ({ Authorization: `Bearer ${resp}` });

  test('SOS from endpoint reaches gateway and becomes an emergency request', async () => {
    const res = await request(app).post('/api/comm/simulate').set(auth()).send({ sourceNodeId: 'EP-A', category: 'FIRE' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.simulated, true);
    assert.equal(res.body.data.delivered, true);
    assert.equal(res.body.data.trace.hopCount, 3);
    assert.deepEqual(res.body.data.trace.path, ['EP-A', 'RL-2', 'RL-1', 'GW']);
    assert.equal(res.body.data.ingest.result, 'ACCEPTED');
    assert.ok(res.body.data.onAirBytes <= res.body.data.maxFrameBytes, `packet ${res.body.data.onAirBytes} B fits one LoRa frame`);
    const long = await request(app).post('/api/comm/simulate').set(auth()).send({ sourceNodeId: 'EP-A', description: 'x'.repeat(200), peopleCount: 99 });
    assert.ok(long.body.data.onAirBytes <= 222, `long description still fits (${long.body.data.onAirBytes} B)`);
    const reqId = res.body.data.packet.payload.requestId;
    const er = await prisma.emergencyRequest.findUnique({ where: { id: reqId } });
    assert.equal(er!.channel, 'LORA_SIM');
    assert.equal(er!.reporterName, 'Mesh node EP-A');
    const msg = await prisma.message.findUnique({ where: { id: res.body.data.packet.messageId } });
    assert.equal(msg!.hopCount, 3);
    assert.deepEqual(JSON.parse(msg!.path), ['EP-A', 'RL-2', 'RL-1', 'GW']);

    // re-sending the same message id: dropped by the mesh, nothing new stored
    const dup = await request(app).post('/api/comm/simulate').set(auth()).send({ sourceNodeId: 'EP-A', messageId: res.body.data.packet.messageId });
    assert.equal(dup.body.data.delivered, false);
    assert.equal(dup.body.data.trace.events[0].type, 'DUPLICATE_DROPPED');
    assert.equal(await prisma.emergencyRequest.count({ where: { channel: 'LORA_SIM' } }), 2, 'the two distinct SOS only');
  });

  test('store-and-forward: queued while partitioned, delivered when relay comes online', async () => {
    const res = await request(app).post('/api/comm/simulate').set(auth()).send({ sourceNodeId: 'EP-B', category: 'TRAPPED' });
    assert.equal(res.body.data.delivered, false);
    assert.equal(res.body.data.queued, true);
    const status = await request(app).get('/api/comm/status').set(auth());
    assert.equal(status.body.data.lora.pendingPackets, 1);
    assert.equal(status.body.data.transport.simulated, true);
    assert.equal(status.body.data.transport.hardwareConnected, false);
    // channels are explicitly classified; physical LoRa is reported as not connected, not as zero traffic
    const channels = Object.fromEntries(status.body.data.channels.map((c: { id: string }) => [c.id, c]));
    assert.equal(channels.LORA_SIMULATED.nature, 'SIMULATED');
    assert.equal(channels.LORA_PHYSICAL.nature, 'NOT_CONNECTED');
    assert.equal(channels.LORA_PHYSICAL.sosRequests, null);
    assert.equal(channels.LORA_SIMULATED.sosRequests, 2, 'two simulated SOS were delivered in the previous test');
    assert.equal(status.body.data.messages.receivedLoraPhysical, null);
    assert.equal(status.body.data.lora.simulated, true);

    const toggle = await request(app).patch('/api/comm/nodes/RL-X').set(auth()).send({ online: true });
    assert.equal(toggle.status, 200);
    assert.equal(toggle.body.data.retried[0].delivered, true);
    assert.equal(await prisma.pendingPacket.count(), 0);
    const er = await prisma.emergencyRequest.findUnique({ where: { id: res.body.data.packet.payload.requestId } });
    assert.ok(er, 'held SOS now in the database');
  });

  test('node list exposes links and simulated flag; counters increase', async () => {
    const res = await request(app).get('/api/comm/nodes').set(auth());
    assert.ok(res.body.data.links.length >= 4);
    assert.ok(res.body.data.nodes.every((n: { simulated: boolean }) => n.simulated));
    const gw = res.body.data.nodes.find((n: { id: string }) => n.id === 'GW');
    assert.ok(gw.packetsReceived >= 2);
  });
});
