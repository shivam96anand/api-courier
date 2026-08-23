/**
 * Regression test: a regex mock route with nested quantifiers used to backtrack
 * catastrophically. Because the mock server runs on the Electron main process,
 * a single crafted request path froze the whole app for minutes (140s measured
 * for `^(a+)+$` against 40 chars).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { matchPath, isRedosProne } from '../mock-server-utils';

describe('isRedosProne', () => {
  it.each([
    '^(a+)+$',
    '(a*)*',
    '([a-z]+)+',
    '(\\d+)*',
    '^(\\w+\\s?)+$',
    '(([a-z])+.)+[A-Z]([a-z])+',
  ])('flags nested quantifier pattern %s', (pattern) => {
    expect(isRedosProne(pattern)).toBe(true);
  });

  it.each([
    '^/api/users/\\d+$',
    '^/v1/[a-z-]+/\\d{1,10}$',
    '^/files/.*$',
    '(cat|dog)s?',
    '^/a(b)?c$',
    '^/x[+*]y$',
  ])('allows safe pattern %s', (pattern) => {
    expect(isRedosProne(pattern)).toBe(false);
  });
});

describe('matchPath — regex routes', () => {
  const warn = vi.spyOn(console, 'warn');

  beforeEach(() => {
    warn.mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockReset();
  });

  it('returns quickly instead of hanging on a catastrophic pattern', () => {
    const start = Date.now();
    const result = matchPath('^(a+)+$', `${'a'.repeat(60)}b`, 'regex');
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result).toBe(false);
  });

  it('falls back to exact match for a refused pattern', () => {
    expect(matchPath('^(x+)+$', '^(x+)+$', 'regex')).toBe(true);
  });

  it('warns once so the user can see the route was refused', () => {
    matchPath('^(z+)+$', '/anything', 'regex');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Refusing unsafe regex route')
    );
  });

  it('still matches ordinary regex routes', () => {
    expect(matchPath('^/api/users/\\d+$', '/api/users/42', 'regex')).toBe(true);
    expect(matchPath('^/api/users/\\d+$', '/api/users/abc', 'regex')).toBe(
      false
    );
  });

  it('ignores absurdly long request paths', () => {
    expect(matchPath('^/.*$', `/${'a'.repeat(5000)}`, 'regex')).toBe(false);
    expect(matchPath('^/.*$', '/short', 'regex')).toBe(true);
  });

  it('keeps falling back to exact match for an invalid pattern', () => {
    expect(matchPath('[invalid', '[invalid', 'regex')).toBe(true);
    expect(matchPath('[invalid', '/other', 'regex')).toBe(false);
  });
});
