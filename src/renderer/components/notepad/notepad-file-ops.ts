/**
 * Notepad file operations - open, save, save as
 */
import { NotepadTab } from '../../../shared/types';
import { NotepadStore } from './notepad-store';
import { getFileName } from './notepad-utils';

export interface FileOperationsContext {
  store: NotepadStore;
  getEditorValue: () => string | undefined;
  getActiveTabId: () => string | undefined;
  loadActiveTabIntoEditor: () => void;
}

/**
 * Open a file and create or switch to a tab
 */
export async function openFile(ctx: FileOperationsContext): Promise<void> {
  const result = await window.apiCourier.notepad.openFile();
  if (result?.canceled || !result.filePath || result.content === undefined) return;

  const existing = ctx.store.getTabByFilePath(result.filePath);
  if (existing) {
    ctx.store.setActiveTab(existing.id);
    ctx.loadActiveTabIntoEditor();
    return;
  }

  ctx.store.createTab({
    title: getFileName(result.filePath),
    content: result.content,
    filePath: result.filePath,
  });
}

/**
 * Save the currently active tab
 */
export async function saveActiveTab(
  ctx: FileOperationsContext,
  forceSaveAs = false
): Promise<boolean> {
  const activeTab = ctx.store.getActiveTab();
  if (!activeTab) return false;
  return saveTab(ctx, activeTab, forceSaveAs);
}

/**
 * Save a specific tab by ID
 */
export async function saveTabById(
  ctx: FileOperationsContext,
  tabId: string,
  forceSaveAs = false
): Promise<boolean> {
  const tab = ctx.store.getState().tabs.find(t => t.id === tabId);
  if (!tab) return false;
  return saveTab(ctx, tab, forceSaveAs);
}

/**
 * Save a tab to disk
 */
export async function saveTab(
  ctx: FileOperationsContext,
  tab: NotepadTab,
  forceSaveAs = false
): Promise<boolean> {
  try {
    const activeTabId = ctx.getActiveTabId();
    const latestContent = tab.id === activeTabId ? ctx.getEditorValue() || tab.content : tab.content;
    if (latestContent !== tab.content) {
      ctx.store.updateContent(tab.id, latestContent, false);
      tab = { ...tab, content: latestContent };
    }

    const useSaveAs = forceSaveAs || !tab.filePath;
    const result = await window.apiCourier.notepad.saveFile({
      filePath: useSaveAs ? undefined : tab.filePath,
      content: tab.content,
      defaultName: tab.title,
    });

    if (result?.canceled) return false;
    const finalPath = result?.filePath || tab.filePath;
    ctx.store.markSaved(tab.id, finalPath);
    return true;
  } catch (error) {
    console.error('Failed to save tab', error);
    return false;
  }
}
