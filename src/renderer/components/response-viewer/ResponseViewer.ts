import { ApiResponse } from '../../../shared/types';
import { ResponseViewerConfig } from '../../types/response-types';
import { JsonViewer } from '../JsonViewer';
import { JsonViewerStatePersistence } from '../json-viewer/json-viewer-state-persistence';

export class ResponseViewer {
  private container: HTMLElement;
  private jsonViewer: JsonViewer | null = null;
  private currentFormatter: 'json' | 'plain' | null = null;
  private currentRequestId: string = 'default';
  private lastResponseTimestamps: Map<string, number> = new Map();
  private statePersistence: JsonViewerStatePersistence = new JsonViewerStatePersistence();

  constructor(container: HTMLElement, private config: ResponseViewerConfig) {
    this.container = container;
    this.setupViewerElements();
  }

  public setRequestId(requestId: string): void {
    this.currentRequestId = requestId;
  }

  private setupViewerElements(): void {
    // Ensure we have the necessary response sections
    this.ensureResponseSections();
  }

  private ensureResponseSections(): void {
    const bodySection = this.container.querySelector('#response-body');
    if (!bodySection) {
      const section = document.createElement('div');
      section.id = 'response-body';
      section.className = 'response-section active';
      this.container.appendChild(section);
    }

    const headersSection = this.container.querySelector('#response-headers');
    if (!headersSection) {
      const section = document.createElement('div');
      section.id = 'response-headers';
      section.className = 'response-section';
      this.container.appendChild(section);
    }

    const metaSection = this.container.querySelector('#response-meta');
    if (!metaSection) {
      const section = document.createElement('div');
      section.id = 'response-meta';
      section.className = 'response-meta';
      this.container.appendChild(section);
    }
  }

  public async displayResponse(response: ApiResponse): Promise<void> {
    // If this is a new response (different timestamp), clear the saved expansion state
    // This ensures that when you send the same request again, you get fresh auto-expansion
    const lastTimestamp = this.lastResponseTimestamps.get(this.currentRequestId);
    if (response.timestamp !== lastTimestamp) {
      await this.statePersistence.clearRequestState(this.currentRequestId);
      this.lastResponseTimestamps.set(this.currentRequestId, response.timestamp);
    }

    await this.updateResponseBody(response);
    this.updateResponseHeaders(response);
    this.updateResponseMeta(response);
  }

  private async updateResponseBody(response: ApiResponse): Promise<void> {
    const bodyElement = document.getElementById('response-body');
    if (!bodyElement) return;

    if (!response.body) {
      bodyElement.innerHTML = '<div class="response-placeholder">No response body</div>';
      this.jsonViewer = null;
      this.currentFormatter = null;
      return;
    }

    const contentType = response.headers['content-type'] || '';
    const isJson = contentType.includes('application/json') || this.isValidJSON(response.body);

    if (isJson) {
      try {
        const parsed = JSON.parse(response.body);
        await this.setupJsonViewer(bodyElement, parsed);
        this.currentFormatter = 'json';
      } catch (e) {
        this.setupPlainTextView(bodyElement, response.body);
        this.currentFormatter = 'plain';
      }
    } else {
      this.setupPlainTextView(bodyElement, response.body);
      this.currentFormatter = 'plain';
    }
  }

