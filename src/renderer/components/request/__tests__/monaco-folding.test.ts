import { describe, it, expect, vi } from 'vitest';
import { resetFoldingRanges } from '../monaco-folding';

describe('resetFoldingRanges', () => {
  it('toggles folding off then on so Monaco rebuilds the folding model', () => {
    const updateOptions = vi.fn();
    resetFoldingRanges({ updateOptions } as never);

    expect(updateOptions.mock.calls).toEqual([
      [{ folding: false }],
      [{ folding: true }],
    ]);
  });
});
