export interface JsonInputPanelEvents {
  onJsonParsed: (jsonData: any) => void;
  onStatusUpdate: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  onClearViewer: () => void;
}

import { iconHtml } from '../../utils/icons';
import { MonacoInputEditor } from './MonacoInputEditor';

export class JsonInputPanel {
  private container: HTMLElement;
  private events: JsonInputPanelEvents;
  private readonly storageKey = 'apiCourier.jsonViewer.lastInput';
  private monacoEditor: MonacoInputEditor | null = null;
  private isValid: boolean = true;
  private errorMessage: string = '';

  constructor(container: HTMLElement, events: JsonInputPanelEvents) {
    this.container = container;
    this.events = events;
    this.initialize();
  }

  private initialize(): void {
    this.setupDOM();
    this.setupEventListeners();
    this.setupFileUpload();
  }

  private setupDOM(): void {
    this.container.innerHTML = `
      <div class="panel-header">
        <h3>JSON Input</h3>
        <div class="input-actions">
          <button id="clear-input-btn" class="btn btn-secondary">Clear</button>
        </div>
      </div>
      <div class="input-methods">
        <div class="input-tabs">
          <button class="input-tab active" data-method="paste">Paste JSON</button>
          <button class="input-tab" data-method="upload">Upload File</button>
        </div>
        <div class="input-content">
          <div id="paste-section" class="input-section active">
            <div class="monaco-input-wrapper">
              <div id="monaco-input-container" class="monaco-input-container"></div>
              <div class="input-status-badge" id="input-status-badge"></div>
            </div>
            <div class="input-error-message" id="input-error-message"></div>
            <div class="input-actions-bottom">
              <button id="format-btn" class="btn btn-secondary">Format JSON</button>
              <button id="minify-btn" class="btn btn-secondary">Minify</button>
              <button id="parse-btn" class="btn btn-primary">Parse & View</button>
            </div>
          </div>
          <div id="upload-section" class="input-section">
            <div class="upload-area" id="upload-area">
              <div class="upload-content">
                <div class="upload-icon">${iconHtml('folder')}</div>
                <div class="upload-text">
                  <strong>Drop JSON file here</strong><br>
                  or click to browse
                </div>
              </div>
              <input type="file" id="file-input" accept=".json,.txt" style="display: none;">
            </div>
            <div class="upload-info">
              <small>Supports .json and .txt files up to 10MB</small>
            </div>
          </div>
        </div>
      </div>
      <div class="json-status" id="json-status"></div>
    `;

    // Initialize Monaco editor
    const monacoContainer = this.container.querySelector('#monaco-input-container') as HTMLElement;
    if (monacoContainer) {
      this.monacoEditor = new MonacoInputEditor({
        container: monacoContainer,
        value: '',
        onChange: (value: string) => {
          this.persistCurrentInput(value);
        },
        onValidityChange: (valid: boolean, error?: string) => {
          this.isValid = valid;
          this.errorMessage = error || '';
          this.updateValidationUI();
        }
      });
    }
  }

