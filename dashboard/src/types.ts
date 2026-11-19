export type Role = 'VICTIM' | 'RESPONDER' | 'ADMIN';
export type EmergencyType = 'MEDICAL' | 'TRAPPED' | 'FIRE' | 'BUILDING_COLLAPSE' | 'MISSING_PERSON' | 'OTHER';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EmergencyStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
export type Channel = 'ONLINE' | 'OFFLINE_SYNC' | 'LORA_SIM';

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
  createdAt: string;
  lastLoginAt: string | null;
  reportedCount?: number;
  assignedCount?: number;
}

export interface PersonRef {
  id: string;
  name: string;
  phone: string | null;
  email: string;
}

export interface HistoryEntry {
  id: string;
  status: EmergencyStatus;
  note: string | null;
  createdAt: string;
  user: { id: string; name: string; role: Role } | null;
}

export interface Emergency {
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
  channel: Channel;
  archived: boolean;
  createdAt: string;
  receivedAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  resolvedAt: string | null;
  reporter: PersonRef | null;
  reporterName: string;
  responder: PersonRef | null;
  history?: HistoryEntry[];
}

export interface CountItem<K extends string = string> {
  key: K;
  count: number;
}

export interface Overview {
  totals: { total: number; pending: number; active: number; resolved: number; cancelled: number; criticalOpen: number };
  byType: CountItem<EmergencyType>[];
  byPriority: CountItem<Priority>[];
  byStatus: CountItem<EmergencyStatus>[];
  byChannel: CountItem<Channel>[];
  daily: { date: string; reported: number; resolved: number }[];
  avgResponseMinutes: number | null;
  users: Partial<Record<Role, number>>;
  nodes: { total: number; online: number; simulated: boolean };
  recent: Emergency[];
}

export interface CommNode {
  id: string;
  name: string;
  kind: 'GATEWAY' | 'RELAY' | 'ENDPOINT';
  latitude: number;
  longitude: number;
  rangeKm: number;
  online: boolean;
  simulated: boolean;
  batteryLevel: number;
  packetsSent: number;
  packetsReceived: number;
  packetsDropped: number;
  lastSeen: string;
  heldPackets: number;
}

export interface CommStatus {
  api: { online: boolean; serverTime: string; database: string };
  transport: { kind: string; simulated: boolean; hardwareConnected: boolean; description: string };
  nodes: { total: number; online: number; gatewaysOnline: number; simulated: boolean };
  messages: { receivedTotal: number; receivedHttp: number; receivedLora: number; duplicatesBlocked: number; rejected: number };
  lora: { packetsSent: number; packetsReceived: number; packetsDropped: number; pendingPackets: number };
  pendingRequests: number;
}

export type TraceEventType = 'ORIGIN' | 'TX' | 'RX' | 'DUPLICATE_DROPPED' | 'HOP_LIMIT' | 'DELIVERED' | 'NODE_OFFLINE' | 'NO_ROUTE';

export interface TraceEvent {
  step: number;
  type: TraceEventType;
  nodeId: string;
  from?: string;
  hopCount: number;
  detail: string;
}

export interface MeshPacket {
  messageId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: number;
  priority: Priority;
  hopCount: number;
  maxHops: number;
  payload: Record<string, unknown>;
}

export interface IngestInfo {
  result: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  requestId?: string;
  error?: string;
}

export interface SimulationResponse {
  simulated: true;
  packet: MeshPacket;
  onAirBytes: number;
  maxFrameBytes: number;
  delivered: boolean;
  queued: boolean;
  ingest?: IngestInfo;
  trace: {
    delivered: boolean;
    hopCount?: number;
    path?: string[];
    events: TraceEvent[];
    transmissions: number;
    duplicatesDropped: number;
    holders: string[];
  };
}

export interface TransmissionRecord {
  at: string;
  messageId: string;
  type: string;
  sourceNodeId: string;
  delivered: boolean;
  queued: boolean;
  hopCount?: number;
  path?: string[];
  transmissions: number;
  duplicatesDropped: number;
  ingest?: IngestInfo;
  events: TraceEvent[];
}

export interface MessageRecord {
  id: string;
  type: string;
  sourceNodeId: string;
  destinationNodeId: string;
  priority: Priority;
  hopCount: number;
  path: string[];
  transport: 'HTTP' | 'LORA_SIM';
  deliveryStatus: string;
  createdAt: string;
  receivedAt: string;
  sender: { id: string; name: string } | null;
}

export interface SystemSettings {
  organizationName: string;
  maxHops: number;
  mapCenterLat: number;
  mapCenterLng: number;
  mapZoom: number;
  autoRefreshSeconds: number;
}
