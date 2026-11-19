import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { api, setBaseUrl, setForceOfflineFlag } from '../services/api';
import { kv } from '../storage/kv';
import { createOutboxStore, outboxCounts } from '../storage/database';
import { flushOutbox, type SyncSummary } from '../sync/syncEngine';
import { HttpTransport, LoRaBridgeTransport } from '../transports/transport';
import { useAuth } from './AuthContext';

/**
 *  offline      — no network on the phone, or "Offline mode" switched on
 *  unreachable  — the phone has a network but the RescueMesh server does not answer
 *  online       — server reachable: messages are delivered immediately
 */
export type LinkState = 'checking' | 'offline' | 'unreachable' | 'online';

interface SyncState {
  link: LinkState;
  online: boolean;
  forceOffline: boolean;
  setForceOffline: (v: boolean) => Promise<void>;
  apiUrl: string;
  setApiUrl: (url: string) => Promise<void>;
  counts: { unsent: number; delivered: number; failed: number; queued: number };
  lastSync: { at: number; summary: SyncSummary } | null;
  syncing: boolean;
  syncNow: () => Promise<SyncSummary | null>;
  refreshCounts: () => Promise<void>;
  checkServer: () => Promise<boolean>;
  /** Bumped whenever local data changes, so screens can reload. */
  revision: number;
  bump: () => void;
  transports: { id: string; label: string; available: boolean; description: string }[];
}

const Ctx = createContext<SyncState | null>(null);
const HEALTH_INTERVAL_MS = 15_000;
const SYNC_INTERVAL_MS = 10_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [netConnected, setNetConnected] = useState<boolean | null>(null);
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [forceOffline, setForceOfflineState] = useState(false);
  const [apiUrl, setApiUrlState] = useState('');
  const [counts, setCounts] = useState({ unsent: 0, delivered: 0, failed: 0, queued: 0 });
  const [lastSync, setLastSync] = useState<SyncState['lastSync']>(null);
  const [syncing, setSyncing] = useState(false);
  const [revision, setRevision] = useState(0);
  const inFlight = useRef<Promise<SyncSummary | null> | null>(null);

  const link: LinkState = forceOffline || netConnected === false ? 'offline' : serverOk === null ? 'checking' : serverOk ? 'online' : 'unreachable';
  const online = link === 'online';
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const http = useMemo(() => new HttpTransport(() => onlineRef.current), []);
  const lora = useMemo(() => new LoRaBridgeTransport(), []);

  // ---- settings
  useEffect(() => {
    (async () => {
      const [url, fo] = await Promise.all([kv.getApiUrl(), kv.getForceOffline()]);
      setBaseUrl(url);
      setApiUrlState(url);
      setForceOfflineFlag(fo);
      setForceOfflineState(fo);
    })();
  }, []);

  const setForceOffline = useCallback(async (v: boolean) => {
    await kv.setForceOffline(v);
    setForceOfflineFlag(v);
    setForceOfflineState(v);
    if (!v) setServerOk(null);
  }, []);

  const setApiUrl = useCallback(async (url: string) => {
    await kv.setApiUrl(url);
    const clean = url.trim().replace(/\/$/, '');
    setBaseUrl(clean);
    setApiUrlState(clean);
    setServerOk(null);
  }, []);

  // ---- connectivity
  // Only "has any network" matters here; whether the RescueMesh server answers is
  // checked separately (it may be on a local network with no internet access).
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setNetConnected(s.isConnected !== false);
      }),
    [],
  );

  const checkServer = useCallback(async () => {
    if (forceOffline) return false;
    try {
      await api.health();
      setServerOk(true);
      return true;
    } catch {
      setServerOk(false);
      return false;
    }
  }, [forceOffline]);

  useEffect(() => {
    if (!apiUrl || forceOffline || netConnected === false) return;
    void checkServer();
    const id = setInterval(checkServer, HEALTH_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void checkServer());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [apiUrl, forceOffline, netConnected, checkServer]);

  // ---- outbox
  const refreshCounts = useCallback(async () => {
    if (!user) return;
    const c = await outboxCounts(user.id);
    setCounts({ unsent: c.unsent, delivered: c.DELIVERED, failed: c.FAILED, queued: c.QUEUED + c.PENDING });
  }, [user]);

  const runSync = useCallback(
    async (manual: boolean): Promise<SyncSummary | null> => {
      if (!user) return null;
      if (inFlight.current) return inFlight.current;
      const task = (async () => {
        setSyncing(true);
        try {
          // Use the first available transport. LoRa bridge reports unavailable until hardware exists.
          const transport = [http, lora].find((t) => t.isAvailable());
          if (!transport) return null;
          const summary = await flushOutbox({ store: createOutboxStore(user.id), api: transport, ignoreBackoff: manual });
          if (summary.attempted) setLastSync({ at: Date.now(), summary });
          if (summary.networkError) setServerOk(false);
          if (summary.authRequired) await logout();
          if (summary.attempted) setRevision((r) => r + 1);
          return summary;
        } finally {
          await refreshCounts();
          setSyncing(false);
          inFlight.current = null;
        }
      })();
      inFlight.current = task;
      return task;
    },
    [user, http, lora, logout, refreshCounts],
  );

  const syncNow = useCallback(async () => {
    if (!onlineRef.current) {
      const ok = await checkServer();
      if (!ok) return null;
      onlineRef.current = true;
    }
    return runSync(true);
  }, [checkServer, runSync]);

  // Automatic sync: whenever we become online, and periodically while online.
  useEffect(() => {
    void refreshCounts();
    if (!online || !user) return;
    void runSync(false);
    const id = setInterval(() => void runSync(false), SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [online, user, runSync, refreshCounts]);

  const bump = useCallback(() => {
    setRevision((r) => r + 1);
    void refreshCounts();
    if (onlineRef.current) void runSync(false);
  }, [refreshCounts, runSync]);

  const transports = [http, lora].map((t) => ({ id: t.id, label: t.label, available: t.isAvailable(), description: t.describe() }));

  const value: SyncState = {
    link,
    online,
    forceOffline,
    setForceOffline,
    apiUrl,
    setApiUrl,
    counts,
    lastSync,
    syncing,
    syncNow,
    refreshCounts,
    checkServer,
    revision,
    bump,
    transports,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync outside SyncProvider');
  return v;
}
