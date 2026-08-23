/**
 * @vitest-environment jsdom
 *
 * Regression: the store's default theme is `blue`, which is not one of the six
 * built-in themes. Applying it left the app on an accent colour the user could
 * not re-select and put an out-of-range value in the settings dropdown.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeManager } from '../theme-manager';
import { AppTheme } from '../../../shared/types';

function mountDropdown(): HTMLSelectElement {
  document.body.innerHTML = '';
  const select = document.createElement('select');
  select.id = 'theme-dropdown';
  for (const name of ['teal', 'sky', 'emerald', 'amber', 'coral', 'magenta']) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
  document.body.appendChild(select);
  return select;
}

describe('ThemeManager with an unknown persisted theme', () => {
  let tm: ThemeManager;
  let dropdown: HTMLSelectElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    dropdown = mountDropdown();
    tm = new ThemeManager();
    tm.initialize();
  });

  it('falls back to a built-in theme for the legacy "blue" default', () => {
    tm.setTheme({
      name: 'blue',
      primaryColor: '#2563eb',
      accentColor: '#1d4ed8',
    });

    expect(tm.getCurrentTheme().name).toBe('teal');
    expect(document.body.getAttribute('data-theme')).toBe('teal');
    expect(dropdown.value).toBe('teal');
  });

  it('falls back when the stored theme is missing entirely', () => {
    tm.setTheme(undefined as unknown as AppTheme);
    expect(tm.getCurrentTheme().name).toBe('teal');
    expect(dropdown.value).toBe('teal');
  });

  it('uses the built-in definition even if stored colours drifted', () => {
    tm.setTheme({
      name: 'sky',
      primaryColor: '#000000',
      accentColor: '#000000',
    });
    expect(tm.getCurrentTheme().primaryColor).toBe('#38bdf8');
  });

  it('still honours a valid theme', () => {
    const coral = tm.getAvailableThemes().find((t) => t.name === 'coral')!;
    tm.setTheme(coral);
    expect(tm.getCurrentTheme()).toEqual(coral);
    expect(dropdown.value).toBe('coral');
  });
});
