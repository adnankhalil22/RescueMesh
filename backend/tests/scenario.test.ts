// Verifies the Beirut demonstration scenario: coordinates are in Lebanon and the
// configured LoRa ranges produce exactly the intended multi-hop routes.
import './env';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_AREA, DEMO_NODES } from '../prisma/demoScenario';
import { DEFAULT_SETTINGS } from '../src/services/settingsService';
import { canLink, computeLinks, haversineKm, simulateFlood, type SimNode } from '../src/mesh/simulator';
import type { MeshPacket } from '../src/mesh/packet';

const nodes = (overrides: Record<string, boolean> = {}): SimNode[] =>
  DEMO_NODES.map((n) => ({ ...n, online: overrides[n.id] ?? n.online ?? true }));

let seq = 0;
const probe = (src: string, maxHops = DEFAULT_SETTINGS.maxHops): MeshPacket => ({
  messageId: `scenario-${src}-${++seq}`,
  sourceNodeId: src,
  destinationNodeId: 'SERVER',
  type: 'SOS',
  latitude: null,
  longitude: null,
  timestamp: Date.now(),
  priority: 'HIGH',
  hopCount: 0,
  maxHops,
  payload: {},
});

// Lebanon bounding box (approx.) and the Greater Beirut demonstration area
const LEBANON = { minLat: 33.05, maxLat: 34.69, minLng: 35.1, maxLng: 36.63 };
const inBox = (lat: number, lng: number, b: { minLat: number; maxLat: number; minLng: number; maxLng: number }) =>
  lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;

describe('Beirut demonstration scenario', () => {
  test('default map centre and every node lie in Lebanon, within the demo area', () => {
    assert.ok(inBox(DEFAULT_SETTINGS.mapCenterLat, DEFAULT_SETTINGS.mapCenterLng, LEBANON));
    assert.equal(DEFAULT_SETTINGS.mapCenterLat, DEMO_AREA.center.latitude);
    assert.equal(DEFAULT_SETTINGS.mapCenterLng, DEMO_AREA.center.longitude);
    for (const n of DEMO_NODES) {
      assert.ok(inBox(n.latitude, n.longitude, LEBANON), `${n.id} is in Lebanon`);
      assert.ok(haversineKm(n, DEMO_AREA.center) < 6, `${n.id} is within 6 km of the demo centre`);
    }
    const b = DEMO_AREA.incidentBox;
    assert.ok(inBox(b.minLat, b.minLng, LEBANON) && inBox(b.maxLat, b.maxLng, LEBANON), 'seeded incident area in Lebanon');
  });

  test('topology: exactly the designed radio links', () => {
    const links = computeLinks(nodes())
      .map(([a, b]) => [a, b].sort().join('-'))
      .sort();
    assert.deepEqual(links, ['EP-01-RL-03', 'EP-02-RL-04', 'GW-01-RL-01', 'RL-01-RL-02', 'RL-02-RL-03', 'RL-02-RL-04', 'RL-03-RL-04']);
  });

  test('EP-01 → gateway: 4-hop route through the relay triangle, duplicates suppressed', () => {
    const r = simulateFlood(nodes(), 'EP-01', probe('EP-01'), new Map());
    assert.equal(r.delivered, true);
    assert.deepEqual(r.path, ['EP-01', 'RL-03', 'RL-02', 'RL-01', 'GW-01']);
    assert.equal(r.hopCount, 4);
    assert.ok(r.duplicatesDropped >= 1);
  });

  test('EP-02 → gateway: 4-hop route via Bourj Hammoud', () => {
    const r = simulateFlood(nodes(), 'EP-02', probe('EP-02'), new Map());
    assert.deepEqual(r.path, ['EP-02', 'RL-04', 'RL-02', 'RL-01', 'GW-01']);
  });

  test('EP-03 is cut off while RL-05 is offline and delivered once it is online', () => {
    const off = simulateFlood(nodes(), 'EP-03', probe('EP-03'), new Map());
    assert.equal(off.delivered, false);
    assert.deepEqual(off.holders, ['EP-03']);
    const on = simulateFlood(nodes({ 'RL-05': true }), 'EP-03', probe('EP-03'), new Map());
    assert.equal(on.delivered, true);
    assert.equal(on.path![1], 'RL-05');
  });

  test('field nodes cannot reach the gateway directly (multi-hop is required)', () => {
    const gw = DEMO_NODES.find((n) => n.id === 'GW-01')!;
    for (const n of nodes().filter((x) => x.kind === 'ENDPOINT')) assert.equal(canLink(n, { ...gw, online: true }), false, n.id);
  });

  test('the default hop limit leaves headroom over the longest designed route', () => {
    const r = simulateFlood(nodes(), 'EP-01', probe('EP-01', 4), new Map());
    assert.equal(r.delivered, true, 'a 4-hop route still works with maxHops = 4');
    assert.ok(DEFAULT_SETTINGS.maxHops >= 4);
  });
});
