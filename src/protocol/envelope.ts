// chepherd-rc protocol v1 envelope — TypeScript implementation.
// Source-of-truth spec: https://github.com/chepherd/chepherd/blob/main/docs/PROTOCOL.md
//
// Wire-compatible with the Go envelope at
// github.com/chepherd/chepherd/internal/daemon/rc/envelope. Both
// implementations encode the SAME JSON object per frame; both must stay
// in sync when the spec bumps.

/** Protocol v1 message type discriminator (PROTOCOL.md §4). */
export type EnvelopeType =
  | 'register'
  | 'state'
  | 'log'
  | 'verdict'
  | 'command'
  | 'ack'
  | 'ping'
  | 'pong'
  | 'error';

/** Wire envelope — exactly one of these per frame on every transport. */
export interface Envelope<P = unknown> {
  /** PROTOCOL.md §3 type discriminator. */
  type: EnvelopeType;
  /** RFC3339Nano UTC timestamp on the sender's clock. */
  ts: string;
  /** Monotonic per-direction, per-connection. uint64 in JSON. */
  seq: number;
  /** Type-specific payload (see protocol §4). */
  payload?: P;
}

/** Frame size limit from PROTOCOL.md §3. */
export const FRAME_SIZE_LIMIT = 256 * 1024;

/** Monotonic per-direction sequence counter. */
export class SequenceCounter {
  #v = 0;
  next(): number {
    this.#v += 1;
    return this.#v;
  }
  current(): number {
    return this.#v;
  }
  /** Used during reconnect-resume per PROTOCOL.md §5. */
  setTo(v: number): void {
    this.#v = v;
  }
}

/** Construct an envelope with the sender clock + auto-incrementing seq. */
export function mkEnvelope<P>(
  type: EnvelopeType,
  payload: P,
  counter: SequenceCounter,
): Envelope<P> {
  return {
    type,
    ts: new Date().toISOString(),
    seq: counter.next(),
    payload,
  };
}

/** Frame size validator — receivers MUST reject frames > FRAME_SIZE_LIMIT. */
export function validateFrame(frame: string): void {
  if (!frame) throw new Error('envelope: empty frame');
  // Bytes vs characters — UTF-8 measurement.
  const bytes = new TextEncoder().encode(frame).byteLength;
  if (bytes > FRAME_SIZE_LIMIT) {
    throw new Error(
      `envelope: frame too large (${bytes} > ${FRAME_SIZE_LIMIT})`,
    );
  }
}

/** Decode + validate one wire frame. */
export function decodeFrame<P = unknown>(frame: string): Envelope<P> {
  validateFrame(frame);
  const parsed = JSON.parse(frame) as Envelope<P>;
  if (!parsed.type) {
    throw new Error('envelope: missing type');
  }
  return parsed;
}

/** Marshal one envelope to its wire form. */
export function encodeFrame(env: Envelope): string {
  return JSON.stringify(env);
}
