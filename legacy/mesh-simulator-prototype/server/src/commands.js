// Applies a client command to the simulation. Throws on invalid input; the
// caller reports the error back to the client that sent it.

import { createScenario } from './scenario.js';

export const SPEEDS = [0.5, 1, 2, 4];

export function applyCommand(sim, cmd) {
  if (!cmd || typeof cmd.type !== 'string') throw new Error('Malformed command');
  const { mesh } = sim;

  switch (cmd.type) {
    case 'chat':
      return mesh.send(cmd.from, { type: 'chat', to: cmd.to ?? '*', body: cmd.body });
    case 'sos':
      return mesh.send(cmd.from, {
        type: 'sos',
        body: cmd.body,
        meta: { severity: cmd.severity, people: cmd.people },
      });
    case 'sosUpdate':
      return mesh.send(cmd.from, { type: 'sos-update', ref: cmd.ref, meta: { status: cmd.status } });
    case 'addNode':
      return mesh.addNode({ name: cmd.name, kind: cmd.kind, x: cmd.x, y: cmd.y, range: cmd.range });
    case 'removeNode':
      return mesh.removeNode(cmd.id);
    case 'moveNode':
      return mesh.moveNode(cmd.id, cmd.x, cmd.y);
    case 'setOnline':
      return mesh.setOnline(cmd.id, cmd.online);
    case 'updateNode':
      return mesh.updateNode(cmd.id, { name: cmd.name, kind: cmd.kind, range: cmd.range });
    case 'pause':
      sim.paused = Boolean(cmd.paused);
      return null;
    case 'speed': {
      const speed = Number(cmd.speed);
      if (!SPEEDS.includes(speed)) throw new Error(`Speed must be one of ${SPEEDS.join(', ')}`);
      sim.speed = speed;
      return null;
    }
    case 'step':
      return mesh.tick();
    case 'reset':
      sim.mesh = createScenario();
      return null;
    default:
      throw new Error(`Unknown command: ${cmd.type}`);
  }
}
