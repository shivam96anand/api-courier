import { ApiResponse, RequestMode } from '../../../shared/types';
import { ResponseViewerConfig } from '../../types/response-types';
import { MonacoJsonEditor } from '../request/MonacoJsonEditor';
import { JsonViewerUtilities } from '../json-viewer/utilities';

export class ResponseViewer {
  private static readonly LARGE_JSON_RAW_THRESHOLD_BYTES = 2 * 1024 * 1024;
  private static readonly JSON_SNIFF_LIMIT_BYTES = 256 * 1024;

  private container: HTMLElement;
  private monacoEditor: MonacoJsonEditor | null = null;
  private currentFormatter: 'json' | 'plain' | null = null;
  private parsedJsonData: unknown | null = null;
  private detectedJsonBody = false;
  private currentSoapFault = false;
  private currentRequestId: string = 'default';
  private lastResponseTimestamps: Map<string, number> = new Map();

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

  public async displayResponse(response: ApiResponse, requestMode: RequestMode = 'rest'): Promise<void> {
    const lastTimestamp = this.lastResponseTimestamps.get(this.currentRequestId);
    if (response.timestamp !== lastTimestamp) {
      console.log(`[ResponseViewer] New response detected (size: ${response.size} bytes)`);
      this.lastResponseTimestamps.set(this.currentRequestId, response.timestamp);
    } else {
      console.log(`[ResponseViewer] Same response (size: ${response.size} bytes)`);
    }

    await this.updateResponseBody(response, requestMode);
    this.updateResponseHeaders(response);
    this.updateResponseMeta(response);
  }

  private async updateResponseBody(response: ApiResponse, requestMode: RequestMode): Promise<void> {
    const bodyElement = document.getElementById('response-body');
    if (!bodyElement) return;

    if (!response.body) {
      bodyElement.innerHTML = '<div class="response-placeholder">No response body</div>';
      this.disposeMonaco();
      this.currentFormatter = null;
      this.parsedJsonData = null;
      this.detectedJsonBody = false;
      this.currentSoapFault = false;
      this.updateSoapFaultBadge(false);
      this.emitModeChanged();
      return;
    }

    const contentType = this.getHeaderValueCaseInsensitive(response.headers, 'content-type') || '';
    this.currentSoapFault = false;
    const isXmlMode = requestMode === 'soap' || this.isXmlContentType(contentType);
    if (isXmlMode) {
      const xmlParseResult = this.tryParseXml(response.body);
      if (xmlParseResult.ok && xmlParseResult.document) {
        const formattedXml = this.prettyPrintXml(xmlParseResult.document);
        const hasSoapFault = this.hasSoapFault(xmlParseResult.document);
        this.setupXmlView(bodyElement, formattedXml, hasSoapFault);
        this.currentFormatter = 'plain';
        this.parsedJsonData = null;
        this.detectedJsonBody = false;
        this.currentSoapFault = hasSoapFault;
        this.updateSoapFaultBadge(hasSoapFault);
        this.emitModeChanged();
        return;
      }
    }

    const responseBytes = this.getResponseBytes(response);
    const isJsonContentType = this.isJsonContentType(contentType);
    const shouldSniffJson = !isJsonContentType && responseBytes <= ResponseViewer.JSON_SNIFF_LIMIT_BYTES;

    let parsedJson: unknown | null = null;
    let detectedJson = false;

    if (isJsonContentType || shouldSniffJson) {
      const parseResult = this.tryParseJson(response.body);
      detectedJson = parseResult.ok;
      parsedJson = parseResult.value;
    }

    if (detectedJson && parsedJson !== null && responseBytes >= ResponseViewer.LARGE_JSON_RAW_THRESHOLD_BYTES) {
      this.setupLargeJsonPreview(bodyElement, response.body, response.size);
      this.currentFormatter = 'plain';
      this.parsedJsonData = null;
      this.detectedJsonBody = true;
      this.emitModeChanged();
      return;
    }

    if (detectedJson && parsedJson !== null) {
      const mounted = await this.setupJsonViewer(bodyElement, parsedJson, response.size);
      if (mounted) {
        this.currentFormatter = 'json';
        this.parsedJsonData = parsedJson;
        this.detectedJsonBody = true;
      } else {
        this.currentFormatter = 'plain';
        this.parsedJsonData = null;
        this.detectedJsonBody = false;
      }
    } else {
      if (response.status >= 400) {
        this.setupErrorBodyView(bodyElement, response.body, response.status, response.statusText);
      } else {
        this.setupPlainTextView(bodyElement, response.body);
      }
      this.currentFormatter = 'plain';
      this.parsedJsonData = null;
      this.detectedJsonBody = false;
      this.currentSoapFault = false;
    }

    this.updateSoapFaultBadge(this.currentSoapFault);
    this.emitModeChanged();
  }

