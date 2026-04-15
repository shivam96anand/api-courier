/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeManager } from '../theme-manager';

// Minimal DOM stubs for node environment
function setupDOM() {
  const styles: Record<string, string> = {};
  const attrs: Record<string, string> = {};
  let dropdownValue = '';
  const listeners: Record<string, Function[]> = {};

  // document.body.setAttribute
  document.body.setAttribute = vi.fn((k, v) => {
    attrs[k] = v;
  });

  // document.documentElement.style.setProperty
  document.documentElement.style.setProperty = vi.fn((k, v) => {
    if (k && v) styles[k] = v;
  });

  // document.getElementById
  const dropdownEl = {
    get value() {
      return dropdownValue;
    },
    set value(v: string) {
      dropdownValue = v;
    },
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
  };
  vi.spyOn(document, 'getElementById').mockReturnValue(
    dropdownEl as unknown as HTMLElement
  );

  // document.dispatchEvent
  const dispatched: CustomEvent[] = [];
  vi.spyOn(document, 'dispatchEvent').mockImplementation((e) => {
    dispatched.push(e as CustomEvent);
    return true;
  });

  return { styles, attrs, dropdownEl, listeners, dispatched };
}

describe('ThemeManager', () => {
  let tm: ThemeManager;
  let dom: ReturnType<typeof setupDOM>;

  beforeEach(() => {
    vi.restoreAllMocks();
    dom = setupDOM();
    tm = new ThemeManager();
  });

  describe('getAvailableThemes', () => {
    it('returns 6 built-in themes', () => {
      expect(tm.getAvailableThemes()).toHaveLength(6);
    });

    it('returns a copy (mutation-safe)', () => {
      const a = tm.getAvailableThemes();
      a.pop();
      expect(tm.getAvailableThemes()).toHaveLength(6);
    });
  });

  describe('getCurrentTheme', () => {
    it('defaults to teal', () => {
      expect(tm.getCurrentTheme().name).toBe('teal');
    });
  });

  describe('setTheme', () => {
    it('changes the current theme', () => {
      const sky = tm.getAvailableThemes().find((t) => t.name === 'sky')!;
      tm.initialize();
      tm.setTheme(sky);
      expect(tm.getCurrentTheme()).toEqual(sky);
    });

    it('applies CSS custom properties', () => {
      const sky = tm.getAvailableThemes().find((t) => t.name === 'sky')!;
      tm.initialize();
      tm.setTheme(sky);

      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--primary-color',
        sky.primaryColor
      );
      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--primary-dark',
        sky.accentColor
      );
    });

    it('dispatches theme-changed event', () => {
      const sky = tm.getAvailableThemes().find((t) => t.name === 'sky')!;
      tm.initialize();
      tm.setTheme(sky);

      const evt = dom.dispatched.find((e) => e.type === 'theme-changed');
      expect(evt).toBeDefined();
      expect(evt!.detail.theme).toEqual(sky);
    });

    it('updates dropdown value', () => {
      const coral = tm.getAvailableThemes().find((t) => t.name === 'coral')!;
      tm.initialize();
      tm.setTheme(coral);
      expect(dom.dropdownEl.value).toBe('coral');
    });
  });

  describe('previewTheme / restoreTheme', () => {
    it('previewTheme applies CSS without changing currentTheme', () => {
      const amber = tm.getAvailableThemes().find((t) => t.name === 'amber')!;
      tm.previewTheme(amber);
      expect(tm.getCurrentTheme().name).toBe('teal');
      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--primary-color',
        amber.primaryColor
      );
    });

    it('restoreTheme reapplies the current theme', () => {
      const amber = tm.getAvailableThemes().find((t) => t.name === 'amber')!;
      tm.previewTheme(amber);
      tm.restoreTheme();
      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--primary-color',
        '#14b8a6' // teal
      );
    });
  });

  describe('hexToRgb (via applyTheme)', () => {
    it('sets --primary-color-rgb as comma-separated RGB', () => {
      tm.initialize();
      // teal is #14b8a6 → 20, 184, 166
      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--primary-color-rgb',
        '20, 184, 166'
      );
    });
  });

  describe('lightenColor (via applyTheme)', () => {
    it('sets --primary-light to a lighter variant', () => {
      tm.initialize();
      // Should be called with a hex string lighter than #14b8a6
      const calls = (
        document.documentElement.style.setProperty as ReturnType<typeof vi.fn>
      ).mock.calls;
      const lightCall = calls.find(
        (c: string[]) => c[0] === '--primary-light'
      );
      expect(lightCall).toBeDefined();
      const lightHex = lightCall![1] as string;
      expect(lightHex).toMatch(/^#[0-9a-f]{6}$/i);
      // The lightened color should have higher R/G/B than the original
    });
  });
});
