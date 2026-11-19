import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getSettings, settingsSchema, updateSettings } from '../services/settingsService';
import { asyncHandler, parse } from '../utils/http';
import { meshTransport } from '../mesh/simulatedLoRaTransport';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getSettings() });
  }),
);

settingsRouter.put(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const patch = parse(settingsSchema.partial(), req.body);
    const before = await getSettings();
    const updated = await updateSettings(patch);
    // A new hop limit can make held mesh packets deliverable (store-and-forward retry).
    if (updated.maxHops !== before.maxHops) await meshTransport.retryPending();
    res.json({ data: updated });
  }),
);
