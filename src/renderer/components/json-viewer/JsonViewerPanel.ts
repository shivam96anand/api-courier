import { JsonViewer } from '../JsonViewer';
import { iconHtml } from '../../utils/icons';

export interface JsonViewerPanelEvents {
  onStatusUpdate: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  onSearchToggle: () => void;
}

export class JsonViewerPanel {
  private container: HTMLElement;
  private events: JsonViewerPanelEvents;
  private jsonViewer: JsonViewer | null = null;

  constructor(container: HTMLElement, events: JsonViewerPanelEvents) {
    this.container = container;
    this.events = events;
    this.initialize();
  }

  private initialize(): void {
    this.setupDOM();
    this.setupEventListeners();
  }

  private setupDOM(): void {
    this.container.innerHTML = `
      <div class="panel-header">
        <h3>JSON Viewer</h3>
      </div>
      <div class="viewer-actions" id="viewer-actions">
        <button id="viewer-copy-btn" class="response-action-btn" title="Copy JSON to clipboard">Copy</button>
        <button id="viewer-export-btn" class="response-action-btn" title="Export JSON">Export</button>
        <button id="viewer-search-btn" class="response-action-btn" title="Search within JSON">Search</button>
        <button id="viewer-collapse-btn" class="response-action-btn" title="Collapse all JSON nodes">Collapse</button>
        <button id="viewer-expand-btn" class="response-action-btn" title="Expand all JSON nodes">Expand</button>
        <button id="viewer-top-btn" class="response-action-btn" title="Scroll to top">Top</button>
        <button id="viewer-bottom-btn" class="response-action-btn" title="Scroll to bottom">Bottom</button>
        <button id="viewer-enlarge-btn" class="response-action-btn" title="Open in fullscreen mode">Enlarge</button>
        <button id="viewer-ask-ai-btn" class="response-action-btn ask-ai-btn" title="Ask AI about this JSON">Ask AI</button>
      </div>
        <div class="json-viewer-content-wrapper">
          <div id="json-viewer-tab-container"></div>
          <div class="empty-state" id="viewer-empty-state">
          <div class="empty-state-icon">${iconHtml('file')}</div>
          <div class="empty-state-text">
            <h4>No JSON to display</h4>
            <p>Paste JSON content or upload a file to get started</p>
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Viewer action buttons
    this.container.querySelector('#viewer-copy-btn')?.addEventListener('click', () => this.copyJson());
    this.container.querySelector('#viewer-export-btn')?.addEventListener('click', () => this.exportJson());
    this.container.querySelector('#viewer-search-btn')?.addEventListener('click', () => this.events.onSearchToggle());
    this.container.querySelector('#viewer-collapse-btn')?.addEventListener('click', () => this.collapseAll());
    this.container.querySelector('#viewer-expand-btn')?.addEventListener('click', () => this.expandAll());
    this.container.querySelector('#viewer-top-btn')?.addEventListener('click', () => this.scrollToTop());
    this.container.querySelector('#viewer-bottom-btn')?.addEventListener('click', () => this.scrollToBottom());
    this.container.querySelector('#viewer-enlarge-btn')?.addEventListener('click', () => this.toggleFullscreen());
    this.container.querySelector('#viewer-ask-ai-btn')?.addEventListener('click', () => this.handleAskAI());
  }

  public async displayJson(jsonData: any, sourceText: string): Promise<void> {
    // Initialize JSON viewer if not already done
    if (!this.jsonViewer) {
      this.jsonViewer = new JsonViewer('json-viewer-tab-container');
    }

    await this.jsonViewer.setData(jsonData);

    // Show viewer container, hide empty state
    const viewerContainer = this.container.querySelector('#json-viewer-tab-container') as HTMLElement;
    const emptyState = this.container.querySelector('#viewer-empty-state') as HTMLElement;

    if (viewerContainer) viewerContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    // Store source text for copying
    (this as any).sourceText = sourceText;
  }

  public clearViewer(): void {
    if (this.jsonViewer) {
      this.jsonViewer.clear();
    }

    // Hide viewer container, show empty state
    const viewerContainer = this.container.querySelector('#json-viewer-tab-container') as HTMLElement;
    const emptyState = this.container.querySelector('#viewer-empty-state') as HTMLElement;

    if (viewerContainer) viewerContainer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';

    // Clear source text
    (this as any).sourceText = '';
  }

  private copyJson(): void {
    const sourceText = (this as any).sourceText;
    if (!sourceText) {
      this.events.onStatusUpdate('warning', 'No JSON to copy');
      return;
    }

    navigator.clipboard.writeText(sourceText).then(() => {
      this.events.onStatusUpdate('success', 'JSON copied to clipboard');
    }).catch(() => {
      this.events.onStatusUpdate('error', 'Failed to copy to clipboard');
    });
  }

  private exportJson(): void {
    if (!this.jsonViewer) {
      this.events.onStatusUpdate('warning', 'No JSON to export');
      return;
    }

    this.jsonViewer.exportJson();
  }

  private collapseAll(): void {
    if (!this.jsonViewer) {
      this.events.onStatusUpdate('warning', 'No JSON to collapse');
      return;
    }

    this.jsonViewer.collapseAll();
    this.events.onStatusUpdate('info', 'All nodes collapsed');
  }

  private expandAll(): void {
    if (!this.jsonViewer) {
      this.events.onStatusUpdate('warning', 'No JSON to expand');
      return;
    }

    this.jsonViewer.expandAll();
    this.events.onStatusUpdate('info', 'All nodes expanded');
  }

  private scrollToTop(): void {
    if (!this.jsonViewer) return;

    const content = document.querySelector('#json-viewer-tab-container .json-content') as HTMLElement;
    if (content) {
      content.scrollTop = 0;
      this.events.onStatusUpdate('info', 'Scrolled to top');
    }
  }

  private scrollToBottom(): void {
    if (!this.jsonViewer) return;

    const content = document.querySelector('#json-viewer-tab-container .json-content') as HTMLElement;
    if (content) {
      content.scrollTop = content.scrollHeight;
      this.events.onStatusUpdate('info', 'Scrolled to bottom');
    }
  }

  private toggleFullscreen(): void {
    if (!this.jsonViewer) {
      this.events.onStatusUpdate('warning', 'No JSON to display in fullscreen');
      return;
    }

    this.jsonViewer.openFullscreen();
  }

  private handleAskAI(): void {
    const sourceText = (this as any).sourceText;
    if (!sourceText) {
      this.events.onStatusUpdate('warning', 'No JSON to analyze');
      return;
    }

    // Placeholder for AI integration
    this.events.onStatusUpdate('info', 'Ask AI feature coming soon...');
  }

  public getJsonViewer(): JsonViewer | null {
    return this.jsonViewer;
  }

  public destroy(): void {
    if (this.jsonViewer) {
      this.jsonViewer.clear();
    }
    this.jsonViewer = null;
  }
}
