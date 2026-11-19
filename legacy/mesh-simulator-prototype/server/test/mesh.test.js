import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshNetwork, inRange } from '../src/mesh.js';
import { createScenario } from '../src/scenario.js';
import { applyCommand } from '../src/commands.js';

/** A straight chain a-b-c-d with 100px spacing and 150px range. */
function chain(opts = {}) {
  const mesh = new MeshNetwork(opts);
  for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
    mesh.addNode({ id, name: id.toUpperCase(), x: 100 + i * 100, y: 100, range: 150 });
  }
  return mesh;
}

const runTicks = (mesh, n) => {
  for (let i = 0; i < n; i++) mesh.tick();
};

test('chain topology only links adjacent nodes', () => {
  const mesh = chain();
  assert.deepEqual(
    mesh.linkPairs().map(([x, y]) => x.id + y.id),
    ['ab', 'bc', 'cd'],
  );
});

test('broadcast propagates one hop per tick', () => {
  const mesh = chain();
  const msg = mesh.send('a', { body: 'hello' });
  mesh.tick();
  assert.ok(mesh.nodes.get('b').seen.has(msg.id));
  assert.ok(!mesh.nodes.get('c').seen.has(msg.id));
  runTicks(mesh, 2);
  const view = mesh.nodeView('d');
  assert.equal(view.inbox.length, 1);
  assert.equal(view.inbox[0].hops, 3);
  assert.equal(view.inbox[0].body, 'hello');
});

test('store-and-forward: message waits through a partition', () => {
  const mesh = chain();
  mesh.setOnline('c', false);
  const msg = mesh.send('a', { body: 'are you ok?', to: 'd' });
  runTicks(mesh, 5);
  assert.ok(!mesh.nodes.get('d').seen.has(msg.id), 'should not cross the partition');
  assert.ok(mesh.nodes.get('b').store.has(msg.id), 'b keeps carrying it');
  mesh.setOnline('c', true);
  runTicks(mesh, 2);
  assert.ok(mesh.nodes.get('d').seen.has(msg.id));
});

test('direct message produces a delivery receipt that stops relaying', () => {
  const mesh = chain();
  const msg = mesh.send('a', { body: 'ping', to: 'c' });
  runTicks(mesh, 2); // reaches c
  assert.equal(mesh.stats.delivered, 1);
  runTicks(mesh, 2); // receipt travels back to a
  const aView = mesh.nodeView('a');
  assert.equal(aView.inbox.find((m) => m.id === msg.id).delivered, true);
  assert.ok(mesh.nodes.get('b').suppressed.has(msg.id));
  assert.ok(mesh.nodes.get('c').suppressed.has(msg.id));
  // d is not the recipient, so the direct message never shows in its inbox
  runTicks(mesh, 3);
  assert.equal(mesh.nodeView('d').inbox.length, 0);
});

test('an offline sender queues messages until it reconnects', () => {
  const mesh = chain();
  mesh.setOnline('a', false);
  const msg = mesh.send('a', { body: 'queued' });
  runTicks(mesh, 3);
  assert.ok(!mesh.nodes.get('b').seen.has(msg.id));
  mesh.setOnline('a', true);
  mesh.tick();
  assert.ok(mesh.nodes.get('b').seen.has(msg.id));
});

test('TTL limits how far a message travels', () => {
  const mesh = chain({ ttl: 2 });
  const msg = mesh.send('a', { body: 'short range' });
  runTicks(mesh, 6);
  assert.ok(mesh.nodes.get('c').seen.has(msg.id));
  assert.ok(!mesh.nodes.get('d').seen.has(msg.id));
});

test('messages expire after maxAge', () => {
  const mesh = chain({ maxAgeMs: 1000 });
  const msg = mesh.send('a', { body: 'old news' });
  mesh.tick(msg.createdAt + 5000);
  assert.equal(mesh.nodes.get('a').store.size, 0);
  assert.ok(!mesh.nodes.get('b').seen.has(msg.id));
});

