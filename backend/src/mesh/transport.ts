// Transport abstraction. Application code talks to a MeshTransport and does
// not care whether packets travel through a simulator or real ESP32 + LoRa
// radios. Swap the implementation in src/mesh/index.ts.

import type { MeshPacket } from './packet';
import type { SimulationResult } from './simulator';

export interface TransportStatus {
  kind: 'SIMULATED_LORA' | 'SERIAL_LORA';
  simulated: boolean;
  hardwareConnected: boolean;
  description: string;
}

export interface TransmitResult {
  delivered: boolean;
  queued: boolean;
  simulation?: SimulationResult;
  ingest?: { result: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED'; requestId?: string; error?: string };
}

export interface MeshTransport {
  status(): TransportStatus;
  /** Inject a packet into the mesh at `sourceNodeId`. */
  transmit(packet: MeshPacket, sourceNodeId: string): Promise<TransmitResult>;
  /** Re-attempt packets that previously had no route. */
  retryPending(): Promise<TransmitResult[]>;
}
