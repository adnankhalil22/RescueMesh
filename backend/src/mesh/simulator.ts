// Pure (no I/O) flood-routing simulator for a LoRa mesh.
//
// Rules implemented:
//  * A node can reach another node when both are online and the distance is
//    within the smaller of their two radio ranges.
//  * Every node keeps a "seen" cache of message IDs. A packet that is already
//    in the cache is dropped: this prevents duplicate forwarding and loops.
//  * hopCount is incremented on every forward. A node does not forward once
//    hopCount >= maxHops (TTL), which bounds flooding in large meshes.
//  * A packet is delivered when it reaches its destination node, or any
//    GATEWAY when the destination is the server.

import { SERVER_NODE_ID, type NodeKind } from '../domain/constants';
import type { MeshPacket } from './packet';

export interface SimNode {
  id: string;
  name: string;
  kind: NodeKind;
  latitude: number;
  longitude: number;
  rangeKm: number;
  online: boolean;
}

export type TraceEventType = 'ORIGIN' | 'TX' | 'RX' | 'DUPLICATE_DROPPED' | 'HOP_LIMIT' | 'DELIVERED' | 'NODE_OFFLINE' | 'NO_ROUTE';

export interface TraceEvent {
  step: number;
  type: TraceEventType;
  nodeId: string;
  from?: string;
  hopCount: number;
  detail: string;
}

export interface NodeCounters {
  sent: number;
  received: number;
  dropped: number;
}

export interface SimulationResult {
  messageId: string;
  delivered: boolean;
  deliveredAt?: string;
  hopCount?: number;
  path?: string[];
  events: TraceEvent[];
  transmissions: number;
  duplicatesDropped: number;
  holders: string[]; // nodes that now carry the packet (store-and-forward)
  counters: Record<string, NodeCounters>;
}

export type SeenCache = Map<string, Set<string>>;

const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function canLink(a: SimNode, b: SimNode): boolean {
  return a.id !== b.id && a.online && b.online && haversineKm(a, b) <= Math.min(a.rangeKm, b.rangeKm);
}

export function computeLinks(nodes: SimNode[]): Array<[string, string]> {
  const links: Array<[string, string]> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (canLink(nodes[i], nodes[j])) links.push([nodes[i].id, nodes[j].id]);
    }
  }
  return links;
}

export function isDestination(node: SimNode, packet: MeshPacket): boolean {
  if (packet.destinationNodeId === node.id) return true;
  return packet.destinationNodeId === SERVER_NODE_ID && node.kind === 'GATEWAY';
}

/**
 * Floods `packet` from `startNodeId`. `seen` is mutated so that repeated
 * transmissions of the same message ID are recognised as duplicates.
 */
export function simulateFlood(nodes: SimNode[], startNodeId: string, packet: MeshPacket, seen: SeenCache): SimulationResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const counters: Record<string, NodeCounters> = {};
  const count = (id: string) => (counters[id] ??= { sent: 0, received: 0, dropped: 0 });
  const seenAt = (id: string) => {
    let s = seen.get(id);
    if (!s) seen.set(id, (s = new Set()));
    return s;
  };

  const result: SimulationResult = {
    messageId: packet.messageId,
    delivered: false,
    events: [],
    transmissions: 0,
    duplicatesDropped: 0,
    holders: [],
    counters,
  };
  const log = (e: TraceEvent) => result.events.push(e);

  const start = byId.get(startNodeId);
  if (!start) throw new Error(`Unknown node ${startNodeId}`);
  if (!start.online) {
    log({ step: 0, type: 'NODE_OFFLINE', nodeId: start.id, hopCount: packet.hopCount, detail: `${start.name} is offline; packet held` });
    result.holders = [start.id];
    return result;
  }
  if (seenAt(start.id).has(packet.messageId)) {
    count(start.id).dropped++;
    result.duplicatesDropped++;
    log({ step: 0, type: 'DUPLICATE_DROPPED', nodeId: start.id, hopCount: packet.hopCount, detail: `${start.name} already handled this message; not re-sent` });
    return result;
  }

  seenAt(start.id).add(packet.messageId);
  log({ step: 0, type: 'ORIGIN', nodeId: start.id, hopCount: packet.hopCount, detail: `${start.name} originates message` });

  type Item = { nodeId: string; hopCount: number; path: string[] };
  let frontier: Item[] = [{ nodeId: start.id, hopCount: packet.hopCount, path: [start.id] }];
  const holders = new Set<string>([start.id]);
  let step = 0;

  while (frontier.length) {
    step++;
    const next: Item[] = [];
    for (const item of frontier) {
      const node = byId.get(item.nodeId)!;
      if (isDestination(node, packet)) {
        if (!result.delivered) {
          result.delivered = true;
          result.deliveredAt = node.id;
          result.hopCount = item.hopCount;
          result.path = item.path;
          log({ step, type: 'DELIVERED', nodeId: node.id, hopCount: item.hopCount, detail: `Delivered at ${node.name} after ${item.hopCount} hop(s)` });
        }
        continue; // destinations do not re-broadcast
      }
      if (item.hopCount >= packet.maxHops) {
        count(node.id).dropped++;
        log({ step, type: 'HOP_LIMIT', nodeId: node.id, hopCount: item.hopCount, detail: `${node.name} reached max hops (${packet.maxHops}); not forwarded` });
        continue;
      }
      const prev = item.path[item.path.length - 2];
      const neighbours = nodes.filter((n) => n.id !== prev && canLink(node, n));
      if (neighbours.length === 0) continue;
      count(node.id).sent++;
      result.transmissions++;
      log({ step, type: 'TX', nodeId: node.id, hopCount: item.hopCount, detail: `${node.name} broadcasts (hop ${item.hopCount})` });
      for (const nb of neighbours) {
        if (seenAt(nb.id).has(packet.messageId)) {
          count(nb.id).dropped++;
          result.duplicatesDropped++;
          log({ step, type: 'DUPLICATE_DROPPED', nodeId: nb.id, from: node.id, hopCount: item.hopCount + 1, detail: `${nb.name} ignored duplicate from ${node.name}` });
          continue;
        }
        seenAt(nb.id).add(packet.messageId);
        count(nb.id).received++;
        holders.add(nb.id);
        log({ step, type: 'RX', nodeId: nb.id, from: node.id, hopCount: item.hopCount + 1, detail: `${nb.name} received from ${node.name}` });
        next.push({ nodeId: nb.id, hopCount: item.hopCount + 1, path: [...item.path, nb.id] });
      }
    }
    frontier = next;
  }

  if (!result.delivered) {
    log({ step: step + 1, type: 'NO_ROUTE', nodeId: start.id, hopCount: packet.hopCount, detail: 'No route to destination; packet stored for retry' });
  }
  result.holders = [...holders];
  return result;
}

/** Forget a message everywhere, so a store-and-forward retry can re-flood it. */
export function forget(seen: SeenCache, messageId: string): void {
  for (const set of seen.values()) set.delete(messageId);
}
