import { describe, expect, it } from 'vitest';
import {
  sanitizeResponseForPersistence,
  sanitizeTabsForPersistence,
  sanitizeHistoryForPersistence,
} from '../response-persistence';
import {
  HISTORY_ITEM_BODY_LIMIT,
  HISTORY_TOTAL_BODY_BUDGET,
} from '../../../shared/history-persistence';
import { ApiResponse, HistoryItem, RequestTab } from '../../../shared/types';

function makeResponse(bodySize: number): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: 'x'.repeat(bodySize),
    time: 100,
    size: bodySize,
  };
}

function makeTab(overrides: Partial<RequestTab> = {}): RequestTab {
  return {
    id: 'tab-1',
    name: 'Test Tab',
    request: {
      id: 'req-1',
      name: 'Test',
      method: 'GET',
      url: 'https://api.example.com',
    },
    ...overrides,
  } as RequestTab;
}

function makeHistoryItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: 'hist-1',
    name: 'Test',
    method: 'GET',
    url: 'https://api.example.com',
    timestamp: Date.now(),
    response: makeResponse(100),
    ...overrides,
  } as HistoryItem;
}

describe('response-persistence.ts', () => {
  describe('sanitizeResponseForPersistence', () => {
    it('returns undefined for undefined input', () => {
      expect(sanitizeResponseForPersistence(undefined)).toBeUndefined();
    });

    it('preserves body under 5MB', () => {
      const response = makeResponse(1000);
      const result = sanitizeResponseForPersistence(response);
      expect(result!.body).toBe(response.body);
      expect(result!.body.length).toBe(1000);
      expect(result!.truncated).toBeUndefined();
    });

    it('silently strips body exceeding 5MB without setting truncated flag', () => {
      const response = makeResponse(6_000_000);
      const result = sanitizeResponseForPersistence(response);
      expect(result!.body).toBe('');
      expect(result!.truncated).toBeUndefined();
      expect(result!.truncatedSize).toBeUndefined();
    });

    it('handles empty body', () => {
      const response = { ...makeResponse(0), body: '' };
      const result = sanitizeResponseForPersistence(response);
      expect(result!.body).toBe('');
    });

    it('preserves other response fields', () => {
      const response = makeResponse(100);
      const result = sanitizeResponseForPersistence(response);
      expect(result!.status).toBe(200);
      expect(result!.statusText).toBe('OK');
      expect(result!.headers).toEqual({ 'content-type': 'application/json' });
      expect(result!.time).toBe(100);
    });
  });

  describe('sanitizeTabsForPersistence', () => {
    it('sanitizes response bodies in tabs', () => {
      const tabs = [
        makeTab({ response: makeResponse(6_000_000) }),
        makeTab({ response: makeResponse(100) }),
      ];
      const result = sanitizeTabsForPersistence(tabs);
      expect(result[0].response!.body).toBe('');
      expect(result[0].response!.truncated).toBeUndefined();
      expect(result[1].response!.body.length).toBe(100);
    });

    it('handles tabs without responses', () => {
      const tabs = [makeTab({ response: undefined })];
      const result = sanitizeTabsForPersistence(tabs);
      expect(result[0].response).toBeUndefined();
    });

    it('sanitizes per-mode stashed REST/SOAP response bodies', () => {
      const tabs = [
        makeTab({
          restResponse: makeResponse(6_000_000),
          soapResponse: makeResponse(100),
        }),
      ];
      const result = sanitizeTabsForPersistence(tabs);
      expect(result[0].restResponse!.body).toBe('');
      expect(result[0].soapResponse!.body.length).toBe(100);
    });

    it('returns empty array for empty input', () => {
      expect(sanitizeTabsForPersistence([])).toEqual([]);
    });
  });

  describe('sanitizeHistoryForPersistence', () => {
    it('preserves response body for typical sized history items', () => {
      const history = [makeHistoryItem({ response: makeResponse(5000) })];
      const result = sanitizeHistoryForPersistence(history);
      expect(result[0].response.body.length).toBe(5000);
    });

    it('strips a single response body larger than the per-item cap', () => {
      const history = [
        makeHistoryItem({
          response: makeResponse(HISTORY_ITEM_BODY_LIMIT + 1),
        }),
      ];
      const result = sanitizeHistoryForPersistence(history);
      expect(result[0].response.body).toBe('');
    });

    it('keeps bodies for recent items within the total budget and strips older ones', () => {
      // History is newest-first. With each body at the per-item cap, the
      // cumulative budget is reached after `budget / itemLimit` items; any
      // older items beyond that lose their bodies (metadata is kept).
      const perItem = HISTORY_ITEM_BODY_LIMIT;
      const keepCount = Math.floor(HISTORY_TOTAL_BODY_BUDGET / perItem);
      const history = Array.from({ length: keepCount + 1 }, (_, i) =>
        makeHistoryItem({ id: `hist-${i}`, response: makeResponse(perItem) })
      );

      const result = sanitizeHistoryForPersistence(history);

      for (let i = 0; i < keepCount; i++) {
        expect(result[i].response.body.length).toBe(perItem);
      }
      expect(result[keepCount].response.body).toBe('');
    });

    it('preserves other response fields in history', () => {
      const history = [makeHistoryItem()];
      const result = sanitizeHistoryForPersistence(history);
      expect(result[0].response.status).toBe(200);
      expect(result[0].response.statusText).toBe('OK');
    });

    it('returns empty array for empty input', () => {
      expect(sanitizeHistoryForPersistence([])).toEqual([]);
    });
  });
});
