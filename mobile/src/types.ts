export type Role = 'VICTIM' | 'RESPONDER' | 'ADMIN';
export type EmergencyType = 'MEDICAL' | 'TRAPPED' | 'FIRE' | 'BUILDING_COLLAPSE' | 'MISSING_PERSON' | 'OTHER';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EmergencyStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
/** Delivery state of a message in the device outbox. */
export type DeliveryStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  bloodGroup: string | null;
  emergencyContact: string | null;
  organization: string | null;
}

export interface PersonRef {
  id: string;
  name: string;
  phone: string | null;
  email: string;
}

export interface ServerEmergency {
  id: string;
  code: string;
  type: EmergencyType;
  priority: Priority;
  status: EmergencyStatus;
  description: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  peopleCount: number;
  channel: 'ONLINE' | 'OFFLINE_SYNC' | 'LORA_SIM';
  createdAt: string;
  receivedAt: string;
  updatedAt: string;
  reporter: PersonRef | null;
  reporterName: string;
  responder: PersonRef | null;
  history?: { id: string; status: EmergencyStatus; note: string | null; createdAt: string; user: { name: string; role: Role } | null }[];
}

/** An SOS request as stored on the phone (works fully offline). */
export interface LocalRequest {
  id: string;
  userId: string;
  messageId: string;
  type: EmergencyType;
  priority: Priority;
  description: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  peopleCount: number;
  status: EmergencyStatus; // last known server status
  responderName: string | null;
  createdAt: number;
  updatedAt: number;
  // joined from the outbox
  deliveryStatus: DeliveryStatus;
  attempts: number;
  lastError: string | null;
}
