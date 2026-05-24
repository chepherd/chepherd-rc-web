// chepherd-rc transport layer — pluggable Transport interface with two
// concrete implementations: WebRTC DataChannel (default, P2P, privacy-
// preserving) and WebSocket (opt-in, relayed).
//
// Mirror of: github.com/chepherd/chepherd/internal/daemon/rc/transport/.
// Both sides MUST present the same Transport abstraction so the rest of
// the client (UI, command dispatcher, log subscriber) doesn't know which
// is in use.

import type { Envelope } from './envelope';
import {
  encodeFrame,
  decodeFrame,
  FRAME_SIZE_LIMIT,
  validateFrame,
} from './envelope';

/** Lifecycle states a Transport can be in. */
export type TransportState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'closing'
  | 'closed';

/** Subscriber for incoming envelopes — one per Transport. */
export type FrameListener = (env: Envelope) => void;
/** Subscriber for state changes — fires on every TransportState transition. */
export type StateListener = (state: TransportState, reason?: string) => void;

/** The pluggable transport contract — WS and WebRTC both satisfy this. */
export interface Transport {
  /** Initiate the connection. Resolves when state transitions to 'open'. */
  connect(): Promise<void>;
  /** Send one envelope. Rejects if the transport is not open. */
  send(env: Envelope): Promise<void>;
  /** Close gracefully. Idempotent. */
  close(reason?: string): Promise<void>;
  /** Current lifecycle state. */
  state(): TransportState;
  /** Subscribe to incoming frames. Returns an unsubscribe. */
  onFrame(listener: FrameListener): () => void;
  /** Subscribe to state changes. Returns an unsubscribe. */
  onState(listener: StateListener): () => void;
  /** Identifier for logging / debugging. */
  readonly kind: 'ws' | 'webrtc';
}

/** Common base — wires up listener lifecycle + state-machine plumbing. */
abstract class BaseTransport implements Transport {
  abstract readonly kind: 'ws' | 'webrtc';
  protected currentState: TransportState = 'idle';
  protected frameListeners = new Set<FrameListener>();
  protected stateListeners = new Set<StateListener>();

  abstract connect(): Promise<void>;
  abstract send(env: Envelope): Promise<void>;
  abstract close(reason?: string): Promise<void>;

  state(): TransportState {
    return this.currentState;
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  protected emitFrame(env: Envelope): void {
    for (const l of this.frameListeners) {
      try {
        l(env);
      } catch (err) {
        console.error('chepherd: frame listener threw', err);
      }
    }
  }

  protected setState(next: TransportState, reason?: string): void {
    if (next === this.currentState) return;
    this.currentState = next;
    for (const l of this.stateListeners) {
      try {
        l(next, reason);
      } catch (err) {
        console.error('chepherd: state listener threw', err);
      }
    }
  }

  protected handleIncoming(raw: string): void {
    try {
      validateFrame(raw);
      const env = decodeFrame(raw);
      this.emitFrame(env);
    } catch (err) {
      console.error('chepherd: dropping bad frame', err);
    }
  }
}

// =============================================================================
// WebSocket transport — relayed mode, opt-in. Used when WebRTC fails (NAT
// double-symmetric scenarios) or when the user explicitly chose relay mode.
// =============================================================================

export interface WSConfig {
  /** Full ws:// or wss:// URL to chepherd-relay's WS endpoint. */
  url: string;
  /** Bearer JWT (client-side identity token). */
  authToken: string;
  /** Bastion ID (logical room key). */
  bastionId: string;
}

export class WSTransport extends BaseTransport {
  readonly kind = 'ws' as const;
  #ws: WebSocket | null = null;
  #cfg: WSConfig;

  constructor(cfg: WSConfig) {
    super();
    this.#cfg = cfg;
  }

  async connect(): Promise<void> {
    if (this.currentState !== 'idle' && this.currentState !== 'closed') {
      throw new Error(`ws: already ${this.currentState}`);
    }
    this.setState('connecting');

    // Subprotocol carries the auth + bastion id — same shape as the Go
    // server's expectation (relay's /v1/signaling/ws endpoint).
    const proto = `chepherd-rc-v1.${this.#cfg.bastionId}.${this.#cfg.authToken}`;
    const ws = new WebSocket(this.#cfg.url, proto);
    this.#ws = ws;

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        this.setState('open');
        resolve();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          this.handleIncoming(ev.data);
        } else {
          // Binary frames are not part of protocol v1.
          console.warn('chepherd ws: dropping binary frame');
        }
      };
      ws.onclose = (ev) => {
        this.setState('closed', `code=${ev.code} reason=${ev.reason}`);
      };
      ws.onerror = (ev) => {
        // The error event has no useful payload in browsers; rely on the
        // subsequent close event for the actual reason code.
        if (this.currentState === 'connecting') {
          reject(new Error(`ws: connection failed (${ev.type})`));
        }
        this.setState('closed', 'transport error');
      };
    });
  }

  async send(env: Envelope): Promise<void> {
    if (this.currentState !== 'open' || !this.#ws) {
      throw new Error(`ws: cannot send in state ${this.currentState}`);
    }
    const frame = encodeFrame(env);
    validateFrame(frame);
    this.#ws.send(frame);
  }

  async close(reason?: string): Promise<void> {
    if (this.currentState === 'closed' || this.currentState === 'idle') return;
    this.setState('closing', reason);
    this.#ws?.close(1000, reason ?? 'client close');
  }
}

