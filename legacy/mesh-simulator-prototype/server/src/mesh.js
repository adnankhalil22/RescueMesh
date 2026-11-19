// RescueMesh simulation engine.
//
// Models a delay-tolerant ("store-and-forward") mesh of radio devices.
// Every device keeps a store of messages it has seen. On each tick, linked
// devices (online + within radio range of each other) exchange summary vectors
// and forward messages the neighbour has not seen yet — one hop per tick,
// limited by link bandwidth, highest priority (SOS) first. Messages carry a
// hop TTL and a maximum age so they cannot circulate forever.
//
// Direct messages produce a delivery receipt that travels back to the sender;
// any device that sees the receipt stops relaying the original message.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export const DEFAULTS = Object.freeze({
  range: 210,
  ttl: 10,
  maxAgeMs: 15 * 60 * 1000,
  linkBandwidth: 4,
  storeLimit: 300,
  width: 1000,
  height: 700,
});

export const NODE_KINDS = Object.freeze(['civilian', 'responder', 'base', 'relay']);
export const USER_MESSAGE_TYPES = Object.freeze(['chat', 'sos', 'sos-update']);
export const SOS_STATUSES = Object.freeze(['open', 'acknowledged', 'resolved']);

const PRIORITY = { sos: 3, 'sos-update': 3, receipt: 2, chat: 1 };
const SOS_RANK = { open: 0, acknowledged: 1, resolved: 2 };
const LOG_LIMIT = 200;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const shortId = () => randomUUID().replace(/-/g, '').slice(0, 8);
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Two devices can talk when each is inside the other's radio range. */
export function inRange(a, b) {
  return distance(a, b) <= Math.min(a.range, b.range);
}

export class MeshNetwork extends EventEmitter {
  constructor(options = {}) {
    super();
    this.opts = { ...DEFAULTS, ...options };
    this.nodes = new Map();
    this.tickCount = 0;
    this.stats = { originated: 0, forwarded: 0, delivered: 0, expired: 0 };
    this.log = [];
    this.lastTransfers = [];
  }

  // ------------------------------------------------------------------ nodes

  addNode({ id, name, x, y, range, kind = 'civilian', online = true } = {}) {
    const nodeId = id ?? `n-${shortId()}`;
    if (this.nodes.has(nodeId)) throw new Error(`Node ${nodeId} already exists`);
    if (!NODE_KINDS.includes(kind)) throw new Error(`Unknown node kind: ${kind}`);
    const { width, height } = this.opts;
    const node = {
      id: nodeId,
      name: String(name ?? nodeId).trim().slice(0, 40) || nodeId,
      kind,
      x: clamp(num(x, 40 + Math.random() * (width - 80)), 0, width),
      y: clamp(num(y, 40 + Math.random() * (height - 80)), 0, height),
      range: clamp(num(range, this.opts.range), 40, 600),
      online: Boolean(online),
      store: new Map(), // msgId -> { msg, ttl, hops, receivedAt }
      seen: new Set(), // every msgId ever received (dedup / summary vector)
      suppressed: new Set(), // msgIds this node must stop relaying
      receipts: new Set(), // own direct messages confirmed delivered
      sosView: new Map(), // sosId -> { status, by, updatedAt } as known by this node
    };
    this.nodes.set(nodeId, node);
    this.#log(`${node.name} joined the mesh`, 'node');
    return node;
  }

