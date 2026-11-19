// Verifies the Saida (Sidon) demonstration scenario: every coordinate is in Saida, the
// map settings agree with the seed data, and the configured LoRa ranges produce exactly
// the intended multi-hop routes.
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

type Box = { minLat: number; maxLat: number; minLng: number; maxLng: number };
const inBox = (lat: number, lng: number, b: Box) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
// Saida city and its immediate surroundings (approx.). The Mediterranean lies west of ~35.36 E here.
const SAIDA: Box = { minLat: 33.5, maxLat: 33.6, minLng: 35.36, maxLng: 35.45 };
// Places that must never come back into the demo data.
const LAHORE = { latitude: 31.52, longitude: 74.35 };
const BEIRUT = { latitude: 33.89, longitude: 35.5 };

describe('Saida demonstration scenario', () => {
  test('every node, the map centre and the seeded-emergency area are in Saida', () => {
    assert.ok(inBox(DEFAULT_SETTINGS.mapCenterLat, DEFAULT_SETTINGS.mapCenterLng, SAIDA), 'map centre in Saida');
    for (const n of DEMO_NODES) assert.ok(inBox(n.latitude, n.longitude, SAIDA), `${n.id} (${n.name}) in Saida`);
    const b = DEMO_AREA.incidentBox;
    assert.ok(inBox(b.minLat, b.minLng, SAIDA) && inBox(b.maxLat, b.maxLng, SAIDA), 'seeded-emergency area inside Saida');
    assert.ok(b.minLng >= 35.37, 'seeded emergencies stay east of the coastline (on land)');
  });

  test('map settings agree with the seed scenario', () => {
    assert.equal(DEFAULT_SETTINGS.mapCenterLat, DEMO_AREA.center.latitude);
    assert.equal(DEFAULT_SETTINGS.mapCenterLng, DEMO_AREA.center.longitude);
    assert.equal(DEFAULT_SETTINGS.mapZoom, DEMO_AREA.zoom);
    // At zoom 13 the visible map spans roughly ±5 km around the centre on a typical screen.
    for (const n of DEMO_NODES) assert.ok(haversineKm(n, DEMO_AREA.center) < 5, `${n.id} visible around the map centre`);
    const b = DEMO_AREA.incidentBox;
    for (const [lat, lng] of [[b.minLat, b.minLng], [b.minLat, b.maxLng], [b.maxLat, b.minLng], [b.maxLat, b.maxLng]]) {
      assert.ok(haversineKm({ latitude: lat, longitude: lng }, DEMO_AREA.center) < 5, 'incident area visible around the map centre');
    }
  });

  test('no Lahore or Beirut coordinates remain in the scenario', () => {
    const points = [...DEMO_NODES, DEMO_AREA.center, { latitude: DEFAULT_SETTINGS.mapCenterLat, longitude: DEFAULT_SETTINGS.mapCenterLng }];
    for (const p of points) {
      assert.ok(haversineKm(p, LAHORE) > 500, 'not Lahore');
      assert.ok(haversineKm(p, BEIRUT) > 20, 'not Beirut');
    }
  });

  test('topology: exactly the designed radio links', () => {
    const links = computeLinks(nodes())
      .map(([a, b]) => [a, b].sort().join('-'))
      .sort();
    assert.deepEqual(links, ['EP-01-RL-03', 'EP-02-RL-04', 'GW-01-RL-01', 'RL-01-RL-02', 'RL-02-RL-03', 'RL-02-RL-04', 'RL-03-RL-04']);
  });

  test('EP-01 Maghdouché → gateway: 4-hop route through the relay triangle, duplicates suppressed', () => {
    const r = simulateFlood(nodes(), 'EP-01', probe('EP-01'), new Map());
    assert.equal(r.delivered, true);
    assert.deepEqual(r.path, ['EP-01', 'RL-03', 'RL-02', 'RL-01', 'GW-01']);
    assert.equal(r.hopCount, 4);
    assert.ok(r.duplicatesDropped >= 1);
  });

  test('EP-02 Salhieh → gateway: 4-hop route via Majdelyoun', () => {
    const r = simulateFlood(nodes(), 'EP-02', probe('EP-02'), new Map());
    assert.deepEqual(r.path, ['EP-02', 'RL-04', 'RL-02', 'RL-01', 'GW-01']);
  });

  test('EP-03 Ghazieh is cut off while RL-05 is offline and delivered once it is online', () => {
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
