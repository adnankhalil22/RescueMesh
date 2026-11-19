import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthToken } from '../services/api';
import { kv } from '../storage/kv';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  restoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (body: { name: string; email: string; password: string; phone?: string; bloodGroup?: string; emergencyContact?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (u: User) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * The session is persisted on the phone, so a signed-in user stays signed in
 * (and can raise SOS requests) with no connectivity at all.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    (async () => {
      const session = await kv.getSession();
      if (session) {
        setAuthToken(session.token);
        setUser(session.user);
      }
      // keep the splash visible briefly so branding is readable
      await new Promise((r) => setTimeout(r, 900));
      setRestoring(false);
    })().catch(() => setRestoring(false));
  }, []);

  const start = useCallback(async (token: string, u: User) => {
    setAuthToken(token);
    await kv.setSession(token, u);
    setUser(u);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email.trim().toLowerCase(), password);
    await start(res.token, res.user);
  }, [start]);

  const register = useCallback<AuthState['register']>(async (body) => {
    const res = await api.register(body);
    await start(res.token, res.user);
  }, [start]);

  const logout = useCallback(async () => {
    setAuthToken(null);
    await kv.clearSession();
    setUser(null);
  }, []);

  const updateUser = useCallback(async (u: User) => {
    await kv.setUser(u);
    setUser(u);
  }, []);

  const value = useMemo(() => ({ user, restoring, login, register, logout, updateUser }), [user, restoring, login, register, logout, updateUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
