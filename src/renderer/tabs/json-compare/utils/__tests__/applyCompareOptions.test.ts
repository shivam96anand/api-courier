import { describe, it, expect } from 'vitest';
import {
  sortKeysDeep,
  lowerStringsDeep,
  collapseWhitespaceDeep,
  applyCompareOptions,
} from '../applyCompareOptions';

describe('applyCompareOptions helpers', () => {
  describe('sortKeysDeep', () => {
    it('sorts top-level object keys', () => {
      expect(sortKeysDeep({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
    });
    it('sorts nested object keys recursively', () => {
      const input = { z: { y: 1, x: 2 }, a: [{ d: 0, c: 1 }] };
      expect(sortKeysDeep(input)).toEqual({
        a: [{ c: 1, d: 0 }],
        z: { x: 2, y: 1 },
      });
    });
    it('preserves arrays order', () => {
      expect(sortKeysDeep([3, 1, 2])).toEqual([3, 1, 2]);
    });
    it('passes primitives through', () => {
      expect(sortKeysDeep('x')).toBe('x');
      expect(sortKeysDeep(null)).toBeNull();
    });
  });

  describe('lowerStringsDeep', () => {
    it('lowercases strings, leaves numbers/bools alone', () => {
      expect(lowerStringsDeep({ a: 'HELLO', b: 5, c: true })).toEqual({
        a: 'hello',
        b: 5,
        c: true,
      });
    });
    it('recurses into arrays', () => {
      expect(lowerStringsDeep(['Foo', 'BAR'])).toEqual(['foo', 'bar']);
    });
  });

  describe('collapseWhitespaceDeep', () => {
    it('collapses interior whitespace and trims', () => {
      expect(collapseWhitespaceDeep('  a   b  c  ')).toBe('a b c');
    });
    it('does not touch non-strings', () => {
      expect(collapseWhitespaceDeep({ n: 5 })).toEqual({ n: 5 });
    });
  });

  describe('applyCompareOptions', () => {
    it('returns input unchanged when no options', () => {
      const v = { b: 'X', a: 1 };
      expect(applyCompareOptions(v, undefined)).toBe(v);
    });
    it('applies options in order: ws → case → sort', () => {
      const out = applyCompareOptions(
        { B: 'HE  LLO', A: 1 },
        {
          sortKeys: true,
          caseInsensitive: true,
          ignoreStringWhitespace: true,
        }
      );
      // Object key order matters for "sortKeys"
      expect(Object.keys(out as object)).toEqual(['A', 'B']);
      expect((out as Record<string, unknown>).B).toBe('he llo');
    });
  });
});
