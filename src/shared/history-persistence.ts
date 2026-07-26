import { ApiResponse, HistoryItem } from './types';

/**
 * Maximum body we persist for a single history item. Matches the in-memory
 * cap applied when an entry is first added (see `HistoryManager.addToHistory`),
 * so anything the app kept in memory can also survive a restart.
 */
export const HISTORY_ITEM_BODY_LIMIT = 5_000_000; // ~5 MB

/**
 * Cumulative budget for all persisted history response bodies. History is
 * stored newest-first, so bodies are kept for the most recent items until this
 * budget is exhausted, then dropped for older items. This lets users reopen
 * responses for many recent requests across app restarts while keeping
 * `database.json` bounded regardless of individual response sizes.
 */
export const HISTORY_TOTAL_BODY_BUDGET = 20_000_000; // ~20 MB

/**
 * Cap persisted history response bodies. Assumes `history` is ordered
 * newest-first (HistoryManager unshifts new items). A body is kept only when it
 * fits under {@link HISTORY_ITEM_BODY_LIMIT} and there is room left in
 * {@link HISTORY_TOTAL_BODY_BUDGET}; otherwise it is stripped to an empty
 * string (metadata such as status/time/size is always preserved). The function
 * is pure and idempotent.
 */
export function sanitizeHistoryForPersistence(
  history: HistoryItem[]
): HistoryItem[] {
  let used = 0;
  return history.map((item) => {
    const response: ApiResponse | undefined = item.response;
    const bodyLength = response?.body ? response.body.length : 0;
    if (bodyLength === 0) return item;

    if (
      bodyLength > HISTORY_ITEM_BODY_LIMIT ||
      used + bodyLength > HISTORY_TOTAL_BODY_BUDGET
    ) {
      return { ...item, response: { ...response!, body: '' } };
    }

    used += bodyLength;
    return item;
  });
}