  private setupXmlView(container: HTMLElement, xml: string, hasSoapFault: boolean): void {
    this.disposeMonaco();
    this.parsedJsonData = null;

    const wrapper = document.createElement('div');
    wrapper.className = `xml-response-wrapper${hasSoapFault ? ' has-soap-fault' : ''}`;

    if (hasSoapFault) {
      const banner = document.createElement('div');
      banner.className = 'soap-fault-banner';
      banner.textContent = 'SOAP Fault detected';
      wrapper.appendChild(banner);
    }

    const preElement = document.createElement('pre');
    preElement.className = `xml-response${hasSoapFault ? ' soap-fault' : ''}`;
    const codeElement = document.createElement('code');

    if (hasSoapFault) {
      codeElement.innerHTML = this.highlightSoapFault(xml);
    } else {
      codeElement.textContent = xml;
    }

    preElement.appendChild(codeElement);
    wrapper.appendChild(preElement);

    container.innerHTML = '';
    container.appendChild(wrapper);
  }

  private async setupJsonViewer(container: HTMLElement, jsonData: any, _responseSize?: number): Promise<boolean> {
    this.disposeMonaco();
    container.innerHTML = '';

    const jsonContainer = document.createElement('div');
    jsonContainer.id = 'response-monaco-json-container';
    jsonContainer.style.height = '100%';
    jsonContainer.style.minHeight = '400px';

    container.appendChild(jsonContainer);

    try {
      const formattedJson = JSON.stringify(jsonData, null, 2);
      this.monacoEditor = new MonacoJsonEditor({
        container: jsonContainer,
        value: formattedJson,
        onChange: () => { /* read-only, no-op */ },
        readOnly: true,
      });
      return true;
    } catch (error) {
      console.error('Failed to initialize Monaco JSON viewer:', error);
      this.setupPlainTextView(container, JSON.stringify(jsonData, null, 2));
      return false;
    }
  }

