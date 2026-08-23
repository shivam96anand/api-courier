/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BODY_FONT_SIZE_CHANGED_EVENT,
  clampBodyFontSize,
  getBodyFontSize,
  hydrateBodyFontSize,
  setBodyFontSize,
} from '../body-font-size';

const storeSet = vi.fn(() => Promise.resolve());

beforeEach(() => {
  storeSet.mockClear();
  (window as unknown as { restbro: unknown }).restbro = {
    store: { set: storeSet },
  };
});

describe('clampBodyFontSize', () => {
  it('clamps to the supported range and rounds', () => {
    expect(clampBodyFontSize(3)).toBe(8);
    expect(clampBodyFontSize(999)).toBe(28);
    expect(clampBodyFontSize(12.6)).toBe(13);
  });

  it('falls back to the default for non-numeric input', () => {
    expect(clampBodyFontSize(Number.NaN)).toBe(11);
  });
});

describe('hydrateBodyFontSize', () => {
  it('adopts the stored value and notifies without persisting', () => {
    const seen: number[] = [];
    document.addEventListener(BODY_FONT_SIZE_CHANGED_EVENT, (e) =>
      seen.push((e as CustomEvent).detail.fontSize)
    );

    hydrateBodyFontSize(16);

    expect(getBodyFontSize()).toBe(16);
    expect(seen).toEqual([16]);
    expect(storeSet).not.toHaveBeenCalled();
  });

  it('ignores a missing preference', () => {
    hydrateBodyFontSize(undefined);
    expect(getBodyFontSize()).toBe(16);
  });
});

describe('setBodyFontSize', () => {
  it('applies, notifies and persists', () => {
    const seen: number[] = [];
    document.addEventListener(BODY_FONT_SIZE_CHANGED_EVENT, (e) =>
      seen.push((e as CustomEvent).detail.fontSize)
    );

    setBodyFontSize(14);

    expect(getBodyFontSize()).toBe(14);
    expect(seen).toEqual([14]);
    expect(storeSet).toHaveBeenCalledWith({
      editorSettings: { bodyFontSize: 14 },
    });
  });

  it('is a no-op when the size does not change', () => {
    setBodyFontSize(14);
    expect(storeSet).not.toHaveBeenCalled();
  });
});
