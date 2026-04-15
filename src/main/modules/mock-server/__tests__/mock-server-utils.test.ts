import { describe, expect, it } from 'vitest';
import {
  redactHeaders,
  delay,
  matchPath,
  getMatchSpecificity,
} from '../mock-server-utils';

describe('mock-server-utils.ts', () => {
  describe('redactHeaders', () => {
    it('redacts authorization header', () => {
      expect(
        redactHeaders({ Authorization: 'Bearer secret123' })
      ).toEqual({ Authorization: '[REDACTED]' });
    });

    it('redacts headers containing "token" (case-insensitive)', () => {
      expect(
        redactHeaders({ 'X-Auth-Token': 'abc', 'api-token': 'def' })
      ).toEqual({
        'X-Auth-Token': '[REDACTED]',
        'api-token': '[REDACTED]',
      });
    });

    it('redacts headers containing "secret"', () => {
      expect(redactHeaders({ 'X-Client-Secret': 'hidden' })).toEqual({
        'X-Client-Secret': '[REDACTED]',
      });
    });

    it('preserves non-sensitive headers', () => {
      expect(
        redactHeaders({
          'Content-Type': 'application/json',
          Accept: 'text/html',
        })
      ).toEqual({
        'Content-Type': 'application/json',
        Accept: 'text/html',
      });
    });

    it('handles empty headers object', () => {
      expect(redactHeaders({})).toEqual({});
    });

    it('handles mixed sensitive and non-sensitive headers', () => {
      const result = redactHeaders({
        'Content-Type': 'application/json',
        authorization: 'Basic abc',
        'X-Request-Id': '123',
      });
      expect(result).toEqual({
        'Content-Type': 'application/json',
        authorization: '[REDACTED]',
        'X-Request-Id': '123',
      });
    });
  });

  describe('delay', () => {
    it('returns a promise that resolves', async () => {
      await expect(delay(0)).resolves.toBeUndefined();
    });
  });

  describe('matchPath — exact', () => {
    it('matches identical paths', () => {
      expect(matchPath('/api/users', '/api/users', 'exact')).toBe(true);
    });

    it('does not match different paths', () => {
      expect(matchPath('/api/users', '/api/posts', 'exact')).toBe(false);
    });

    it('is the default match type', () => {
      expect(matchPath('/api/users', '/api/users')).toBe(true);
      expect(matchPath('/api/users', '/api/posts')).toBe(false);
    });
  });

  describe('matchPath — prefix', () => {
    it('matches when request starts with route path', () => {
      expect(matchPath('/api', '/api/users', 'prefix')).toBe(true);
    });

    it('does not match when prefix does not match', () => {
      expect(matchPath('/web', '/api/users', 'prefix')).toBe(false);
    });

    it('supports trailing wildcard in route path', () => {
      expect(matchPath('/api/*', '/api/users', 'prefix')).toBe(true);
      expect(matchPath('/api/*', '/api/users/123', 'prefix')).toBe(true);
    });
  });

  describe('matchPath — wildcard', () => {
    it('matches * for a single path segment', () => {
      expect(matchPath('/api/*/details', '/api/users/details', 'wildcard')).toBe(true);
    });

    it('does not match * across multiple segments', () => {
      expect(matchPath('/api/*/details', '/api/users/123/details', 'wildcard')).toBe(false);
    });

    it('matches ** for multiple path segments', () => {
      expect(matchPath('/api/**', '/api/users/123/details', 'wildcard')).toBe(true);
    });

    it('matches ** in the middle of a pattern', () => {
      expect(matchPath('/api/**/end', '/api/a/b/c/end', 'wildcard')).toBe(true);
    });

    it('does not match when pattern does not align', () => {
      expect(matchPath('/api/users', '/web/users', 'wildcard')).toBe(false);
    });
  });

  describe('matchPath — regex', () => {
    it('matches a regex pattern', () => {
      expect(matchPath('^/api/users/\\d+$', '/api/users/123', 'regex')).toBe(true);
    });

    it('does not match when regex fails', () => {
      expect(matchPath('^/api/users/\\d+$', '/api/users/abc', 'regex')).toBe(false);
    });

    it('falls back to exact match for invalid regex', () => {
      expect(matchPath('[invalid', '[invalid', 'regex')).toBe(true);
      expect(matchPath('[invalid', '/other', 'regex')).toBe(false);
    });
  });

  describe('getMatchSpecificity', () => {
    it('gives exact matches the highest base priority', () => {
      const exact = getMatchSpecificity('/api/users', 'exact');
      const prefix = getMatchSpecificity('/api/users', 'prefix');
      const wildcard = getMatchSpecificity('/api/users', 'wildcard');
      const regex = getMatchSpecificity('/api/users', 'regex');

      expect(exact).toBeGreaterThan(prefix);
      expect(prefix).toBeGreaterThan(wildcard);
      expect(wildcard).toBeGreaterThan(regex);
    });

    it('increases score with more path segments for exact', () => {
      expect(getMatchSpecificity('/api/users/details', 'exact')).toBeGreaterThan(
        getMatchSpecificity('/api/users', 'exact')
      );
    });

    it('reduces wildcard score for wildcards in pattern', () => {
      expect(getMatchSpecificity('/api/users', 'wildcard')).toBeGreaterThan(
        getMatchSpecificity('/api/*', 'wildcard')
      );
    });

    it('returns 0 for unknown matchType', () => {
      const unknown = getMatchSpecificity('/api', 'unknown' as any);
      expect(unknown).toBe(0);
    });
  });
});
