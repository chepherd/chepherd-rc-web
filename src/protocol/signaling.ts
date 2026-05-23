// SignalingClient — REST implementation calling chepherd-relay's
// /v1/signaling/* endpoints. Mirrors the Go implementation in
// github.com/chepherd/chepherd/internal/daemon/rc/signaling.

import type { SignalingClient } from './transport';

export interface HTTPSignalingConfig {
  /** Base URL of the relay, e.g. "https://relay.chepherd.org". */
  baseUrl: string;
  /** Bearer JWT for the relay's auth middleware. */
  authToken: string;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
}

interface OfferResponse {
  answer: RTCSessionDescriptionInit;
}

interface CandidatesResponse {
  candidates: RTCIceCandidateInit[];
  /** Cursor that the next poll should pass to avoid re-delivering. */
  cursor: string;
}

export class HTTPSignaling implements SignalingClient {
  #cfg: HTTPSignalingConfig;
  #fetch: typeof fetch;

  constructor(cfg: HTTPSignalingConfig) {
    this.#cfg = cfg;
    this.#fetch = cfg.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async exchangeOffer(
    bastionId: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    const res = await this.#fetch(
      `${this.#cfg.baseUrl}/v1/signaling/offer`,
      {
        method: 'POST',
        headers: this.#headers(),
        body: JSON.stringify({ bastion_id: bastionId, offer }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`signaling: offer rejected ${res.status} ${text}`);
    }
    const body = (await res.json()) as OfferResponse;
    if (!body.answer) {
      throw new Error('signaling: offer response missing answer');
    }
    return body.answer;
  }

  async postCandidate(
    bastionId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const res = await this.#fetch(
      `${this.#cfg.baseUrl}/v1/signaling/candidate`,
      {
        method: 'POST',
        headers: this.#headers(),
        body: JSON.stringify({ bastion_id: bastionId, candidate }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`signaling: candidate rejected ${res.status} ${text}`);
    }
  }

  async *recvCandidates(
    bastionId: string,
    abort: AbortSignal,
  ): AsyncIterable<RTCIceCandidateInit> {
    let cursor = '';
    while (!abort.aborted) {
      const url = new URL(
        `${this.#cfg.baseUrl}/v1/signaling/candidates`,
      );
      url.searchParams.set('bastion_id', bastionId);
      if (cursor) url.searchParams.set('cursor', cursor);
      let res: Response;
      try {
        res = await this.#fetch(url.toString(), {
          method: 'GET',
          headers: this.#headers(),
          signal: abort,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Network blip — small back-off + retry.
        await sleep(500, abort);
        continue;
      }
      if (!res.ok) {
        if (res.status === 404) return; // session ended
        await sleep(1000, abort);
        continue;
      }
      const body = (await res.json()) as CandidatesResponse;
      cursor = body.cursor ?? cursor;
      for (const c of body.candidates ?? []) {
        yield c;
      }
    }
  }

  #headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.#cfg.authToken}`,
      'Content-Type': 'application/json',
    };
  }
}

function sleep(ms: number, abort: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    abort.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}
