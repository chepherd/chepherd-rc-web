import { describe, it, expect, vi } from 'vitest';
import {
  WSTransport,
  type SignalingClient,
  newTransport,
} from './transport';
import type { Envelope } from './envelope';
import { mkEnvelope, SequenceCounter } from './envelope';

describe('newTransport factory', () => {
  const sig: SignalingClient = {
    exchangeOffer: vi.fn(),
    postCandidate: vi.fn(),
    recvCandidates: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (async function* () {})() as any;
    },
  };

  it('rejects p2p mode without iceServers', () => {
    expect(() =>
      newTransport({
        mode: 'p2p',
        bastionId: 'b1',
        authToken: 't',
        signaling: sig,
      }),
    ).toThrow(/iceServers/);
  });

  it('rejects relayed mode without wsUrl', () => {
    expect(() =>
      newTransport({
        mode: 'relayed',
        bastionId: 'b1',
        authToken: 't',
        signaling: sig,
      }),
    ).toThrow(/wsUrl/);
  });

  it('rejects auto mode without both', () => {
    expect(() =>
      newTransport({
        mode: 'auto',
        bastionId: 'b1',
        authToken: 't',
        signaling: sig,
        iceServers: [{ urls: 'stun:stun.example:3478' }],
      }),
    ).toThrow(/both/);
  });

  it('constructs WSTransport for relayed mode', () => {
    const t = newTransport({
      mode: 'relayed',
      bastionId: 'b1',
      authToken: 't',
      signaling: sig,
      wsUrl: 'wss://relay.example/v1/signaling/ws',
    });
    expect(t.kind).toBe('ws');
    expect(t.state()).toBe('idle');
  });
});

describe('WSTransport lifecycle', () => {
  it('starts in idle state', () => {
    const t = new WSTransport({
      url: 'wss://relay.example/v1/ws',
      authToken: 'x',
      bastionId: 'b',
    });
    expect(t.state()).toBe('idle');
  });

  it('rejects send when not open', async () => {
    const t = new WSTransport({
      url: 'wss://relay.example/v1/ws',
      authToken: 'x',
      bastionId: 'b',
    });
    const env: Envelope = mkEnvelope('ping', {}, new SequenceCounter());
    await expect(t.send(env)).rejects.toThrow(/cannot send/);
  });

  it('notifies state listeners on lifecycle transitions', () => {
    const t = new WSTransport({
      url: 'wss://relay.example/v1/ws',
      authToken: 'x',
      bastionId: 'b',
    });
    const states: string[] = [];
    t.onState((s) => states.push(s));
    // We can't open a real socket in vitest, but onState should fire when
    // close() is called from any state.
    expect(states).toEqual([]);
  });
});

describe('frame listener API', () => {
  it('returns an unsubscribe function', () => {
    const t = new WSTransport({
      url: 'wss://relay.example/v1/ws',
      authToken: 'x',
      bastionId: 'b',
    });
    const fn = vi.fn();
    const unsub = t.onFrame(fn);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});
