import { describe, expect, it } from 'vitest';
import { formatOAuthError, formatOAuthErrorText } from '../oauth-error-format';

describe('formatOAuthError', () => {
  it('turns an RFC 6749 JSON error body into readable copy', () => {
    const result = formatOAuthError(
      'Token request failed: 401 Unauthorized - {"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}'
    );

    expect(result.title).toBe('Client is not allowed to use this grant');
    expect(result.detail).toBe(
      'HTTP 401 · Invalid client or Invalid client credentials'
    );
    expect(result.hint).toContain('Client ID');
    expect(JSON.stringify(result)).not.toContain('{"error"');
  });

  it('maps invalid_client to a credentials hint', () => {
    const result = formatOAuthError(
      'Token request failed: 401 Unauthorized - {"error":"invalid_client"}'
    );

    expect(result.title).toBe('Client authentication failed');
    expect(result.detail).toBe('HTTP 401');
    expect(result.hint).toBeTruthy();
  });

  it('strips a leading "Error: " prefix added by callers', () => {
    const result = formatOAuthError(
      'Error: Token request failed: 400 Bad Request - {"error":"invalid_grant","error_description":"Refresh token expired"}'
    );

    expect(result.title).toBe('Authorization grant is invalid or expired');
    expect(result.detail).toBe('HTTP 400 · Refresh token expired');
  });

  it('humanizes unknown OAuth error codes', () => {
    const result = formatOAuthError(
      'Token request failed: 400 Bad Request - {"error":"invalid_target","error_description":"Unknown audience"}'
    );

    expect(result.title).toBe('Invalid target');
    expect(result.detail).toBe('HTTP 400 · Unknown audience');
  });

  it('falls back to status-code copy when there is no OAuth error code', () => {
    const result = formatOAuthError('Token request failed: 404 Not Found - ');

    expect(result.title).toBe('Token URL not found');
    expect(result.hint).toContain('Token URL');
  });

  it('never renders raw HTML error pages', () => {
    const result = formatOAuthError(
      'Token request failed: 500 Internal Server Error - <html><head><title>Gateway failure</title></head><body><h1>Oops</h1></body></html>'
    );

    expect(result.detail).toBe('HTTP 500 · Gateway failure');
    expect(result.detail).not.toContain('<');
  });

  it('truncates very long plain-text bodies', () => {
    const result = formatOAuthError(
      `Token request failed: 400 Bad Request - ${'x'.repeat(1000)}`
    );

    expect(result.detail?.length).toBeLessThan(340);
    expect(result.detail?.endsWith('…')).toBe(true);
  });

  it('handles the "OAuth error: code - description" shape', () => {
    const result = formatOAuthError(
      'OAuth error: invalid_scope - Scope "admin" is not allowed'
    );

    expect(result.title).toBe('The requested scope is invalid');
    expect(result.detail).toBe('Scope "admin" is not allowed');
  });

  it('explains DNS failures without exposing the error code', () => {
    const result = formatOAuthError(
      'request to https://auth.example.com failed, reason: getaddrinfo ENOTFOUND auth.example.com'
    );

    expect(result.title).toBe('Cannot reach the authorization server');
    expect(result.hint).toContain('VPN');
  });

  it('explains connection refused and timeouts', () => {
    expect(formatOAuthError('connect ECONNREFUSED 127.0.0.1:8080').title).toBe(
      'Connection refused by the authorization server'
    );
    expect(formatOAuthError('connect ETIMEDOUT 10.0.0.1:443').title).toBe(
      'The authorization server timed out'
    );
  });

  it('reports user cancellation without a hint', () => {
    const result = formatOAuthError('OAuth token request cancelled by user');

    expect(result.title).toBe('Token request cancelled');
    expect(result.hint).toBeUndefined();
  });

  it('keeps arbitrary messages intact', () => {
    expect(
      formatOAuthError('Failed to obtain OAuth token. Check the config.').title
    ).toBe('Failed to obtain OAuth token. Check the config.');
  });

  it('handles empty, non-string and Error inputs', () => {
    expect(formatOAuthError('').title).toBe('Token request failed');
    expect(formatOAuthError(undefined).title).toBe('Token request failed');
    expect(
      formatOAuthError(new Error('OAuth error: server_error -')).title
    ).toBe('The authorization server hit an internal error');
  });
});

describe('formatOAuthErrorText', () => {
  it('joins the parts into a single line', () => {
    const text = formatOAuthErrorText(
      'Token request failed: 401 Unauthorized - {"error":"invalid_client","error_description":"Bad client credentials"}'
    );

    expect(text).toContain('Client authentication failed');
    expect(text).toContain('Bad client credentials');
    expect(text).not.toContain('{');
  });
});
