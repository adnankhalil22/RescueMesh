// Message transports used by the sync service. The app never talks to a
// specific network directly; it hands outbox batches to the first available
// transport. Today only HTTP is functional. The LoRa bridge is the integration
// point for an ESP32 + LoRa module (e.g. over BLE serial) and reports itself as
// unavailable until real hardware is connected and tested.

import type { MeshPacket } from '../mesh/packet';
import type { SyncApi, SyncResult } from '../sync/syncEngine';
import { NetworkUnavailableError } from '../sync/syncEngine';
import { api } from '../services/api';

export interface MessageTransport extends SyncApi {
  readonly id: 'HTTP' | 'LORA_BRIDGE';
  readonly label: string;
  /** Hardware/link availability right now. */
  isAvailable(): boolean;
  describe(): string;
}

export class HttpTransport implements MessageTransport {
  readonly id = 'HTTP' as const;
  readonly label = 'HTTP / REST API';
  constructor(private readonly reachable: () => boolean) {}
  isAvailable() {
    return this.reachable();
  }
  describe() {
    return this.reachable() ? 'Connected to the RescueMesh server' : 'Server not reachable';
  }
  postMessages(packets: MeshPacket[]): Promise<SyncResult[]> {
    return api.syncMessages(packets);
  }
}

/**
 * ESP32 + LoRa bridge (NOT CONNECTED). A paired ESP32 would receive compact
 * packets from the phone and broadcast them over LoRa; a gateway node forwards
 * them to the server, which answers with the same SyncResult acknowledgements.
 * No hardware is attached in this build, so this transport is never used.
 */
export class LoRaBridgeTransport implements MessageTransport {
  readonly id = 'LORA_BRIDGE' as const;
  readonly label = 'Physical LoRa (ESP32 bridge)';
  isAvailable() {
    return false;
  }
  describe() {
    return 'No LoRa hardware paired (integration interface ready)';
  }
  async postMessages(): Promise<SyncResult[]> {
    throw new NetworkUnavailableError('ESP32 LoRa bridge is not connected');
  }
}
