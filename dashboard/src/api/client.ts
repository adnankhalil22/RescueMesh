const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_KEY = 'rescuemesh.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: session-only login */
    }
  },
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}): Promise<T> {
  const qs = init.query
    ? '?' + new URLSearchParams(Object.entries(init.query).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString()
    : '';
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}${qs === '?' ? '' : qs}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the RescueMesh server');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  }
  return json.data as T;
}

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    const fieldErrors = (e.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
    if (fieldErrors && Object.keys(fieldErrors).length) {
      return `${e.message}: ${Object.entries(fieldErrors).map(([k, v]) => `${k} ${v.join(', ')}`).join('; ')}`;
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Unexpected error';
}
