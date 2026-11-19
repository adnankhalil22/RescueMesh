import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createScenario } from './scenario.js';
import { applyCommand } from './commands.js';

const PORT = Number(process.env.PORT) || 4000;
const BASE_TICK_MS = 700;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

const sim = { mesh: createScenario(), paused: false, speed: 1, timer: null };

// ------------------------------------------------------------------ HTTP

const app = express();
app.use(express.json({ limit: '16kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, nodes: sim.mesh.nodes.size, tick: sim.mesh.tickCount, paused: sim.paused });
});

app.get('/api/state', (_req, res) => res.json(statePayload(null)));

app.get('/api/nodes/:id', (req, res) => {
  const view = sim.mesh.nodeView(req.params.id);
  if (!view) return res.status(404).json({ error: 'Unknown node' });
  res.json(view);
});

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const server = createServer(app);

// ------------------------------------------------------------- WebSocket

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

function statePayload(viewNode) {
  return {
    type: 'state',
    snapshot: { ...sim.mesh.snapshot(), paused: sim.paused, speed: sim.speed },
    view: viewNode ? sim.mesh.nodeView(viewNode) : null,
  };
}

function sendState(ws) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(statePayload(ws.viewNode)));
}

function broadcast() {
  for (const ws of wss.clients) sendState(ws);
}

wss.on('connection', (ws) => {
  ws.viewNode = null;
  sendState(ws);

  ws.on('message', (raw) => {
    let cmd;
    try {
      cmd = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }
    if (cmd?.type === 'subscribe') {
      ws.viewNode = typeof cmd.node === 'string' ? cmd.node : null;
      sendState(ws);
      return;
    }
    try {
      const speedBefore = sim.speed;
      applyCommand(sim, cmd);
      if (sim.speed !== speedBefore) schedule();
      broadcast();
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message, command: cmd?.type }));
    }
  });
});

// ------------------------------------------------------------ simulation

function schedule() {
  clearInterval(sim.timer);
  sim.timer = setInterval(() => {
    if (sim.paused) return;
    sim.mesh.tick();
    broadcast();
  }, BASE_TICK_MS / sim.speed);
}

schedule();

server.listen(PORT, () => {
  console.log(`RescueMesh server listening on http://localhost:${PORT}`);
  console.log(existsSync(clientDist) ? 'Serving built client from client/dist' : 'Client not built — run the Vite dev server (npm run dev)');
});

function shutdown() {
  clearInterval(sim.timer);
  wss.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
