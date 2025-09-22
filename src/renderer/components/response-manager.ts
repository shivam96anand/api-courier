import { ApiResponse } from '../../shared/types';
import { JsonViewer } from './JsonViewer';

export class ResponseManager {
  private currentResponse: ApiResponse | null = null;
  private jsonViewer: JsonViewer | null = null;

  initialize(): void {
    this.setupResponseTabs();
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
      });
    });
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
    jsonContainer.id = 'json-viewer-container';
    jsonContainer.style.height = '100%';
    jsonContainer.style.minHeight = '400px';

    container.appendChild(jsonContainer);

    // Initialize the JSON viewer
    try {
      this.jsonViewer = new JsonViewer('json-viewer-container');
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

    if (bodyElement) {
      bodyElement.innerHTML = '<div class="response-placeholder">Send a request to see the response here</div>';
    }

    if (headersElement) {
      headersElement.innerHTML = '<div class="response-placeholder">No response headers</div>';
    }

    if (metaElement) {
      metaElement.innerHTML = '<span>No response yet</span>';
    }
  }
}