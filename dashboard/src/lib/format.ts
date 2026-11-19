import type { Channel, EmergencyStatus, EmergencyType, Priority, Role } from '../types';

export const TYPE_LABEL: Record<EmergencyType, string> = {
  MEDICAL: 'Medical emergency',
  TRAPPED: 'Trapped person',
  FIRE: 'Fire',
  BUILDING_COLLAPSE: 'Building collapse',
  MISSING_PERSON: 'Missing person',
  OTHER: 'Other',
};

export const PRIORITY_LABEL: Record<Priority, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
export const PRIORITY_COLOR: Record<Priority, string> = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#0284c7' };
export const PRIORITY_BADGE: Record<Priority, string> = {
  CRITICAL: 'bg-red-100 text-red-700 ring-red-600/20',
  HIGH: 'bg-orange-100 text-orange-700 ring-orange-600/20',
  MEDIUM: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  LOW: 'bg-sky-100 text-sky-700 ring-sky-600/20',
};

export const STATUS_LABEL: Record<EmergencyStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled',
};
export const STATUS_COLOR: Record<EmergencyStatus, string> = {
  PENDING: '#dc2626',
  ACCEPTED: '#2563eb',
  IN_PROGRESS: '#d97706',
  RESOLVED: '#059669',
  CANCELLED: '#64748b',
};
export const STATUS_BADGE: Record<EmergencyStatus, string> = {
  PENDING: 'bg-red-50 text-red-700 ring-red-600/20',
  ACCEPTED: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  IN_PROGRESS: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  ONLINE: 'Online (API)',
  OFFLINE_SYNC: 'Offline → synced',
  LORA_SIM: 'LoRa mesh (simulated)',
};

/** Same display names as the mobile app (mobile/src/constants.ts). The API key VICTIM is always shown as "Citizen". */
export const ROLE_LABEL: Record<Role, string> = { VICTIM: 'Citizen', RESPONDER: 'Responder', ADMIN: 'Administrator' };

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const fmtCoords = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
