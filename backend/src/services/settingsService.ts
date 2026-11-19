import { z } from 'zod';
import { prisma } from '../db';

export const settingsSchema = z.object({
  organizationName: z.string().min(2).max(80),
  maxHops: z.number().int().min(1).max(15),
  mapCenterLat: z.number().min(-90).max(90),
  mapCenterLng: z.number().min(-180).max(180),
  mapZoom: z.number().int().min(3).max(18),
  autoRefreshSeconds: z.number().int().min(3).max(300),
});

export type SystemSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: SystemSettings = {
  organizationName: 'RescueMesh Emergency Operations Center',
  maxHops: 6,
  // Saida (Sidon), Lebanon — demonstration area; must equal DEMO_AREA.center in prisma/demoScenario.ts
  // (checked by tests/scenario.test.ts)
  mapCenterLat: 33.547,
  mapCenterLng: 35.398,
  mapZoom: 13,
  autoRefreshSeconds: 5,
};

export async function getSettings(): Promise<SystemSettings> {
  const rows = await prisma.setting.findMany();
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore corrupt value, default applies */
    }
  }
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
  const next = settingsSchema.parse({ ...(await getSettings()), ...patch });
  await prisma.$transaction(
    Object.entries(next).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } }),
    ),
  );
  return next;
}
