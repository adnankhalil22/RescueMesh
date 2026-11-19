// SIMULATED LoRa transport. Node positions/ranges live in the CommNode table;
// routing is done by the pure simulator. Packets that reach a GATEWAY are
// handed to the same ingest pipeline that HTTP sync uses. Packets with no
// route are kept in PendingPacket and retried when the topology changes.

import { prisma } from '../db';
import { ingestPacket } from '../services/ingestService';
import { getSettings } from '../services/settingsService';
import type { NodeKind } from '../domain/constants';
import { meshPacketSchema, type MeshPacket } from './packet';
import { forget, simulateFlood, type SeenCache, type SimNode, type SimulationResult } from './simulator';
import type { MeshTransport, TransmitResult, TransportStatus } from './transport';

const RECENT_LIMIT = 25;

export interface TransmissionRecord {
  at: string;
  messageId: string;
  type: string;
  sourceNodeId: string;
  delivered: boolean;
  queued: boolean;
  hopCount?: number;
  path?: string[];
  transmissions: number;
  duplicatesDropped: number;
  ingest?: TransmitResult['ingest'];
  events: SimulationResult['events'];
}

export class SimulatedLoRaTransport implements MeshTransport {
  private seen: SeenCache = new Map();
  readonly recent: TransmissionRecord[] = [];

  status(): TransportStatus {
    return {
      kind: 'SIMULATED_LORA',
      simulated: true,
      hardwareConnected: false,
      description: 'Software simulation of ESP32 + LoRa nodes. No radio hardware is involved.',
    };
  }

  async loadNodes(): Promise<SimNode[]> {
    const rows = await prisma.commNode.findMany({ orderBy: { id: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as NodeKind,
      latitude: r.latitude,
      longitude: r.longitude,
      rangeKm: r.rangeKm,
      online: r.online,
    }));
  }

  async transmit(input: MeshPacket, sourceNodeId: string): Promise<TransmitResult> {
    const packet = meshPacketSchema.parse({ ...input, maxHops: input.maxHops || (await getSettings()).maxHops });
    const nodes = await this.loadNodes();
    const sim = simulateFlood(nodes, sourceNodeId, packet, this.seen);
    await this.applyCounters(sim);

    let ingest: TransmitResult['ingest'];
    if (sim.delivered) {
      const delivered = { ...packet, hopCount: sim.hopCount ?? packet.hopCount };
      ingest = await ingestPacket(delivered, { transport: 'LORA_SIM', path: sim.path });
      await prisma.pendingPacket.deleteMany({ where: { id: packet.messageId } });
    }
    const queued = !sim.delivered && sim.holders.length > 0;
    if (queued) {
      const heldBy = sim.holders[sim.holders.length - 1];
      await prisma.pendingPacket.upsert({
        where: { id: packet.messageId },
        create: { id: packet.messageId, packet: JSON.stringify(packet), heldByNode: heldBy },
        update: { attempts: { increment: 1 }, heldByNode: heldBy },
      });
    }

    this.record(packet, sourceNodeId, sim, queued, ingest);
    return { delivered: sim.delivered, queued, simulation: sim, ingest };
  }

  /** Store-and-forward: re-flood held packets from the node holding them. */
  async retryPending(): Promise<TransmitResult[]> {
    const pending = await prisma.pendingPacket.findMany({ orderBy: { createdAt: 'asc' } });
    const { maxHops } = await getSettings();
    const results: TransmitResult[] = [];
    for (const p of pending) {
      // Re-sent with the *current* hop limit, so raising max hops in Settings can release
      // packets that were previously stopped by a lower limit.
      const packet = meshPacketSchema.parse({ ...JSON.parse(p.packet), maxHops });
      forget(this.seen, packet.messageId);
      const start = (await prisma.commNode.findUnique({ where: { id: p.heldByNode } }))?.online ? p.heldByNode : packet.sourceNodeId;
      results.push(await this.transmit(packet, start));
    }
    return results;
  }

  private async applyCounters(sim: SimulationResult) {
    const now = new Date();
    await prisma.$transaction(
      Object.entries(sim.counters).map(([id, c]) =>
        prisma.commNode.update({
          where: { id },
          data: {
            packetsSent: { increment: c.sent },
            packetsReceived: { increment: c.received },
            packetsDropped: { increment: c.dropped },
            lastSeen: now,
          },
        }),
      ),
    );
  }

  private record(packet: MeshPacket, source: string, sim: SimulationResult, queued: boolean, ingest?: TransmitResult['ingest']) {
    this.recent.unshift({
      at: new Date().toISOString(),
      messageId: packet.messageId,
      type: packet.type,
      sourceNodeId: source,
      delivered: sim.delivered,
      queued,
      hopCount: sim.hopCount,
      path: sim.path,
      transmissions: sim.transmissions,
      duplicatesDropped: sim.duplicatesDropped,
      ingest,
      events: sim.events,
    });
    this.recent.length = Math.min(this.recent.length, RECENT_LIMIT);
  }

  /** Test helper: clear in-memory caches. */
  reset() {
    this.seen = new Map();
    this.recent.length = 0;
  }
}

export const meshTransport = new SimulatedLoRaTransport();
