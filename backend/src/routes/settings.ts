import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getSettings, settingsSchema, updateSettings } from '../services/settingsService';
import { asyncHandler, parse } from '../utils/http';

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
    res.json({ data: await updateSettings(patch) });
  }),
);
