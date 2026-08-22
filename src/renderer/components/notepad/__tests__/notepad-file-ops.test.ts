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
import {
  openFileByPath,
  saveTab,
  FileOperationsContext,
} from '../notepad-file-ops';
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

describe('openFileByPath language selection', () => {
  let store: NotepadStore;

  function ctx(): FileOperationsContext {
    return {
      store,
      getEditorValue: () => undefined,
      getActiveTabId: () => store.getActiveTab()?.id,
      loadActiveTabIntoEditor: vi.fn(),
      getEditor: () => null,
      getToastHost: () => document.createElement('div'),
      flushPendingContent: vi.fn(),
    };
  }

  function mockOpen(filePath: string, content: string): void {
    (window as any).restbro = {
      store: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
      notepad: {
        openPath: vi.fn().mockResolvedValue({ filePath, content }),
      },
    };
  }

  beforeEach(() => {
    store = new NotepadStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).restbro;
  });

  const spec = 'openapi: 3.0.0\ninfo:\n  title: x\n  version: "1"\npaths: {}\n';

  it('upgrades an OpenAPI .yaml file to the swagger preview', async () => {
    mockOpen('/tmp/openapi.yaml', spec);
    await openFileByPath(ctx(), '/tmp/openapi.yaml');
    const tab = store.getActiveTab();
    expect(tab?.language).toBe('swagger');
    expect(tab?.previewMode).toBe(true);
  });

  it('upgrades an OpenAPI .json file too', async () => {
    mockOpen('/tmp/swagger.json', JSON.stringify({ openapi: '3.0.0' }));
    await openFileByPath(ctx(), '/tmp/swagger.json');
    expect(store.getActiveTab()?.language).toBe('swagger');
  });

  it('leaves ordinary YAML and JSON files alone', async () => {
    mockOpen('/tmp/config.yaml', 'foo: bar\n');
    await openFileByPath(ctx(), '/tmp/config.yaml');
    expect(store.getActiveTab()?.language).toBe('yaml');
  });

  it('falls back to content sniffing for an unknown extension', async () => {
    mockOpen('/tmp/payload.bogus', '{"a": 1}');
    await openFileByPath(ctx(), '/tmp/payload.bogus');
    expect(store.getActiveTab()?.language).toBe('json');
  });
});
