/**
 * File operations exposed to the notepad UI.
 *
 * - Save flushes pending in-editor edits into the store before writing.
 * - Save respects the user's "trim trailing whitespace", "insert final
 *   newline" and "format on save" settings.
 * - All errors surface to the user as toasts (not console-only) and the tab's
 *   dirty flag is preserved on failure.
 */
import type * as monaco from 'monaco-editor';
import { NotepadSettings, NotepadTab } from '../../../shared/types';
import { NotepadStore } from './notepad-store';
import {
  ensureFinalNewline,
  formatDocument,
  trimTrailingWhitespace,
} from './notepad-editor';
import {
  defaultFileName,
  detectLanguageFromContent,
  detectLanguageFromPath,
  looksLikeOpenApi,
} from './notepad-language';
import { formatJson } from './notepad-json';
import { showNotepadToast } from './notepad-toast';
import { getFileName } from './notepad-utils';

export interface FileOperationsContext {
  store: NotepadStore;
  /** Returns the live editor value for the active tab, if any. */
  getEditorValue: () => string | undefined;
  getActiveTabId: () => string | undefined;
  loadActiveTabIntoEditor: () => void;
  /** Returns the actual Monaco editor instance for format-on-save. */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null;
  /** Container under which to show toasts. */
  getToastHost: () => HTMLElement;
  /** Flush any in-flight content debounce so the store has the latest text. */
  flushPendingContent: () => void;
}

/**
 * JSON files are pretty-printed on open (the JSON Viewer replacement). Very
 * large files skip auto-formatting to avoid a costly parse/stringify on open.
 */
const JSON_FORMAT_ON_OPEN_MAX = 2_000_000;

function contentForOpen(content: string, language: string | undefined): string {
  if (language !== 'json' || content.length > JSON_FORMAT_ON_OPEN_MAX) {
    return content;
  }
  const result = formatJson(content);
  return result.ok ? result.text : content;
}

/** Create a tab for a freshly read file, picking the best language for it. */
function openInNewTab(
  ctx: FileOperationsContext,
  filePath: string,
  content: string
): void {
  // Unknown/absent extension (README, api-response.foo, …): sniff the body so
  // JSON/XML/YAML still get highlighted.
  let language =
    detectLanguageFromPath(filePath) ?? detectLanguageFromContent(content);
  // `.yaml`/`.json` are just the containers for an OpenAPI spec — upgrade so
  // the Swagger preview kicks in instead of raw YAML/JSON.
  if (
    (language === 'yaml' || language === 'json') &&
    looksLikeOpenApi(content)
  ) {
    language = 'swagger';
  }
  ctx.store.createTab({
    title: getFileName(filePath),
    content: contentForOpen(content, language),
    filePath,
    language,
  });

  if (language === 'markdown' || language === 'swagger') {
    const newTab = ctx.store.getActiveTab();
    if (newTab) ctx.store.updateTab(newTab.id, { previewMode: true });
  }
}

export async function openFile(ctx: FileOperationsContext): Promise<void> {
  const result = await window.restbro.notepad.openFile();
  if (!result || result.canceled) return;

  if (result.error) {
    showNotepadToast(ctx.getToastHost(), result.error, 'error');
    return;
  }
  if (!result.filePath || result.content === undefined) return;

  const existing = ctx.store.getTabByFilePath(result.filePath);
  if (existing) {
    ctx.store.setActiveTab(existing.id);
    ctx.loadActiveTabIntoEditor();
    return;
  }

  openInNewTab(ctx, result.filePath, result.content);
}

/**
 * Open a file by absolute path (used by OS file-association).
 * Reuses an existing tab if one already points at the same path.
 */
export async function openFileByPath(
  ctx: FileOperationsContext,
  filePath: string
): Promise<void> {
  const existing = ctx.store.getTabByFilePath(filePath);
  if (existing) {
    ctx.store.setActiveTab(existing.id);
    ctx.loadActiveTabIntoEditor();
    return;
  }
  const result = await window.restbro.notepad.openPath(filePath);
  if (result?.error) {
    showNotepadToast(ctx.getToastHost(), result.error, 'error');
    return;
  }
  if (!result?.filePath || result.content === undefined) return;
  openInNewTab(ctx, result.filePath, result.content);
}

