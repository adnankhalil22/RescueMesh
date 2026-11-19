// Hardware adapter for a real ESP32 + LoRa gateway attached over USB serial.
//
// NOT ACTIVE: no hardware has been connected or tested. This class documents
// the integration contract (see docs/LORA_INTEGRATION.md) and refuses to send
// so that nothing claims a physical transmission happened.
//
// Contract: the gateway firmware exchanges newline-delimited compact packets
// (see encodeCompact in packet.ts) at 115200 baud. Incoming lines are decoded
// with decodeCompact and passed to ingestPacket(..., { transport: 'LORA' }).

import type { MeshPacket } from './packet';
import type { MeshTransport, TransmitResult, TransportStatus } from './transport';

export class SerialLoRaTransport implements MeshTransport {
  constructor(private readonly portPath: string) {}

  status(): TransportStatus {
    return {
      kind: 'SERIAL_LORA',
      simulated: false,
      hardwareConnected: false,
      description: `ESP32 LoRa gateway on ${this.portPath} — hardware not connected`,
    };
  }

  async transmit(_packet: MeshPacket, _sourceNodeId: string): Promise<TransmitResult> {
    throw new Error('ESP32 LoRa hardware is not connected. Use the simulated transport.');
  }

  async retryPending(): Promise<TransmitResult[]> {
    return [];
  }
}
