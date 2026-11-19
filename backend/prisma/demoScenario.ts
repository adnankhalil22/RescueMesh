// Demonstration scenario — Saida (Sidon), Lebanon (fictional incident).
//
// A flash flood along the Sainiq River and its valley, south-east of Saida. The
// emergency operations centre (EOC) gateway is in Saida's old city. Relays step
// east and south-east into Haret Saida, Miyeh w Miyeh, Darb es-Sim and Majdelyoun;
// field nodes sit in the affected outlying areas. Saida's coast runs north–south
// with the sea to the west, so every point is placed inland. All mesh nodes are
// SIMULATED (no ESP32 hardware).
//
// Designed multi-hop routes (verified by tests/scenario.test.ts):
//   EP-01 Maghdouché → RL-03 Darb es-Sim → RL-02 Miyeh w Miyeh → RL-01 Haret Saida → GW-01   (4 hops)
//   EP-02 Salhieh    → RL-04 Majdelyoun  → RL-02 → RL-01 → GW-01                             (4 hops)
//   RL-02 / RL-03 / RL-04 form a triangle, so floods produce duplicates that are suppressed.
//   EP-03 Ghazieh is reachable only through RL-05 Sainiq River Bridge, which starts OFFLINE →
//   its packets are held (store-and-forward) until RL-05 is powered on in the dashboard.
// Coordinates are approximate neighbourhood positions chosen for a coherent scenario (not
// surveyed sites); ranges are typical urban/peri-urban LoRa assumptions, not measurements.

export const DEMO_AREA = {
  name: 'Saida (Sidon), Lebanon',
  /** Map centre = centre of the node network; zoom 13 shows the whole scenario. */
  center: { latitude: 33.547, longitude: 35.398 },
  zoom: 13,
  /** Seeded emergencies are spread over this on-land area (east of the coastline). */
  incidentBox: { minLat: 33.53, maxLat: 33.565, minLng: 35.38, maxLng: 35.43 },
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
  { id: 'GW-01', name: 'EOC Gateway — Saida Old City', kind: 'GATEWAY', latitude: 33.566, longitude: 35.3735, rangeKm: 3.0 },
  { id: 'RL-01', name: 'Relay — Haret Saida', kind: 'RELAY', latitude: 33.5575, longitude: 35.384, rangeKm: 2.8 },
  { id: 'RL-02', name: 'Relay — Miyeh w Miyeh', kind: 'RELAY', latitude: 33.5535, longitude: 35.4035, rangeKm: 2.8 },
  { id: 'RL-03', name: 'Relay — Darb es-Sim', kind: 'RELAY', latitude: 33.542, longitude: 35.412, rangeKm: 2.8 },
  { id: 'RL-04', name: 'Relay — Majdelyoun', kind: 'RELAY', latitude: 33.559, longitude: 35.417, rangeKm: 2.8 },
  { id: 'RL-05', name: 'Relay — Sainiq River Bridge', kind: 'RELAY', latitude: 33.54, longitude: 35.378, rangeKm: 2.8, online: false },
  { id: 'EP-01', name: 'Field Node — Maghdouché', kind: 'ENDPOINT', latitude: 33.527, longitude: 35.4045, rangeKm: 2.5 },
  { id: 'EP-02', name: 'Field Node — Salhieh', kind: 'ENDPOINT', latitude: 33.562, longitude: 35.433, rangeKm: 2.5 },
  { id: 'EP-03', name: 'Field Node — Ghazieh', kind: 'ENDPOINT', latitude: 33.524, longitude: 35.368, rangeKm: 2.5 },
];
