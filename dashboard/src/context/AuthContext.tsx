import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';
import type { SystemSettings, User } from '../types';

interface AuthState {
  user: User | null;
  settings: SystemSettings | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setSettings: (s: SystemSettings) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  const loadSession = useCallback(async () => {
    const [me, s] = await Promise.all([api<User>('/auth/me'), api<SystemSettings>('/settings')]);
    if (me.role === 'VICTIM') {
      tokenStore.set(null);
      throw new Error('This dashboard is for responders and administrators. Citizens should use the RescueMesh mobile app.');
    }
    setUser(me);
    setSettings(s);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    loadSession()
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [loadSession, logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } });
      tokenStore.set(res.token);
      await loadSession();
    },
    [loadSession],
  );

  const refreshUser = useCallback(async () => {
    setUser(await api<User>('/auth/me'));
  }, []);

  const value = useMemo(
    () => ({ user, settings, loading, login, logout, refreshUser, setSettings }),
    [user, settings, loading, login, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
