/**
 * Notepad state store. Lives in the renderer; persists via the main-process
 * store (debounced) and exposes a small pub/sub for subscribers.
 *
 * Dirty-tracking is based on `savedContent` (the snapshot last written to disk
 * or the empty initial buffer). This means undo-to-saved-state correctly
 * clears the dirty flag.
 */
import {
  NotepadSettings,
  NotepadState,
  NotepadTab,
} from '../../../shared/types';

export const DEFAULT_SETTINGS: NotepadSettings = {
  fontSize: 14,
  wordWrap: 'on',
  tabSize: 2,
  formatOnSave: false,
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
  promptOnExit: true,
};

const DEFAULT_STATE: NotepadState = {
  tabs: [],
  activeTabId: undefined,
  untitledCounter: 1,
  settings: { ...DEFAULT_SETTINGS },
};

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 11);
};

const normalizeTab = (tab: NotepadTab): NotepadTab => ({
  ...tab,
  createdAt: Number(tab.createdAt) || Date.now(),
  updatedAt: Number(tab.updatedAt) || Date.now(),
  isDirty: Boolean(tab.isDirty),
  content: tab.content ?? '',
  // Backfill savedContent for tabs persisted before this field existed: if the
  // tab was marked dirty, treat saved as empty so it stays dirty; otherwise
  // assume saved matches current content.
  savedContent: tab.savedContent ?? (tab.isDirty ? '' : (tab.content ?? '')),
});

export class NotepadStore {
  private state: NotepadState = {
    ...DEFAULT_STATE,
    settings: { ...DEFAULT_SETTINGS },
  };
  private subscribers: Array<(state: NotepadState) => void> = [];
  private persistTimer: number | null = null;

  /**
   * Load persisted notepad state. Accepts an optional pre-fetched AppState
   * to avoid a redundant IPC round-trip when the caller already has it.
   */
  async hydrate(prefetchedState?: {
    notepad?: NotepadState;
  }): Promise<NotepadState> {
    const stored = prefetchedState ?? (await window.restbro.store.get());
    const persisted = (stored as { notepad?: NotepadState }).notepad;

    if (persisted) {
      this.state = {
        ...DEFAULT_STATE,
        ...persisted,
        tabs: (persisted.tabs || []).map(normalizeTab),
        activeTabId: persisted.activeTabId,
        untitledCounter:
          persisted.untitledCounter || DEFAULT_STATE.untitledCounter,
        settings: { ...DEFAULT_SETTINGS, ...(persisted.settings || {}) },
      };
    } else {
      this.state = {
        ...DEFAULT_STATE,
        settings: { ...DEFAULT_SETTINGS },
      };
    }

    this.notify();
    return this.state;
  }

