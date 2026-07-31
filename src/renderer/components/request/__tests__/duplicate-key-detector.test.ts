import { describe, expect, it } from 'vitest';
import { findShadowedRowIndexes } from '../editors/duplicate-key-detector';

const row = (key: string, enabled = true) => ({ key, enabled });

describe('duplicate-key-detector.ts — findShadowedRowIndexes', () => {
  it('returns nothing when all keys are unique', () => {
    const result = findShadowedRowIndexes([row('Accept'), row('Content-Type')]);
    expect(result.size).toBe(0);
  });

  it('shadows every duplicate except the last', () => {
    const result = findShadowedRowIndexes([
      row('Content-Type'),
      row('Accept'),
      row('Content-Type'),
    ]);
    expect(Array.from(result)).toEqual([0]);
  });

  it('compares keys case-insensitively', () => {
    const result = findShadowedRowIndexes([
      row('content-type'),
      row('Content-Type'),
    ]);
    expect(Array.from(result)).toEqual([0]);
  });

  it('ignores whitespace around keys', () => {
    const result = findShadowedRowIndexes([row('  Accept '), row('Accept')]);
    expect(Array.from(result)).toEqual([0]);
  });

  it('ignores disabled rows entirely', () => {
    const result = findShadowedRowIndexes([
      row('Accept', false),
      row('Accept', true),
    ]);
    expect(result.size).toBe(0);
  });

  it('ignores blank keys', () => {
    const result = findShadowedRowIndexes([row(''), row(''), row('   ')]);
    expect(result.size).toBe(0);
  });

  it('handles three or more duplicates', () => {
    const result = findShadowedRowIndexes([
      row('X'),
      row('X'),
      row('X'),
      row('Y'),
    ]);
    expect(Array.from(result).sort()).toEqual([0, 1]);
  });
});
