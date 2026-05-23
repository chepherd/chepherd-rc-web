// PKCE (Proof Key for Code Exchange) — RFC 7636.
//
// Used for the OAuth2 authorization-code flow without a client secret,
// which is mandatory for browser SPAs that cannot keep a secret.

const CODE_VERIFIER_BYTES = 32; // RFC 7636 recommends 32-96 bytes.

/** Base64url-encode a byte array per RFC 7636 §4.1. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/** Generate a cryptographically-random code_verifier per RFC 7636 §4.1. */
export function newCodeVerifier(): string {
  const buf = new Uint8Array(CODE_VERIFIER_BYTES);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

/** Derive the code_challenge from the verifier per RFC 7636 §4.2 (S256). */
export async function codeChallengeFromVerifier(
  verifier: string,
): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/** Random URL-safe nonce — used as the OAuth2 `state` param. */
export function newStateNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}
