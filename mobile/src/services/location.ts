import * as Location from 'expo-location';

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
  /** gps = fresh fix; last-known = cached ≤ 10 min; stale = older cached position (better than nothing in an emergency). */
  source: 'gps' | 'last-known' | 'stale';
}

export type GpsState = 'unknown' | 'denied' | 'services-off' | 'ready';

/** Error the UI can act on (e.g. show an "Open settings" button). */
export class LocationError extends Error {
  constructor(
    message: string,
    public readonly reason: 'permission-denied' | 'permission-blocked' | 'services-off' | 'timeout',
  ) {
    super(message);
  }
}

export async function gpsState(): Promise<GpsState> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return perm.canAskAgain ? 'unknown' : 'denied';
  return (await Location.hasServicesEnabledAsync()) ? 'ready' : 'services-off';
}

/** Asks for permission if needed. Distinguishes "denied, can ask again" from "blocked — needs phone settings". */
export async function ensurePermission(): Promise<void> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return;
  if (!current.canAskAgain) {
    throw new LocationError('Location access is blocked for RescueMesh. Open Settings and allow location.', 'permission-blocked');
  }
  const res = await Location.requestForegroundPermissionsAsync();
  if (!res.granted) {
    throw new LocationError(
      res.canAskAgain ? 'Location permission is required so responders can find you.' : 'Location access is blocked. Open Settings and allow location.',
      res.canAskAgain ? 'permission-denied' : 'permission-blocked',
    );
  }
}

/** Resolves or rejects with the promise, or rejects after `ms`. Always clears its timer. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LocationError('GPS did not get a fix in time.', 'timeout')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const toFix = (pos: Location.LocationObject, source: Fix['source']): Fix => ({
  latitude: pos.coords.latitude,
  longitude: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
  timestamp: pos.timestamp,
  source,
});

/**
 * Gets the best available position. GPS works without internet.
 * 1. fresh high-accuracy fix (within `timeoutMs`)
 * 2. last known position up to 10 minutes old
 * 3. any last known position, flagged as stale
 */
export async function getFix(timeoutMs = 15000): Promise<Fix> {
  await ensurePermission();
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationError('Location (GPS) is turned off. Turn it on in your phone settings.', 'services-off');
  }
  try {
    return toFix(await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeoutMs), 'gps');
  } catch (err) {
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    if (recent) return toFix(recent, 'last-known');
    const any = await Location.getLastKnownPositionAsync();
    if (any) return toFix(any, 'stale');
    throw err instanceof Error ? err : new LocationError('Could not get a GPS fix.', 'timeout');
  }
}

export function describeFixAge(fix: Fix, now = Date.now()): string {
  const min = Math.round((now - fix.timestamp) / 60_000);
  if (fix.source === 'gps') return 'live GPS';
  return min < 1 ? 'last known' : `last known, ${min < 60 ? `${min} min` : `${Math.round(min / 60)} h`} old`;
}