  private setupLargeJsonPreview(container: HTMLElement, content: string, responseSize?: number): void {
    this.disposeMonaco();

    const notice = document.createElement('div');
    notice.style.cssText = `
      margin: 12px;
      padding: 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    `;

    const message = document.createElement('div');
    message.style.fontSize = '12px';
    message.style.color = 'var(--text-secondary)';
    message.textContent = `Large JSON response (${this.formatBytes(responseSize || this.getResponseBytesFromBody(content))}) shown as raw text by default.`;

    const button = document.createElement('button');
    button.textContent = 'Pretty Print';
    button.className = 'response-action-btn';
    button.style.whiteSpace = 'nowrap';

    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Formatting...';

      await new Promise((resolve) => requestAnimationFrame(resolve));

      const parseResult = this.tryParseJson(content);
      if (!parseResult.ok || parseResult.value === null) {
        button.disabled = false;
        button.textContent = 'Pretty Print';
        return;
      }

      const mounted = await this.setupJsonViewer(container, parseResult.value, responseSize);
      if (!mounted) {
        button.disabled = false;
        button.textContent = 'Pretty Print';
        return;
      }

      this.currentFormatter = 'json';
      this.parsedJsonData = parseResult.value;
      this.detectedJsonBody = true;
      this.emitModeChanged();
    });

    notice.appendChild(message);
    notice.appendChild(button);

    const preElement = this.buildPlainTextElement(content);
    container.innerHTML = '';
    container.appendChild(notice);
    container.appendChild(preElement);
  }

  private setupErrorBodyView(container: HTMLElement, content: string, status: number, statusText: string): void {
    this.disposeMonaco();
    this.parsedJsonData = null;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px;';

    // Extract a human-readable message from HTML body if present
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    const rawMessage = (h1Match?.[1] || titleMatch?.[1] || '').replace(/&[a-z#0-9]+;/gi, ' ').trim();
    const humanMessage = rawMessage.toLowerCase() !== `${status} ${statusText}`.toLowerCase() ? rawMessage : '';

    const isServerError = status >= 500;
    const accentColor = isServerError ? 'var(--error-color, #ef4444)' : 'var(--warning-color, #f59e0b)';
    const bgColor = isServerError ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)';
    const borderColor = isServerError ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)';

    const banner = document.createElement('div');
    banner.style.cssText = [
      'display:flex', 'align-items:flex-start', 'gap:12px',
      `padding:14px 16px`,
      `background:${bgColor}`,
      `border:1px solid ${borderColor}`,
      `border-left:4px solid ${accentColor}`,
      'border-radius:8px'
    ].join(';');

    const icon = document.createElement('div');
    icon.style.cssText = `font-size:20px; line-height:1; flex-shrink:0; margin-top:2px; color:${accentColor};`;
    icon.textContent = isServerError ? '✕' : '!';

    const textWrapper = document.createElement('div');
    textWrapper.style.flex = '1';

    const statusLine = document.createElement('div');
    statusLine.style.cssText = `font-size:15px; font-weight:600; color:${accentColor}; margin-bottom:2px; font-family:var(--font-mono);`;
    statusLine.textContent = `${status} ${statusText}`;
    textWrapper.appendChild(statusLine);

    if (humanMessage) {
      const msgLine = document.createElement('div');
      msgLine.style.cssText = 'font-size:13px; color:var(--text-secondary); margin-top:4px;';
      msgLine.textContent = humanMessage;
      textWrapper.appendChild(msgLine);
    }

    banner.appendChild(icon);
    banner.appendChild(textWrapper);
    wrapper.appendChild(banner);

    // Collapsible raw body
    const rawIsHtml = /<html[\s>]/i.test(content);
    const details = document.createElement('details');

    const summary = document.createElement('summary');
    summary.style.cssText = [
      'cursor:pointer', 'user-select:none',
      'padding:6px 8px', 'border-radius:4px',
      'color:var(--text-secondary)', 'font-size:12px',
      'list-style:none', 'display:flex', 'align-items:center', 'gap:6px'
    ].join(';');
    summary.textContent = rawIsHtml ? '▶  Raw HTML response' : '▶  Raw response body';
    summary.addEventListener('click', () => {
      requestAnimationFrame(() => {
        summary.textContent = details.open
          ? (rawIsHtml ? '▼  Raw HTML response' : '▼  Raw response body')
          : (rawIsHtml ? '▶  Raw HTML response' : '▶  Raw response body');
      });
    });

    const preElement = this.buildPlainTextElement(content);
    preElement.style.marginTop = '6px';

    details.appendChild(summary);
    details.appendChild(preElement);
    wrapper.appendChild(details);

    container.innerHTML = '';
    container.appendChild(wrapper);
  }

  private setupPlainTextView(container: HTMLElement, content: string): void {
    this.disposeMonaco();
    this.parsedJsonData = null;

    const preElement = this.buildPlainTextElement(content);
    container.innerHTML = '';
    container.appendChild(preElement);
  }

  private buildPlainTextElement(content: string): HTMLPreElement {
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
    preElement.style.flex = '1';
    preElement.style.minHeight = '0';
    preElement.style.maxHeight = 'none';

    const codeElement = document.createElement('code');
    codeElement.textContent = content;
    preElement.appendChild(codeElement);
    return preElement;
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
    const statusEl = document.getElementById('meta-status');
    const timeEl = document.getElementById('meta-time');
    const sizeEl = document.getElementById('meta-size');

    if (statusEl) {
      statusEl.textContent = `${response.status} ${response.statusText}`;
      statusEl.classList.remove('meta-chip--success', 'meta-chip--warning', 'meta-chip--error');
      if (response.status >= 200 && response.status < 300) {
        statusEl.classList.add('meta-chip--success');
      } else if (response.status >= 300 && response.status < 500) {
        statusEl.classList.add('meta-chip--warning');
      } else if (response.status >= 500) {
        statusEl.classList.add('meta-chip--error');
      }
    }
    if (timeEl) timeEl.textContent = this.formatResponseTime(response.time);
    if (sizeEl) sizeEl.textContent = this.formatBytes(response.size);

    this.updateResponseTimestamp(response.timestamp);

    // Add status class to toolbar for subtle background tint
    const toolbar = document.querySelector('.response-toolbar');
    if (toolbar) {
      toolbar.classList.remove('status-2xx', 'status-3xx', 'status-4xx', 'status-5xx');
      if (response.status >= 200 && response.status < 300) {
        toolbar.classList.add('status-2xx');
      } else if (response.status >= 300 && response.status < 400) {
        toolbar.classList.add('status-3xx');
      } else if (response.status >= 400 && response.status < 500) {
        toolbar.classList.add('status-4xx');
      } else if (response.status >= 500) {
        toolbar.classList.add('status-5xx');
      }
    }
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

  /** Open Monaco's native find widget (single unified search bar) */
  public triggerMonacoSearch(): void {
    if (this.monacoEditor && this.currentFormatter === 'json') {
      this.monacoEditor.triggerFind();
    }
  }

  public search(query: string): void {
    if (this.monacoEditor && this.currentFormatter === 'json') {
      this.monacoEditor.triggerFind();
    } else if (this.currentFormatter === 'plain') {
      this.searchInPlainText(query);
    }
  }

  public navigateSearch(direction: number): void {
    if (this.monacoEditor && this.currentFormatter === 'json') {
      const editor = this.monacoEditor.getEditor();
      if (!editor) return;
      if (direction > 0) {
        editor.getAction('editor.action.nextMatchFindAction')?.run();
      } else {
        editor.getAction('editor.action.previousMatchFindAction')?.run();
      }
    }
  }

  public getSearchInfo(): { total: number, current: number } {
    // Monaco manages search internally via its find widget
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
    if (this.monacoEditor) {
      const editor = this.monacoEditor.getEditor();
      if (editor) {
        editor.getAction('closeFindWidget')?.run();
      }
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
    if (this.monacoEditor) {
      this.monacoEditor.foldAll();
    }
  }

  public expandAll(): void {
    if (this.monacoEditor) {
      this.monacoEditor.unfoldAll();
    }
  }

  public scrollToTop(): void {
    if (this.monacoEditor) {
      this.monacoEditor.scrollToTop();
      return;
    }
    const responseBody = document.getElementById('response-body');
    if (responseBody) {
      responseBody.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  public scrollToBottom(): void {
    if (this.monacoEditor) {
      this.monacoEditor.scrollToBottom();
      return;
    }
    const responseBody = document.getElementById('response-body');
    if (responseBody) {
      responseBody.scrollTo({ top: responseBody.scrollHeight, behavior: 'smooth' });
    }
  }

  public openFullscreen(): void {
    if (this.parsedJsonData) {
      JsonViewerUtilities.openFullscreenMonaco(this.parsedJsonData);
    }
  }

  public exportJson(): void {
    if (this.parsedJsonData && this.currentFormatter === 'json') {
      JsonViewerUtilities.exportJson(this.parsedJsonData);
    }
  }

  public isJsonBody(): boolean {
    return this.currentFormatter === 'json';
  }

  public getParsedJson(): unknown | null {
    return this.parsedJsonData;
  }

  public clear(): void {
    const bodyElement = document.getElementById('response-body');
    const headersElement = document.getElementById('response-headers');
    const timestampElement = document.getElementById('response-timestamp');

    this.disposeMonaco();

    if (bodyElement) {
      bodyElement.innerHTML = '<div class="response-placeholder">Send a request to see the response here</div>';
    }

    if (headersElement) {
      headersElement.innerHTML = '<div class="response-placeholder">No response headers</div>';
    }

    // Reset individual meta chips without destroying them
    const statusEl = document.getElementById('meta-status');
    const timeEl = document.getElementById('meta-time');
    const sizeEl = document.getElementById('meta-size');
    if (statusEl) {
      statusEl.textContent = '---';
      statusEl.classList.remove('meta-chip--success', 'meta-chip--warning', 'meta-chip--error');
    }
    if (timeEl) timeEl.textContent = '---';
    if (sizeEl) sizeEl.textContent = '---';

    // Remove toolbar status tint
    const toolbar = document.querySelector('.response-toolbar');
    if (toolbar) {
      toolbar.classList.remove('status-2xx', 'status-3xx', 'status-4xx', 'status-5xx');
    }

    if (timestampElement) {
      timestampElement.textContent = '';
    }

    this.currentFormatter = null;
    this.parsedJsonData = null;
    this.detectedJsonBody = false;
    this.currentSoapFault = false;
    this.updateSoapFaultBadge(false);
    this.emitModeChanged();
  }

  private tryParseJson(str: string): { ok: boolean; value: unknown | null } {
    const normalized = this.normalizePotentialJson(str);

    try {
      return { ok: true, value: JSON.parse(normalized) };
    } catch {
      // Some APIs prepend/append non-JSON wrappers.
      const extracted = this.extractLikelyJson(normalized);
      if (!extracted) {
        return { ok: false, value: null };
      }

      try {
        return { ok: true, value: JSON.parse(extracted) };
      } catch {
        return { ok: false, value: null };
      }
    }
  }

  private normalizePotentialJson(value: string): string {
    let normalized = value || '';

    // Remove UTF-8 BOM.
    if (normalized.charCodeAt(0) === 0xFEFF) {
      normalized = normalized.slice(1);
    }

    normalized = normalized.trim();

    // Remove common XSSI prefix.
    normalized = normalized.replace(/^\)\]\}',?\s*/, '');

    return normalized;
  }

  private extractLikelyJson(value: string): string | null {
    const firstObject = value.indexOf('{');
    const firstArray = value.indexOf('[');

    let start = -1;
    if (firstObject >= 0 && firstArray >= 0) {
      start = Math.min(firstObject, firstArray);
    } else if (firstObject >= 0) {
      start = firstObject;
    } else if (firstArray >= 0) {
      start = firstArray;
    }

    if (start < 0) return null;

    const lastObject = value.lastIndexOf('}');
    const lastArray = value.lastIndexOf(']');
    const end = Math.max(lastObject, lastArray);

    if (end <= start) return null;
    return value.slice(start, end + 1);
  }

  private getHeaderValueCaseInsensitive(headers: Record<string, string>, headerName: string): string | undefined {
    const direct = headers[headerName];
    if (typeof direct === 'string') {
      return direct;
    }

    const target = headerName.toLowerCase();
    const foundKey = Object.keys(headers).find((key) => key.toLowerCase() === target);
    return foundKey ? headers[foundKey] : undefined;
  }

  private isJsonContentType(contentType: string): boolean {
    return /\bapplication\/(.+\+)?json\b/i.test(contentType);
  }

  private isXmlContentType(contentType: string): boolean {
    return /\b(application|text)\/(.+\+)?xml\b/i.test(contentType);
  }

  private tryParseXml(str: string): { ok: boolean; document?: Document } {
    try {
      const parser = new DOMParser();
      const documentNode = parser.parseFromString(str, 'application/xml');
      const parserError = documentNode.querySelector('parsererror');
      if (parserError) {
        return { ok: false };
      }
      return { ok: true, document: documentNode };
    } catch {
      return { ok: false };
    }
  }

  private hasSoapFault(documentNode: Document): boolean {
    const allElements = Array.from(documentNode.getElementsByTagName('*'));
    return allElements.some((element) => element.localName?.toLowerCase() === 'fault');
  }

  private prettyPrintXml(documentNode: Document): string {
    const serializeNode = (node: Node, depth: number): string => {
      const indent = '  '.repeat(depth);

      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.nodeValue || '').trim();
        return text ? `${indent}${text}\n` : '';
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const element = node as Element;
      const attrs = Array.from(element.attributes)
        .map((attr) => `${attr.name}=\"${attr.value}\"`)
        .join(' ');
      const openTag = attrs ? `<${element.tagName} ${attrs}>` : `<${element.tagName}>`;

      const children = Array.from(element.childNodes)
        .filter((child) => child.nodeType === Node.ELEMENT_NODE || ((child.nodeType === Node.TEXT_NODE) && (child.nodeValue || '').trim()));

      if (children.length === 0) {
        return `${indent}${openTag.replace('>', '/>')}\n`;
      }

      const textOnly = children.every((child) => child.nodeType === Node.TEXT_NODE);
      if (textOnly) {
        const text = children.map((child) => (child.nodeValue || '').trim()).join('');
        return `${indent}${openTag}${text}</${element.tagName}>\n`;
      }

      let result = `${indent}${openTag}\n`;
      children.forEach((child) => {
        result += serializeNode(child, depth + 1);
      });
      result += `${indent}</${element.tagName}>\n`;
      return result;
    };

    const declaration = '<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n';
    return `${declaration}${serializeNode(documentNode.documentElement, 0).trimEnd()}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private highlightSoapFault(xml: string): string {
    const escaped = this.escapeHtml(xml);
    return escaped.replace(
      /(&lt;\/?[\w:-]*Fault(?:\s+[^&]*?)?&gt;)/g,
      '<span class=\"soap-fault-node\">$1</span>'
    );
  }

  private updateSoapFaultBadge(hasFault: boolean): void {
    const faultChip = document.getElementById('meta-soap-fault');
    if (!faultChip) return;
    faultChip.style.display = hasFault ? 'inline-flex' : 'none';
  }

  private getResponseBytes(response: ApiResponse): number {
    const transferBytes = response.size && response.size > 0 ? response.size : 0;
    const bodyBytes = this.getResponseBytesFromBody(response.body || '');
    return Math.max(transferBytes, bodyBytes);
  }

  private getResponseBytesFromBody(body: string): number {
    return new TextEncoder().encode(body).length;
  }

  private emitModeChanged(): void {
    document.dispatchEvent(new CustomEvent('response-viewer-mode-changed', {
      detail: {
        isJson: this.detectedJsonBody,
        formatter: this.currentFormatter,
      },
    }));
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  public destroy(): void {
    this.disposeMonaco();
    this.currentFormatter = null;
    this.parsedJsonData = null;
    this.detectedJsonBody = false;
    this.currentSoapFault = false;
  }

  private disposeMonaco(): void {
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
      this.monacoEditor = null;
    }
  }
}
