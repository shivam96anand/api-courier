import { describe, it, expect } from 'vitest';
import { buildIgnoreMatcher, normalizeIgnorePatterns } from '../pathMatcher';

describe('pathMatcher', () => {
  it('normalizes patterns and skips empty/comments', () => {
    expect(normalizeIgnorePatterns(['', '  ', '# comment', '/foo'])).toEqual([
      '/foo',
    ]);
  });

  it('returns false for everything when no patterns', () => {
    const m = buildIgnoreMatcher([]);
    expect(m('/users/0/name')).toBe(false);
  });

  it('matches exact paths', () => {
    const m = buildIgnoreMatcher(['/etag']);
    expect(m('/etag')).toBe(true);
    expect(m('/etagX')).toBe(false);
  });

  it('* matches a single segment', () => {
    const m = buildIgnoreMatcher(['/users/*/createdAt']);
    expect(m('/users/0/createdAt')).toBe(true);
    expect(m('/users/abc/createdAt')).toBe(true);
    expect(m('/users/0/1/createdAt')).toBe(false);
  });

  it('** matches any number of segments', () => {
    const m = buildIgnoreMatcher(['/audit/**']);
    expect(m('/audit/a')).toBe(true);
    expect(m('/audit/a/b/c')).toBe(true);
    expect(m('/auditx')).toBe(false);
  });

  it('accepts patterns without leading slash', () => {
    const m = buildIgnoreMatcher(['etag']);
    expect(m('/etag')).toBe(true);
  });

  it('escapes regex special chars in literal segments', () => {
    const m = buildIgnoreMatcher(['/a.b']);
    expect(m('/a.b')).toBe(true);
    expect(m('/aXb')).toBe(false);
  });
});
