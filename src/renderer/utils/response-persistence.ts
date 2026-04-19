import { ApiResponse, HistoryItem, RequestTab } from '../../shared/types';

// Cap on how much body we persist per tab. Anything bigger gets dropped from
// disk to keep `database.json` lean. We do this silently \u2014 the in-memory
// response is untouched, only the persisted snapshot loses the body. We
// intentionally do NOT set the `truncated` flag so no UI banner is shown;
// the user just sees "no body" if they reload the app, which is acceptable
// for very large responses (re-send to view).
const TAB_BODY_LIMIT = 5_000_000;

// Cap on how much body we persist per history item. Smaller than tabs because
// we keep up to 100 items. Persisting the body (up to this cap) lets the
// "Compare with previous response" feature keep working across app restarts;
// without this, the right-hand side of JSON Compare would be empty after
// reload because history responses had been stripped.
const HISTORY_BODY_LIMIT = 1_000_000; // ~1 MB per item

function sanitizeTabResponseForPersistence(
  response?: ApiResponse
): ApiResponse | undefined {
  if (!response) return undefined;
  const body = response.body || '';
  if (body.length <= TAB_BODY_LIMIT) {
    return { ...response };
  }
  return {
    ...response,
    body: '',
  };
}

function sanitizeHistoryResponseForPersistence(
  response?: ApiResponse
): ApiResponse | undefined {
  if (!response) return undefined;
  const body = response.body || '';
  if (body.length <= HISTORY_BODY_LIMIT) {
    return { ...response };
  }
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

export function sanitizeHistoryForPersistence(
  history: HistoryItem[]
): HistoryItem[] {
  return history.map((item) => ({
    ...item,
    response: sanitizeHistoryResponseForPersistence(item.response)!,
  }));
}
