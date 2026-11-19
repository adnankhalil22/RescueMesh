import os from 'node:os';
import { config } from './config';
import { createApp } from './app';
import { prisma } from './db';

const app = createApp();

const server = app.listen(config.port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i!.address}:${config.port}`);
  console.log(`RescueMesh API listening on http://localhost:${config.port}`);
  if (lan.length) console.log(`On your network (use this in the mobile app): ${lan.join(', ')}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
