import * as Location from 'expo-location';

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
  source: 'gps' | 'last-known';
}

export type GpsState = 'unknown' | 'denied' | 'services-off' | 'ready';

export async function gpsState(): Promise<GpsState> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return perm.canAskAgain ? 'unknown' : 'denied';
  return (await Location.hasServicesEnabledAsync()) ? 'ready' : 'services-off';
}

export async function ensurePermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const res = await Location.requestForegroundPermissionsAsync();
  return res.granted;
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GPS timed out')), ms))]);

/**
 * Gets the best available position. GPS works without internet; if a fresh fix
 * takes too long, the last known position (≤ 10 min old) is used instead.
 */
export async function getFix(timeoutMs = 15000): Promise<Fix> {
  if (!(await ensurePermission())) throw new Error('Location permission is required to send your position.');
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('Location services are turned off. Enable GPS in your phone settings.');
  try {
    const pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeoutMs);
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: pos.timestamp, source: 'gps' };
  } catch (err) {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    if (last) {
      return { latitude: last.coords.latitude, longitude: last.coords.longitude, accuracy: last.coords.accuracy, timestamp: last.timestamp, source: 'last-known' };
    }
    throw err instanceof Error ? err : new Error('Could not get a GPS fix');
  }
}
