// Small persistent key-value settings (session, server URL, offline mode),
// stored in SQLite via expo-sqlite/kv-store so it survives app restarts.
import Storage from 'expo-sqlite/kv-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import type { User } from '../types';

const K = {
  token: 'session.token',
  user: 'session.user',
  apiUrl: 'settings.apiUrl',
  forceOffline: 'settings.forceOffline',
  deviceId: 'device.nodeId',
  responderCache: 'cache.responderList',
};

/**
 * Default backend address. In Expo Go the dev machine's LAN IP is known from
 * the Metro host, and the API runs on port 4000 of the same machine.
 */
export function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return 'http://10.0.2.2:4000'; // Android emulator → host machine
}

export const kv = {
  async getSession(): Promise<{ token: string; user: User } | null> {
    const [token, user] = await Promise.all([Storage.getItem(K.token), Storage.getItem(K.user)]);
    if (!token || !user) return null;
    try {
      return { token, user: JSON.parse(user) as User };
    } catch {
      return null;
    }
  },
  async setSession(token: string, user: User) {
    await Storage.setItem(K.token, token);
    await Storage.setItem(K.user, JSON.stringify(user));
  },
  async setUser(user: User) {
    await Storage.setItem(K.user, JSON.stringify(user));
  },
  async clearSession() {
    await Storage.removeItem(K.token);
    await Storage.removeItem(K.user);
    await Storage.removeItem(K.responderCache);
  },
  async getApiUrl(): Promise<string> {
    return (await Storage.getItem(K.apiUrl)) || defaultApiUrl();
  },
  async setApiUrl(url: string) {
    await Storage.setItem(K.apiUrl, url.trim().replace(/\/$/, ''));
  },
  async getForceOffline(): Promise<boolean> {
    return (await Storage.getItem(K.forceOffline)) === '1';
  },
  async setForceOffline(v: boolean) {
    await Storage.setItem(K.forceOffline, v ? '1' : '0');
  },
  /** Stable node ID for this phone, used as sourceNodeId in mesh packets. */
  async getDeviceId(): Promise<string> {
    let id = await Storage.getItem(K.deviceId);
    if (!id) {
      id = `PHONE-${Crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      await Storage.setItem(K.deviceId, id);
    }
    return id;
  },
  async getCache<T>(key: 'responderCache'): Promise<{ at: number; data: T } | null> {
    const raw = await Storage.getItem(K[key]);
    try {
      return raw ? (JSON.parse(raw) as { at: number; data: T }) : null;
    } catch {
      return null;
    }
  },
  async setCache<T>(key: 'responderCache', data: T) {
    await Storage.setItem(K[key], JSON.stringify({ at: Date.now(), data }));
  },
};
