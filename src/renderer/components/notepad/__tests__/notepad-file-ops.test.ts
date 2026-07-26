/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// saveTab imports notepad-editor (which pulls in the browser-only monaco-editor
// package). The no-op / dirty paths under test never touch Monaco, so stub the
// editor helpers to keep monaco-editor out of the test module graph.
vi.mock('../notepad-editor', () => ({
  ensureFinalNewline: (s: string) => s,
  trimTrailingWhitespace: (s: string) => s,
  formatDocument: vi.fn(),
}));

import { NotepadStore } from '../notepad-store';
import { saveTab, FileOperationsContext } from '../notepad-file-ops';
import type { NotepadTab } from '../../../../shared/types';

describe('saveTab', () => {
  let store: NotepadStore;
  let saveFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveFile = vi.fn().mockResolvedValue({ ok: true, filePath: '/tmp/a.txt' });
    (window as any).restbro = {
      store: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
      notepad: { saveFile },
    };
    store = new NotepadStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).restbro;
  });

  function ctxFor(tab: NotepadTab): FileOperationsContext {
    return {
      store,
      getEditorValue: () => tab.content,
      getActiveTabId: () => store.getActiveTab()?.id,
      loadActiveTabIntoEditor: vi.fn(),
      getEditor: () => null,
      getToastHost: () => document.createElement('div'),
      flushPendingContent: vi.fn(),
    };
  }

  it('is a no-op (no disk write) for an unchanged, already-saved tab', async () => {
    const tab = store.createTab({ content: 'hello' });
    store.markSaved(tab.id, '/tmp/a.txt'); // clean + has filePath
    const saved = store.getActiveTab() as NotepadTab;

    const result = await saveTab(ctxFor(saved), saved, false);

    expect(result).toBe(true);
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('still writes to disk when the tab is dirty', async () => {
    const tab = store.createTab({ content: 'hello' });
    store.markSaved(tab.id, '/tmp/a.txt');
    store.updateContent(tab.id, 'changed'); // now dirty
    const dirty = store.getActiveTab() as NotepadTab;

    await saveTab(ctxFor(dirty), dirty, false);

    expect(saveFile).toHaveBeenCalledTimes(1);
  });

  it('always writes on Save As even when the tab is unchanged', async () => {
    const tab = store.createTab({ content: 'hello' });
    store.markSaved(tab.id, '/tmp/a.txt');
    const saved = store.getActiveTab() as NotepadTab;

    await saveTab(ctxFor(saved), saved, true); // forceSaveAs

    expect(saveFile).toHaveBeenCalledTimes(1);
  });
});
