import { describe, expect, it } from 'vitest';
import { shellEscape, buildCurlCommand, buildCurlParts } from '../curl-builder';
import { ApiRequest } from '../../../../shared/types';

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Test',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: {},
    ...overrides,
  };
}

describe('curl-builder.ts', () => {
  describe('shellEscape', () => {
    it('wraps value in single quotes', () => {
      expect(shellEscape('hello')).toBe("'hello'");
    });

    it('escapes single quotes within the value', () => {
      expect(shellEscape("it's")).toBe("'it'\\''s'");
    });

    it('handles empty string', () => {
      expect(shellEscape('')).toBe("''");
    });
  });

  describe('buildCurlParts', () => {
    it('returns URL and empty headers/body for a simple GET', () => {
      const { url, headerArgs, bodyArg } = buildCurlParts(
        makeRequest()
      );
      expect(url).toBe('https://api.example.com/users');
      expect(headerArgs).toEqual([]);
      expect(bodyArg).toBeUndefined();
    });

    it('includes request headers in headerArgs', () => {
      const { headerArgs } = buildCurlParts(
        makeRequest({
          headers: { 'X-Custom': 'value', Accept: 'application/json' },
        })
      );
      expect(headerArgs).toContain('X-Custom: value');
      expect(headerArgs).toContain('Accept: application/json');
    });

    it('includes body data for POST requests', () => {
      const { bodyArg } = buildCurlParts(
        makeRequest({
          method: 'POST',
          body: { type: 'json', content: '{"key":"value"}' },
        })
      );
      expect(bodyArg).toBe('{"key":"value"}');
    });

    it('appends query params to URL', () => {
      const { url } = buildCurlParts(
        makeRequest({
          params: { page: '1', limit: '10' },
        })
      );
      expect(url).toContain('page=1');
      expect(url).toContain('limit=10');
    });

    it('adds Content-Type header when body has a type', () => {
      const { headerArgs } = buildCurlParts(
        makeRequest({
          method: 'POST',
          body: { type: 'json', content: '{}' },
        })
      );
      expect(headerArgs.some((h) => h.startsWith('Content-Type:'))).toBe(true);
    });

    it('does not duplicate Content-Type if already in headers', () => {
      const { headerArgs } = buildCurlParts(
        makeRequest({
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: { type: 'json', content: '{}' },
        })
      );
      const ctHeaders = headerArgs.filter((h) =>
        h.toLowerCase().startsWith('content-type:')
      );
      expect(ctHeaders).toHaveLength(1);
      expect(ctHeaders[0]).toBe('Content-Type: text/plain');
    });
  });

  describe('buildCurlCommand', () => {
    it('builds a simple GET curl command', () => {
      const cmd = buildCurlCommand(makeRequest());
      expect(cmd).toContain('curl');
      expect(cmd).toContain('-X GET');
      expect(cmd).toContain("'https://api.example.com/users'");
    });

    it('builds a POST curl command with body', () => {
      const cmd = buildCurlCommand(
        makeRequest({
          method: 'POST',
          body: { type: 'json', content: '{"name":"John"}' },
        })
      );
      expect(cmd).toContain('-X POST');
      expect(cmd).toContain('--data-raw');
      expect(cmd).toContain('{"name":"John"}');
    });

    it('includes headers as -H flags', () => {
      const cmd = buildCurlCommand(
        makeRequest({
          headers: { Accept: 'application/json' },
        })
      );
      expect(cmd).toContain('-H');
      expect(cmd).toContain('Accept: application/json');
    });

    it('includes auth headers for bearer auth', () => {
      const cmd = buildCurlCommand(
        makeRequest({
          auth: { type: 'bearer', config: { token: 'mytoken' } },
        })
      );
      expect(cmd).toContain('Authorization: Bearer mytoken');
    });

    it('builds DELETE method correctly', () => {
      const cmd = buildCurlCommand(
        makeRequest({ method: 'DELETE' })
      );
      expect(cmd).toContain('-X DELETE');
    });
  });
});