  private setupEventListeners(): void {
    // Input method tabs
    const inputTabs = this.container.querySelectorAll('.input-tab');
    const inputSections = this.container.querySelectorAll('.input-section');

    inputTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const method = (tab as HTMLElement).dataset.method;

        inputTabs.forEach(t => t.classList.remove('active'));
        inputSections.forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const section = this.container.querySelector(`#${method}-section`);
        if (section) {
          section.classList.add('active');
        }
      });
    });

    // Action buttons
    this.container.querySelector('#clear-input-btn')?.addEventListener('click', () => this.clearInput());
    this.container.querySelector('#format-btn')?.addEventListener('click', () => this.formatJson());
    this.container.querySelector('#minify-btn')?.addEventListener('click', () => this.minifyJson());
    this.container.querySelector('#parse-btn')?.addEventListener('click', () => this.parseAndView());
  }

  private updateValidationUI(): void {
    const statusBadge = this.container.querySelector('#input-status-badge') as HTMLElement;
    const errorMessage = this.container.querySelector('#input-error-message') as HTMLElement;

    if (!statusBadge || !errorMessage) return;

    if (this.isValid) {
      statusBadge.textContent = '';
      statusBadge.className = 'input-status-badge';
      errorMessage.textContent = '';
    } else {
      statusBadge.textContent = 'Invalid JSON';
      statusBadge.className = 'input-status-badge invalid';
      errorMessage.textContent = this.errorMessage;
    }
  }

  private setupFileUpload(): void {
    const uploadArea = this.container.querySelector('#upload-area')!;
    const fileInput = this.container.querySelector('#file-input') as HTMLInputElement;

    // Click to browse
    uploadArea.addEventListener('click', () => {
      fileInput.click();
    });

    // File selection
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleFileUpload(file);
      }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');

      const dragEvent = e as DragEvent;
      const files = dragEvent.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleFileUpload(files[0]);
      }
    });
  }

  private async handleFileUpload(file: File): Promise<void> {
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      this.events.onStatusUpdate('error', 'File size exceeds 10MB limit');
      return;
    }

    // Check file type
    if (!file.name.toLowerCase().endsWith('.json') && !file.name.toLowerCase().endsWith('.txt')) {
      this.events.onStatusUpdate('error', 'Please upload a .json or .txt file');
      return;
    }

    try {
      this.events.onStatusUpdate('info', 'Reading file...');

      const text = await file.text();

      if (this.monacoEditor) {
        this.monacoEditor.setValue(text);
      }

      this.persistCurrentInput(text);
      this.events.onStatusUpdate('success', `File "${file.name}" loaded successfully`);

      // Auto-parse if it looks like valid JSON
      try {
        JSON.parse(text);
        this.parseAndView();
      } catch {
        this.events.onStatusUpdate('warning', 'File loaded but JSON appears invalid. Please check and parse manually.');
      }
    } catch (error) {
      this.events.onStatusUpdate('error', `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private clearInput(): void {
    if (this.monacoEditor) {
      this.monacoEditor.clear();
    }
    this.persistCurrentInput('');
    this.events.onClearViewer();
  }

  private formatJson(): void {
    if (!this.monacoEditor) {
      this.events.onStatusUpdate('error', 'Editor not initialized');
      return;
    }

    const text = this.monacoEditor.getValue().trim();

    if (!text) {
      this.events.onStatusUpdate('warning', 'No JSON to format');
      return;
    }

    try {
      this.monacoEditor.format();
      this.events.onStatusUpdate('success', 'JSON formatted successfully');
    } catch (error) {
      this.events.onStatusUpdate('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private minifyJson(): void {
    if (!this.monacoEditor) {
      this.events.onStatusUpdate('error', 'Editor not initialized');
      return;
    }

    const text = this.monacoEditor.getValue().trim();

    if (!text) {
      this.events.onStatusUpdate('warning', 'No JSON to minify');
      return;
    }

    try {
      this.monacoEditor.minify();
      this.events.onStatusUpdate('success', 'JSON minified successfully');
    } catch (error) {
      this.events.onStatusUpdate('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseAndView(): void {
    if (!this.monacoEditor) {
      this.events.onStatusUpdate('error', 'Editor not initialized');
      return;
    }

    const text = this.monacoEditor.getValue().trim();

    if (!text) {
      this.events.onStatusUpdate('warning', 'No JSON to parse');
      this.events.onClearViewer();
      return;
    }

    try {
      const parsed = JSON.parse(text);
      this.events.onJsonParsed(parsed);
    } catch (error) {
      this.events.onStatusUpdate('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.events.onClearViewer();
    }
  }

  public getJsonText(): string {
    return this.monacoEditor?.getValue()?.trim() || '';
  }

  public restorePersistedInput(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    const saved = storage.getItem(this.storageKey);
    if (!saved) {
      return;
    }

    if (!this.monacoEditor) {
      return;
    }

    this.monacoEditor.setValue(saved);

    try {
      const parsed = JSON.parse(saved);
      this.events.onJsonParsed(parsed);
    } catch {
      this.events.onClearViewer();
    }
  }

  public destroy(): void {
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
      this.monacoEditor = null;
    }
  }

  private persistCurrentInput(value?: string): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    const text = value !== undefined ? value : this.monacoEditor?.getValue() || '';

    if (!text.trim()) {
      storage.removeItem(this.storageKey);
      return;
    }

    storage.setItem(this.storageKey, text);
  }

  private getStorage(): Storage | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      return window.localStorage;
    } catch {
      return null;
    }
  }
}
