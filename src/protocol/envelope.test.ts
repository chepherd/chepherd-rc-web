import { describe, it, expect } from 'vitest';
import {
  SequenceCounter,
  mkEnvelope,
  encodeFrame,
  decodeFrame,
  validateFrame,
  FRAME_SIZE_LIMIT,
} from './envelope';
import type { RegisterPayload, VerdictPayload } from './payloads';

describe('envelope', () => {
  it('mkEnvelope assigns monotonic seq', () => {
    const counter = new SequenceCounter();
    const a = mkEnvelope('ping', {}, counter);
    const b = mkEnvelope('ping', {}, counter);
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(counter.current()).toBe(2);
  });

  it('round-trips a register frame', () => {
    const counter = new SequenceCounter();
    const payload: RegisterPayload = {
      bastion_id: 'emrah-bastion-01',
      user_id: 'alice@example.com',
      chepherd_version: '0.2.0-rc1',
      capabilities: ['pause', 'inject'],
      session_count: 7,
    };
    const env = mkEnvelope('register', payload, counter);
    const wire = encodeFrame(env);
    const back = decodeFrame<RegisterPayload>(wire);
    expect(back.type).toBe('register');
    expect(back.seq).toBe(1);
    expect(back.payload?.bastion_id).toBe('emrah-bastion-01');
    expect(back.payload?.session_count).toBe(7);
  });

  it('round-trips a verdict frame', () => {
    const counter = new SequenceCounter();
    const payload: VerdictPayload = {
      session_uuid: 'abc',
      session: 'openova-1',
      verdict: 'intervene',
      principle_ref: 'P9, P14',
      scorecard: { G: 3, V: 1, F: 1, E: 0 },
      injected: true,
    };
    const wire = encodeFrame(mkEnvelope('verdict', payload, counter));
    const back = decodeFrame<VerdictPayload>(wire);
    expect(back.payload?.verdict).toBe('intervene');
    expect(back.payload?.scorecard?.G).toBe(3);
    expect(back.payload?.injected).toBe(true);
  });

  it('rejects frames larger than FRAME_SIZE_LIMIT', () => {
    const big = 'x'.repeat(FRAME_SIZE_LIMIT + 100);
    expect(() => validateFrame(big)).toThrow(/too large/);
  });

  it('rejects empty frames', () => {
    expect(() => validateFrame('')).toThrow(/empty/);
  });

  it('rejects frames without type', () => {
    const malformed = JSON.stringify({ ts: '2026-05-23T00:00:00Z', seq: 1, payload: {} });
    expect(() => decodeFrame(malformed)).toThrow(/missing type/);
  });

  it('SequenceCounter setTo advances correctly on reconnect-resume', () => {
    const c = new SequenceCounter();
    c.setTo(100);
    expect(c.next()).toBe(101);
  });
});
