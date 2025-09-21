import { HistoryItem, ApiRequest, ApiResponse } from '../../shared/types';

export class HistoryManager {
  private history: HistoryItem[] = [];

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
        const exists = this.history.some(item =>
          item.request.id === request.id &&
          item.response.status === response.status &&
          Math.abs(new Date(item.timestamp).getTime() - Date.now()) < 60000 // Within last minute
        );

        if (!exists) {
          this.addToHistory(request, response);
        }
      }
    });
  }

  addToHistory(request: ApiRequest, response: ApiResponse): void {
    const historyItem: HistoryItem = {
      id: this.generateId(),
      request: { ...request }, // Clone to avoid reference issues
      response: { ...response }, // Clone to avoid reference issues
      timestamp: new Date(),
    };

    // Add to beginning of history (most recent first)
    this.history.unshift(historyItem);

    // Limit history to 100 items to prevent excessive memory usage
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }

    // Trigger state save
    this.saveHistory();
  }

  getHistory(): HistoryItem[] {
    return this.history;
  }

  setHistory(history: HistoryItem[]): void {
    this.history = history;
  }

  clearHistory(): void {
    this.history = [];
    this.saveHistory();
  }

  getLastResponseForRequest(requestId: string): { request: ApiRequest; response: ApiResponse } | null {
    // Find the most recent history item for this request ID
    const historyItem = this.history.find(item => item.request.id === requestId);

    if (historyItem) {
      return {
        request: historyItem.request,
        response: historyItem.response
      };
    }

    return null;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private saveHistory(): void {
    // Trigger a state save by dispatching an event
    const event = new CustomEvent('history-changed', {
      detail: { history: this.history }
    });
    document.dispatchEvent(event);
  }
}