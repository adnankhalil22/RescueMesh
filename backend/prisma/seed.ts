// Demonstration seed data. Re-running it wipes and recreates all data.
// Locations: Beirut, Lebanon — see prisma/demoScenario.ts for the scenario and mesh topology.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../src/services/settingsService';
import { simulateFlood, type SimNode } from '../src/mesh/simulator';
import type { MeshPacket } from '../src/mesh/packet';
import { DEMO_AREA, DEMO_NODES } from './demoScenario';

const box = DEMO_AREA.incidentBox;

const prisma = new PrismaClient();

// All demo people are FICTIONAL. Phone numbers are fictional Lebanese (+961) demo contacts in an
// obviously fake "000" block — they do not belong to anyone. The administrator has no phone number
// because it is a system account, not a field contact.
// Role key VICTIM is displayed as "Citizen" everywhere.
export const DEMO_USERS = [
  { email: 'admin@rescuemesh.org', password: 'Admin@12345', name: 'System Administrator', role: 'ADMIN', phone: null, organization: 'RescueMesh EOC' },
  { email: 'responder@rescuemesh.org', password: 'Responder@123', name: 'Ayesha Malik', role: 'RESPONDER', phone: '+961 70 000 101', organization: 'City Rescue Unit — Team A' },
  { email: 'responder2@rescuemesh.org', password: 'Responder@123', name: 'Bilal Ahmed', role: 'RESPONDER', phone: '+961 70 000 102', organization: 'City Rescue Unit — Medical' },
  { email: 'victim@rescuemesh.org', password: 'Victim@1234', name: 'Ali Raza', role: 'VICTIM', phone: '+961 71 000 201', bloodGroup: 'B+', emergencyContact: 'Sara Raza (demo contact) +961 71 000 299' },
  { email: 'fatima@example.com', password: 'Victim@1234', name: 'Fatima Noor', role: 'VICTIM', phone: '+961 71 000 202', bloodGroup: 'O+' },
  { email: 'usman@example.com', password: 'Victim@1234', name: 'Usman Tariq', role: 'VICTIM', phone: '+961 71 000 203', bloodGroup: 'A-' },
] as const;

// Simulated ESP32 + LoRa nodes (Beirut scenario). RL-05 starts OFFLINE so EP-03 is cut off:
// switch it on in the dashboard to demonstrate store-and-forward delivery.
const NODES = DEMO_NODES;

