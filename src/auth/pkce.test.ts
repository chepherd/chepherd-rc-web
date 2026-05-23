import { describe, it, expect } from 'vitest';
import {
  base64UrlEncode,
  newCodeVerifier,
  codeChallengeFromVerifier,
  newStateNonce,
} from './pkce';

describe('PKCE', () => {
  it('base64UrlEncode produces URL-safe output', () => {
    const out = base64UrlEncode(new Uint8Array([0, 1, 2, 250, 251, 252]));
    expect(out).not.toMatch(/[+/=]/);
  });

  it('newCodeVerifier produces ≥43 chars (RFC 7636)', () => {
    for (let i = 0; i < 10; i += 1) {
      const v = newCodeVerifier();
      expect(v.length).toBeGreaterThanOrEqual(43);
      expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('codeChallengeFromVerifier matches RFC 7636 test vector', async () => {
    // Test vector from RFC 7636 Appendix B.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const got = await codeChallengeFromVerifier(verifier);
    expect(got).toBe(expected);
  });

  it('newStateNonce produces a non-empty URL-safe string', () => {
    const s = newStateNonce();
    expect(s.length).toBeGreaterThanOrEqual(16);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