// =============================================================================
// WebRTC transport — P2P DataChannel. Privacy-preserving: relay only
// participates in the SDP/ICE handshake; once DTLS is up, every byte
// travels directly between the daemon's bastion and the user's browser.
// =============================================================================

export interface WebRTCConfig {
  /** ICE servers (STUN/TURN). Relay's STUN included by default. */
  iceServers: RTCIceServer[];
  /** Implementation of the signaling exchange. */
  signaling: SignalingClient;
  /** Bastion ID (room key for the signaling rendezvous). */
  bastionId: string;
}

/** SignalingClient abstracts the relay's signaling REST endpoints. */
export interface SignalingClient {
  /** POST our SDP offer; relay returns whatever the daemon answered. */
  exchangeOffer(
    bastionId: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit>;
  /** POST one trickled ICE candidate. */
  postCandidate(
    bastionId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void>;
  /** Long-poll for remote ICE candidates that arrived after the answer. */
  recvCandidates(
    bastionId: string,
    abort: AbortSignal,
  ): AsyncIterable<RTCIceCandidateInit>;
}

export class WebRTCTransport extends BaseTransport {
  readonly kind = 'webrtc' as const;
  #pc: RTCPeerConnection | null = null;
  #dc: RTCDataChannel | null = null;
  #cfg: WebRTCConfig;
  #candidatePoller: AbortController | null = null;

  constructor(cfg: WebRTCConfig) {
    super();
    this.#cfg = cfg;
  }

  async connect(): Promise<void> {
    if (this.currentState !== 'idle' && this.currentState !== 'closed') {
      throw new Error(`webrtc: already ${this.currentState}`);
    }
    this.setState('connecting');

    const pc = new RTCPeerConnection({
      iceServers: this.#cfg.iceServers,
    });
    this.#pc = pc;

    // We're the initiator; we open the DataChannel before generating the
    // offer so the SDP includes the m=application section.
    const dc = pc.createDataChannel('chepherd-rc-v1', {
      ordered: true,
      // Reliability matters — log + verdict frames cannot drop. Omit
      // maxRetransmits entirely (default = reliable). exactOptional
      // PropertyTypes rejects explicit `undefined` for optional fields.
      negotiated: false,
    });
    this.#dc = dc;

    dc.onopen = () => this.setState('open');
    dc.onclose = () => this.setState('closed', 'data channel closed');
    dc.onerror = (ev) => {
      console.error('chepherd webrtc: dc error', ev);
      this.setState('closed', 'data channel error');
    };
    dc.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        this.handleIncoming(ev.data);
      }
    };

    // Trickle our local candidates.
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.#cfg.signaling
          .postCandidate(this.#cfg.bastionId, ev.candidate.toJSON())
          .catch((err) => {
            console.error('chepherd webrtc: postCandidate failed', err);
          });
      }
    };

    pc.onconnectionstatechange = () => {
      const cs = pc.connectionState;
      if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
        this.setState('closed', `peer state ${cs}`);
      }
    };

    // Begin the SDP exchange via the signaling client.
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const answer = await this.#cfg.signaling.exchangeOffer(
      this.#cfg.bastionId,
      offer,
    );
    await pc.setRemoteDescription(answer);

    // Long-poll for remote candidates trickled after the answer.
    this.#candidatePoller = new AbortController();
    void this.#pollRemoteCandidates(this.#candidatePoller.signal);

    // Wait for the data channel to open or for the connection to fail.
    return new Promise((resolve, reject) => {
      const unsubState = this.onState((s, reason) => {
        if (s === 'open') {
          unsubState();
          resolve();
        } else if (s === 'closed') {
          unsubState();
          reject(new Error(`webrtc: connection failed (${reason ?? ''})`));
        }
      });
    });
  }

  async #pollRemoteCandidates(abort: AbortSignal): Promise<void> {
    try {
      for await (const cand of this.#cfg.signaling.recvCandidates(
        this.#cfg.bastionId,
        abort,
      )) {
        if (this.#pc && this.#pc.connectionState !== 'closed') {
          await this.#pc.addIceCandidate(cand);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('chepherd webrtc: recvCandidates loop ended', err);
      }
    }
  }

  async send(env: Envelope): Promise<void> {
    if (this.currentState !== 'open' || !this.#dc) {
      throw new Error(`webrtc: cannot send in state ${this.currentState}`);
    }
    const frame = encodeFrame(env);
    validateFrame(frame);
    if (frame.length > FRAME_SIZE_LIMIT) {
      throw new Error('webrtc: frame too large');
    }
    this.#dc.send(frame);
  }

  async close(reason?: string): Promise<void> {
    if (this.currentState === 'closed' || this.currentState === 'idle') return;
    this.setState('closing', reason);
    this.#candidatePoller?.abort();
    this.#dc?.close();
    this.#pc?.close();
    this.setState('closed', reason);
  }
}

