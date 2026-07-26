/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { buildNotepadLayout } from '../notepad-layout';

function makeCallbacks() {
  return {
    onZoomOut: vi.fn(),
    onZoomIn: vi.fn(),
    onOpenFile: vi.fn(),
    onSave: vi.fn(),
    onTogglePreview: vi.fn(),
    onToggleSplit: vi.fn(),
    onFormatJson: vi.fn(),
    onSettingsClick: vi.fn(),
    onLanguageChange: vi.fn(),
    onFind: vi.fn(),
    onReplace: vi.fn(),
  };
}

describe('buildNotepadLayout', () => {
  it('builds the shell with two pane hosts and a divider', () => {
    const container = document.createElement('div');
    const els = buildNotepadLayout(container, makeCallbacks());

    expect(els.panesHost).toBeTruthy();
    expect(els.pane0Root).toBeTruthy();
    expect(els.pane1Root).toBeTruthy();
    expect(els.paneDivider).toBeTruthy();
    // The second pane and divider start hidden (single-pane by default).
    expect(els.pane1Root.classList.contains('hidden')).toBe(true);
    expect(els.paneDivider.classList.contains('hidden')).toBe(true);
  });

  it('exposes all status-bar and action elements', () => {
    const container = document.createElement('div');
    const els = buildNotepadLayout(container, makeCallbacks());

    for (const el of [
      els.statusFile,
      els.statusState,
      els.statusCursor,
      els.statusLines,
      els.statusChars,
      els.statusLanguage,
      els.statusSelection,
      els.statusEol,
      els.statusIndent,
      els.previewToggleBtn,
      els.formatJsonBtn,
      els.settingsBtn,
      els.splitBtn,
      els.languagePicker,
      els.contextMenu,
      els.settingsHost,
    ]) {
      expect(el).toBeTruthy();
    }
    expect(els.splitBtn.textContent).toBe('Split');
  });

  it('includes a "Move to Other View" context-menu action', () => {
    const container = document.createElement('div');
    buildNotepadLayout(container, makeCallbacks());
    const item = container.querySelector('[data-action="moveToOtherView"]');
    expect(item).toBeTruthy();
  });

  it('includes Close to the Left/Right context-menu actions', () => {
    const container = document.createElement('div');
    buildNotepadLayout(container, makeCallbacks());
    expect(container.querySelector('[data-action="closeLeft"]')).toBeTruthy();
    expect(container.querySelector('[data-action="closeRight"]')).toBeTruthy();
  });

  it('relocates Find/Replace/Format/language/zoom into the top-bar tools group', () => {
    const container = document.createElement('div');
    buildNotepadLayout(container, makeCallbacks());
    const tools = container.querySelector('.notepad-tools');
    expect(tools).toBeTruthy();
    for (const sel of [
      '#np-find',
      '#np-replace',
      '#np-format-json',
      '#np-status-language-picker',
      '#np-zoom-out',
      '#np-zoom-in',
    ]) {
      expect(tools?.querySelector(sel)).toBeTruthy();
    }
    // They should no longer live in the status bar.
    const statusBar = container.querySelector('.notepad-status-bar');
    expect(statusBar?.querySelector('#np-find')).toBeNull();
    expect(statusBar?.querySelector('#np-status-language-picker')).toBeNull();
  });

  it('wires the Split button to the toggle callback', () => {
    const container = document.createElement('div');
    const callbacks = makeCallbacks();
    const els = buildNotepadLayout(container, callbacks);
    els.splitBtn.click();
    expect(callbacks.onToggleSplit).toHaveBeenCalledTimes(1);
  });

  it('populates the language picker from the pickable languages', () => {
    const container = document.createElement('div');
    const els = buildNotepadLayout(container, makeCallbacks());
    expect(els.languagePicker.options.length).toBeGreaterThan(1);
  });
});
