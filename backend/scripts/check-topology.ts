// Prints the simulated mesh links and the route each endpoint would use.
// Read-only: does not modify the database. Usage: npx tsx scripts/check-topology.ts
import { PrismaClient } from '@prisma/client';
import { computeLinks, simulateFlood, type SimNode } from '../src/mesh/simulator';
import type { MeshPacket } from '../src/mesh/packet';

const prisma = new PrismaClient();

const probe = (src: string): MeshPacket => ({
  messageId: `probe-${src}-${Date.now()}`,
  sourceNodeId: src,
  destinationNodeId: 'SERVER',
  type: 'SOS',
  latitude: null,
  longitude: null,
  timestamp: Date.now(),
  priority: 'HIGH',
  hopCount: 0,
  maxHops: 6,
  payload: {},
});

function report(title: string, nodes: SimNode[]) {
  console.log(`\n${title}`);
  console.log('Links:', computeLinks(nodes).map((l) => l.join('—')).join('  '));
  for (const n of nodes.filter((x) => x.kind === 'ENDPOINT')) {
    const r = simulateFlood(nodes, n.id, probe(n.id), new Map());
    console.log(
      `${n.id}: ${r.delivered ? `delivered via ${r.path!.join(' > ')} (${r.hopCount} hops, ${r.duplicatesDropped} duplicates dropped)` : `NO ROUTE (held by ${r.holders.join(', ')})`}`,
    );
  }
}

async function main() {
  const nodes: SimNode[] = (await prisma.commNode.findMany({ orderBy: { id: 'asc' } })).map((n) => ({ ...n, kind: n.kind as SimNode['kind'] }));
  console.log('Nodes:', nodes.map((n) => `${n.id}${n.online ? '' : '(off)'}`).join(' '));
  report('Current state:', nodes);
  const offline = nodes.filter((n) => !n.online);
  if (offline.length) report(`If ${offline.map((n) => n.id).join(', ')} were powered on:`, nodes.map((n) => ({ ...n, online: true })));
}

main().finally(() => prisma.$disconnect());