  private async setupJsonViewer(container: HTMLElement, jsonData: any): Promise<void> {
    container.innerHTML = '';

    const jsonContainer = document.createElement('div');
    jsonContainer.id = 'response-json-viewer-container';
    jsonContainer.style.height = '100%';
    jsonContainer.style.minHeight = '400px';

    container.appendChild(jsonContainer);

    try {
      this.jsonViewer = new JsonViewer('response-json-viewer-container', {
        requestId: this.currentRequestId
      });
      await this.jsonViewer.setData(jsonData);
    } catch (error) {
      console.error('Failed to initialize JSON viewer:', error);
      this.setupPlainTextView(container, JSON.stringify(jsonData, null, 2));
      this.currentFormatter = 'plain';
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

  private updateResponseMeta(response: ApiResponse): void {
    const metaElement = document.getElementById('response-meta');
    if (!metaElement) return;

    const statusClass = this.getStatusClass(response.status);
    const statusBadge = `<span class="${statusClass}">${response.status} ${response.statusText}</span>`;
    const timeBadge = `<span>${this.formatResponseTime(response.time)}</span>`;
    const sizeBadge = `<span>${this.formatBytes(response.size)}</span>`;

    metaElement.innerHTML = `${statusBadge}<span class="meta-separator">•</span>${timeBadge}<span class="meta-separator">•</span>${sizeBadge}`;

    // Update timestamp separately
    this.updateResponseTimestamp(response.timestamp);
  }

  private formatResponseTime(timeMs: number): string {
    if (timeMs >= 1000) {
      const timeInSeconds = timeMs / 1000;
      return `${timeInSeconds.toFixed(2)}s`;
    }
    return `${timeMs}ms`;
  }

  private updateResponseTimestamp(timestamp: number): void {
    const timestampElement = document.getElementById('response-timestamp');
    if (!timestampElement) return;

    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;

    timestampElement.textContent = `${day}/${month}/${year} ${displayHours}:${minutes}:${seconds} ${ampm}`;
  }

  public switchTab(tab: string): void {
    const sections = this.container.querySelectorAll('.response-section');
    sections.forEach(section => section.classList.remove('active'));

    const targetSection = document.getElementById(`response-${tab}`);
    targetSection?.classList.add('active');
  }

  public search(query: string): void {
    if (this.jsonViewer && this.currentFormatter === 'json') {
      this.jsonViewer.performSearch(query);
    } else if (this.currentFormatter === 'plain') {
      // Implement plain text search if needed
      this.searchInPlainText(query);
    }
  }

  public navigateSearch(direction: number): void {
    if (this.jsonViewer && this.currentFormatter === 'json') {
      this.jsonViewer.navigateSearch(direction);
    }
  }

  public getSearchInfo(): { total: number, current: number } {
    if (this.jsonViewer && this.currentFormatter === 'json') {
      return this.jsonViewer.getSearchInfo();
    }
    return { total: 0, current: 0 };
  }

  private searchInPlainText(query: string): void {
    // Basic text search implementation
    const bodyElement = document.getElementById('response-body');
    const codeElement = bodyElement?.querySelector('code');
    
    if (codeElement && query) {
      const content = codeElement.textContent || '';
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const highlightedContent = content.replace(regex, '<mark>$&</mark>');
      codeElement.innerHTML = highlightedContent;
    }
  }

  public clearSearch(): void {
    if (this.jsonViewer) {
      this.jsonViewer.clearSearch();
    }
    // Clear plain text search highlights
    const bodyElement = document.getElementById('response-body');
    const codeElement = bodyElement?.querySelector('code');
    if (codeElement) {
      const content = codeElement.innerHTML.replace(/<mark>(.*?)<\/mark>/gi, '$1');
      codeElement.innerHTML = content;
    }
  }

  public collapseAll(): void {
    if (this.jsonViewer) {
      this.jsonViewer.collapseAll();
    }
  }

  public expandAll(): void {
    if (this.jsonViewer) {
      this.jsonViewer.expandAll();
    }
  }

  public scrollToTop(): void {
    // Scroll the response-section (body) to top
    const responseBody = document.getElementById('response-body');
    if (responseBody) {
      responseBody.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Also scroll the JSON content itself to the top
    const jsonContent = responseBody?.querySelector('.json-content');
    if (jsonContent) {
      jsonContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  public scrollToBottom(): void {
    const responseBody = document.getElementById('response-body');
    const jsonContent = responseBody?.querySelector('.json-content');

    if (jsonContent) {
      jsonContent.scrollTo({ top: jsonContent.scrollHeight, behavior: 'smooth' });
    } else if (responseBody) {
      responseBody.scrollTo({ top: responseBody.scrollHeight, behavior: 'smooth' });
    }
  }

  public openFullscreen(): void {
    if (this.jsonViewer) {
      this.jsonViewer.openFullscreen();
    }
  }

  public exportJson(): void {
    if (this.jsonViewer && this.currentFormatter === 'json') {
      this.jsonViewer.exportJson();
    }
  }

  public clear(): void {
    const bodyElement = document.getElementById('response-body');
    const headersElement = document.getElementById('response-headers');
    const metaElement = document.getElementById('response-meta');
    const timestampElement = document.getElementById('response-timestamp');

    if (bodyElement) {
      bodyElement.innerHTML = '<div class="response-placeholder">Send a request to see the response here</div>';
    }

    if (headersElement) {
      headersElement.innerHTML = '<div class="response-placeholder">No response headers</div>';
    }

    if (metaElement) {
      metaElement.innerHTML = '<span>No response yet</span>';
    }

    if (timestampElement) {
      timestampElement.textContent = '';
    }

    this.jsonViewer = null;
    this.currentFormatter = null;
  }

  private isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
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

  public destroy(): void {
    if (this.jsonViewer) {
      this.jsonViewer.clear();
      this.jsonViewer = null;
    }
    this.currentFormatter = null;
  }
}
