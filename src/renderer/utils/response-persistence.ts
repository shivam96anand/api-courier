import { ApiResponse, HistoryItem, RequestTab } from '../../shared/types';

// Max body size to persist for open tabs (~5 MB). Keep history lean (no body).
// 5 MB prevents truncating many large JSON payloads that are still practical to reopen.
const TAB_BODY_LIMIT = 5_000_000;

function clampBody(body: string, limit: number): string {
  if (!body) return '';
  return body.length > limit ? body.slice(0, limit) : body;
}

function sanitizeTabResponseForPersistence(
  response?: ApiResponse
): ApiResponse | undefined {
  if (!response) return undefined;
  return {
    ...response,
    body: clampBody(response.body || '', TAB_BODY_LIMIT),
  };
}

function sanitizeHistoryResponseForPersistence(
  response?: ApiResponse
): ApiResponse | undefined {
  if (!response) return undefined;
  return { ...response, body: '' };
}

// Keep for backwards-compat if imported elsewhere
export function sanitizeResponseForPersistence(
  response?: ApiResponse
): ApiResponse | undefined {
  return sanitizeTabResponseForPersistence(response);
}

export function sanitizeTabsForPersistence(tabs: RequestTab[]): RequestTab[] {
  return tabs.map((tab) => ({
    ...tab,
    response: sanitizeTabResponseForPersistence(tab.response),
  }));
}

export function sanitizeHistoryForPersistence(history: HistoryItem[]): HistoryItem[] {
  return history.map((item) => ({
    ...item,
    response: sanitizeHistoryResponseForPersistence(item.response)!,
  }));
}
