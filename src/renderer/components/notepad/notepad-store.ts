import { NotepadState, NotepadTab } from '../../../shared/types';

const DEFAULT_STATE: NotepadState = {
  tabs: [],
  activeTabId: undefined,
  untitledCounter: 1,
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
});

export class NotepadStore {
  private state: NotepadState = { ...DEFAULT_STATE };
  private subscribers: Array<(state: NotepadState) => void> = [];
  private persistTimer: number | null = null;

  async hydrate(): Promise<NotepadState> {
    const stored = await window.apiCourier.store.get();
    const persisted = stored.notepad;

    if (persisted) {
      this.state = {
        ...DEFAULT_STATE,
        ...persisted,
        tabs: (persisted.tabs || []).map(normalizeTab),
        activeTabId: persisted.activeTabId,
        untitledCounter: persisted.untitledCounter || DEFAULT_STATE.untitledCounter,
      };
    } else {
      this.state = { ...DEFAULT_STATE };
    }

    this.notify();
    return this.state;
  }

  subscribe(handler: (state: NotepadState) => void): () => void {
    this.subscribers.push(handler);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== handler);
    };
  }

  getState(): NotepadState {
    return this.state;
  }

  getActiveTab(): NotepadTab | undefined {
    return this.state.tabs.find(t => t.id === this.state.activeTabId);
  }

  getTabByFilePath(filePath?: string): NotepadTab | undefined {
    if (!filePath) return undefined;
    return this.state.tabs.find(t => t.filePath === filePath);
  }

  createTab(initial?: Partial<Pick<NotepadTab, 'title' | 'content' | 'filePath'>>): NotepadTab {
    const title = initial?.title || `Untitled ${this.state.untitledCounter}`;
    const now = Date.now();

    const tab: NotepadTab = {
      id: generateId(),
      title,
      content: initial?.content ?? '',
      filePath: initial?.filePath,
      isDirty: !initial?.filePath, // New unsaved files start dirty
      createdAt: now,
      updatedAt: now,
    };

    this.state.tabs.push(tab);
    this.state.activeTabId = tab.id;
    this.state.untitledCounter += 1;
    this.touch();
    return tab;
  }

  setActiveTab(tabId?: string): void {
    this.state.activeTabId = tabId;
    this.touch();
  }

  updateTab(tabId: string, updates: Partial<NotepadTab>): void {
    const idx = this.state.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const updated: NotepadTab = {
      ...this.state.tabs[idx],
      ...updates,
      updatedAt: Date.now(),
    };

    this.state.tabs[idx] = updated;
    this.touch();
  }

  updateContent(tabId: string, content: string, markDirty = true): void {
    const tab = this.state.tabs.find(t => t.id === tabId);
    if (!tab) return;
    const isDirty = markDirty ? content !== tab.content || tab.isDirty : tab.isDirty;

    this.updateTab(tabId, { content, isDirty });
  }

  markSaved(tabId: string, filePath?: string): void {
    const tab = this.state.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const title = filePath ? this.getFileName(filePath) : tab.title;
    this.updateTab(tabId, {
      isDirty: false,
      filePath: filePath || tab.filePath,
      title,
    });
  }

  closeTab(tabId: string): NotepadTab | undefined {
    const idx = this.state.tabs.findIndex(t => t.id === tabId);
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
    this.state.tabs = this.state.tabs.filter(t => t.id === tabId);
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
    this.subscribers.forEach(cb => cb({ ...this.state, tabs: [...this.state.tabs] }));
  }

  private persist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = window.setTimeout(async () => {
      await window.apiCourier.store.set({ notepad: this.state });
      this.persistTimer = null;
    }, 300);
  }
}
