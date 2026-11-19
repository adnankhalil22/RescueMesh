import { kv } from '../storage/kv';
import type { MeshPacket } from '../mesh/packet';
import { AuthRequiredError, NetworkUnavailableError, type SyncResult } from '../sync/syncEngine';
import type { EmergencyStatus, ServerEmergency, User } from '../types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let forceOffline = false;
let token: string | null = null;
let baseUrl: string | null = null;

/** Set by the connectivity layer: when true, every request fails fast as offline. */
export const setForceOfflineFlag = (v: boolean) => {
  forceOffline = v;
};
export const setAuthToken = (t: string | null) => {
  token = t;
};
export const setBaseUrl = (u: string) => {
  baseUrl = u.replace(/\/$/, '');
};
export const getBaseUrl = async () => baseUrl ?? (baseUrl = await kv.getApiUrl());

const TIMEOUT_MS = 8000;

async function request<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number; auth?: boolean } = {}): Promise<T> {
  if (forceOffline) throw new NetworkUnavailableError('Offline mode is on');
  const url = `${await getBaseUrl()}/api${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token && init.auth !== false ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new NetworkUnavailableError('Cannot reach the RescueMesh server');
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (res.status === 401 && init.auth !== false) throw new AuthRequiredError(json.error?.message ?? 'Session expired. Please sign in again.');
  if (res.status >= 500) throw new NetworkUnavailableError(json.error?.message ?? `Server error (${res.status})`);
  if (!res.ok) throw new ApiError(res.status, json.error?.message ?? `Request failed (${res.status})`);
  return json.data as T;
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Unexpected error';
}

export const isNetworkError = (e: unknown) => e instanceof NetworkUnavailableError;

export const api = {
  health: (url?: string) =>
    url
      ? fetch(`${url.replace(/\/$/, '')}/api/health`).then((r) => {
          if (!r.ok) throw new Error(`Server responded ${r.status}`);
          return true;
        })
      : request<{ status: string }>('/health', { timeoutMs: 4000, auth: false }).then(() => true),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (body: { name: string; email: string; password: string; phone?: string; bloodGroup?: string; emergencyContact?: string }) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body, auth: false }),
  me: () => request<User>('/auth/me'),
  updateProfile: (id: string, body: Partial<Pick<User, 'name' | 'phone' | 'bloodGroup' | 'emergencyContact' | 'organization'>>) =>
    request<User>(`/users/${id}`, { method: 'PATCH', body }),
  syncMessages: (messages: MeshPacket[]) =>
    request<{ results: SyncResult[] }>('/sync/messages', { method: 'POST', body: { messages }, timeoutMs: 15000 }).then((r) => r.results),
  myEmergencies: () => request<ServerEmergency[]>('/emergencies', { auth: true }),
  emergencies: (query: Record<string, string> = {}) => request<ServerEmergency[]>(`/emergencies?${new URLSearchParams(query).toString()}`),
  emergency: (id: string) => request<ServerEmergency>(`/emergencies/${id}`),
  setStatus: (id: string, status: EmergencyStatus, note?: string) =>
    request<ServerEmergency>(`/emergencies/${id}/status`, { method: 'PATCH', body: { status, note } }),
  accept: (id: string, note?: string) => request<ServerEmergency>(`/emergencies/${id}/assign`, { method: 'PATCH', body: { note } }),
};
