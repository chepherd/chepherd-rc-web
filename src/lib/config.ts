// Runtime-injected config — populated at build/deploy time via
// PUBLIC_* env vars or window.CHEPHERD_CONFIG. All values are PUBLIC
// (no secrets) because this is a static-built SPA.

export interface ChepherdRuntimeConfig {
  /** OpenOva identity provider base URL. */
  idpBaseUrl: string;
  /** OAuth2 client ID registered with the IdP. */
  clientId: string;
  /** Where the IdP should redirect after the user grants consent. */
  redirectUri: string;
  /** Scope to request from the IdP. */
  scope: string;
  /** chepherd-relay base URL. */
  relayBaseUrl: string;
  /** chepherd-relay WebSocket URL. */
  relayWsUrl: string;
  /** ICE servers for WebRTC. */
  iceServers: RTCIceServer[];
  /** Default transport mode. */
  defaultMode: 'p2p' | 'relayed' | 'auto';
  /** Optional Sentry DSN — public-safe. */
  sentryDsn?: string;
  /** Optional OTel collector HTTP endpoint — public-safe. */
  otelEndpoint?: string;
}

declare global {
  interface Window {
    CHEPHERD_CONFIG?: Partial<ChepherdRuntimeConfig>;
  }
}

const DEFAULTS: ChepherdRuntimeConfig = {
  idpBaseUrl: 'https://id.openova.io',
  clientId: 'chepherd-rc-web',
  redirectUri:
    typeof window !== 'undefined'
      ? `${window.location.origin}/app/callback`
      : 'https://chepherd.org/app/callback',
  scope: 'openid profile email chepherd:rc',
  relayBaseUrl: 'https://relay.chepherd.org',
  relayWsUrl: 'wss://relay.chepherd.org/v1/signaling/ws',
  iceServers: [
    { urls: 'stun:stun.chepherd.org:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ],
  defaultMode: 'auto',
};

export function loadConfig(): ChepherdRuntimeConfig {
  const fromWindow =
    typeof window !== 'undefined' ? window.CHEPHERD_CONFIG ?? {} : {};
  return { ...DEFAULTS, ...fromWindow };
}
