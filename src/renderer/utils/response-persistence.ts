import { ApiResponse, RequestTab } from '../../shared/types';

export { sanitizeHistoryForPersistence } from '../../shared/history-persistence';

// Cap on how much body we persist per tab. Anything bigger gets dropped from
// disk to keep `database.json` lean. We do this silently \u2014 the in-memory
// response is untouched, only the persisted snapshot loses the body. We
// intentionally do NOT set the `truncated` flag so no UI banner is shown;
// the user just sees "no body" if they reload the app, which is acceptable
// for very large responses (re-send to view).
const TAB_BODY_LIMIT = 5_000_000;

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
    // Per-mode stashes are subject to the same body cap as the active response.
    restResponse: sanitizeTabResponseForPersistence(tab.restResponse),
    soapResponse: sanitizeTabResponseForPersistence(tab.soapResponse),
  }));
}
