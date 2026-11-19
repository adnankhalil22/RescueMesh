import type { DeliveryStatus, EmergencyStatus, Priority } from './types';

export const colors = {
  navy: '#0b1426',
  navy2: '#111d35',
  navy3: '#1a2847',
  red: '#dc2626',
  redDark: '#b91c1c',
  redSoft: '#fee2e2',
  bg: '#f1f5f9',
  surface: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  green: '#059669',
  greenSoft: '#d1fae5',
  amber: '#d97706',
  amberSoft: '#fef3c7',
  blue: '#2563eb',
  blueSoft: '#dbeafe',
  violet: '#7c3aed',
  white: '#ffffff',
};

export const priorityColor: Record<Priority, string> = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#0284c7' };

export const statusColor: Record<EmergencyStatus, string> = {
  PENDING: '#dc2626',
  ACCEPTED: '#2563eb',
  IN_PROGRESS: '#d97706',
  RESOLVED: '#059669',
  CANCELLED: '#64748b',
};

export const deliveryColor: Record<DeliveryStatus, string> = {
  PENDING: '#64748b',
  QUEUED: '#d97706',
  SENT: '#2563eb',
  DELIVERED: '#059669',
  FAILED: '#dc2626',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24 };
export const space = (n: number) => n * 4;
