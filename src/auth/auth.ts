// OAuth2 authorization-code flow with PKCE (RFC 6749 + RFC 7636).
//
// chepherd-rc-web is a browser SPA that cannot keep a client secret, so
// PKCE is mandatory. The identity provider is OpenOva's identity-svc
// (Keycloak-backed). The resulting access_token + refresh_token are
// stored in sessionStorage (cleared on browser close, NOT localStorage)
// — refresh on every page load via the refresh_token.

import {
  newCodeVerifier,
  codeChallengeFromVerifier,
  newStateNonce,
} from './pkce';

export interface AuthConfig {
  /** Identity provider base URL, e.g. https://id.openova.io. */
  idpBaseUrl: string;
  /** OAuth2 client_id registered with the IdP. */
  clientId: string;
  /** Exact registered redirect_uri, e.g. https://chepherd.org/app/callback. */
  redirectUri: string;
  /** Space-separated OAuth2 scopes. */
  scope: string;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  id_token?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

const SS_VERIFIER = 'chepherd_pkce_verifier';
const SS_STATE = 'chepherd_pkce_state';
const SS_TOKENS = 'chepherd_tokens';

/** Begin the auth flow — redirects the browser to the IdP. */
export async function beginLogin(cfg: AuthConfig): Promise<void> {
  const verifier = newCodeVerifier();
  const challenge = await codeChallengeFromVerifier(verifier);
  const state = newStateNonce();
  sessionStorage.setItem(SS_VERIFIER, verifier);
  sessionStorage.setItem(SS_STATE, state);

  const url = new URL(`${cfg.idpBaseUrl}/realms/openova/protocol/openid-connect/auth`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(url.toString());
}

/** Complete the auth flow at the callback URL. Idempotent: returns the same
 *  tokens if called twice within one session. */
export async function completeLogin(cfg: AuthConfig): Promise<TokenSet> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = sessionStorage.getItem(SS_STATE);
  const verifier = sessionStorage.getItem(SS_VERIFIER);
  if (!code || !state || !expectedState || !verifier) {
    throw new Error('auth: missing OAuth2 params');
  }
  if (state !== expectedState) {
    throw new Error('auth: state mismatch (possible CSRF)');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  const res = await fetch(
    `${cfg.idpBaseUrl}/realms/openova/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`auth: token exchange failed ${res.status}`);
  }
  const tok = (await res.json()) as TokenResponse;
  const tokens: TokenSet = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + tok.expires_in - 30,
    id_token: tok.id_token,
  };
  sessionStorage.setItem(SS_TOKENS, JSON.stringify(tokens));
  sessionStorage.removeItem(SS_VERIFIER);
  sessionStorage.removeItem(SS_STATE);
  return tokens;
}

/** Return the cached token set, or null if not signed in. */
export function getTokens(): TokenSet | null {
  const raw = sessionStorage.getItem(SS_TOKENS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

/** Return a still-valid access token, refreshing transparently if needed. */
export async function getValidAccessToken(
  cfg: AuthConfig,
): Promise<string | null> {
  const tok = getTokens();
  if (!tok) return null;
  if (tok.expires_at > Math.floor(Date.now() / 1000)) {
    return tok.access_token;
  }
  // Refresh.
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tok.refresh_token,
    client_id: cfg.clientId,
  });
  const res = await fetch(
    `${cfg.idpBaseUrl}/realms/openova/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  if (!res.ok) {
    sessionStorage.removeItem(SS_TOKENS);
    return null;
  }
  const fresh = (await res.json()) as TokenResponse;
  const updated: TokenSet = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + fresh.expires_in - 30,
    id_token: fresh.id_token,
  };
  sessionStorage.setItem(SS_TOKENS, JSON.stringify(updated));
  return updated.access_token;
}

/** Clear local tokens. */
export function signOut(): void {
  sessionStorage.removeItem(SS_TOKENS);
  sessionStorage.removeItem(SS_VERIFIER);
  sessionStorage.removeItem(SS_STATE);
}
