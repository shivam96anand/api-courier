/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { NotepadStore as NotepadStoreType } from '../notepad-store';

describe('NotepadStore', () => {
  let store: NotepadStoreType;

  beforeEach(async () => {
    vi.useFakeTimers();
    (window as any).restbro = {
      store: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    };
    // Reset modules to get a fresh DEFAULT_STATE.tabs array each time
    vi.resetModules();
    const mod = await import('../notepad-store');
    store = new mod.NotepadStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as any).restbro;
  });

  describe('getState', () => {
    it('returns default state initially', () => {
      const state = store.getState();
      expect(state.tabs).toEqual([]);
      expect(state.activeTabId).toBeUndefined();
      expect(state.untitledCounter).toBe(1);
    });
  });

  describe('createTab', () => {
    it('creates a tab with default title', () => {
      const tab = store.createTab();
      expect(tab.title).toBe('Untitled');
      expect(tab.content).toBe('');
      expect(tab.isDirty).toBe(false);
      expect(tab.id).toBeDefined();
    });

    it('creates a tab with custom title and content', () => {
      const tab = store.createTab({ title: 'Notes', content: 'Hello' });
      expect(tab.title).toBe('Notes');
      expect(tab.content).toBe('Hello');
    });

    it('creates a tab with filePath', () => {
      const tab = store.createTab({ filePath: '/tmp/test.md' });
      expect(tab.filePath).toBe('/tmp/test.md');
    });

    it('sets the new tab as active', () => {
      const tab = store.createTab();
      expect(store.getState().activeTabId).toBe(tab.id);
    });

    it('adds tab to state', () => {
      store.createTab();
      store.createTab();
      expect(store.getState().tabs).toHaveLength(2);
    });
  });

  describe('setActiveTab', () => {
    it('sets the active tab ID', () => {
      const tab = store.createTab();
      store.createTab(); // second tab becomes active
      store.setActiveTab(tab.id);
      expect(store.getState().activeTabId).toBe(tab.id);
    });

    it('sets undefined to clear active tab', () => {
      store.createTab();
      store.setActiveTab(undefined);
      expect(store.getState().activeTabId).toBeUndefined();
    });
  });

  describe('getActiveTab', () => {
    it('returns undefined when no tabs', () => {
      expect(store.getActiveTab()).toBeUndefined();
    });

    it('returns the active tab', () => {
      const tab = store.createTab({ title: 'Active' });
      expect(store.getActiveTab()).toEqual(
        expect.objectContaining({ id: tab.id })
      );
    });
  });

  describe('getTabByFilePath', () => {
    it('returns undefined for undefined filePath', () => {
      expect(store.getTabByFilePath(undefined)).toBeUndefined();
    });

    it('returns undefined when no match', () => {
      store.createTab({ filePath: '/a.txt' });
      expect(store.getTabByFilePath('/b.txt')).toBeUndefined();
    });

    it('finds tab by filePath', () => {
      const tab = store.createTab({ filePath: '/tmp/test.md' });
      expect(store.getTabByFilePath('/tmp/test.md')?.id).toBe(tab.id);
    });
  });

  describe('updateTab', () => {
    it('updates tab properties', () => {
      const tab = store.createTab({ title: 'Old' });
      store.updateTab(tab.id, { title: 'New' });
      const updated = store.getState().tabs.find((t) => t.id === tab.id);
      expect(updated?.title).toBe('New');
    });

    it('does nothing for nonexistent tab', () => {
      store.createTab();
      store.updateTab('nonexistent', { title: 'X' });
      expect(store.getState().tabs).toHaveLength(1);
    });

    it('updates the updatedAt timestamp', () => {
      const tab = store.createTab();
      const originalUpdatedAt = store.getState().tabs[0].updatedAt;
      vi.advanceTimersByTime(100);
      store.updateTab(tab.id, { title: 'Changed' });
      expect(store.getState().tabs[0].updatedAt).toBeGreaterThanOrEqual(
        originalUpdatedAt
      );
    });
  });

  describe('updateContent', () => {
    it('updates content and marks dirty', () => {
      const tab = store.createTab({ content: 'old' });
      store.updateContent(tab.id, 'new');
      const state = store.getState();
      const updated = state.tabs.find((t) => t.id === tab.id);
      expect(updated?.content).toBe('new');
      expect(updated?.isDirty).toBe(true);
    });

    it('does not mark dirty when markDirty is false', () => {
      const tab = store.createTab({ content: 'old' });
      store.updateContent(tab.id, 'new', false);
      const updated = store.getState().tabs.find((t) => t.id === tab.id);
      expect(updated?.isDirty).toBe(false);
    });

    it('does nothing for nonexistent tab', () => {
      store.updateContent('nonexistent', 'content');
      expect(store.getState().tabs).toHaveLength(0);
    });
  });

  describe('markSaved', () => {
    it('clears dirty flag', () => {
      const tab = store.createTab();
      store.updateContent(tab.id, 'modified');
      store.markSaved(tab.id);
      const updated = store.getState().tabs.find((t) => t.id === tab.id);
      expect(updated?.isDirty).toBe(false);
    });

    it('updates filePath and title from filename', () => {
      const tab = store.createTab();
      store.markSaved(tab.id, '/path/to/notes.md');
      const updated = store.getState().tabs.find((t) => t.id === tab.id);
      expect(updated?.filePath).toBe('/path/to/notes.md');
      expect(updated?.title).toBe('notes.md');
    });

    it('does nothing for nonexistent tab', () => {
      store.markSaved('nonexistent', '/a.txt');
      // Should not throw
    });
  });

  describe('closeTab', () => {
    it('removes the tab', () => {
      const tab = store.createTab();
      store.closeTab(tab.id);
      expect(store.getState().tabs).toHaveLength(0);
    });

    it('returns the removed tab', () => {
      const tab = store.createTab({ title: 'To close' });
      const removed = store.closeTab(tab.id);
      expect(removed?.title).toBe('To close');
    });

    it('returns undefined for nonexistent tab', () => {
      expect(store.closeTab('nonexistent')).toBeUndefined();
    });

    it('switches active to next tab after close', () => {
      const tab1 = store.createTab({ title: 'First' });
      const tab2 = store.createTab({ title: 'Second' });
      const tab3 = store.createTab({ title: 'Third' });

      // Active is tab3, close tab2
      store.setActiveTab(tab2.id);
      store.closeTab(tab2.id);
      // Should switch to tab at the clamped index
      expect(store.getState().activeTabId).toBeDefined();
      expect(store.getState().activeTabId).not.toBe(tab2.id);
    });

    it('clears active tab when closing the last tab', () => {
      const tab = store.createTab();
      store.closeTab(tab.id);
      expect(store.getState().activeTabId).toBeUndefined();
    });
  });

  describe('closeAll', () => {
    it('removes all tabs', () => {
      store.createTab();
      store.createTab();
      store.closeAll();
      expect(store.getState().tabs).toHaveLength(0);
      expect(store.getState().activeTabId).toBeUndefined();
    });
  });

  describe('closeOthers', () => {
    it('keeps only the specified tab', () => {
      store.createTab({ title: 'Keep' });
      const keep = store.createTab({ title: 'Keep Me' });
      store.createTab({ title: 'Remove' });

      store.closeOthers(keep.id);
      expect(store.getState().tabs).toHaveLength(1);
      expect(store.getState().tabs[0].id).toBe(keep.id);
      expect(store.getState().activeTabId).toBe(keep.id);
    });
  });

  describe('subscribe', () => {
    it('notifies subscribers on changes', () => {
      const handler = vi.fn();
      store.subscribe(handler);
      store.createTab();
      expect(handler).toHaveBeenCalled();
    });

    it('returns unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = store.subscribe(handler);
      unsub();
      store.createTab();
      // handler was called during subscribe setup from createTab above,
      // reset and check it's not called again
      handler.mockClear();
      store.createTab();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('hydrate', () => {
    it('loads persisted state', async () => {
      const persisted = {
        notepad: {
          tabs: [
            {
              id: 'tab-1',
              title: 'Saved',
              content: 'Hello',
              isDirty: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          activeTabId: 'tab-1',
          untitledCounter: 2,
        },
      };
      const state = await store.hydrate(persisted);
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].title).toBe('Saved');
      expect(state.activeTabId).toBe('tab-1');
    });

    it('returns default state when no persisted data', async () => {
      const state = await store.hydrate({});
      expect(state.tabs).toHaveLength(0);
      expect(state.untitledCounter).toBe(1);
    });

    it('fetches from IPC when no prefetched state given', async () => {
      (window as any).restbro.store.get.mockResolvedValue({
        notepad: {
          tabs: [
            {
              id: 'remote-1',
              title: 'Remote',
              content: '',
              isDirty: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          activeTabId: 'remote-1',
          untitledCounter: 1,
        },
      });
      const state = await store.hydrate();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].title).toBe('Remote');
    });
  });

  describe('persistence', () => {
    it('debounces persist calls', () => {
      store.createTab();
      store.createTab();
      // Should not have called set yet (debounced 300ms)
      expect((window as any).restbro.store.set).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect((window as any).restbro.store.set).toHaveBeenCalledTimes(1);
    });

    it('flushPersist writes immediately', () => {
      store.createTab();
      store.flushPersist();
      expect((window as any).restbro.store.set).toHaveBeenCalledWith(
        expect.objectContaining({ notepad: expect.any(Object) })
      );
    });
  });

  describe('split view', () => {
    it('is disabled by default', () => {
      store.createTab();
      expect(store.isSplitEnabled()).toBe(false);
      expect(store.getFocusedPaneId()).toBe(0);
    });

    it('enableSplit moves the active tab to pane 1 and fills pane 0', () => {
      const only = store.createTab({ title: 'Solo' });
      store.enableSplit();
      expect(store.isSplitEnabled()).toBe(true);
      // The moved tab is on the right and focused.
      expect(store.getTabsForPane(1).map((t) => t.id)).toEqual([only.id]);
      expect(store.getFocusedPaneId()).toBe(1);
      expect(store.getState().activeTabId).toBe(only.id);
      // A fresh Untitled tab keeps pane 0 populated.
      expect(store.getTabsForPane(0)).toHaveLength(1);
    });

    it('enableSplit with two tabs leaves one on each side', () => {
      const a = store.createTab({ title: 'A' });
      const b = store.createTab({ title: 'B' }); // active
      store.enableSplit();
      expect(store.getTabsForPane(1).map((t) => t.id)).toEqual([b.id]);
      expect(store.getTabsForPane(0).map((t) => t.id)).toEqual([a.id]);
    });

    it('moveTabToPane enables the split and focuses the moved tab', () => {
      const a = store.createTab({ title: 'A' });
      const b = store.createTab({ title: 'B' });
      store.moveTabToPane(a.id, 1);
      expect(store.isSplitEnabled()).toBe(true);
      expect(store.getTabsForPane(0).map((t) => t.id)).toEqual([b.id]);
      expect(store.getTabsForPane(1).map((t) => t.id)).toEqual([a.id]);
      expect(store.getFocusedPaneId()).toBe(1);
    });

    it('collapses the split when a pane empties via close', () => {
      const a = store.createTab({ title: 'A' });
      const b = store.createTab({ title: 'B' });
      store.moveTabToPane(a.id, 1);
      expect(store.isSplitEnabled()).toBe(true);
      store.closeTab(a.id); // pane 1 now empty
      expect(store.isSplitEnabled()).toBe(false);
      expect(store.getTabsForPane(0).map((t) => t.id)).toEqual([b.id]);
    });

    it('disableSplit returns every tab to pane 0 keeping the focused tab', () => {
      const a = store.createTab({ title: 'A' });
      store.createTab({ title: 'B' });
      store.moveTabToPane(a.id, 1); // a on right, focused
      store.disableSplit();
      expect(store.isSplitEnabled()).toBe(false);
      expect(store.getState().activeTabId).toBe(a.id);
      expect(store.getTabsForPane(0)).toHaveLength(2);
      expect(store.getTabsForPane(1)).toHaveLength(0);
    });

    it('setFocusedPane switches focus and mirrors activeTabId', () => {
      const a = store.createTab({ title: 'A' });
      store.createTab({ title: 'B' });
      store.moveTabToPane(a.id, 1); // focus pane 1 (a)
      store.setFocusedPane(0);
      expect(store.getFocusedPaneId()).toBe(0);
      expect(store.getState().activeTabId).toBe(store.getPaneActiveTabId(0));
    });

    it('setSplitRatio clamps and persists without notifying', () => {
      const handler = vi.fn();
      store.createTab();
      store.subscribe(handler);
      handler.mockClear();
      store.setSplitRatio(0.95);
      expect(store.getSplitRatio()).toBe(0.8);
      expect(handler).not.toHaveBeenCalled();
    });

    it('reorders tabs within a pane', () => {
      const a = store.createTab({ title: 'A' });
      const b = store.createTab({ title: 'B' });
      const c = store.createTab({ title: 'C' });
      store.moveTabWithinPane(0, 0, 2); // move A to the end
      expect(store.getTabsForPane(0).map((t) => t.id)).toEqual([
        b.id,
        c.id,
        a.id,
      ]);
    });
  });

  describe('split hydrate/migration', () => {
    it('migrates legacy state (no paneId) into a single pane', async () => {
      const state = await store.hydrate({
        notepad: {
          tabs: [
            {
              id: 't1',
              title: 'One',
              content: '',
              isDirty: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          activeTabId: 't1',
          untitledCounter: 1,
        } as any,
      });
      expect(state.splitEnabled).toBe(false);
      expect(state.tabs[0].paneId).toBe(0);
      expect(state.activeTabId).toBe('t1');
    });

    it('collapses a persisted split that has no tabs on one side', async () => {
      const state = await store.hydrate({
        notepad: {
          tabs: [
            {
              id: 't1',
              title: 'One',
              content: '',
              isDirty: false,
              paneId: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          activeTabId: 't1',
          untitledCounter: 1,
          splitEnabled: true,
          activePaneId: 1,
          paneActiveTabIds: ['t1', undefined],
        } as any,
      });
      expect(state.splitEnabled).toBe(false);
      expect(state.activePaneId).toBe(0);
      expect(state.activeTabId).toBe('t1');
    });

    it('restores a valid persisted split', async () => {
      const state = await store.hydrate({
        notepad: {
          tabs: [
            {
              id: 'l1',
              title: 'Left',
              content: '',
              isDirty: false,
              paneId: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'r1',
              title: 'Right',
              content: '',
              isDirty: false,
              paneId: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          activeTabId: 'r1',
          untitledCounter: 1,
          splitEnabled: true,
          activePaneId: 1,
          paneActiveTabIds: ['l1', 'r1'],
        } as any,
      });
      expect(state.splitEnabled).toBe(true);
      expect(store.getTabsForPane(0).map((t) => t.id)).toEqual(['l1']);
      expect(store.getTabsForPane(1).map((t) => t.id)).toEqual(['r1']);
      expect(state.activeTabId).toBe('r1');
    });
  });

  describe('closeTabsToLeft / closeTabsToRight', () => {
    it('closes tabs to the left within the pane, keeping the anchor active', () => {
      const a = store.createTab({ title: 'A' });
      const b = store.createTab({ title: 'B' });
      const c = store.createTab({ title: 'C' });
      store.closeTabsToLeft(c.id);
      expect(store.getState().tabs.map((t) => t.id)).toEqual([c.id]);
      expect(store.getState().activeTabId).toBe(c.id);
      expect([a.id, b.id]).not.toContain(store.getState().activeTabId);
    });

    it('closes tabs to the right within the pane', () => {
      const a = store.createTab({ title: 'A' });
      store.createTab({ title: 'B' });
      store.createTab({ title: 'C' });
      store.closeTabsToRight(a.id);
      expect(store.getState().tabs.map((t) => t.id)).toEqual([a.id]);
      expect(store.getState().activeTabId).toBe(a.id);
    });

    it('is a no-op when there are no tabs on that side', () => {
      const a = store.createTab({ title: 'A' });
      store.createTab({ title: 'B' });
      store.closeTabsToLeft(a.id); // nothing to the left
      expect(store.getState().tabs).toHaveLength(2);
    });

    it('only closes tabs within the anchor tab pane when split', () => {
      const a = store.createTab({ title: 'A' });
      const b = store.createTab({ title: 'B' });
      const c = store.createTab({ title: 'C' });
      store.moveTabToPane(c.id, 1); // c → right pane; a, b on left
      store.closeTabsToLeft(b.id); // closes a only (left pane)
      expect(store.getTabsForPane(0).map((t) => t.id)).toEqual([b.id]);
      expect(store.getTabsForPane(1).map((t) => t.id)).toEqual([c.id]);
      expect(store.isSplitEnabled()).toBe(true);
    });
  });
});
