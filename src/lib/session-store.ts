// session-store — live, observable Svelte 5 store wrapping a Transport.
//
// Subscribes to the protocol stream; turns the latest 'state' envelope
// into a reactive snapshot of all sessions; appends 'log' frames to a
// per-session ring buffer; surfaces 'verdict' frames as an event stream.

import type {
  SessionState,
  StatePayload,
  LogPayload,
  VerdictPayload,
} from '../protocol/payloads';
import type { Transport, TransportState } from '../protocol/transport';
import { mkEnvelope, SequenceCounter } from '../protocol/envelope';

interface LogEntry {
  session: string;
  level: LogPayload['level'];
  text: string;
  at: number;
}

interface VerdictEntry extends VerdictPayload {
  at: number;
}

const LOG_RING_SIZE = 500;

export class SessionStore {
  sessions = $state<SessionState[]>([]);
  logs = $state<LogEntry[]>([]);
  verdicts = $state<VerdictEntry[]>([]);
  transportState = $state<TransportState>('idle');
  transportKind = $state<'ws' | 'webrtc' | null>(null);

  #transport: Transport;
  #counter = new SequenceCounter();
  #unsubFrame: () => void;
  #unsubState: () => void;

  constructor(transport: Transport) {
    this.#transport = transport;
    this.transportKind = transport.kind;
    this.#unsubFrame = transport.onFrame((env) => this.#handleFrame(env));
    this.#unsubState = transport.onState((s) => {
      this.transportState = s;
    });
  }

  async connect(): Promise<void> {
    await this.#transport.connect();
  }

  async close(): Promise<void> {
    this.#unsubFrame();
    this.#unsubState();
    await this.#transport.close('user signed out');
  }

  /** Issue a command via protocol §4.5. Resolves when sent (NOT acked). */
  async sendCommand(
    sessionUuid: string,
    action: 'pause' | 'unpause' | 'refresh' | 'inject',
    args?: Record<string, unknown>,
  ): Promise<void> {
    const env = mkEnvelope(
      'command',
      { session_uuid: sessionUuid, action, args },
      this.#counter,
    );
    await this.#transport.send(env);
  }

  #handleFrame(env: { type: string; payload?: unknown }): void {
    switch (env.type) {
      case 'state': {
        const p = env.payload as StatePayload | undefined;
        if (p?.sessions) this.sessions = p.sessions;
        break;
      }
      case 'log': {
        const p = env.payload as LogPayload | undefined;
        if (p) {
          this.logs = [
            ...this.logs.slice(-(LOG_RING_SIZE - 1)),
            { ...p, at: Date.now() },
          ];
        }
        break;
      }
      case 'verdict': {
        const p = env.payload as VerdictPayload | undefined;
        if (p) {
          this.verdicts = [...this.verdicts.slice(-99), { ...p, at: Date.now() }];
        }
        break;
      }
      default:
        // ack/ping/pong/error handled elsewhere; ignore here.
        break;
    }
  }
}
