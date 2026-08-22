import { ApiResponse, HistoryItem } from './types';

/**
 * Maximum body we persist for a single history item. Only applies on disk —
 * the in-memory history keeps whatever it captured (see
 * `HistoryManager.addToHistory`) so a just-received response is always
 * reopenable, even when it is too big to survive a restart.
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
 * Cap history response bodies. Assumes `history` is ordered newest-first
 * (HistoryManager unshifts new items). A body is kept only when it fits under
 * `itemBodyLimit` and there is room left in {@link HISTORY_TOTAL_BODY_BUDGET};
 * otherwise it is stripped to an empty string (metadata such as
 * status/time/size is always preserved). The function is pure and idempotent.
 *
 * Pass `Infinity` for `itemBodyLimit` to apply only the cumulative budget,
 * which is what the in-memory history does so a single huge response stays
 * viewable for the rest of the session.
 */
export function capHistoryBodies(
  history: HistoryItem[],
  itemBodyLimit: number = HISTORY_ITEM_BODY_LIMIT
): HistoryItem[] {
  let used = 0;
  return history.map((item) => {
    const response: ApiResponse | undefined = item.response;
    const bodyLength = response?.body ? response.body.length : 0;
    if (bodyLength === 0) return item;

    if (
      bodyLength > itemBodyLimit ||
      used + bodyLength > HISTORY_TOTAL_BODY_BUDGET
    ) {
      return { ...item, response: { ...response!, body: '' } };
    }

    used += bodyLength;
    return item;
  });
}

/** Disk variant: also enforces the per-item {@link HISTORY_ITEM_BODY_LIMIT}. */
export function sanitizeHistoryForPersistence(
  history: HistoryItem[]
): HistoryItem[] {
  return capHistoryBodies(history);
}
