import { describe, it, expect } from 'vitest';
import { computeObjectHash } from '../objectHash';

describe('computeObjectHash', () => {
  it('returns id when present', () => {
    expect(computeObjectHash({ id: 42, x: 1 })).toBe('42');
    expect(computeObjectHash({ _id: 'abc' })).toBe('abc');
    expect(computeObjectHash({ uuid: 'u' })).toBe('u');
    expect(computeObjectHash({ guid: 'g' })).toBe('g');
  });

  it('falls back to JSON.stringify when no id', () => {
    expect(computeObjectHash({ a: 1 })).toBe('{"a":1}');
  });

  it('handles primitives by combining JSON + index', () => {
    expect(computeObjectHash('foo', 3)).toBe('"foo"#3');
    expect(computeObjectHash(7)).toBe('7#0');
  });
});
