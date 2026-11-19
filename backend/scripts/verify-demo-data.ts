// Read-only consistency check of the demonstration database (run after `npm run seed`):
//  - every simulated-LoRa message's stored path/hop count equals what the simulator computes
//  - every node's packet counters equal the sum of the simulator's counters for those deliveries
//  - all SOS coordinates lie in the Beirut demonstration area; all nodes are flagged simulated
// Usage: npx tsx scripts/verify-demo-data.ts   (exit code 1 on any mismatch)
import { PrismaClient } from '@prisma/client';
import { simulateFlood, type SimNode } from '../src/mesh/simulator';
import type { MeshPacket } from '../src/mesh/packet';
import { DEMO_AREA } from '../prisma/demoScenario';
import { DEFAULT_SETTINGS } from '../src/services/settingsService';

const prisma = new PrismaClient();
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✔' : '✖'} ${msg}`);
  if (!ok) failures++;
};

async function main() {
  const rows = await prisma.commNode.findMany({ orderBy: { id: 'asc' } });
  const nodes: SimNode[] = rows.map((n) => ({ ...n, kind: n.kind as SimNode['kind'] }));
  check(rows.every((n) => n.simulated), `all ${rows.length} mesh nodes are flagged simulated`);

  const lora = await prisma.message.findMany({ where: { transport: 'LORA_SIM' }, orderBy: { createdAt: 'asc' } });
  const expected = new Map<string, { sent: number; received: number; dropped: number }>();
  for (const m of lora) {
    const packet: MeshPacket = {
      messageId: m.id, sourceNodeId: m.sourceNodeId, destinationNodeId: m.destinationNodeId, type: 'SOS',
      latitude: null, longitude: null, timestamp: m.createdAt.getTime(), priority: m.priority as MeshPacket['priority'],
      hopCount: 0, maxHops: DEFAULT_SETTINGS.maxHops, payload: {},
    };
    const sim = simulateFlood(nodes, m.sourceNodeId, packet, new Map());
    check(JSON.stringify(sim.path) === m.path && sim.hopCount === m.hopCount, `${m.id}: stored path ${m.path} (${m.hopCount} hops) matches simulator`);
    for (const [id, c] of Object.entries(sim.counters)) {
      const e = expected.get(id) ?? { sent: 0, received: 0, dropped: 0 };
      expected.set(id, { sent: e.sent + c.sent, received: e.received + c.received, dropped: e.dropped + c.dropped });
    }
  }
  for (const n of rows) {
    const e = expected.get(n.id) ?? { sent: 0, received: 0, dropped: 0 };
    check(
      n.packetsSent === e.sent && n.packetsReceived === e.received && n.packetsDropped === e.dropped,
      `${n.id}${n.online ? '' : ' (offline)'} counters sent/recv/drop ${n.packetsSent}/${n.packetsReceived}/${n.packetsDropped} = simulator ${e.sent}/${e.received}/${e.dropped}`,
    );
  }

  const sos = await prisma.emergencyRequest.findMany({ select: { latitude: true, longitude: true } });
  const b = DEMO_AREA.incidentBox;
  const inArea = sos.filter((s) => s.latitude >= b.minLat && s.latitude <= b.maxLat && s.longitude >= b.minLng && s.longitude <= b.maxLng).length;
  check(inArea === sos.length, `${inArea}/${sos.length} SOS coordinates inside the Beirut demonstration area`);

  console.log(failures ? `\n${failures} problem(s) found.` : '\nDemo data is consistent.');
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
