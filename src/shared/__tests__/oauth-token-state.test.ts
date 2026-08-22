import { describe, expect, it } from 'vitest';
import {
  OAUTH_TOKEN_REFRESH_SKEW_MS,
  canReuseOAuthToken,
  getOAuthTokenState,
} from '../oauth-token-state';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');

function at(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

describe('oauth-token-state', () => {
  it('reports missing when there is no access token', () => {
    expect(getOAuthTokenState(undefined, { now: NOW })).toBe('missing');
    expect(getOAuthTokenState({}, { now: NOW })).toBe('missing');
    expect(getOAuthTokenState({ accessToken: '' }, { now: NOW })).toBe(
      'missing'
    );
  });

  it('reuses a token that has no expiry', () => {
    expect(getOAuthTokenState({ accessToken: 'tok' }, { now: NOW })).toBe(
      'reusable'
    );
  });

  it('reuses a token whose expiry cannot be parsed', () => {
    expect(
      getOAuthTokenState(
        { accessToken: 'tok', expiresAt: 'not-a-date' },
        { now: NOW }
      )
    ).toBe('reusable');
  });

  it('reuses a token that is comfortably in the future', () => {
    expect(
      getOAuthTokenState(
        { accessToken: 'tok', expiresAt: at(3600_000) },
        { now: NOW }
      )
    ).toBe('reusable');
  });

  it('reuses a short-lived token that was just issued', () => {
    // expires_in=300 used to fall inside a 5-minute skew, so every send minted
    // a brand new token.
    expect(
      canReuseOAuthToken(
        { accessToken: 'tok', expiresAt: at(300_000) },
        { now: NOW }
      )
    ).toBe(true);
  });

  it('marks a token inside the skew window as expiring', () => {
    expect(
      getOAuthTokenState(
        { accessToken: 'tok', expiresAt: at(OAUTH_TOKEN_REFRESH_SKEW_MS - 1) },
        { now: NOW }
      )
    ).toBe('expiring');
  });

  it('marks a past expiry as expired', () => {
    expect(
      getOAuthTokenState(
        { accessToken: 'tok', expiresAt: at(-1) },
        { now: NOW }
      )
    ).toBe('expired');
  });
});
