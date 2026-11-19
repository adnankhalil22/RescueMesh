// Default demo scenario: a flooded district.
// West side: command post + rescue teams. East side: civilians.
// The rooftop relay is the only bridge between them — take it offline to
// partition the mesh and watch messages wait, then flow when it returns.
// Tom's phone starts dead (offline) so messages to him queue up.

import { MeshNetwork } from './mesh.js';

export const SCENARIO_NODES = [
  { id: 'command', name: 'Command Post', kind: 'base', x: 130, y: 360, range: 240 },
  { id: 'alpha', name: 'Rescue Team Alpha', kind: 'responder', x: 280, y: 230, range: 240 },
  { id: 'bravo', name: 'Medic Bravo', kind: 'responder', x: 290, y: 500, range: 240 },
  { id: 'relay', name: 'Rooftop Relay', kind: 'relay', x: 470, y: 360, range: 280 },
  { id: 'maya', name: 'Maya', kind: 'civilian', x: 640, y: 250 },
  { id: 'omar', name: 'Omar', kind: 'civilian', x: 650, y: 440 },
  { id: 'lena', name: 'Lena', kind: 'civilian', x: 820, y: 330 },
  { id: 'ana', name: 'Ana', kind: 'civilian', x: 700, y: 620 },
  { id: 'kenji', name: 'Kenji', kind: 'civilian', x: 860, y: 560 },
  { id: 'tom', name: 'Tom', kind: 'civilian', x: 900, y: 140, online: false },
];

export function createScenario({ seedMessages = true, ...options } = {}) {
  const mesh = new MeshNetwork(options);
  for (const n of SCENARIO_NODES) mesh.addNode(n);
  if (seedMessages) {
    mesh.send('kenji', {
      type: 'sos',
      body: 'Trapped on 2nd floor, water rising fast',
      meta: { severity: 3, people: 2 },
    });
    mesh.send('command', {
      type: 'chat',
      to: '*',
      body: 'Command Post active. Stay on high ground. Send SOS if you need rescue.',
    });
  }
  return mesh;
}
