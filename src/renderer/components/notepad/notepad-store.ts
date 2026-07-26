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
  splitEnabled: false,
  activePaneId: 0,
  paneActiveTabIds: [undefined, undefined],
  splitRatio: 0.5,
};

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 11);
};

/** Clamp the split ratio to a sensible draggable range. */
const clampRatio = (ratio: number): number =>
  Math.max(0.2, Math.min(0.8, Number.isFinite(ratio) ? ratio : 0.5));

const normalizeTab = (tab: NotepadTab): NotepadTab => ({
  ...tab,
  createdAt: Number(tab.createdAt) || Date.now(),
  updatedAt: Number(tab.updatedAt) || Date.now(),
  isDirty: Boolean(tab.isDirty),
  content: tab.content ?? '',
  // Clamp to a valid pane id (0 or 1); older state has no paneId.
  paneId: tab.paneId === 1 ? 1 : 0,
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

    // Seed per-pane active tabs into a fresh array (never alias DEFAULT_STATE's
    // shared array). Fall back to the legacy single `activeTabId` for pane 0.
    const seeded = Array.isArray(persisted?.paneActiveTabIds)
      ? persisted.paneActiveTabIds
      : [persisted?.activeTabId, undefined];
    this.state.paneActiveTabIds = [seeded[0], seeded[1]];
    this.state.splitRatio = clampRatio(this.state.splitRatio ?? 0.5);
    // Enforce all pane/split invariants (collapse invalid splits, fix focus,
    // mirror activeTabId), auto-picking a pane's first tab when needed.
    this.reconcile(true);

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

  getActiveTab(paneId?: number): NotepadTab | undefined {
    if (paneId === undefined) {
      return this.state.tabs.find((t) => t.id === this.state.activeTabId);
    }
    const id = this.getPaneActiveTabId(paneId);
    return this.state.tabs.find((t) => t.id === id);
  }

  /** Which pane currently has focus (0 or 1). */
  getFocusedPaneId(): number {
    return this.state.activePaneId === 1 ? 1 : 0;
  }

  isSplitEnabled(): boolean {
    return Boolean(this.state.splitEnabled);
  }

  getSplitRatio(): number {
    return clampRatio(this.state.splitRatio ?? 0.5);
  }

  /** Tabs belonging to a given pane, in strip order. */
  getTabsForPane(paneId: number): NotepadTab[] {
    const p = paneId === 1 ? 1 : 0;
    return this.state.tabs.filter((t) => (t.paneId ?? 0) === p);
  }

  getPaneActiveTabId(paneId: number): string | undefined {
    return this.state.paneActiveTabIds?.[paneId === 1 ? 1 : 0];
  }

  private setPaneActive(paneId: number, tabId?: string): void {
    if (!Array.isArray(this.state.paneActiveTabIds)) {
      this.state.paneActiveTabIds = [undefined, undefined];
    }
    this.state.paneActiveTabIds[paneId === 1 ? 1 : 0] = tabId;
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
    >,
    paneId?: number
  ): NotepadTab {
    // New tabs land in the focused pane unless a pane is explicitly requested.
    // When the notepad isn't split, everything lives in pane 0.
    const target = this.state.splitEnabled
      ? (paneId ?? this.getFocusedPaneId())
      : 0;
    const tab = this.makeTab(initial, target);
    this.setPaneActive(tab.paneId ?? 0, tab.id);
    this.state.activePaneId = tab.paneId ?? 0;
    this.reconcile(false);
    this.touch();
    return tab;
  }

  /** Create a tab object and append it, without touching focus/selection. */
  private makeTab(
    initial:
      | Partial<Pick<NotepadTab, 'title' | 'content' | 'filePath' | 'language'>>
      | undefined,
    paneId: number
  ): NotepadTab {
    const now = Date.now();
    const content = initial?.content ?? '';
    const tab: NotepadTab = {
      id: generateId(),
      title: initial?.title || 'Untitled',
      content,
      // For freshly opened files, savedContent matches disk content → not dirty.
      // For new empty tabs, savedContent === '' so typing flips dirty correctly.
      savedContent: content,
      filePath: initial?.filePath,
      language: initial?.language,
      paneId: paneId === 1 ? 1 : 0,
      isDirty: false,
      createdAt: now,
      updatedAt: now,
    };
    this.state.tabs.push(tab);
    return tab;
  }

  setActiveTab(tabId?: string, paneId?: number): void {
    if (!tabId) {
      this.setPaneActive(this.getFocusedPaneId());
      this.reconcile(false);
      this.touch();
      return;
    }
    const tab = this.state.tabs.find((t) => t.id === tabId);
    const p = paneId ?? tab?.paneId ?? 0;
    if (this.getFocusedPaneId() === p && this.getPaneActiveTabId(p) === tabId) {
      return;
    }
    this.setPaneActive(p, tabId);
    this.state.activePaneId = p === 1 ? 1 : 0;
    this.reconcile(false);
    this.touch();
  }

  /** Focus a pane (drives global actions + status bar) without changing tabs. */
  setFocusedPane(paneId: number): void {
    const p = paneId === 1 ? 1 : 0;
    if (this.getFocusedPaneId() === p) return;
    if (!this.getTabsForPane(p).length) return;
    this.state.activePaneId = p;
    this.reconcile(false);
    this.touch();
  }

  /** Persist the split divider ratio quietly (no re-render). */
  setSplitRatio(ratio: number): void {
    this.state.splitRatio = clampRatio(ratio);
    this.persist();
  }

  /**
   * Move a tab into a pane. Moving into pane 1 turns on the split; if that
   * would strand an empty pane 0, a fresh Untitled tab is created there. When a
   * move empties a pane, `reconcile` collapses the split back to a single pane.
   */
  moveTabToPane(tabId: string, targetPaneId: number): void {
    const p = targetPaneId === 1 ? 1 : 0;
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const source = tab.paneId ?? 0;
    if (source === p) {
      this.setPaneActive(p, tabId);
      this.state.activePaneId = p;
      this.reconcile(true);
      this.touch();
      return;
    }
    tab.paneId = p;
    tab.updatedAt = Date.now();
    if (p === 1) this.state.splitEnabled = true;
    // Keep both sides populated when the split is created from a single tab.
    if (p === 1 && !this.state.tabs.some((t) => (t.paneId ?? 0) === 0)) {
      const filler = this.makeTab(undefined, 0);
      this.setPaneActive(0, filler.id);
    }
    this.setPaneActive(p, tabId);
    this.state.activePaneId = p;
    this.reconcile(true);
    this.touch();
  }

  /** Reorder a tab within its own pane (indices are pane-relative). */
  moveTabWithinPane(paneId: number, fromRel: number, toRel: number): void {
    const p = paneId === 1 ? 1 : 0;
    const inPane = this.getTabsForPane(p);
    if (fromRel < 0 || fromRel >= inPane.length) return;
    const target = Math.max(0, Math.min(toRel, inPane.length - 1));
    if (fromRel === target) return;

    const movingId = inPane[fromRel].id;
    const globalFrom = this.state.tabs.findIndex((t) => t.id === movingId);
    const [moved] = this.state.tabs.splice(globalFrom, 1);

    const after = this.getTabsForPane(p);
    let insertAt: number;
    if (target >= after.length) {
      const lastId = after[after.length - 1]?.id;
      insertAt = lastId
        ? this.state.tabs.findIndex((t) => t.id === lastId) + 1
        : this.state.tabs.length;
    } else {
      const refId = after[target].id;
      insertAt = this.state.tabs.findIndex((t) => t.id === refId);
    }
    this.state.tabs.splice(insertAt, 0, moved);
    this.reconcile(false);
    this.touch();
  }

  /** Turn on the split, moving the focused pane's active tab to the right. */
  enableSplit(): void {
    if (this.state.splitEnabled) return;
    let tabId = this.getPaneActiveTabId(this.getFocusedPaneId());
    if (!tabId) tabId = this.makeTab(undefined, 0).id;
    this.moveTabToPane(tabId, 1);
  }

  /** Collapse the split: all tabs return to pane 0, keeping the focused tab. */
  disableSplit(): void {
    if (!this.state.splitEnabled) return;
    const focusedActive = this.getPaneActiveTabId(this.getFocusedPaneId());
    for (const t of this.state.tabs) t.paneId = 0;
    this.state.splitEnabled = false;
    this.state.activePaneId = 0;
    this.state.paneActiveTabIds = [focusedActive, undefined];
    this.reconcile(true);
    this.touch();
  }

  /**
   * Reorder tabs by moving the tab at `fromIdx` to `toIdx` (global indices).
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
    // reconcile(true) re-selects a neighbour within the affected pane, collapses
    // the split if a pane emptied, and re-mirrors activeTabId.
    this.reconcile(true);
    this.touch();
    return removed;
  }

  closeAll(): void {
    this.state.tabs = [];
    this.state.splitEnabled = false;
    this.state.activePaneId = 0;
    this.state.paneActiveTabIds = [undefined, undefined];
    this.state.activeTabId = undefined;
    this.touch();
  }

  closeOthers(tabId: string): void {
    const kept = this.state.tabs.find((t) => t.id === tabId);
    this.state.tabs = kept ? [kept] : [];
    if (kept) kept.paneId = 0;
    this.state.splitEnabled = false;
    this.state.activePaneId = 0;
    this.state.paneActiveTabIds = [tabId, undefined];
    this.reconcile(true);
    this.touch();
  }

  /** Close every tab positioned before `tabId` within its own pane. */
  closeTabsToLeft(tabId: string): void {
    this.closeTabsOnSide(tabId, 'left');
  }

  /** Close every tab positioned after `tabId` within its own pane. */
  closeTabsToRight(tabId: string): void {
    this.closeTabsOnSide(tabId, 'right');
  }

  private closeTabsOnSide(tabId: string, side: 'left' | 'right'): void {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const paneId = tab.paneId ?? 0;
    const inPane = this.getTabsForPane(paneId);
    const idx = inPane.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const victims =
      side === 'left' ? inPane.slice(0, idx) : inPane.slice(idx + 1);
    if (!victims.length) return;
    const remove = new Set(victims.map((t) => t.id));
    this.state.tabs = this.state.tabs.filter((t) => !remove.has(t.id));
    // Keep the anchor tab active in its pane.
    this.setPaneActive(paneId, tabId);
    this.state.activePaneId = paneId;
    this.reconcile(true);
    this.touch();
  }

  /**
   * Enforce all pane/split invariants:
   *  - every tab has a valid pane id (0 or 1);
   *  - a split requires a tab on each side, else it collapses to pane 0;
   *  - each pane's active tab id references a tab in that pane (when
   *    `autofill` is true, an empty selection falls back to the pane's first
   *    tab; otherwise it is left cleared);
   *  - focus moves off an empty pane; `activeTabId` mirrors the focused pane.
   */
  private reconcile(autofill: boolean): void {
    const s = this.state;
    for (const t of s.tabs) t.paneId = t.paneId === 1 ? 1 : 0;

    const hasP0 = s.tabs.some((t) => (t.paneId ?? 0) === 0);
    const hasP1 = s.tabs.some((t) => t.paneId === 1);
    const split = Boolean(s.splitEnabled) && hasP0 && hasP1;
    if (!split) {
      for (const t of s.tabs) t.paneId = 0;
      s.splitEnabled = false;
      s.activePaneId = 0;
    } else {
      s.splitEnabled = true;
      s.activePaneId = s.activePaneId === 1 ? 1 : 0;
    }

    const cur = s.paneActiveTabIds ?? [undefined, undefined];
    const next: (string | undefined)[] = [undefined, undefined];
    for (const p of [0, 1]) {
      const inPane = s.tabs.filter((t) => (t.paneId ?? 0) === p);
      const prev = cur[p];
      if (prev && inPane.some((t) => t.id === prev)) next[p] = prev;
      else if (autofill && inPane.length) next[p] = inPane[0].id;
      else next[p] = undefined;
    }
    s.paneActiveTabIds = next;

    const focused = s.activePaneId === 1 ? 1 : 0;
    const other = focused === 0 ? 1 : 0;
    if (!next[focused] && next[other]) s.activePaneId = other;
    s.activeTabId = s.paneActiveTabIds[s.activePaneId === 1 ? 1 : 0];
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
    }, this.persistDebounceMs());
  }

  /**
   * Adaptive autosave cadence. Persisting serializes the whole notepad state
   * (all tabs + full content) and writes it over IPC, so for multi-MB buffers
   * we back off to avoid re-writing megabytes on every keystroke. Flush points
   * (tab switch, save, quit) still persist immediately via flushPersist().
   */
  private persistDebounceMs(): number {
    let total = 0;
    for (const t of this.state.tabs) total += t.content.length;
    if (total > 5_000_000) return 3000;
    if (total > 1_000_000) return 1500;
    return 300;
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
