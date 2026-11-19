import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config';
import { prisma } from './db';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { emergenciesRouter } from './routes/emergencies';
import { syncRouter } from './routes/sync';
import { commRouter } from './routes/comm';
import { statsRouter } from './routes/stats';
import { settingsRouter } from './routes/settings';
import { errorHandler } from './utils/http';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin.includes('*') ? true : config.corsOrigin }));
  app.use(express.json({ limit: '256kb' }));
  if (!config.isTest) app.use(morgan('dev'));

  // Opening the API address in a browser: explain where things are instead of a bare 404.
  app.get('/', (_req, res) => {
    res.json({
      service: 'RescueMesh API',
      status: 'running',
      health: '/api/health',
      docs: 'See docs/API.md in the project',
      dashboard: 'The web dashboard runs separately (default http://localhost:5173)',
    });
  });

  /** Used by the mobile app and dashboard to decide whether they are "online". */
  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ data: { status: 'ok', database: 'connected', time: new Date().toISOString() } });
    } catch {
      res.status(503).json({ error: { message: 'Database unavailable' } });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/emergencies', emergenciesRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/comm', commRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/settings', settingsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { message: 'Endpoint not found' } });
  });
  app.use(errorHandler);
  return app;
}