// =============================================================================
// Factory — picks WebRTC by default, falls back to WS on explicit request.
// =============================================================================

export type TransportMode = 'p2p' | 'relayed' | 'auto';

export interface FactoryConfig {
  mode: TransportMode;
  bastionId: string;
  authToken: string;
  signaling: SignalingClient;
  /** ICE servers for WebRTC mode (mandatory if mode != 'relayed'). */
  iceServers?: RTCIceServer[];
  /** WS URL for relayed mode (mandatory if mode != 'p2p'). */
  wsUrl?: string;
}

/**
 * Construct the right Transport for the requested mode.
 *
 * 'p2p' — WebRTC only. Fails if NAT prevents direct connection. Privacy.
 * 'relayed' — WebSocket only. Always works. User-chosen opt-in.
 * 'auto' — try WebRTC, fall back to WS if the data channel never opens.
 */
export function newTransport(cfg: FactoryConfig): Transport {
  switch (cfg.mode) {
    case 'p2p': {
      if (!cfg.iceServers) {
        throw new Error('factory: p2p mode requires iceServers');
      }
      return new WebRTCTransport({
        iceServers: cfg.iceServers,
        signaling: cfg.signaling,
        bastionId: cfg.bastionId,
      });
    }
    case 'relayed': {
      if (!cfg.wsUrl) {
        throw new Error('factory: relayed mode requires wsUrl');
      }
      return new WSTransport({
        url: cfg.wsUrl,
        authToken: cfg.authToken,
        bastionId: cfg.bastionId,
      });
    }
    case 'auto': {
      if (!cfg.iceServers || !cfg.wsUrl) {
        throw new Error('factory: auto mode requires both iceServers and wsUrl');
      }
      return new AutoTransport(cfg);
    }
  }
}

/**
 * AutoTransport — first attempts WebRTC; on connect failure or 5s timeout,
 * tears down and tries WS. From the outside it looks like one Transport
 * with one lifecycle.
 */
class AutoTransport extends BaseTransport {
  readonly kind = 'webrtc' as const; // kind tracks the active inner transport
  #cfg: FactoryConfig;
  #inner: Transport | null = null;
  #frameUnsub: (() => void) | null = null;
  #stateUnsub: (() => void) | null = null;

  constructor(cfg: FactoryConfig) {
    super();
    this.#cfg = cfg;
  }

  async connect(): Promise<void> {
    this.setState('connecting');
    // First attempt: WebRTC.
    const rtc = new WebRTCTransport({
      iceServers: this.#cfg.iceServers!,
      signaling: this.#cfg.signaling,
      bastionId: this.#cfg.bastionId,
    });
    this.#wireInner(rtc);
    try {
      await Promise.race([
        rtc.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('webrtc: open timeout')), 5000),
        ),
      ]);
      return;
    } catch (err) {
      console.warn('chepherd auto: WebRTC failed, falling back to WS', err);
      await rtc.close('falling back');
      this.#unwireInner();
    }
    // Fallback: WebSocket.
    const ws = new WSTransport({
      url: this.#cfg.wsUrl!,
      authToken: this.#cfg.authToken,
      bastionId: this.#cfg.bastionId,
    });
    this.#wireInner(ws);
    await ws.connect();
  }

  #wireInner(t: Transport): void {
    this.#inner = t;
    this.#frameUnsub = t.onFrame((env) => this.emitFrame(env));
    this.#stateUnsub = t.onState((s, r) => this.setState(s, r));
  }

  #unwireInner(): void {
    this.#frameUnsub?.();
    this.#stateUnsub?.();
    this.#inner = null;
    this.#frameUnsub = null;
    this.#stateUnsub = null;
  }

  async send(env: Envelope): Promise<void> {
    if (!this.#inner) throw new Error('auto: no inner transport');
    return this.#inner.send(env);
  }

  async close(reason?: string): Promise<void> {
    if (this.#inner) {
      await this.#inner.close(reason);
      this.#unwireInner();
    }
    this.setState('closed', reason);
  }
}
