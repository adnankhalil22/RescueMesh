import type { DeliveryStatus, EmergencyStatus, EmergencyType, Priority, Role } from './types';

/**
 * Display names for roles — identical in the mobile app and dashboard.
 * The API keeps the key VICTIM; it is always shown to people as "Citizen".
 * The person who raised a particular SOS is called its "reporter".
 */
export const ROLE_LABEL: Record<Role, string> = { VICTIM: 'Citizen', RESPONDER: 'Responder', ADMIN: 'Administrator' };

export const EMERGENCY_TYPES: { key: EmergencyType; label: string; icon: string; defaultPriority: Priority }[] = [
  { key: 'MEDICAL', label: 'Medical emergency', icon: 'medkit', defaultPriority: 'HIGH' },
  { key: 'TRAPPED', label: 'Trapped person', icon: 'hand-left', defaultPriority: 'CRITICAL' },
  { key: 'FIRE', label: 'Fire', icon: 'flame', defaultPriority: 'CRITICAL' },
  { key: 'BUILDING_COLLAPSE', label: 'Building collapse', icon: 'business', defaultPriority: 'CRITICAL' },
  { key: 'MISSING_PERSON', label: 'Missing person', icon: 'person-remove', defaultPriority: 'HIGH' },
  { key: 'OTHER', label: 'Other', icon: 'alert-circle', defaultPriority: 'MEDIUM' },
];

export const TYPE_LABEL = Object.fromEntries(EMERGENCY_TYPES.map((t) => [t.key, t.label])) as Record<EmergencyType, string>;
export const TYPE_ICON = Object.fromEntries(EMERGENCY_TYPES.map((t) => [t.key, t.icon])) as Record<EmergencyType, string>;

export const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const PRIORITY_LABEL: Record<Priority, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

export const STATUS_LABEL: Record<EmergencyStatus, string> = {
  PENDING: 'Waiting for responder',
  ACCEPTED: 'Responder assigned',
  IN_PROGRESS: 'Rescue in progress',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled',
};

export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  PENDING: 'Saved on phone',
  QUEUED: 'Queued — will send when online',
  SENT: 'Sending…',
  DELIVERED: 'Delivered to responders',
  FAILED: 'Failed — rejected by server',
};
