/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabsStateManager } from '../tabs-state-manager';
import { ApiRequest, RequestTab } from '../../../../shared/types';

// Mock confirm-dialog — always confirm by default
vi.mock('../../../utils/confirm-dialog', () => ({
  showConfirmDialog: vi.fn().mockResolvedValue(true),
}));

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://example.com',
    headers: { 'User-Agent': 'Restbro/1.0' },
    ...overrides,
  } as ApiRequest;
}

describe('TabsStateManager', () => {
  let tsm: TabsStateManager;
  let notifyCalls: number;
  let notifications: Array<{ message: string; type: string }>;
  let dispatched: CustomEvent[];

  beforeEach(() => {
    vi.restoreAllMocks();
    notifyCalls = 0;
    notifications = [];
    dispatched = [];

    vi.spyOn(document, 'dispatchEvent').mockImplementation((e) => {
      dispatched.push(e as CustomEvent);
      return true;
    });

    tsm = new TabsStateManager(
      () => {
        notifyCalls++;
      },
      (message, type) => {
        notifications.push({ message, type });
      }
    );
  });

  describe('createNewTab', () => {
    it('creates a tab with default values', () => {
      tsm.createNewTab();
      expect(tsm.getTabs()).toHaveLength(1);
      const tab = tsm.getTabs()[0];
      expect(tab.request.method).toBe('GET');
      expect(tab.request.url).toBe('');
      expect(tab.isModified).toBe(false);
      expect(tab.requestMode).toBe('rest');
    });

    it('sets the new tab as active', () => {
      tsm.createNewTab();
      expect(tsm.getActiveTabId()).toBe(tsm.getTabs()[0].id);
    });

    it('increments tab name number', () => {
      tsm.createNewTab();
      tsm.createNewTab();
      expect(tsm.getTabs()[1].request.name).toContain('2');
    });

    it('notifies on tab change', () => {
      tsm.createNewTab();
      expect(notifyCalls).toBe(1);
    });

    it('dispatches tabs-changed event to persist state', () => {
      tsm.createNewTab();
      const evt = dispatched.find((e) => e.type === 'tabs-changed');
      expect(evt).toBeDefined();
    });
  });

  describe('switchToTab', () => {
    it('changes active tab', () => {
      tsm.createNewTab();
      tsm.createNewTab();
      const firstId = tsm.getTabs()[0].id;
      tsm.switchToTab(firstId);
      expect(tsm.getActiveTabId()).toBe(firstId);
    });
  });

  describe('switchToNextTab / switchToPrevTab', () => {
    it('cycles forward through tabs', () => {
      tsm.createNewTab();
      tsm.createNewTab();
      tsm.createNewTab();
      tsm.switchToTab(tsm.getTabs()[0].id);

      tsm.switchToNextTab();
      expect(tsm.getActiveTabId()).toBe(tsm.getTabs()[1].id);

      tsm.switchToNextTab();
      expect(tsm.getActiveTabId()).toBe(tsm.getTabs()[2].id);
    });

    it('wraps around to first tab', () => {
      tsm.createNewTab();
      tsm.createNewTab();
      // Active is already the last tab
      tsm.switchToNextTab();
      expect(tsm.getActiveTabId()).toBe(tsm.getTabs()[0].id);
    });

    it('cycles backward through tabs', () => {
      tsm.createNewTab();
      tsm.createNewTab();
      tsm.switchToTab(tsm.getTabs()[0].id);

      tsm.switchToPrevTab();
      expect(tsm.getActiveTabId()).toBe(tsm.getTabs()[1].id);
    });

    it('does nothing with single tab', () => {
      tsm.createNewTab();
      const id = tsm.getActiveTabId();
      tsm.switchToNextTab();
      expect(tsm.getActiveTabId()).toBe(id);
      tsm.switchToPrevTab();
      expect(tsm.getActiveTabId()).toBe(id);
    });
  });

  describe('closeTab', () => {
    it('removes the tab', () => {
      tsm.createNewTab();
      const tabId = tsm.getTabs()[0].id;
      tsm.closeTab(tabId);
      expect(tsm.getTabs()).toHaveLength(0);
    });

    it('activates the next tab when active tab is closed', () => {
      tsm.createNewTab();
      tsm.createNewTab();
      const firstId = tsm.getTabs()[0].id;
      const secondId = tsm.getTabs()[1].id;
      tsm.switchToTab(firstId);
      tsm.closeTab(firstId);
      expect(tsm.getActiveTabId()).toBe(secondId);
    });

    it('clears activeTabId when last tab is closed', () => {
      tsm.createNewTab();
      tsm.closeTab(tsm.getTabs()[0].id);
      expect(tsm.getActiveTabId()).toBeUndefined();
    });

    it('dispatches tab-closed-with-response when tab has a response', () => {
      tsm.createNewTab();
      const tab = tsm.getTabs()[0];
      tsm.updateActiveTab({
        response: {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: '{}',
          time: 10,
          size: 2,
          timestamp: Date.now(),
        },
      });
      tsm.closeTab(tab.id);
      const evt = dispatched.find(
        (e) => e.type === 'tab-closed-with-response'
      );
      expect(evt).toBeDefined();
    });

    it('does nothing for non-existent tabId', () => {
      tsm.createNewTab();
      tsm.closeTab('nonexistent');
      expect(tsm.getTabs()).toHaveLength(1);
    });
  });

  describe('updateActiveTab', () => {
    it('merges updates into the active tab', () => {
      tsm.createNewTab();
      tsm.updateActiveTab({ name: 'Renamed' });
      expect(tsm.getActiveTab()!.name).toBe('Renamed');
    });

    it('marks tab as modified by default', () => {
      tsm.createNewTab();
      tsm.updateActiveTab({ name: 'Renamed' });
      expect(tsm.getActiveTab()!.isModified).toBe(true);
    });

    it('does not mark as modified when markAsModified=false', () => {
      tsm.createNewTab();
      tsm.updateActiveTab({ name: 'Renamed' }, false);
      expect(tsm.getActiveTab()!.isModified).toBe(false);
    });
  });

  describe('openRequestInTab', () => {
    it('creates a new tab for a new request', () => {
      const req = makeRequest({ id: 'new-req' });
      tsm.openRequestInTab(req, 'col-1');
      expect(tsm.getTabs()).toHaveLength(1);
      expect(tsm.getActiveTab()!.request.id).toBe('new-req');
      expect(tsm.getActiveTab()!.collectionId).toBe('col-1');
    });

    it('switches to existing tab if request already open', () => {
      const req = makeRequest({ id: 'existing' });
      tsm.openRequestInTab(req);
      const firstTabId = tsm.getActiveTabId();
      tsm.createNewTab(); // switch away
      tsm.openRequestInTab(req);
      expect(tsm.getActiveTabId()).toBe(firstTabId);
      expect(tsm.getTabs()).toHaveLength(2); // no extra tab created
    });
  });

  describe('openRequestInTabWithResponse', () => {
    it('creates tab with response pre-loaded', () => {
      const req = makeRequest({ id: 'with-resp' });
      const res = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'hello',
        time: 50,
        size: 5,
        timestamp: Date.now(),
      };
      tsm.openRequestInTabWithResponse(req, res);
      expect(tsm.getActiveTab()!.response).toBeDefined();
      expect(tsm.getActiveTab()!.response!.status).toBe(200);
    });
  });

  describe('duplicateTab', () => {
    it('duplicates a tab with " (Copy)" suffix', () => {
      tsm.createNewTab();
      const tabId = tsm.getTabs()[0].id;
      tsm.duplicateTab(tabId);
      expect(tsm.getTabs()).toHaveLength(2);
      expect(tsm.getTabs()[1].name).toContain('(Copy)');
    });

    it('gives the duplicate a new request id', () => {
      tsm.createNewTab();
      const originalReqId = tsm.getTabs()[0].request.id;
      tsm.duplicateTab(tsm.getTabs()[0].id);
      expect(tsm.getTabs()[1].request.id).not.toBe(originalReqId);
    });

    it('activates the duplicated tab', () => {
      tsm.createNewTab();
      tsm.duplicateTab(tsm.getTabs()[0].id);
      expect(tsm.getActiveTabId()).toBe(tsm.getTabs()[1].id);
    });

    it('does nothing for non-existent tabId', () => {
      tsm.createNewTab();
      tsm.duplicateTab('nonexistent');
      expect(tsm.getTabs()).toHaveLength(1);
    });
  });

  describe('closeTabsByRequestId', () => {
    it('removes all tabs with the given requestId', () => {
      const req = makeRequest({ id: 'target' });
      tsm.openRequestInTab(req);
      tsm.createNewTab();
      expect(tsm.getTabs()).toHaveLength(2);
      tsm.closeTabsByRequestId('target');
      expect(tsm.getTabs()).toHaveLength(1);
    });

    it('does nothing when no tabs match', () => {
      tsm.createNewTab();
      tsm.closeTabsByRequestId('nonexistent');
      expect(tsm.getTabs()).toHaveLength(1);
    });
  });

  describe('updateTabNameForRequest', () => {
    it('renames tabs matching the requestId', () => {
      const req = makeRequest({ id: 'target' });
      tsm.openRequestInTab(req);
      tsm.updateTabNameForRequest('target', 'New Name');
      expect(tsm.getTabs()[0].name).toBe('New Name');
      expect(tsm.getTabs()[0].request.name).toBe('New Name');
    });
  });

  describe('setTabs', () => {
    it('restores tabs with drafts', () => {
      const tabs: RequestTab[] = [
        {
          id: 'tab-1',
          name: 'Restored',
          request: makeRequest(),
          isModified: false,
          requestMode: 'rest',
        },
      ];
      tsm.setTabs(tabs, 'tab-1');
      expect(tsm.getTabs()).toHaveLength(1);
      expect(tsm.getActiveTabId()).toBe('tab-1');
      // restDraft should be populated
      expect(tsm.getTabs()[0].restDraft).toBeDefined();
    });
  });

  describe('getActiveTab', () => {
    it('returns undefined when no tabs exist', () => {
      expect(tsm.getActiveTab()).toBeUndefined();
    });
  });

  describe('closeTab — edge cases', () => {
    it('activates the previous tab when last tab in list is closed', () => {
      tsm.createNewTab();
      tsm.createNewTab();
      tsm.createNewTab();
      const tabs = tsm.getTabs();
      // Active is last tab (tab 3)
      tsm.closeTab(tabs[2].id);
      // Should activate the new last tab (tab 2)
      expect(tsm.getActiveTabId()).toBe(tabs[1].id);
    });

    it('handles closing a non-active tab without switching', () => {
      tsm.createNewTab();
      tsm.createNewTab();
      const tabs = tsm.getTabs();
      const activeId = tsm.getActiveTabId();
      // Close the first (non-active) tab
      tsm.closeTab(tabs[0].id);
      expect(tsm.getActiveTabId()).toBe(activeId);
    });
  });

  describe('updateTabByRequestId', () => {
    it('updates tab matching requestId without marking modified by default', () => {
      const req = makeRequest({ id: 'target-req' });
      tsm.openRequestInTab(req);
      tsm.updateTabByRequestId('target-req', { name: 'Updated via requestId' });
      expect(tsm.getTabs()[0].name).toBe('Updated via requestId');
      expect(tsm.getTabs()[0].isModified).toBe(false);
    });

    it('does nothing when requestId not found', () => {
      tsm.createNewTab();
      tsm.updateTabByRequestId('nonexistent', { name: 'Nope' });
      expect(tsm.getTabs()[0].name).not.toBe('Nope');
    });
  });

  describe('updateActiveTab — no active tab', () => {
    it('does nothing when no active tab exists', () => {
      tsm.updateActiveTab({ name: 'Ghost' });
      expect(tsm.getTabs()).toHaveLength(0);
    });
  });

  describe('reorderTab', () => {
    beforeEach(() => {
      tsm.createNewTab(); // tab A (index 0)
      tsm.createNewTab(); // tab B (index 1)
      tsm.createNewTab(); // tab C (index 2)
      notifyCalls = 0;
    });

    it('moves a tab before the target when dropBefore is true', () => {
      const tabs = tsm.getTabs();
      const [a, b, c] = [tabs[0].id, tabs[1].id, tabs[2].id];
      // Move C before A
      tsm.reorderTab(c, a, true);
      const result = tsm.getTabs().map((t) => t.id);
      expect(result).toEqual([c, a, b]);
    });

    it('moves a tab after the target when dropBefore is false', () => {
      const tabs = tsm.getTabs();
      const [a, b, c] = [tabs[0].id, tabs[1].id, tabs[2].id];
      // Move A after C
      tsm.reorderTab(a, c, false);
      const result = tsm.getTabs().map((t) => t.id);
      expect(result).toEqual([b, c, a]);
    });

    it('does nothing when source equals target', () => {
      const tabs = tsm.getTabs();
      const originalOrder = tabs.map((t) => t.id);
      tsm.reorderTab(tabs[1].id, tabs[1].id, true);
      expect(tsm.getTabs().map((t) => t.id)).toEqual(originalOrder);
    });

    it('does nothing when source tab id is invalid', () => {
      const tabs = tsm.getTabs();
      const originalOrder = tabs.map((t) => t.id);
      tsm.reorderTab('nonexistent', tabs[0].id, true);
      expect(tsm.getTabs().map((t) => t.id)).toEqual(originalOrder);
    });

    it('notifies on reorder', () => {
      const tabs = tsm.getTabs();
      tsm.reorderTab(tabs[2].id, tabs[0].id, true);
      expect(notifyCalls).toBeGreaterThan(0);
    });

    it('persists state after reorder', () => {
      const tabs = tsm.getTabs();
      tsm.reorderTab(tabs[2].id, tabs[0].id, false);
      const evt = dispatched.find((e) => e.type === 'tabs-changed');
      expect(evt).toBeDefined();
    });
  });
});