test('SOS outranks chat when link bandwidth is limited', () => {
  const mesh = chain({ linkBandwidth: 1 });
  mesh.send('a', { body: 'chat 1' });
  mesh.send('a', { body: 'chat 2' });
  const sos = mesh.send('a', { type: 'sos', body: 'help', meta: { severity: 3 } });
  const transfers = mesh.tick();
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].msgId, sos.id);
});

test('SOS lifecycle: only responders can update and status propagates', () => {
  const mesh = chain();
  mesh.updateNode('d', { kind: 'responder' });
  const sos = mesh.send('a', { type: 'sos', body: 'injured', meta: { severity: 2, people: 3 } });
  assert.throws(() => mesh.send('b', { type: 'sos-update', ref: sos.id, meta: { status: 'acknowledged' } }), /Only responder/);
  assert.throws(() => mesh.send('d', { type: 'sos-update', ref: sos.id, meta: { status: 'acknowledged' } }), /not received/);
  runTicks(mesh, 3);
  mesh.send('d', { type: 'sos-update', ref: sos.id, meta: { status: 'acknowledged' } });
  assert.throws(() => mesh.send('d', { type: 'sos-update', ref: sos.id, meta: { status: 'acknowledged' } }), /already/);
  runTicks(mesh, 3);
  const aSos = mesh.nodeView('a').sos[0];
  assert.equal(aSos.status, 'acknowledged');
  assert.equal(aSos.by, 'D');
  assert.equal(aSos.meta.people, 3);
  assert.equal(mesh.globalSos()[0].status, 'acknowledged');
  assert.equal(mesh.globalSos()[0].reached, 4);
});

test('input validation', () => {
  const mesh = chain();
  assert.throws(() => mesh.send('a', { body: '   ' }), /empty/);
  assert.throws(() => mesh.send('a', { body: 'x', to: 'zzz' }), /Unknown recipient/);
  assert.throws(() => mesh.send('a', { body: 'x', to: 'a' }), /yourself/);
  assert.throws(() => mesh.send('a', { type: 'receipt', body: 'x' }), /Unsupported/);
  assert.throws(() => mesh.addNode({ id: 'a' }), /already exists/);
  assert.throws(() => mesh.addNode({ kind: 'alien' }), /Unknown node kind/);
  const n = mesh.moveNode('a', -50, 99999);
  assert.equal(n.x, 0);
  assert.equal(n.y, mesh.opts.height);
});

test('default scenario: all online nodes reachable; relay is the only bridge', () => {
  const mesh = createScenario({ seedMessages: false });
  const reachable = (start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const id = queue.shift();
      for (const n of mesh.neighbors(id)) if (!seen.has(n.id)) seen.add(n.id), queue.push(n.id);
    }
    return seen;
  };
  const online = [...mesh.nodes.values()].filter((n) => n.online).map((n) => n.id);
  assert.equal(reachable('command').size, online.length);
  mesh.setOnline('relay', false);
  assert.ok(!reachable('command').has('maya'));
  // Tom becomes reachable once his phone is back on
  mesh.setOnline('relay', true);
  mesh.setOnline('tom', true);
  assert.ok(reachable('command').has('tom'));
  assert.ok(inRange(mesh.getNode('tom'), mesh.getNode('lena')));
});

test('seeded SOS reaches the command post', () => {
  const mesh = createScenario();
  runTicks(mesh, 12);
  const sos = mesh.nodeView('command').sos;
  assert.equal(sos.length, 1);
  assert.equal(sos[0].fromName, 'Kenji');
});

test('commands: speed validation and reset', () => {
  const sim = { mesh: createScenario(), paused: false, speed: 1 };
  assert.throws(() => applyCommand(sim, { type: 'speed', speed: 3 }), /Speed/);
  applyCommand(sim, { type: 'speed', speed: 2 });
  assert.equal(sim.speed, 2);
  applyCommand(sim, { type: 'removeNode', id: 'tom' });
  applyCommand(sim, { type: 'reset' });
  assert.ok(sim.mesh.nodes.has('tom'));
  assert.throws(() => applyCommand(sim, { type: 'nope' }), /Unknown command/);
});
