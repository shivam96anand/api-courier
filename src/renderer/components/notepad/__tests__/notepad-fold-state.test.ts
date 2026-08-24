import { describe, it, expect } from 'vitest';
import { stripRecoveredFolds } from '../notepad-fold-state';

const folding = (regions: unknown): Record<string, unknown> => ({
  cursorState: [],
  contributionsState: {
    'editor.contrib.folding': {
      collapsedRegions: regions,
      lineCount: 569,
      provider: 'syntax',
    },
  },
});

describe('stripRecoveredFolds', () => {
  it('drops recovered ranges and keeps provider + user-defined ones', () => {
    const state = folding([
      { startLineNumber: 4, endLineNumber: 64, isCollapsed: true, source: 0 },
      { startLineNumber: 65, endLineNumber: 177, isCollapsed: true, source: 2 },
      { startLineNumber: 70, endLineNumber: 88, isCollapsed: true, source: 1 },
    ]);

    const result = stripRecoveredFolds(state) as ReturnType<typeof folding>;
    const contributions = result.contributionsState as Record<string, unknown>;
    const next = contributions['editor.contrib.folding'] as Record<
      string,
      unknown
    >;

    expect(next.collapsedRegions).toEqual([
      { startLineNumber: 4, endLineNumber: 64, isCollapsed: true, source: 0 },
      { startLineNumber: 70, endLineNumber: 88, isCollapsed: true, source: 1 },
    ]);
    expect(next.lineCount).toBe(569);
    expect(next.provider).toBe('syntax');
  });

  it('leaves the state untouched when nothing is recovered', () => {
    const state = folding([{ startLineNumber: 4, endLineNumber: 64 }]);
    expect(stripRecoveredFolds(state)).toBe(state);
  });

  it('does not mutate the persisted state', () => {
    const state = folding([{ startLineNumber: 65, source: 2 }]);
    stripRecoveredFolds(state);
    const contributions = state.contributionsState as Record<string, unknown>;
    const original = contributions['editor.contrib.folding'] as Record<
      string,
      unknown
    >;
    expect(original.collapsedRegions).toHaveLength(1);
  });

  it('passes through malformed or missing folding state', () => {
    expect(stripRecoveredFolds(undefined)).toBeUndefined();
    expect(stripRecoveredFolds('nope')).toBe('nope');
    expect(stripRecoveredFolds({})).toEqual({});
    const noRegions = folding(undefined);
    expect(stripRecoveredFolds(noRegions)).toBe(noRegions);
  });
});
