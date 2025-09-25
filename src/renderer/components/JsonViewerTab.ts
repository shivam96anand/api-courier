import { JsonInputPanel } from './json-viewer/JsonInputPanel';
import { JsonViewerPanel } from './json-viewer/JsonViewerPanel';
import { JsonViewerSearch } from './json-viewer/JsonViewerSearch';

export class JsonViewerTab {
  private container: HTMLElement;
  private inputPanel!: JsonInputPanel;
  private viewerPanel!: JsonViewerPanel;
  private searchManager!: JsonViewerSearch;

  constructor() {
    this.container = document.getElementById('json-viewer-tab')!;
    this.initialize();
  }

  private initialize(): void {
    this.setupDOM();
    this.initializeComponents();
  }

  private setupDOM(): void {
    this.container.innerHTML = `
      <div class="json-viewer-layout">
        <!-- Left Panel: JSON Input -->
        <div class="json-input-panel">
          <div class="resize-handle" data-panel="json-input"></div>
        </div>

        <!-- Right Panel: JSON Viewer -->
        <div class="json-viewer-panel">
        </div>
      </div>
    `;
  }

  private initializeComponents(): void {
    const inputPanelContainer = this.container.querySelector('.json-input-panel') as HTMLElement;
    const viewerPanelContainer = this.container.querySelector('.json-viewer-panel') as HTMLElement;

    // Initialize input panel
    this.inputPanel = new JsonInputPanel(inputPanelContainer, {
      onJsonParsed: (jsonData: any) => {
        const sourceText = this.inputPanel.getJsonText();
        this.viewerPanel.displayJson(jsonData, sourceText);
        this.searchManager.setJsonViewer(this.viewerPanel.getJsonViewer());
      },
      onStatusUpdate: (type, message) => this.setStatus(type, message),
      onClearViewer: () => {
        this.viewerPanel.clearViewer();
        this.searchManager.setJsonViewer(null);
      }
    });

    // Initialize viewer panel
    this.viewerPanel = new JsonViewerPanel(viewerPanelContainer, {
      onStatusUpdate: (type, message) => this.setStatus(type, message),
      onSearchToggle: () => {
        if (!this.viewerPanel.getJsonViewer()) {
          this.setStatus('warning', 'No JSON to search');
          return;
        }
        this.searchManager.toggleFloatingSearch();
      }
    });

    // Initialize search manager
    this.searchManager = new JsonViewerSearch(this.container);
  }

  private setStatus(type: 'info' | 'success' | 'warning' | 'error', message: string): void {
    const statusEl = this.container.querySelector('#json-status');
    if (statusEl) {
      statusEl.className = `json-status ${type ? `status-${type}` : ''}`;
      statusEl.textContent = message;
    }
  }

  public destroy(): void {
    this.inputPanel?.destroy?.();
    this.viewerPanel?.destroy?.();
    this.searchManager?.destroy?.();
  }
}