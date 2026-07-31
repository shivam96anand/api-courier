import { describe, expect, it } from 'vitest';
import {
  isSensitiveHeaderName,
  snippetContainsCredentials,
  redactSnippetCredentials,
} from '../redact-snippet';

describe('redact-snippet.ts — isSensitiveHeaderName', () => {
  it('recognises the common credential headers', () => {
    [
      'Authorization',
      'authorization',
      'Proxy-Authorization',
      'X-API-Key',
      'Api-Key',
      'Cookie',
    ].forEach((name) => expect(isSensitiveHeaderName(name)).toBe(true));
  });

  it('leaves ordinary headers alone', () => {
    ['Content-Type', 'Accept', 'User-Agent'].forEach((name) =>
      expect(isSensitiveHeaderName(name)).toBe(false)
    );
  });
});

describe('redact-snippet.ts — snippetContainsCredentials', () => {
  it('detects an Authorization header in a curl command', () => {
    expect(
      snippetContainsCredentials(
        `curl -X GET 'https://x' -H 'Authorization: Basic abc123'`
      )
    ).toBe(true);
  });

  it('detects an API key header in a fetch snippet', () => {
    expect(
      snippetContainsCredentials(`headers: { 'X-API-Key': 'secret' }`)
    ).toBe(true);
  });

  it('returns false for a snippet with no credentials', () => {
    expect(
      snippetContainsCredentials(
        `curl -X GET 'https://x' -H 'Accept: application/json'`
      )
    ).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(snippetContainsCredentials('')).toBe(false);
  });
});

describe('redact-snippet.ts — redactSnippetCredentials', () => {
  it('replaces a curl Authorization value', () => {
    const out = redactSnippetCredentials(
      `curl -X GET 'https://x' -H 'Authorization: Basic cG9zdG1hbjpwYXNz'`
    );
    expect(out).not.toContain('cG9zdG1hbjpwYXNz');
    expect(out).toContain('<REDACTED>');
    expect(out).toContain('Authorization');
  });

  it('leaves non-sensitive headers untouched', () => {
    const input = `curl -H 'Content-Type: application/json' 'https://x'`;
    expect(redactSnippetCredentials(input)).toBe(input);
  });

  it('redacts inside a JS object literal', () => {
    const out = redactSnippetCredentials(
      `headers: { 'Authorization': 'Bearer tok_live_123', 'Accept': 'application/json' }`
    );
    expect(out).not.toContain('tok_live_123');
    expect(out).toContain('application/json');
  });

  it('redacts a cookie header', () => {
    const out = redactSnippetCredentials(`-H 'Cookie: session=abc'`);
    expect(out).not.toContain('session=abc');
  });

  it('is a no-op for empty input', () => {
    expect(redactSnippetCredentials('')).toBe('');
  });
});
