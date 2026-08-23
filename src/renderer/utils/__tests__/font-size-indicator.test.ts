/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showFontSizeIndicator } from '../font-size-indicator';

function anchorWithRect(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('showFontSizeIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the size centred over the anchor and hides it again', () => {
    showFontSizeIndicator(
      anchorWithRect({ left: 100, top: 50, width: 200, height: 400 }),
      16
    );

    const badge = document.querySelector('.font-size-indicator') as HTMLElement;
    expect(badge.textContent).toBe('16px');
    expect(badge.style.left).toBe('200px');
    expect(badge.style.top).toBe('250px');
    expect(badge.classList.contains('font-size-indicator--visible')).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(badge.classList.contains('font-size-indicator--visible')).toBe(
      false
    );
  });

  it('reuses one badge and restarts the timer on rapid changes', () => {
    const anchor = anchorWithRect({ width: 100, height: 100 });

    showFontSizeIndicator(anchor, 12);
    vi.advanceTimersByTime(700);
    showFontSizeIndicator(anchor, 13);
    vi.advanceTimersByTime(700);

    const badges = document.querySelectorAll('.font-size-indicator');
    expect(badges).toHaveLength(1);
    const badge = badges[0] as HTMLElement;
    expect(badge.textContent).toBe('13px');
    expect(badge.classList.contains('font-size-indicator--visible')).toBe(true);
  });

  it('does nothing without an anchor', () => {
    showFontSizeIndicator(null, 14);
    expect(document.querySelector('.font-size-indicator')).toBeNull();
  });
});