const SCENARIOS: Array<{ type: string; priority: string; description: string; people: number }> = [
  { type: 'TRAPPED', priority: 'CRITICAL', description: 'Family of 4 on rooftop, water at first-floor level', people: 4 },
  { type: 'MEDICAL', priority: 'HIGH', description: 'Elderly man with chest pain, cannot walk', people: 1 },
  { type: 'FIRE', priority: 'CRITICAL', description: 'Electrical fire in market after power restoration', people: 6 },
  { type: 'BUILDING_COLLAPSE', priority: 'CRITICAL', description: 'Partial collapse of two-storey house, voices heard', people: 3 },
  { type: 'MISSING_PERSON', priority: 'HIGH', description: '12-year-old boy missing since evacuation', people: 1 },
  { type: 'MEDICAL', priority: 'MEDIUM', description: 'Pregnant woman needs transport to hospital', people: 1 },
  { type: 'OTHER', priority: 'LOW', description: 'Need drinking water and food for 10 people', people: 10 },
  { type: 'TRAPPED', priority: 'HIGH', description: 'Car stuck in underpass, driver on roof', people: 2 },
  { type: 'MEDICAL', priority: 'HIGH', description: 'Child with high fever and dehydration', people: 1 },
  { type: 'OTHER', priority: 'MEDIUM', description: 'Gas smell near shelter, people evacuating', people: 25 },
  { type: 'FIRE', priority: 'HIGH', description: 'Kitchen fire spread to neighbouring house', people: 5 },
  { type: 'TRAPPED', priority: 'CRITICAL', description: 'Workers trapped in flooded basement', people: 3 },
  { type: 'MISSING_PERSON', priority: 'MEDIUM', description: 'Elderly woman with dementia missing', people: 1 },
  { type: 'BUILDING_COLLAPSE', priority: 'HIGH', description: 'Boundary wall collapsed onto parked rickshaw', people: 2 },
  { type: 'MEDICAL', priority: 'LOW', description: 'Minor injuries, needs first aid kit', people: 2 },
  { type: 'OTHER', priority: 'MEDIUM', description: 'Livestock stranded, owner refuses to leave', people: 1 },
];
const STATUS_CYCLE = ['PENDING', 'RESOLVED', 'IN_PROGRESS', 'PENDING', 'ACCEPTED', 'RESOLVED', 'RESOLVED', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CANCELLED', 'ACCEPTED', 'RESOLVED', 'PENDING', 'RESOLVED', 'IN_PROGRESS'];
const CHANNEL_CYCLE = ['ONLINE', 'ONLINE', 'OFFLINE_SYNC', 'ONLINE', 'LORA_SIM', 'ONLINE', 'OFFLINE_SYNC'];

// deterministic pseudo-random so the demo looks the same every time
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

async function main() {
  await prisma.$transaction([
    prisma.statusUpdate.deleteMany(),
    prisma.message.deleteMany(),
    prisma.syncEvent.deleteMany(),
    prisma.pendingPacket.deleteMany(),
    prisma.emergencyRequest.deleteMany(),
    prisma.commNode.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const users: Record<string, { id: string; name: string }> = {};
  for (const u of DEMO_USERS) {
    const { password, ...rest } = u;
    const created = await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 10) } });
    users[u.email] = created;
  }
  const victims = [users['victim@rescuemesh.org'], users['fatima@example.com'], users['usman@example.com']];
  const responders = [users['responder@rescuemesh.org'], users['responder2@rescuemesh.org']];

  for (const n of NODES) {
    await prisma.commNode.create({ data: { online: true, simulated: true, batteryLevel: 60 + Math.round(rand() * 40), ...n } });
  }
  const simNodes: SimNode[] = NODES.map((n) => ({ ...n, kind: n.kind as SimNode['kind'], online: n.online ?? true }));
  const counters = new Map<string, { sent: number; received: number; dropped: number }>();

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.create({ data: { key, value: JSON.stringify(value) } });
  }

  const now = Date.now();
  for (const [i, s] of SCENARIOS.entries()) {
    const status = STATUS_CYCLE[i];
    const channel = CHANNEL_CYCLE[i % CHANNEL_CYCLE.length];
    const createdAt = new Date(now - (i * 15 + rand() * 10) * 3600_000 * 0.6);
    const acceptedAt = status === 'PENDING' || status === 'CANCELLED' ? null : new Date(createdAt.getTime() + (5 + rand() * 40) * 60_000);
    const resolvedAt = status === 'RESOLVED' ? new Date(acceptedAt!.getTime() + (30 + rand() * 180) * 60_000) : null;
    const responder = acceptedAt ? responders[i % 2] : null;
    const reporter = channel === 'LORA_SIM' ? null : victims[i % victims.length];

    const history: Array<{ status: string; note: string; createdAt: Date; userId?: string }> = [
      { status: 'PENDING', note: channel === 'OFFLINE_SYNC' ? 'Created offline on device; synchronised when connectivity returned' : channel === 'LORA_SIM' ? 'Received via simulated LoRa mesh' : 'Submitted online', createdAt },
    ];
    if (acceptedAt && responder) history.push({ status: 'ACCEPTED', note: 'Team dispatched', createdAt: acceptedAt, userId: responder.id });
    if ((status === 'IN_PROGRESS' || status === 'RESOLVED') && acceptedAt && responder)
      history.push({ status: 'IN_PROGRESS', note: 'Team on site', createdAt: new Date(acceptedAt.getTime() + 15 * 60_000), userId: responder.id });
    if (resolvedAt && responder) history.push({ status: 'RESOLVED', note: 'People evacuated safely', createdAt: resolvedAt, userId: responder.id });
    if (status === 'CANCELLED') history.push({ status: 'CANCELLED', note: 'Reporter confirmed situation handled', createdAt: new Date(createdAt.getTime() + 20 * 60_000) });

    const id = randomUUID();
    await prisma.emergencyRequest.create({
      data: {
        id,
        type: s.type,
        priority: s.priority,
        status,
        description: s.description,
        // spread over the affected area (eastern Beirut / Metn, on land)
        latitude: box.minLat + rand() * (box.maxLat - box.minLat),
        longitude: box.minLng + rand() * (box.maxLng - box.minLng),
        accuracy: Math.round(5 + rand() * 30),
        peopleCount: s.people,
        channel,
        createdAt,
        receivedAt: new Date(createdAt.getTime() + (channel === 'OFFLINE_SYNC' ? 40 * 60_000 : 2000)),
        acceptedAt,
        resolvedAt,
        reporterId: reporter?.id ?? null,
        reporterName: reporter ? null : 'Mesh node EP-01',
        responderId: responder?.id ?? null,
        history: { create: history },
      },
    });

    // Seeded mesh deliveries are produced by the same simulator, so the node packet
    // counters on the dashboard agree with the history (all simulated, no radio).
    let meshPath = ['EP-01', 'RL-03', 'RL-02', 'RL-01', 'GW-01'];
    let meshHops = 4;
    if (channel === 'LORA_SIM') {
      const sim = simulateFlood(
        simNodes,
        'EP-01',
        {
          messageId: `seed-msg-${i}-${id.slice(0, 8)}`, sourceNodeId: 'EP-01', destinationNodeId: 'SERVER', type: 'SOS',
          latitude: null, longitude: null, timestamp: createdAt.getTime(), priority: s.priority as MeshPacket['priority'],
          hopCount: 0, maxHops: DEFAULT_SETTINGS.maxHops, payload: {},
        },
        new Map(),
      );
      meshPath = sim.path ?? meshPath;
      meshHops = sim.hopCount ?? meshHops;
      for (const [nodeId, c] of Object.entries(sim.counters)) {
        const t = counters.get(nodeId) ?? { sent: 0, received: 0, dropped: 0 };
        counters.set(nodeId, { sent: t.sent + c.sent, received: t.received + c.received, dropped: t.dropped + c.dropped });
      }
    }

    await prisma.message.create({
      data: {
        id: `seed-msg-${i}-${id.slice(0, 8)}`,
        type: 'SOS',
        sourceNodeId: channel === 'LORA_SIM' ? 'EP-01' : `device-${reporter?.id.slice(0, 8)}`,
        destinationNodeId: 'SERVER',
        priority: s.priority,
        hopCount: channel === 'LORA_SIM' ? meshHops : 0,
        path: JSON.stringify(channel === 'LORA_SIM' ? meshPath : []),
        payload: JSON.stringify({ requestId: id, category: s.type }),
        transport: channel === 'LORA_SIM' ? 'LORA_SIM' : 'HTTP',
        createdAt,
        senderId: reporter?.id ?? null,
      },
    });
  }

  for (const [nodeId, c] of counters) {
    await prisma.commNode.update({ where: { id: nodeId }, data: { packetsSent: c.sent, packetsReceived: c.received, packetsDropped: c.dropped } });
  }

  console.log(`Seeded ${DEMO_USERS.length} users, ${NODES.length} simulated nodes, ${SCENARIOS.length} emergency requests.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
