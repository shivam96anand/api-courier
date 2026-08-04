/**
 * @vitest-environment jsdom
 *
 * Guards the document-event wiring: a dispatched event with no listener fails
 * silently, which is exactly how the response panel's "Clear" and "Open"
 * actions ended up doing nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabsEventHandler } from '../tabs-event-handler';
import { setupEventListeners } from '../../../event-listeners';
import { TabsManager } from '../../tabs-manager';
import { CollectionsManager } from '../../collections-manager';
import { HistoryManager } from '../../history-manager';
import { EnvironmentManager } from '../../environments/environment-manager';
import { AskAiTab } from '../../AskAiTab';

const noop = (): void => {};

describe('TabsEventHandler — response-cleared', () => {
  it('forgets the response for the request that was cleared', () => {
    const cleared: string[] = [];
    const handler = new TabsEventHandler(
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      (requestId) => cleared.push(requestId)
    );
    handler.setupEventListeners();

    document.dispatchEvent(
      new CustomEvent('response-cleared', { detail: { requestId: 'req-1' } })
    );

    expect(cleared).toEqual(['req-1']);
  });
});

describe('setupEventListeners — open-previous-request-response', () => {
  let loadSnapshot: ReturnType<typeof vi.fn>;
  let openWithResponse: ReturnType<typeof vi.fn>;
  let activeTab: unknown;

  const request = { id: 'req-1', name: 'R', method: 'GET', url: 'u' };
  const response = { status: 200, body: '{}', timestamp: 1 };

  beforeEach(() => {
    loadSnapshot = vi.fn();
    openWithResponse = vi.fn();
    activeTab = { id: 'tab-1' };

    const tabsManager = {
      getActiveTab: () => activeTab,
      loadHistorySnapshotIntoActiveTab: loadSnapshot,
      openRequestInTabWithResponse: openWithResponse,
      openRequestInTab: vi.fn(),
    } as unknown as TabsManager;

    setupEventListeners({
      tabsManager,
      collectionsManager: {} as CollectionsManager,
      historyManager: {
        getLastResponseForRequest: () => null,
      } as unknown as HistoryManager,
      environmentManager: {} as EnvironmentManager,
      askAiTab: {} as AskAiTab,
      saveState: async () => {},
    });
  });

  it('restores the snapshot into the active tab', () => {
    document.dispatchEvent(
      new CustomEvent('open-previous-request-response', {
        detail: { request, response },
      })
    );

    expect(loadSnapshot).toHaveBeenCalledWith(request, response);
    expect(openWithResponse).not.toHaveBeenCalled();
  });

  it('opens a new tab when nothing is active', () => {
    activeTab = undefined;

    document.dispatchEvent(
      new CustomEvent('open-previous-request-response', {
        detail: { request, response },
      })
    );

    expect(openWithResponse).toHaveBeenCalledWith(request, response);
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it('ignores malformed payloads', () => {
    document.dispatchEvent(
      new CustomEvent('open-previous-request-response', { detail: {} })
    );

    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(openWithResponse).not.toHaveBeenCalled();
  });
});

describe('clear → close tab → reopen', () => {
  it('does not resurrect the cleared response from history', () => {
    const history = new HistoryManager();
    history.initialize();

    const request = {
      id: 'req-1',
      name: 'R',
      method: 'GET',
      url: 'https://example.com',
      headers: {},
    } as never;
    const response = {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: '{"ok":true}',
      time: 5,
      size: 11,
      timestamp: Date.now(),
    } as never;

    // 1. A response arrives and lands in history.
    document.dispatchEvent(
      new CustomEvent('response-received', { detail: { request, response } })
    );
    expect(history.getLastResponseForRequest('req-1')).not.toBeNull();

    // 2. The user presses Clear in the response panel.
    document.dispatchEvent(
      new CustomEvent('response-cleared', { detail: { requestId: 'req-1' } })
    );

    // 3. Reopening the request (which restores the last response from
    //    history) must not bring the cleared response back...
    expect(history.getLastResponseForRequest('req-1')).toBeNull();

    // ...but it stays listed for the previous-responses dropdown.
    const items: unknown[] = [];
    document.dispatchEvent(
      new CustomEvent('request-previous-responses', {
        detail: { requestId: 'req-1', items },
      })
    );
    expect(items).toHaveLength(1);
  });
});
