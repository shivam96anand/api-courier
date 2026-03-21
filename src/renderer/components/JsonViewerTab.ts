import { JsonInputPanel } from './json-viewer/JsonInputPanel';

export class JsonViewerTab {
  private container: HTMLElement;
  private inputPanel!: JsonInputPanel;
  private initialized = false;

  constructor() {
    this.container = document.getElementById('json-viewer-tab')!;
  }

  /**
   * Lazy initialization — call when the tab is first shown.
   */
  ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.setupDOM();
    this.initializeComponents();
  }

  private setupDOM(): void {
    this.container.innerHTML = `
      <div class="json-viewer-layout">
        <div class="json-input-panel">
        </div>
      </div>
    `;
  }

  private initializeComponents(): void {
    const inputPanelContainer = this.container.querySelector('.json-input-panel') as HTMLElement;

    this.inputPanel = new JsonInputPanel(inputPanelContainer, {
      onJsonParsed: (_jsonData: any) => {
        this.setStatus('success', 'JSON parsed successfully');
      },
      onStatusUpdate: (type, message) => this.setStatus(type, message),
      onClearViewer: () => {
        this.setStatus('info', '');
      }
    });

    this.inputPanel.restorePersistedInput();
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
  }
}
