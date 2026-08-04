/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabsStateManager } from '../tabs-state-manager';
import { ApiRequest, ApiResponse, RequestTab } from '../../../../shared/types';

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
    headers: { 'User-Agent': 'Restbro' },
    ...overrides,
  } as ApiRequest;
}

function makeResponse(body: string, status = 200): ApiResponse {
  return {
    status,
    statusText: 'OK',
    headers: {},
    body,
    time: 10,
    size: body.length,
    timestamp: Date.now(),
  } as ApiResponse;
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
      const evt = dispatched.find((e) => e.type === 'tab-closed-with-response');
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

  describe('swapModeResponses', () => {
    it('stashes the REST response and restores it after a REST→SOAP→REST round-trip', () => {
      tsm.openRequestInTab(makeRequest({ id: 'req-1' }), 'col-1');
      const restResp = makeResponse('{"rest":true}');
      tsm.updateTabByRequestId('req-1', { response: restResp }, false);

      // REST -> SOAP: REST response is stashed, active cleared (no SOAP stash yet)
      const toSoap = tsm.swapModeResponses('req-1', 'rest', 'soap');
      expect(toSoap.response).toBeUndefined();
      expect(tsm.getActiveTab()!.response).toBeUndefined();
      expect(tsm.getActiveTab()!.restResponse).toEqual(restResp);

      // SOAP -> REST: the stashed REST response comes back
      const toRest = tsm.swapModeResponses('req-1', 'soap', 'rest');
      expect(toRest.response).toEqual(restResp);
      expect(tsm.getActiveTab()!.response).toEqual(restResp);
    });

    it('keeps REST and SOAP responses independent across toggles', () => {
      tsm.openRequestInTab(makeRequest({ id: 'req-1' }), 'col-1');
      tsm.updateTabByRequestId(
        'req-1',
        { response: makeResponse('{"rest":true}') },
        false
      );

      tsm.swapModeResponses('req-1', 'rest', 'soap');
      const soapResp = makeResponse('<soap/>');
      tsm.updateTabByRequestId('req-1', { response: soapResp }, false);

      // Back to REST restores the REST response while keeping the SOAP stash.
      const toRest = tsm.swapModeResponses('req-1', 'soap', 'rest');
      expect(toRest.response!.body).toBe('{"rest":true}');
      expect(tsm.getActiveTab()!.soapResponse).toEqual(soapResp);

      // Forward to SOAP again restores the SOAP response.
      const toSoap = tsm.swapModeResponses('req-1', 'rest', 'soap');
      expect(toSoap.response).toEqual(soapResp);
    });

    it('returns an empty object for an unknown requestId', () => {
      tsm.openRequestInTab(makeRequest({ id: 'req-1' }), 'col-1');
      expect(tsm.swapModeResponses('nope', 'rest', 'soap')).toEqual({});
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

    // Regression: opening a collection request into a tab must NOT share
    // nested references (params/headers) with the source request object.
    // The source object is the live collection-tree request; if the tab shares
    // its arrays, later edits bleed back into the collection and across
    // requests ("two requests merged" bug).
    it('does not share params/headers references with the source request', () => {
      const source = makeRequest({
        id: 'col-req',
        url: 'https://a.example.com',
        params: [{ key: 'a', value: '1', enabled: true }],
        headers: [{ key: 'X-A', value: '1', enabled: true }],
      });

      tsm.openRequestInTab(source, 'col-1');
      const tabRequest = tsm.getActiveTab()!.request;

      expect(tabRequest.params).not.toBe(source.params);
      expect(tabRequest.headers).not.toBe(source.headers);

      // Mutating the tab's request must not touch the source (collection) object.
      (tabRequest.params as Array<{ key: string }>).push({
        key: 'b',
        value: '2',
        enabled: true,
      } as never);
      tabRequest.url = 'https://changed.example.com';

      expect((source.params as unknown[]).length).toBe(1);
      expect(source.url).toBe('https://a.example.com');
    });

    it('openRequestInTabWithResponse does not share references with the source request', () => {
      const source = makeRequest({
        id: 'col-req-2',
        params: [{ key: 'a', value: '1', enabled: true }],
      });
      const res = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'hello',
        time: 50,
        size: 5,
        timestamp: Date.now(),
      };

      tsm.openRequestInTabWithResponse(source, res, 'col-1');
      const tabRequest = tsm.getActiveTab()!.request;

      expect(tabRequest.params).not.toBe(source.params);
      (tabRequest.params as Array<{ key: string }>).push({
        key: 'b',
        value: '2',
        enabled: true,
      } as never);
      expect((source.params as unknown[]).length).toBe(1);
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

  describe('loadHistorySnapshotIntoActiveTab', () => {
    const makeResponse = (status: number): ApiResponse => ({
      status,
      statusText: 'OK',
      headers: {},
      body: '{"ok":true}',
      time: 42,
      size: 11,
      timestamp: Date.now(),
    });

    it('replaces the active tab request + response and notifies', () => {
      tsm.createNewTab();
      const notifyBefore = notifyCalls;

      const req = makeRequest({
        id: 'req-1',
        method: 'POST',
        url: 'https://api.example.com/orders',
      });

      tsm.loadHistorySnapshotIntoActiveTab(req, makeResponse(201));

      const active = tsm.getActiveTab()!;
      expect(active.request.method).toBe('POST');
      expect(active.request.url).toBe('https://api.example.com/orders');
      expect(active.response!.status).toBe(201);
      expect(active.isModified).toBe(true);
      expect(notifyCalls).toBeGreaterThan(notifyBefore);
    });

    it('deep-clones the request so the tab never shares references', () => {
      tsm.createNewTab();
      const req = makeRequest({ id: 'req-1', headers: { 'X-Test': 'a' } });

      tsm.loadHistorySnapshotIntoActiveTab(req, makeResponse(200));

      const tabRequest = tsm.getActiveTab()!.request;
      expect(tabRequest).not.toBe(req);
      expect(tabRequest.headers).not.toBe(req.headers);
    });

    it('is a no-op when there is no active tab', () => {
      const notifyBefore = notifyCalls;
      tsm.loadHistorySnapshotIntoActiveTab(makeRequest(), makeResponse(200));
      expect(tsm.getActiveTab()).toBeUndefined();
      expect(notifyCalls).toBe(notifyBefore);
    });
  });

  describe('clearResponseForRequest', () => {
    it('drops the response so a tab switch cannot bring it back', () => {
      tsm.openRequestInTab(makeRequest({ id: 'req-1' }), 'col-1');
      tsm.updateTabByRequestId(
        'req-1',
        {
          response: makeResponse('{"ok":true}'),
          responseViewState: { monacoViewStateResponseTimestamp: 1 },
        },
        false
      );

      tsm.clearResponseForRequest('req-1');

      const tab = tsm.getActiveTab()!;
      expect(tab.response).toBeUndefined();
      expect(tab.responseViewState).toBeUndefined();
    });

    it('also clears the stash for the mode on screen', () => {
      tsm.openRequestInTab(makeRequest({ id: 'req-1' }), 'col-1');
      tsm.updateTabByRequestId(
        'req-1',
        { response: makeResponse('{"rest":true}') },
        false
      );

      tsm.clearResponseForRequest('req-1');

      // A REST -> SOAP -> REST round trip must not resurrect it.
      tsm.swapModeResponses('req-1', 'rest', 'soap');
      const restored = tsm.swapModeResponses('req-1', 'soap', 'rest');
      expect(restored.response).toBeUndefined();
      expect(tsm.getActiveTab()!.response).toBeUndefined();
    });

    it('keeps the other mode stash intact', () => {
      tsm.openRequestInTab(makeRequest({ id: 'req-1' }), 'col-1');
      tsm.updateTabByRequestId(
        'req-1',
        { response: makeResponse('{"rest":true}') },
        false
      );
      tsm.swapModeResponses('req-1', 'rest', 'soap');
      tsm.updateTabByRequestId(
        'req-1',
        { response: makeResponse('<soap/>'), requestMode: 'soap' },
        false
      );

      tsm.clearResponseForRequest('req-1');

      expect(tsm.getActiveTab()!.soapResponse).toBeUndefined();
      expect(tsm.getActiveTab()!.restResponse!.body).toBe('{"rest":true}');
    });

    it('persists the change and does not re-notify listeners', () => {
      tsm.openRequestInTab(makeRequest({ id: 'req-1' }), 'col-1');
      tsm.updateTabByRequestId(
        'req-1',
        { response: makeResponse('{"ok":true}') },
        false
      );
      dispatched.length = 0;
      const notifyBefore = notifyCalls;

      tsm.clearResponseForRequest('req-1');

      expect(dispatched.some((e) => e.type === 'tabs-changed')).toBe(true);
      expect(notifyCalls).toBe(notifyBefore);
    });

    it('is a no-op for an unknown request id', () => {
      tsm.openRequestInTab(makeRequest({ id: 'req-1' }), 'col-1');
      const response = makeResponse('{"ok":true}');
      tsm.updateTabByRequestId('req-1', { response }, false);

      tsm.clearResponseForRequest('req-unknown');

      expect(tsm.getActiveTab()!.response).toEqual(response);
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
