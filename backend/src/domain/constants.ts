export const ROLES = ['VICTIM', 'RESPONDER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const EMERGENCY_TYPES = ['MEDICAL', 'TRAPPED', 'FIRE', 'BUILDING_COLLAPSE', 'MISSING_PERSON', 'OTHER'] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EMERGENCY_STATUSES = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];

export const CHANNELS = ['ONLINE', 'OFFLINE_SYNC', 'LORA_SIM'] as const;
export type Channel = (typeof CHANNELS)[number];

export const MESSAGE_TYPES = ['SOS', 'LOCATION', 'STATUS', 'ACK', 'CHAT'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const DELIVERY_STATUSES = ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const NODE_KINDS = ['GATEWAY', 'RELAY', 'ENDPOINT'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Server-side destination id used by phones and by the LoRa gateway. */
export const SERVER_NODE_ID = 'SERVER';

/** Default priority when the reporter does not choose one. */
export const DEFAULT_PRIORITY: Record<EmergencyType, Priority> = {
  MEDICAL: 'HIGH',
  TRAPPED: 'CRITICAL',
  FIRE: 'CRITICAL',
  BUILDING_COLLAPSE: 'CRITICAL',
  MISSING_PERSON: 'HIGH',
  OTHER: 'MEDIUM',
};

/** Allowed status transitions for responders/admins. */
export const STATUS_TRANSITIONS: Record<EmergencyStatus, EmergencyStatus[]> = {
  PENDING: ['ACCEPTED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'PENDING'],
  IN_PROGRESS: ['RESOLVED', 'CANCELLED', 'ACCEPTED'],
  RESOLVED: ['PENDING'], // reopen
  CANCELLED: ['PENDING'], // reopen
};

export const ACTIVE_STATUSES: EmergencyStatus[] = ['ACCEPTED', 'IN_PROGRESS'];
