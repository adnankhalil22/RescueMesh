// Demonstration scenario — Beirut, Lebanon (fictional incident).
//
// A flash flood along the Beirut River. The emergency operations centre (EOC)
// gateway is downtown, west of the river. Relays step east across Ashrafieh and
// the river into Bourj Hammoud / Sin el Fil; field nodes sit in the affected
// eastern districts. All mesh nodes are SIMULATED (no ESP32 hardware).
//
// Designed multi-hop routes (verified by tests/scenario.test.ts):
//   EP-01 Dekwaneh   → RL-03 Sin el Fil → RL-02 River Bridge → RL-01 Ashrafieh → GW-01  (4 hops)
//   EP-02 Jdeideh    → RL-04 Bourj Hammoud → RL-02 → RL-01 → GW-01                       (4 hops)
//   RL-02 / RL-03 / RL-04 form a triangle, so floods produce duplicates that are suppressed.
//   EP-03 Hazmieh is reachable only through RL-05 Furn el Chebbak, which starts OFFLINE →
//   its packets are held (store-and-forward) until RL-05 is powered on in the dashboard.
// Coordinates are approximate neighbourhood centres; ranges are typical urban LoRa ranges.

export const DEMO_AREA = {
  name: 'Beirut, Lebanon',
  center: { latitude: 33.884, longitude: 35.528 },
  zoom: 13,
  /** Seeded emergencies are placed on land in eastern Beirut / Metn (no point falls in the sea). */
  incidentBox: { minLat: 33.862, maxLat: 33.898, minLng: 35.505, maxLng: 35.565 },
} as const;

export interface DemoNode {
  id: string;
  name: string;
  kind: 'GATEWAY' | 'RELAY' | 'ENDPOINT';
  latitude: number;
  longitude: number;
  rangeKm: number;
  online?: boolean;
}

export const DEMO_NODES: DemoNode[] = [
  { id: 'GW-01', name: 'EOC Gateway — Downtown Beirut', kind: 'GATEWAY', latitude: 33.896, longitude: 35.502, rangeKm: 3.0 },
  { id: 'RL-01', name: 'Relay — Ashrafieh (Sassine)', kind: 'RELAY', latitude: 33.888, longitude: 35.521, rangeKm: 2.8 },
  { id: 'RL-02', name: 'Relay — Beirut River Bridge', kind: 'RELAY', latitude: 33.883, longitude: 35.54, rangeKm: 2.8 },
  { id: 'RL-03', name: 'Relay — Sin el Fil', kind: 'RELAY', latitude: 33.877, longitude: 35.556, rangeKm: 2.8 },
  { id: 'RL-04', name: 'Relay — Bourj Hammoud', kind: 'RELAY', latitude: 33.893, longitude: 35.555, rangeKm: 2.8 },
  { id: 'RL-05', name: 'Relay — Furn el Chebbak', kind: 'RELAY', latitude: 33.865, longitude: 35.53, rangeKm: 2.8, online: false },
  { id: 'EP-01', name: 'Field Node — Dekwaneh', kind: 'ENDPOINT', latitude: 33.87, longitude: 35.573, rangeKm: 2.5 },
  { id: 'EP-02', name: 'Field Node — Jdeideh', kind: 'ENDPOINT', latitude: 33.899, longitude: 35.572, rangeKm: 2.5 },
  { id: 'EP-03', name: 'Field Node — Hazmieh', kind: 'ENDPOINT', latitude: 33.853, longitude: 35.538, rangeKm: 2.5 },
];
