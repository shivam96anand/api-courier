/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HistoryManager } from '../history-manager';
import { ApiRequest, ApiResponse } from '../../../shared/types';

// Mock the response-persistence module
vi.mock('../../utils/response-persistence', () => ({
  sanitizeResponseForPersistence: vi.fn((r: ApiResponse) =>
    r ? { ...r, body: r.body?.slice(0, 100) ?? '' } : undefined
  ),
}));

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Test',
    method: 'GET',
    url: 'https://example.com',
    headers: {},
    ...overrides,
  } as ApiRequest;
}

function makeResponse(overrides: Partial<ApiResponse> = {}): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{}',
    time: 42,
    size: 2,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('HistoryManager', () => {
  let hm: HistoryManager;
  let dispatched: CustomEvent[];

  beforeEach(() => {
    vi.restoreAllMocks();
    dispatched = [];
    vi.spyOn(document, 'dispatchEvent').mockImplementation((e) => {
      dispatched.push(e as CustomEvent);
      return true;
    });
    vi.spyOn(document, 'addEventListener').mockImplementation(() => {});
    hm = new HistoryManager();
  });

  describe('addToHistory', () => {
    it('adds item at the beginning of history', () => {
      hm.addToHistory(makeRequest(), makeResponse());
      expect(hm.getHistory()).toHaveLength(1);
    });

    it('most recent item is first', () => {
      hm.addToHistory(makeRequest({ id: 'a' }), makeResponse());
      hm.addToHistory(makeRequest({ id: 'b' }), makeResponse());
      expect(hm.getHistory()[0].request.id).toBe('b');
    });

    it('dispatches history-changed event', () => {
      hm.addToHistory(makeRequest(), makeResponse());
      const evt = dispatched.find((e) => e.type === 'history-changed');
      expect(evt).toBeDefined();
      expect(evt!.detail.history).toHaveLength(1);
    });

    it('limits history to 100 items', () => {
      for (let i = 0; i < 105; i++) {
        hm.addToHistory(makeRequest({ id: `r-${i}` }), makeResponse());
      }
      expect(hm.getHistory()).toHaveLength(100);
    });

    it('oldest items are dropped when exceeding limit', () => {
      for (let i = 0; i < 105; i++) {
        hm.addToHistory(makeRequest({ id: `r-${i}` }), makeResponse());
      }
      const history = hm.getHistory();
      // Most recent (r-104) should be first, oldest kept should be r-5
      expect(history[0].request.id).toBe('r-104');
      expect(history[99].request.id).toBe('r-5');
    });
  });

  describe('getHistory / setHistory / clearHistory', () => {
    it('getHistory returns empty array initially', () => {
      expect(hm.getHistory()).toEqual([]);
    });

    it('setHistory replaces entire history', () => {
      hm.addToHistory(makeRequest(), makeResponse());
      hm.setHistory([]);
      expect(hm.getHistory()).toEqual([]);
    });

    it('clearHistory empties history and dispatches event', () => {
      hm.addToHistory(makeRequest(), makeResponse());
      dispatched = [];
      hm.clearHistory();
      expect(hm.getHistory()).toEqual([]);
      const evt = dispatched.find((e) => e.type === 'history-changed');
      expect(evt).toBeDefined();
    });
  });

  describe('getLastResponseForRequest', () => {
    it('returns null when no matching request', () => {
      expect(hm.getLastResponseForRequest('nonexistent')).toBeNull();
    });

    it('returns the most recent matching history item', () => {
      const req = makeRequest({ id: 'target' });
      const res = makeResponse({ status: 201 });
      hm.addToHistory(req, res);
      hm.addToHistory(makeRequest({ id: 'other' }), makeResponse());

      const result = hm.getLastResponseForRequest('target');
      expect(result).not.toBeNull();
      expect(result!.request.id).toBe('target');
    });
  });

  describe('addToHistory — dedup and edge cases', () => {
    it('clones request to avoid reference issues', () => {
      const req = makeRequest({ id: 'ref-test' });
      const res = makeResponse();
      hm.addToHistory(req, res);

      // Mutating the original should not affect history
      req.url = 'https://mutated.com';
      expect(hm.getHistory()[0].request.url).toBe('https://example.com');
    });

    it('generates unique IDs for history items', () => {
      hm.addToHistory(makeRequest({ id: 'a' }), makeResponse());
      hm.addToHistory(makeRequest({ id: 'b' }), makeResponse());
      const ids = hm.getHistory().map((h) => h.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('sanitizes response before storing', () => {
      const longBody = 'x'.repeat(500);
      hm.addToHistory(makeRequest(), makeResponse({ body: longBody }));
      // sanitizeResponseForPersistence is mocked to slice to 100 chars
      expect(hm.getHistory()[0].response.body!.length).toBeLessThanOrEqual(100);
    });
  });

  describe('initialize', () => {
    it('sets up event listeners', () => {
      hm.initialize();
      expect(document.addEventListener).toHaveBeenCalledWith(
        'response-received',
        expect.any(Function)
      );
      expect(document.addEventListener).toHaveBeenCalledWith(
        'tab-closed-with-response',
        expect.any(Function)
      );
    });
  });
});
