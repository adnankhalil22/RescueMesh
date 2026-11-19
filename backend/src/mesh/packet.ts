// Standard RescueMesh message format, shared by:
//  - the mobile app's offline outbox (synchronised over HTTP), and
//  - LoRa transports (simulated today, ESP32 hardware later).
// A mirror of this file lives in mobile/src/mesh/packet.ts.

import { z } from 'zod';
import { MESSAGE_TYPES, PRIORITIES } from '../domain/constants';

export const DEFAULT_MAX_HOPS = 6;

export const meshPacketSchema = z.object({
  messageId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'messageId may only contain letters, digits, _ and -'),
  sourceNodeId: z.string().min(1).max(64),
  destinationNodeId: z.string().min(1).max(64),
  type: z.enum(MESSAGE_TYPES),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  timestamp: z.number().int().positive(), // epoch ms at origin
  priority: z.enum(PRIORITIES),
  hopCount: z.number().int().min(0).max(32).default(0),
  maxHops: z.number().int().min(1).max(32).default(DEFAULT_MAX_HOPS),
  payload: z.record(z.unknown()).default({}),
});

export type MeshPacket = z.infer<typeof meshPacketSchema>;

// --- Compact over-the-air encoding ------------------------------------------
// LoRa frames are small (≈ 222 bytes usable at SF7/125 kHz in many regions),
// so on-air packets use short keys and fixed-point coordinates. The ESP32
// firmware is expected to speak this format over its serial link.

/** Max usable payload of one LoRa frame we design for (SF7/125 kHz, common regional limits). */
export const LORA_MAX_FRAME_BYTES = 222;

// Payload keys are abbreviated on air; unknown keys are passed through unchanged.
const PAYLOAD_KEYS: Record<string, string> = {
  requestId: 'r',
  category: 'c',
  description: 'x',
  peopleCount: 'n',
  accuracy: 'a',
  queuedOffline: 'q',
  text: 't',
};
const PAYLOAD_KEYS_BACK = Object.fromEntries(Object.entries(PAYLOAD_KEYS).map(([k, v]) => [v, k]));
const mapKeys = (o: Record<string, unknown>, table: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [table[k] ?? k, v]));

const TYPE_CODES: Record<MeshPacket['type'], number> = { SOS: 1, LOCATION: 2, STATUS: 3, ACK: 4, CHAT: 5 };
const PRIORITY_CODES: Record<MeshPacket['priority'], number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const invert = <K extends string>(o: Record<K, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<number, K>;
const TYPE_BY_CODE = invert(TYPE_CODES);
const PRIORITY_BY_CODE = invert(PRIORITY_CODES);

export interface CompactPacket {
  i: string; // messageId
  s: string; // source
  d: string; // destination
  t: number; // type code
  la: number | null; // latitude * 1e5
  lo: number | null; // longitude * 1e5
  ts: number; // epoch seconds
  p: number; // priority code
  h: number; // hop count
  m: number; // max hops
  pl: Record<string, unknown>;
}

export function encodeCompact(p: MeshPacket): string {
  const c: CompactPacket = {
    i: p.messageId,
    s: p.sourceNodeId,
    d: p.destinationNodeId,
    t: TYPE_CODES[p.type],
    la: p.latitude === null ? null : Math.round(p.latitude * 1e5),
    lo: p.longitude === null ? null : Math.round(p.longitude * 1e5),
    ts: Math.floor(p.timestamp / 1000),
    p: PRIORITY_CODES[p.priority],
    h: p.hopCount,
    m: p.maxHops,
    pl: mapKeys(p.payload, PAYLOAD_KEYS),
  };
  return JSON.stringify(c);
}

/**
 * Shortens free text in the payload until the encoded packet fits in a single
 * LoRa frame (no fragmentation is implemented). Returns the fitted packet.
 */
export function fitToFrame(p: MeshPacket, maxBytes = LORA_MAX_FRAME_BYTES): MeshPacket {
  const out: MeshPacket = { ...p, payload: { ...p.payload } };
  const textKey = typeof out.payload.description === 'string' ? 'description' : typeof out.payload.text === 'string' ? 'text' : null;
  while (Buffer.byteLength(encodeCompact(out)) > maxBytes && textKey && (out.payload[textKey] as string).length > 0) {
    const t = out.payload[textKey] as string;
    out.payload[textKey] = t.slice(0, Math.max(0, t.length - 4));
  }
  return out;
}

export function decodeCompact(raw: string): MeshPacket {
  const c = JSON.parse(raw) as CompactPacket;
  return meshPacketSchema.parse({
    messageId: c.i,
    sourceNodeId: c.s,
    destinationNodeId: c.d,
    type: TYPE_BY_CODE[c.t],
    latitude: c.la === null ? null : c.la / 1e5,
    longitude: c.lo === null ? null : c.lo / 1e5,
    timestamp: c.ts * 1000,
    priority: PRIORITY_BY_CODE[c.p],
    hopCount: c.h,
    maxHops: c.m,
    payload: mapKeys(c.pl ?? {}, PAYLOAD_KEYS_BACK),
  });
}