  getNode(id) {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Unknown node: ${id}`);
    return node;
  }

  removeNode(id) {
    const node = this.getNode(id);
    this.nodes.delete(id);
    this.#log(`${node.name} left the mesh`, 'node');
  }

  moveNode(id, x, y) {
    const node = this.getNode(id);
    node.x = clamp(num(x, node.x), 0, this.opts.width);
    node.y = clamp(num(y, node.y), 0, this.opts.height);
    return node;
  }

  setOnline(id, online) {
    const node = this.getNode(id);
    node.online = Boolean(online);
    this.#log(`${node.name} went ${node.online ? 'online' : 'offline'}`, node.online ? 'node' : 'warn');
    return node;
  }

  updateNode(id, { name, kind, range } = {}) {
    const node = this.getNode(id);
    if (name !== undefined) node.name = String(name).trim().slice(0, 40) || node.name;
    if (kind !== undefined) {
      if (!NODE_KINDS.includes(kind)) throw new Error(`Unknown node kind: ${kind}`);
      node.kind = kind;
    }
    if (range !== undefined) node.range = clamp(num(range, node.range), 40, 600);
    return node;
  }

  neighbors(id) {
    const node = this.getNode(id);
    if (!node.online) return [];
    return [...this.nodes.values()].filter((o) => o !== node && o.online && inRange(node, o));
  }

  linkPairs() {
    const online = [...this.nodes.values()].filter((n) => n.online);
    const pairs = [];
    for (let i = 0; i < online.length; i++) {
      for (let j = i + 1; j < online.length; j++) {
        if (inRange(online[i], online[j])) pairs.push([online[i], online[j]]);
      }
    }
    return pairs;
  }

  // --------------------------------------------------------------- messages

  /**
   * Originate a user message at a device. The device does not need to be
   * online: the message waits in its store until a link appears.
   */
  send(fromId, { type = 'chat', to = '*', body = '', ref = null, meta = {} } = {}) {
    const node = this.getNode(fromId);
    if (!USER_MESSAGE_TYPES.includes(type)) throw new Error(`Unsupported message type: ${type}`);
    const text = String(body ?? '').trim().slice(0, 500);
    let cleanMeta = {};

    if (type === 'chat') {
      if (!text) throw new Error('Message is empty');
      if (to !== '*') {
        if (!this.nodes.has(to)) throw new Error(`Unknown recipient: ${to}`);
        if (to === fromId) throw new Error('Cannot send a direct message to yourself');
      }
    } else if (type === 'sos') {
      to = '*';
      cleanMeta = {
        severity: clamp(Math.round(num(meta.severity, 2)), 1, 3),
        people: clamp(Math.round(num(meta.people, 1)), 1, 500),
      };
    } else if (type === 'sos-update') {
      to = '*';
      if (!['responder', 'base'].includes(node.kind)) {
        throw new Error('Only responder or base devices can update an SOS');
      }
      if (!ref || !node.sosView.has(ref)) throw new Error('This device has not received that SOS');
      if (!['acknowledged', 'resolved'].includes(meta.status)) throw new Error('Invalid SOS status');
      const current = node.sosView.get(ref).status;
      if (SOS_RANK[meta.status] <= SOS_RANK[current]) throw new Error(`SOS is already ${current}`);
      cleanMeta = { status: meta.status };
    }

    const msg = this.#originate(node, { type, to, body: text, ref, meta: cleanMeta });
    const label = type === 'sos' ? 'raised an SOS' : type === 'sos-update' ? `marked SOS ${meta.status}` : 'sent a message';
    this.#log(`${node.name} ${label}${node.online ? '' : ' (queued — device offline)'}`, type === 'sos' ? 'sos' : 'msg');
    return msg;
  }

  #originate(node, { type, to, body = '', ref = null, meta = {} }, now = Date.now()) {
    const msg = Object.freeze({
      id: `m-${shortId()}`,
      type,
      from: node.id,
      fromName: node.name,
      to,
      body,
      ref,
      meta: Object.freeze({ ...meta }),
      priority: PRIORITY[type],
      createdAt: now,
      origin: Object.freeze({ x: Math.round(node.x), y: Math.round(node.y) }),
    });
    this.stats.originated++;
    this.#receive(node, msg, this.opts.ttl, [node.id], now);
    return msg;
  }

  #receive(node, msg, ttl, hops, now) {
    if (node.seen.has(msg.id)) return false;
    node.seen.add(msg.id);
    node.store.set(msg.id, { msg, ttl, hops, receivedAt: now });
    const isOrigin = hops.length === 1 && msg.from === node.id;

    switch (msg.type) {
      case 'chat':
        if (!isOrigin && msg.to === node.id) {
          this.stats.delivered++;
          this.#log(`${node.name} received a direct message from ${msg.fromName} (${hops.length - 1} hops)`, 'deliver');
          this.#originate(node, { type: 'receipt', to: msg.from, ref: msg.id }, now);
        }
        break;
      case 'receipt':
        node.suppressed.add(msg.ref);
        if (msg.to === node.id) node.receipts.add(msg.ref);
        break;
      case 'sos':
        if (!node.sosView.has(msg.id)) {
          node.sosView.set(msg.id, { status: 'open', by: null, updatedAt: msg.createdAt });
        }
        if (!isOrigin && (node.kind === 'base' || node.kind === 'responder')) {
          this.#log(`SOS from ${msg.fromName} reached ${node.name} (${hops.length - 1} hops)`, 'sos');
        }
        break;
      case 'sos-update': {
        const cur = node.sosView.get(msg.ref);
        if (!cur || SOS_RANK[msg.meta.status] > SOS_RANK[cur.status]) {
          node.sosView.set(msg.ref, { status: msg.meta.status, by: msg.fromName, updatedAt: msg.createdAt });
        }
        if (msg.meta.status === 'resolved') node.suppressed.add(msg.ref);
        break;
      }
      default:
        break;
    }

    this.#enforceStoreLimit(node);
    return true;
  }

  /** Evict lowest-priority, oldest relayed messages once the store is full. */
  #enforceStoreLimit(node) {
    const excess = node.store.size - this.opts.storeLimit;
    if (excess <= 0) return;
    const evictable = [...node.store.values()]
      .filter((e) => e.msg.from !== node.id && e.msg.to !== node.id && e.msg.type !== 'sos')
      .sort((a, b) => a.msg.priority - b.msg.priority || a.receivedAt - b.receivedAt);
    for (const e of evictable.slice(0, excess)) node.store.delete(e.msg.id);
  }

  // ------------------------------------------------------------- simulation

  tick(now = Date.now()) {
    this.tickCount++;

    for (const node of this.nodes.values()) {
      for (const [id, entry] of node.store) {
        if (now - entry.msg.createdAt > this.opts.maxAgeMs) {
          node.store.delete(id);
          this.stats.expired++;
        }
      }
    }

    // Plan every transfer from the state at the start of the tick so a
    // message advances at most one hop per tick.
    const planned = [];
    for (const [a, b] of this.linkPairs()) {
      planned.push(...this.#plan(a, b), ...this.#plan(b, a));
    }

    const transfers = [];
    for (const { from, to, entry } of planned) {
      const hops = [...entry.hops, to.id];
      if (this.#receive(to, entry.msg, entry.ttl - 1, hops, now)) {
        this.stats.forwarded++;
        transfers.push({ from: from.id, to: to.id, msgId: entry.msg.id, type: entry.msg.type });
      }
    }

    this.lastTransfers = transfers;
    this.emit('tick', transfers);
    return transfers;
  }

  #plan(a, b) {
    const candidates = [];
    for (const entry of a.store.values()) {
      if (entry.ttl <= 0) continue;
      if (a.suppressed.has(entry.msg.id)) continue;
      if (b.seen.has(entry.msg.id)) continue; // neighbour's summary vector says it has it
      candidates.push(entry);
    }
    candidates.sort((x, y) => y.msg.priority - x.msg.priority || x.msg.createdAt - y.msg.createdAt);
    return candidates.slice(0, this.opts.linkBandwidth).map((entry) => ({ from: a, to: b, entry }));
  }

  // ------------------------------------------------------------------ views

  publicNode(node) {
    let relayQueue = 0;
    for (const e of node.store.values()) if (e.ttl > 0 && !node.suppressed.has(e.msg.id)) relayQueue++;
    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      x: Math.round(node.x),
      y: Math.round(node.y),
      range: node.range,
      online: node.online,
      stored: node.store.size,
      relayQueue,
    };
  }

  /** Network-wide SOS overview (the "omniscient" simulator view). */
  globalSos() {
    const sosById = new Map();
    for (const node of this.nodes.values()) {
      for (const { msg } of node.store.values()) {
        if (msg.type === 'sos' && !sosById.has(msg.id)) sosById.set(msg.id, msg);
      }
    }
    const nodes = [...this.nodes.values()];
    return [...sosById.values()]
      .map((msg) => {
        let status = 'open';
        let reached = 0;
        let respondersReached = 0;
        for (const n of nodes) {
          if (n.seen.has(msg.id)) {
            reached++;
            if (n.kind === 'responder' || n.kind === 'base') respondersReached++;
          }
          const v = n.sosView.get(msg.id);
          if (v && SOS_RANK[v.status] > SOS_RANK[status]) status = v.status;
        }
        return { ...msg, status, reached, respondersReached, total: nodes.length };
      })
      .sort((a, b) => SOS_RANK[a.status] - SOS_RANK[b.status] || b.meta.severity - a.meta.severity || a.createdAt - b.createdAt);
  }

  /** What a single device knows: its inbox, its SOS board, its neighbours. */
  nodeView(id) {
    const node = this.nodes.get(id);
    if (!node) return null;
    const inbox = [];
    const sos = [];
    for (const { msg, hops } of node.store.values()) {
      if (msg.type === 'chat' && (msg.to === '*' || msg.to === id || msg.from === id)) {
        inbox.push({
          ...msg,
          hops: hops.length - 1,
          mine: msg.from === id,
          delivered: node.receipts.has(msg.id),
        });
      }
    }
    for (const [sosId, v] of node.sosView) {
      const entry = node.store.get(sosId);
      if (!entry) continue;
      sos.push({ ...entry.msg, hops: entry.hops.length - 1, status: v.status, by: v.by, updatedAt: v.updatedAt });
    }
    inbox.sort((a, b) => a.createdAt - b.createdAt);
    sos.sort((a, b) => SOS_RANK[a.status] - SOS_RANK[b.status] || b.meta.severity - a.meta.severity);
    return {
      node: this.publicNode(node),
      neighbors: this.neighbors(id).map((n) => n.id),
      inbox,
      sos,
    };
  }

  snapshot() {
    return {
      tick: this.tickCount,
      width: this.opts.width,
      height: this.opts.height,
      stats: { ...this.stats },
      nodes: [...this.nodes.values()].map((n) => this.publicNode(n)),
      links: this.linkPairs().map(([a, b]) => [a.id, b.id]),
      transfers: this.lastTransfers,
      sos: this.globalSos(),
      log: this.log.slice(-80),
    };
  }

  #log(text, kind = 'info') {
    this.log.push({ t: Date.now(), text, kind });
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
  }
}
