import { HistoryItem, ApiRequest, ApiResponse } from '../../shared/types';
import { capHistoryBodies } from '../../shared/history-persistence';

export class HistoryManager {
  private history: HistoryItem[] = [];
  /**
   * requestId → epoch ms of the last explicit "Clear" in the response panel.
   * Responses recorded at or before that moment are not auto-restored when the
   * request is reopened, so closing and reopening a tab can't undo a clear.
   * They remain listed in the previous-responses dropdown and History panel.
   */
  private clearedResponses: Record<string, number> = {};

  initialize(): void {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for successful responses to add to history
    document.addEventListener('response-received', (e: Event) => {
      const customEvent = e as CustomEvent;
      const response = customEvent.detail.response;
      const request = customEvent.detail.request;

      if (response && request) {
        this.addToHistory(request, response);
      }
    });

    // Listen for tabs being closed with responses to preserve them in history
    document.addEventListener('tab-closed-with-response', (e: Event) => {
      const customEvent = e as CustomEvent;
      const response = customEvent.detail.response;
      const request = customEvent.detail.request;

      if (response && request) {
        // Check if this request/response is already in history to avoid duplicates
        const exists = this.history.some(
          (item) =>
            item.request.id === request.id &&
            item.response.status === response.status &&
            Math.abs(new Date(item.timestamp).getTime() - Date.now()) < 60000 // Within last minute
        );

        if (!exists) {
          this.addToHistory(request, response);
        }
      }
    });

    // Synchronous query: callers dispatch with `{ requestId, items: [] }`,
    // we populate `items` in place. Used by the response panel "Compare with"
    // dropdown to list previous responses for the current request.
    document.addEventListener('request-previous-responses', (e: Event) => {
      const customEvent = e as CustomEvent;
      const requestId = customEvent.detail?.requestId as string | undefined;
      const sink = customEvent.detail?.items as HistoryItem[] | undefined;
      if (!requestId || !Array.isArray(sink)) return;
      this.history
        .filter((item) => item.request.id === requestId)
        .forEach((item) => sink.push(item));
    });

    // The user pressed "Clear" — remember it so reopening the request (which
    // restores the last response from history) doesn't undo the clear.
    document.addEventListener('response-cleared', (e: Event) => {
      const customEvent = e as CustomEvent;
      const requestId = customEvent.detail?.requestId as string | undefined;
      if (requestId) {
        this.markResponsesCleared(requestId);
      }
    });
  }

  addToHistory(request: ApiRequest, response: ApiResponse): void {
    const historyItem: HistoryItem = {
      id: this.generateId(),
      request: { ...request }, // Clone to avoid reference issues
      response: { ...response },
      timestamp: new Date(),
    };

    // Add to beginning of history (most recent first)
    this.history.unshift(historyItem);

    // A fresh response supersedes any earlier "Clear" for this request.
    delete this.clearedResponses[request.id];

    // Limit history to 100 items to prevent excessive memory usage
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }

    // Bound how much response body the history holds in memory. Only the
    // cumulative budget applies here — no per-item cap — so the response that
    // just arrived can always be reopened from the previous-responses dropdown,
    // however big it is.
    this.history = capHistoryBodies(this.history, Infinity);

    // Trigger state save
    this.saveHistory();
  }

  /**
   * Record that the user cleared the response panel for a request. Everything
   * currently in history for that request stops being auto-restored.
   */
  markResponsesCleared(requestId: string): void {
    this.clearedResponses[requestId] = Date.now();
    this.pruneClearedResponses();
    this.saveHistory();
  }

  getClearedResponses(): Record<string, number> {
    return this.clearedResponses;
  }

  setClearedResponses(cleared?: Record<string, number>): void {
    this.clearedResponses = { ...(cleared || {}) };
    this.pruneClearedResponses();
  }

  /** Drop markers for requests that no longer have any history to suppress. */
  private pruneClearedResponses(): void {
    const known = new Set(this.history.map((item) => item.request.id));
    Object.keys(this.clearedResponses).forEach((requestId) => {
      if (!known.has(requestId)) delete this.clearedResponses[requestId];
    });
  }

  getHistory(): HistoryItem[] {
    return this.history;
  }

  setHistory(history: HistoryItem[]): void {
    this.history = history;
  }

  clearHistory(): void {
    this.history = [];
    this.clearedResponses = {};
    this.saveHistory();
  }

  getLastResponseForRequest(
    requestId: string
  ): { request: ApiRequest; response: ApiResponse } | null {
    // Find the most recent history item for this request ID
    const historyItem = this.history.find(
      (item) => item.request.id === requestId
    );

    if (!historyItem) return null;

    // Suppress responses the user explicitly cleared. They stay in history —
    // reachable from the response panel dropdown — but don't come back on
    // their own when the request is reopened.
    const clearedAt = this.clearedResponses[requestId];
    if (clearedAt !== undefined) {
      const recordedAt = new Date(historyItem.timestamp).getTime();
      if (!Number.isNaN(recordedAt) && recordedAt <= clearedAt) return null;
    }

    return {
      request: historyItem.request,
      response: historyItem.response,
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private saveHistory(): void {
    // Trigger a state save by dispatching an event
    const event = new CustomEvent('history-changed', {
      detail: { history: this.history },
    });
    document.dispatchEvent(event);
  }
}
