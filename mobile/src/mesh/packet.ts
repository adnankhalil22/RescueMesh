// Standard RescueMesh message format. Mirrors backend/src/mesh/packet.ts.
// The same packet is synchronised over HTTP today and is the payload an
// ESP32 + LoRa bridge would carry (see docs/LORA_INTEGRATION.md).

import type { Priority } from '../types';

export type MeshMessageType = 'SOS' | 'LOCATION' | 'STATUS' | 'ACK' | 'CHAT';

export const SERVER_NODE_ID = 'SERVER';
export const DEFAULT_MAX_HOPS = 6;

export interface MeshPacket {
  messageId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  type: MeshMessageType;
  latitude: number | null;
  longitude: number | null;
  timestamp: number; // epoch ms when created on the device
  priority: Priority;
  hopCount: number;
  maxHops: number;
  payload: Record<string, unknown>;
}

export function buildPacket(fields: Omit<MeshPacket, 'hopCount' | 'maxHops' | 'destinationNodeId'> & { destinationNodeId?: string }): MeshPacket {
  return {
    destinationNodeId: SERVER_NODE_ID,
    hopCount: 0,
    maxHops: DEFAULT_MAX_HOPS,
    ...fields,
  };
}
