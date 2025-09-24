import { ApiResponse } from '../../shared/types';
import { JsonViewer } from './JsonViewer';

export class ResponseManager {
  private currentResponse: ApiResponse | null = null;
  private jsonViewer: JsonViewer | null = null;
  private isFloatingSearchVisible = false;

  initialize(): void {
    this.setupResponseTabs();
    this.setupResponseActions();
    this.listenToResponses();
    this.listenToTabChanges();
  }

  private setupResponseTabs(): void {
    const tabs = document.querySelectorAll('.response-tabs .tab');
    const sections = document.querySelectorAll('.response-section');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const sectionName = (tab as HTMLElement).dataset.section;

        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const section = document.getElementById(`response-${sectionName}`);
        if (section) {
          section.classList.add('active');
        }

        // Show/hide action buttons based on active tab
        this.updateActionButtonsVisibility(sectionName);
      });
    });
  }

  private setupResponseActions(): void {
    // Enlarge (Fullscreen) button
    const enlargeBtn = document.getElementById('enlarge-btn');
    enlargeBtn?.addEventListener('click', () => this.toggleFullscreen());

    // Copy button
    const copyBtn = document.getElementById('copy-btn');
    copyBtn?.addEventListener('click', () => this.copyJsonResponse());

    // Search button
    const searchBtn = document.getElementById('search-btn');
    searchBtn?.addEventListener('click', () => this.toggleFloatingSearch());

    // Collapse button
    const collapseBtn = document.getElementById('collapse-btn');
    collapseBtn?.addEventListener('click', () => this.collapseAll());

    // Expand button
    const expandBtn = document.getElementById('expand-btn');
    expandBtn?.addEventListener('click', () => this.expandAll());

    // Top button
    const topBtn = document.getElementById('top-btn');
    topBtn?.addEventListener('click', () => this.scrollToTop());

    // Bottom button
    const bottomBtn = document.getElementById('bottom-btn');
    bottomBtn?.addEventListener('click', () => this.scrollToBottom());

    // Ask AI button
    const askAiBtn = document.getElementById('ask-ai-btn');
    askAiBtn?.addEventListener('click', () => this.handleAskAI());

    // Floating search bar events
    this.setupFloatingSearchEvents();
  }

  private setupFloatingSearchEvents(): void {
    const floatingSearchBar = document.getElementById('floating-search-bar');
    const searchInput = floatingSearchBar?.querySelector('.floating-search-input') as HTMLInputElement;
    const searchClose = document.getElementById('search-close');
    const searchPrev = document.getElementById('search-prev');
    const searchNext = document.getElementById('search-next');

    searchInput?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.performFloatingSearch(query);
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.navigateFloatingSearch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideFloatingSearch();
      }
    });

    searchClose?.addEventListener('click', () => this.hideFloatingSearch());
    searchPrev?.addEventListener('click', () => this.navigateFloatingSearch(-1));
    searchNext?.addEventListener('click', () => this.navigateFloatingSearch(1));
  }

  private updateActionButtonsVisibility(activeSection: string | undefined): void {
    const actionsContainer = document.getElementById('response-actions');
    if (!actionsContainer) return;

    // Show action buttons only for body section with JSON content
    if (activeSection === 'body' && this.currentResponse && this.isJsonResponse()) {
      actionsContainer.style.display = 'flex';
    } else {
      actionsContainer.style.display = 'none';
      this.hideFloatingSearch(); // Hide search if switching away from body
    }
  }

  private listenToResponses(): void {
    document.addEventListener('response-received', (e: Event) => {
      const customEvent = e as CustomEvent;
      const response = customEvent.detail.response;
      this.displayResponse(response);
    });
  }

  private listenToTabChanges(): void {
    document.addEventListener('tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = customEvent.detail.activeTab;

      if (activeTab && activeTab.response) {
        // Display the response for this tab
        this.displayResponse(activeTab.response);
      } else {
        // Clear the response panel if no response
        this.clearResponse();
      }
    });
  }

  private displayResponse(response: ApiResponse): void {
    this.currentResponse = response;
    this.updateResponseMeta(response);
    this.updateResponseBody(response);
    this.updateResponseHeaders(response);
    this.updateActionButtonsVisibility('body'); // Show buttons if JSON response
  }


  private updateResponseMeta(response: ApiResponse): void {
    const metaElement = document.getElementById('response-meta');
    if (!metaElement) return;

    const statusClass = this.getStatusClass(response.status);
    const statusBadge = `<span class="${statusClass}">${response.status} ${response.statusText}</span>`;
    const timeBadge = `<span>${response.time}ms</span>`;
    const sizeBadge = `<span>${this.formatBytes(response.size)}</span>`;

    metaElement.innerHTML = `${statusBadge} ${timeBadge} ${sizeBadge}`;
  }

  private updateResponseBody(response: ApiResponse): void {
    const bodyElement = document.getElementById('response-body');
    if (!bodyElement) return;

    if (!response.body) {
      bodyElement.innerHTML = '<div class="response-placeholder">No response body</div>';
      this.jsonViewer = null;
      return;
    }

    const contentType = response.headers['content-type'] || '';
    const isJson = contentType.includes('application/json') || this.isValidJSON(response.body);

    if (isJson) {
      try {
        const parsed = JSON.parse(response.body);
        this.setupJsonViewer(bodyElement, parsed);
      } catch (e) {
        // If JSON parsing fails, fall back to plain text
        this.setupPlainTextView(bodyElement, response.body);
      }
    } else {
      this.setupPlainTextView(bodyElement, response.body);
    }
  }

  private setupJsonViewer(container: HTMLElement, jsonData: any): void {
    // Clear any existing content
    container.innerHTML = '';

    // Create a container for the JSON viewer
    const jsonContainer = document.createElement('div');
    jsonContainer.id = 'response-json-viewer-container';
    jsonContainer.style.height = '100%';
    jsonContainer.style.minHeight = '400px';

    container.appendChild(jsonContainer);

    // Initialize the JSON viewer
    try {
      this.jsonViewer = new JsonViewer('response-json-viewer-container');
      this.jsonViewer.setData(jsonData);
    } catch (error) {
      console.error('Failed to initialize JSON viewer:', error);
      // Fall back to plain text if JSON viewer fails
      this.setupPlainTextView(container, JSON.stringify(jsonData, null, 2));
    }
  }

  private setupPlainTextView(container: HTMLElement, content: string): void {
    this.jsonViewer = null;

    const preElement = document.createElement('pre');
    preElement.style.whiteSpace = 'pre-wrap';
    preElement.style.wordBreak = 'break-word';
    preElement.style.fontSize = '12px';
    preElement.style.lineHeight = '1.4';
    preElement.style.margin = '0';
    preElement.style.padding = '16px';
    preElement.style.backgroundColor = 'var(--bg-tertiary)';
    preElement.style.border = '1px solid var(--border-color)';
    preElement.style.borderRadius = '4px';
    preElement.style.overflow = 'auto';
    preElement.style.maxHeight = '400px';

    const codeElement = document.createElement('code');
    codeElement.textContent = content;
    preElement.appendChild(codeElement);

    container.innerHTML = '';
    container.appendChild(preElement);
  }

  private updateResponseHeaders(response: ApiResponse): void {
    const headersElement = document.getElementById('response-headers');
    if (!headersElement) return;

    if (!response.headers || Object.keys(response.headers).length === 0) {
      headersElement.innerHTML = '<div class="response-placeholder">No response headers</div>';
      return;
    }

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '12px';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color);">Name</th>
      <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color);">Value</th>
    `;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    Object.entries(response.headers).forEach(([name, value]) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="padding: 8px; border-bottom: 1px solid var(--border-color); font-weight: 500;">${name}</td>
        <td style="padding: 8px; border-bottom: 1px solid var(--border-color); word-break: break-word;">${value}</td>
      `;
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    headersElement.innerHTML = '';
    headersElement.appendChild(table);
  }

  private getStatusClass(status: number): string {
    if (status >= 200 && status < 300) {
      return 'status-success';
    } else if (status >= 400) {
      return 'status-error';
    } else if (status >= 300) {
      return 'status-warning';
    }
    return '';
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  getCurrentResponse(): ApiResponse | null {
    return this.currentResponse;
  }

  clearResponse(): void {
    this.currentResponse = null;

    // Clean up JSON viewer
    if (this.jsonViewer) {
      this.jsonViewer.clear();
      this.jsonViewer = null;
    }

    const bodyElement = document.getElementById('response-body');
    const headersElement = document.getElementById('response-headers');
    const metaElement = document.getElementById('response-meta');
    const actionsContainer = document.getElementById('response-actions');

    if (bodyElement) {
      bodyElement.innerHTML = '<div class="response-placeholder">Send a request to see the response here</div>';
    }

    if (headersElement) {
      headersElement.innerHTML = '<div class="response-placeholder">No response headers</div>';
    }

    if (metaElement) {
      metaElement.innerHTML = '<span>No response yet</span>';
    }

    if (actionsContainer) {
      actionsContainer.style.display = 'none';
    }

    this.hideFloatingSearch();
  }

  // Action button implementations
  private isJsonResponse(): boolean {
    if (!this.currentResponse) return false;
    const contentType = this.currentResponse.headers['content-type'] || '';
    return contentType.includes('application/json') || this.isValidJSON(this.currentResponse.body || '');
  }

  private toggleFullscreen(): void {
    if (this.jsonViewer) {
      // Use the existing fullscreen functionality from JsonViewer
      this.jsonViewer.openFullscreen();
    }
  }

  private copyJsonResponse(): void {
    if (!this.currentResponse || !this.currentResponse.body) return;

    try {
      let textToCopy = this.currentResponse.body;

      // If it's JSON, format it nicely
      if (this.isJsonResponse()) {
        const parsed = JSON.parse(this.currentResponse.body);
        textToCopy = JSON.stringify(parsed, null, 2);
      }

      navigator.clipboard.writeText(textToCopy).then(() => {
        this.showToast('Response copied to clipboard');
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        this.showToast('Response copied to clipboard');
      });
    } catch (error) {
      this.showToast('Failed to copy response');
    }
  }

  private toggleFloatingSearch(): void {
    if (this.isFloatingSearchVisible) {
      this.hideFloatingSearch();
    } else {
      this.showFloatingSearch();
    }
  }

  private showFloatingSearch(): void {
    const floatingSearchBar = document.getElementById('floating-search-bar');
    const searchInput = floatingSearchBar?.querySelector('.floating-search-input') as HTMLInputElement;

    if (floatingSearchBar) {
      floatingSearchBar.style.display = 'flex';
      this.isFloatingSearchVisible = true;

      // Focus the input
      setTimeout(() => {
        searchInput?.focus();
      }, 100);
    }
  }

  private hideFloatingSearch(): void {
    const floatingSearchBar = document.getElementById('floating-search-bar');
    const searchInput = floatingSearchBar?.querySelector('.floating-search-input') as HTMLInputElement;

    if (floatingSearchBar) {
      floatingSearchBar.style.display = 'none';
      this.isFloatingSearchVisible = false;

      // Clear search and reset
      if (searchInput) {
        searchInput.value = '';
      }
      this.clearFloatingSearch();
    }
  }

  private performFloatingSearch(query: string): void {
    if (this.jsonViewer && query.trim()) {
      // Update the JsonViewer's internal search
      this.jsonViewer.performSearch(query.trim());
      this.updateFloatingSearchResults();
    } else if (this.jsonViewer) {
      this.jsonViewer.clearSearch();
      this.updateFloatingSearchResults();
    }
  }

  private navigateFloatingSearch(direction: number): void {
    if (this.jsonViewer) {
      this.jsonViewer.navigateSearch(direction);
      this.updateFloatingSearchResults();
    }
  }

  private clearFloatingSearch(): void {
    if (this.jsonViewer) {
      this.jsonViewer.clearSearch();
      this.updateFloatingSearchResults();
    }
  }

  private updateFloatingSearchResults(): void {
    const resultsSpan = document.querySelector('.floating-search-results');
    if (this.jsonViewer && resultsSpan) {
      const matches = (this.jsonViewer as any).searchMatches || [];
      const currentIndex = (this.jsonViewer as any).currentSearchIndex;
      const total = matches.length;
      const current = currentIndex === -1 ? 0 : currentIndex + 1;
      resultsSpan.textContent = `${current}/${total}`;
    }
  }

  private collapseAll(): void {
    if (this.jsonViewer) {
      this.jsonViewer.collapseAll();
    }
  }

  private expandAll(): void {
    if (this.jsonViewer) {
      this.jsonViewer.expandAll();
    }
  }

  private scrollToTop(): void {
    const responseBody = document.getElementById('response-body');
    const jsonContent = responseBody?.querySelector('.json-content');

    if (jsonContent) {
      jsonContent.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (responseBody) {
      responseBody.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  private scrollToBottom(): void {
    const responseBody = document.getElementById('response-body');
    const jsonContent = responseBody?.querySelector('.json-content');

    if (jsonContent) {
      jsonContent.scrollTo({ top: jsonContent.scrollHeight, behavior: 'smooth' });
    } else if (responseBody) {
      responseBody.scrollTo({ top: responseBody.scrollHeight, behavior: 'smooth' });
    }
  }

  private handleAskAI(): void {
    // Placeholder for Ask AI functionality - to be implemented later
    this.showToast('Ask AI feature coming soon!');
  }

  private showToast(message: string): void {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: var(--primary-color);
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      font-size: 12px;
      animation: slideInFromTop 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  }
}