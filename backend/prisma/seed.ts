// Demonstration seed data. Re-running it wipes and recreates all data.
// Locations are around Lahore, Pakistan (change mapCenter in Settings for another city).
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../src/services/settingsService';

const prisma = new PrismaClient();

export const DEMO_USERS = [
  { email: 'admin@rescuemesh.org', password: 'Admin@12345', name: 'System Administrator', role: 'ADMIN', phone: '+92 300 0000001', organization: 'RescueMesh EOC' },
  { email: 'responder@rescuemesh.org', password: 'Responder@123', name: 'Ayesha Malik', role: 'RESPONDER', phone: '+92 300 1112233', organization: 'City Rescue Unit — Team A' },
  { email: 'responder2@rescuemesh.org', password: 'Responder@123', name: 'Bilal Ahmed', role: 'RESPONDER', phone: '+92 300 4445566', organization: 'City Rescue Unit — Medical' },
  { email: 'victim@rescuemesh.org', password: 'Victim@1234', name: 'Ali Raza', role: 'VICTIM', phone: '+92 321 7778899', bloodGroup: 'B+', emergencyContact: 'Sara Raza +92 321 1234567' },
  { email: 'fatima@example.com', password: 'Victim@1234', name: 'Fatima Noor', role: 'VICTIM', phone: '+92 333 2223344', bloodGroup: 'O+' },
  { email: 'usman@example.com', password: 'Victim@1234', name: 'Usman Tariq', role: 'VICTIM', phone: '+92 345 5556677', bloodGroup: 'A-' },
] as const;

// Simulated ESP32 + LoRa nodes. RL-05 starts OFFLINE so EP-03 is cut off:
// switch it on in the dashboard to demonstrate store-and-forward delivery.
const NODES = [
  { id: 'GW-01', name: 'EOC Gateway', kind: 'GATEWAY', latitude: 31.56, longitude: 74.315, rangeKm: 3.0 },
  { id: 'RL-01', name: 'Relay — Minar Park', kind: 'RELAY', latitude: 31.545, longitude: 74.335, rangeKm: 2.8 },
  { id: 'RL-02', name: 'Relay — Water Tower', kind: 'RELAY', latitude: 31.53, longitude: 74.355, rangeKm: 2.8 },
  { id: 'RL-03', name: 'Relay — Canal Bridge', kind: 'RELAY', latitude: 31.515, longitude: 74.375, rangeKm: 2.8 },
  { id: 'RL-04', name: 'Relay — Hospital Roof', kind: 'RELAY', latitude: 31.535, longitude: 74.378, rangeKm: 2.8 },
  { id: 'RL-05', name: 'Relay — School Mast', kind: 'RELAY', latitude: 31.51, longitude: 74.34, rangeKm: 2.8, online: false },
  { id: 'EP-01', name: 'Field Node — Riverside', kind: 'ENDPOINT', latitude: 31.505, longitude: 74.395, rangeKm: 2.5 },
  { id: 'EP-02', name: 'Field Node — North Colony', kind: 'ENDPOINT', latitude: 31.552, longitude: 74.39, rangeKm: 2.5 },
  { id: 'EP-03', name: 'Field Node — Flooded Village', kind: 'ENDPOINT', latitude: 31.492, longitude: 74.33, rangeKm: 2.5 },
];

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
        latitude: 31.52 + (rand() - 0.5) * 0.12,
        longitude: 74.35 + (rand() - 0.5) * 0.14,
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

    await prisma.message.create({
      data: {
        id: `seed-msg-${i}-${id.slice(0, 8)}`,
        type: 'SOS',
        sourceNodeId: channel === 'LORA_SIM' ? 'EP-01' : `device-${reporter?.id.slice(0, 8)}`,
        destinationNodeId: 'SERVER',
        priority: s.priority,
        hopCount: channel === 'LORA_SIM' ? 3 : 0,
        path: JSON.stringify(channel === 'LORA_SIM' ? ['EP-01', 'RL-03', 'RL-02', 'RL-01', 'GW-01'] : []),
        payload: JSON.stringify({ requestId: id, category: s.type }),
        transport: channel === 'LORA_SIM' ? 'LORA_SIM' : 'HTTP',
        createdAt,
        senderId: reporter?.id ?? null,
      },
    });
  }

  console.log(`Seeded ${DEMO_USERS.length} users, ${NODES.length} simulated nodes, ${SCENARIOS.length} emergency requests.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