export async function saveActiveTab(
  ctx: FileOperationsContext,
  forceSaveAs = false
): Promise<boolean> {
  const activeTab = ctx.store.getActiveTab();
  if (!activeTab) return false;
  return saveTab(ctx, activeTab, forceSaveAs);
}

export async function saveTabById(
  ctx: FileOperationsContext,
  tabId: string,
  forceSaveAs = false
): Promise<boolean> {
  const tab = ctx.store.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return false;
  return saveTab(ctx, tab, forceSaveAs);
}

/**
 * Save a tab to disk. Applies on-save transformations (format, trim, final
 * newline), prompts for a path if needed, and shows toasts on success/failure.
 */
export async function saveTab(
  ctx: FileOperationsContext,
  tabIn: NotepadTab,
  forceSaveAs = false
): Promise<boolean> {
  // Always operate on the freshest content the user has typed; flush any
  // pending debounce first so we never write a stale buffer.
  ctx.flushPendingContent();
  const activeTabId = ctx.getActiveTabId();
  let tab = tabIn;
  // Re-fetch after the flush: flushPendingContent replaces the tab object in
  // the store, so the `tabIn` reference (and its isDirty flag) may be stale.
  const flushed = ctx.store.getState().tabs.find((t) => t.id === tab.id);
  if (flushed) tab = flushed;
  if (tab.id === activeTabId) {
    const liveValue = ctx.getEditorValue();
    if (liveValue !== undefined && liveValue !== tab.content) {
      ctx.store.updateContent(tab.id, liveValue, false);
      const refreshed = ctx.store.getState().tabs.find((t) => t.id === tab.id);
      if (refreshed) tab = refreshed;
    }
  }

  // No-op for a plain Save on an already-saved tab with no unsaved changes:
  // no disk write and no toast. "Save As" (forceSaveAs) always proceeds.
  if (!forceSaveAs && tab.filePath && !tab.isDirty) {
    return true;
  }

  // Apply on-save transformations.
  const settings = ctx.store.getSettings();
  const isActive = tab.id === activeTabId;
  const editor = ctx.getEditor();
  let contentToSave = tab.content;

  if (settings.formatOnSave && isActive && editor) {
    try {
      await formatDocument(editor);
      contentToSave = editor.getValue();
    } catch {
      // Formatter unavailable for this language — silently keep raw content.
    }
  }
  contentToSave = applyOnSaveTransforms(contentToSave, settings);

  // If transformations changed the content, push it back into the editor and
  // store before writing so what's on disk matches what the user sees.
  if (contentToSave !== tab.content) {
    if (isActive && editor) editor.setValue(contentToSave);
    ctx.store.updateContent(tab.id, contentToSave, false);
  }

  const useSaveAs = forceSaveAs || !tab.filePath;
  let result;
  try {
    result = await window.restbro.notepad.saveFile({
      filePath: useSaveAs ? undefined : tab.filePath,
      content: contentToSave,
      defaultName: tab.filePath
        ? getFileName(tab.filePath)
        : defaultFileName(tab.title, tab.language),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown save error';
    showNotepadToast(ctx.getToastHost(), `Save failed: ${message}`, 'error');
    return false;
  }

  if (result?.canceled) return false;
  if (result && result.ok === false && result.error) {
    showNotepadToast(
      ctx.getToastHost(),
      `Save failed: ${result.error}`,
      'error'
    );
    return false;
  }

  const finalPath = result?.filePath || tab.filePath;
  ctx.store.markSaved(tab.id, finalPath);
  // Auto-detect language if this was a new file just saved with an extension.
  if (finalPath && !tab.language) {
    const lang = detectLanguageFromPath(finalPath);
    if (lang) ctx.store.updateTab(tab.id, { language: lang });
  }
  showNotepadToast(
    ctx.getToastHost(),
    `Saved ${getFileName(finalPath || tab.title)}`,
    'success',
    2000
  );
  return true;
}

function applyOnSaveTransforms(
  content: string,
  settings: NotepadSettings
): string {
  let next = content;
  if (settings.trimTrailingWhitespace) next = trimTrailingWhitespace(next);
  if (settings.insertFinalNewline) next = ensureFinalNewline(next);
  return next;
}