  subscribe(handler: (state: NotepadState) => void): () => void {
    this.subscribers.push(handler);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== handler);
    };
  }

  getState(): NotepadState {
    return this.state;
  }

  getSettings(): NotepadSettings {
    return this.state.settings ?? { ...DEFAULT_SETTINGS };
  }

  updateSettings(updates: Partial<NotepadSettings>): void {
    this.state.settings = { ...this.getSettings(), ...updates };
    this.touch();
  }

  getActiveTab(): NotepadTab | undefined {
    return this.state.tabs.find((t) => t.id === this.state.activeTabId);
  }

  getTabByFilePath(filePath?: string): NotepadTab | undefined {
    if (!filePath) return undefined;
    return this.state.tabs.find((t) => t.filePath === filePath);
  }

  hasDirtyTabs(): boolean {
    return this.state.tabs.some((t) => t.isDirty);
  }

  createTab(
    initial?: Partial<
      Pick<NotepadTab, 'title' | 'content' | 'filePath' | 'language'>
    >
  ): NotepadTab {
    const title = initial?.title || 'Untitled';
    const now = Date.now();
    const content = initial?.content ?? '';

    const tab: NotepadTab = {
      id: generateId(),
      title,
      content,
      // For freshly opened files, savedContent matches disk content → not dirty.
      // For new empty tabs, savedContent === '' so typing flips dirty correctly.
      savedContent: content,
      filePath: initial?.filePath,
      language: initial?.language,
      isDirty: false,
      createdAt: now,
      updatedAt: now,
    };

    this.state.tabs.push(tab);
    this.state.activeTabId = tab.id;
    this.touch();
    return tab;
  }

  setActiveTab(tabId?: string): void {
    if (this.state.activeTabId === tabId) return;
    this.state.activeTabId = tabId;
    this.touch();
  }

  /**
   * Reorder tabs by moving the tab at `fromIdx` to `toIdx`.
   * Both indices clamp to valid bounds; out-of-range or no-op moves are silent.
   */
  reorderTabs(fromIdx: number, toIdx: number): void {
    const tabs = this.state.tabs;
    if (fromIdx < 0 || fromIdx >= tabs.length) return;
    const target = Math.max(0, Math.min(toIdx, tabs.length - 1));
    if (fromIdx === target) return;
    const [moved] = tabs.splice(fromIdx, 1);
    tabs.splice(target, 0, moved);
    this.touch();
  }

  updateTab(tabId: string, updates: Partial<NotepadTab>): void {
    const idx = this.state.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const updated: NotepadTab = {
      ...this.state.tabs[idx],
      ...updates,
      updatedAt: Date.now(),
    };

    this.state.tabs[idx] = updated;
    this.touch();
  }

  /**
   * Update a tab's content. Dirty is computed by comparing against the
   * `savedContent` snapshot (not the previous in-memory content), so undo back
   * to the saved state correctly clears the dirty marker.
   */
  updateContent(tabId: string, content: string, markDirty = true): void {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const savedContent = tab.savedContent ?? '';
    const isDirty = markDirty ? content !== savedContent : tab.isDirty;
    this.updateTab(tabId, { content, isDirty });
  }

  /**
   * Persist the tab's current content as the "saved" snapshot. Updates
   * filePath/title if the tab was just saved-as.
   */
  markSaved(tabId: string, filePath?: string): void {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const title = filePath ? this.getFileName(filePath) : tab.title;
    this.updateTab(tabId, {
      isDirty: false,
      savedContent: tab.content,
      filePath: filePath || tab.filePath,
      title,
    });
  }

  /** Persist Monaco editor view state (cursor, scroll, folding) for a tab. */
  setViewState(tabId: string, viewState: unknown): void {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    // Mutate in place to avoid re-triggering renders for view-state updates.
    tab.viewState = viewState;
  }

  closeTab(tabId: string): NotepadTab | undefined {
    const idx = this.state.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return undefined;

    const [removed] = this.state.tabs.splice(idx, 1);

    if (this.state.activeTabId === tabId) {
      if (this.state.tabs.length > 0) {
        const newIdx = Math.min(idx, this.state.tabs.length - 1);
        this.state.activeTabId = this.state.tabs[newIdx].id;
      } else {
        this.state.activeTabId = undefined;
      }
    }

    this.touch();
    return removed;
  }

  closeAll(): void {
    this.state.tabs = [];
    this.state.activeTabId = undefined;
    this.touch();
  }

  closeOthers(tabId: string): void {
    this.state.tabs = this.state.tabs.filter((t) => t.id === tabId);
    this.state.activeTabId = tabId;
    this.touch();
  }

  private getFileName(filePath: string): string {
    if (!filePath) return filePath;
    const segments = filePath.split(/[/\\]/);
    return segments[segments.length - 1] || filePath;
  }

  private touch(shouldPersist = true): void {
    this.notify();
    if (shouldPersist) {
      this.persist();
    }
  }

  private notify(): void {
    this.subscribers.forEach((cb) =>
      cb({ ...this.state, tabs: [...this.state.tabs] })
    );
  }

  private persist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = window.setTimeout(async () => {
      await window.restbro.store.set({ notepad: this.state });
      this.persistTimer = null;
    }, 300);
  }

  /**
   * Immediately persist current state, cancelling any pending debounced write.
   * Returns the underlying IPC promise so callers can await full persistence
   * before the app shuts down.
   */
  async flushPersist(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await window.restbro.store.set({ notepad: this.state });
  }
}
