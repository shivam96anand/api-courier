import { ApiResponse, HistoryItem, RequestTab } from '../../shared/types';

const PERSISTED_BODY_PREVIEW_LIMIT = 0;

function toBodyPreview(body: string): string {
  if (!body || PERSISTED_BODY_PREVIEW_LIMIT <= 0) {
    return '';
  }

  return body.length > PERSISTED_BODY_PREVIEW_LIMIT
    ? body.slice(0, PERSISTED_BODY_PREVIEW_LIMIT)
    : body;
}

export function sanitizeResponseForPersistence(
  response?: ApiResponse
): ApiResponse | undefined {
  if (!response) return undefined;

  return {
    ...response,
    body: toBodyPreview(response.body || ''),
  };
}

export function sanitizeTabsForPersistence(tabs: RequestTab[]): RequestTab[] {
  return tabs.map((tab) => ({
    ...tab,
    response: sanitizeResponseForPersistence(tab.response),
  }));
}

export function sanitizeHistoryForPersistence(history: HistoryItem[]): HistoryItem[] {
  return history.map((item) => ({
    ...item,
    response: sanitizeResponseForPersistence(item.response)!,
  }));
}
