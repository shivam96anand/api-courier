export interface JsonInputPanelEvents {
  onJsonParsed: (jsonData: any) => void;
  onStatusUpdate: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  onClearViewer: () => void;
}

export class JsonInputPanel {
  private container: HTMLElement;
  private events: JsonInputPanelEvents;

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
            <textarea
              id="json-input"
              class="json-input-textarea"
              placeholder="Paste your JSON here..."
              spellcheck="false"
            ></textarea>
            <div class="input-actions-bottom">
              <button id="format-btn" class="btn btn-secondary">Format JSON</button>
              <button id="minify-btn" class="btn btn-secondary">Minify</button>
              <button id="parse-btn" class="btn btn-primary">Parse & View</button>
            </div>
          </div>
          <div id="upload-section" class="input-section">
            <div class="upload-area" id="upload-area">
              <div class="upload-content">
                <div class="upload-icon">📁</div>
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

    // JSON input textarea
    const jsonInput = this.container.querySelector('#json-input') as HTMLTextAreaElement;
    jsonInput?.addEventListener('input', () => this.updateStatus());

    // Action buttons
    this.container.querySelector('#clear-input-btn')?.addEventListener('click', () => this.clearInput());
    this.container.querySelector('#format-btn')?.addEventListener('click', () => this.formatJson());
    this.container.querySelector('#minify-btn')?.addEventListener('click', () => this.minifyJson());
    this.container.querySelector('#parse-btn')?.addEventListener('click', () => this.parseAndView());
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
      const jsonInput = this.container.querySelector('#json-input') as HTMLTextAreaElement;

      jsonInput.value = text;
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
    const jsonInput = this.container.querySelector('#json-input') as HTMLTextAreaElement;
    jsonInput.value = '';
    this.updateStatus();
    this.events.onClearViewer();
  }

  private formatJson(): void {
    const jsonInput = this.container.querySelector('#json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.events.onStatusUpdate('warning', 'No JSON to format');
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      jsonInput.value = formatted;
      this.events.onStatusUpdate('success', 'JSON formatted successfully');
    } catch (error) {
      this.events.onStatusUpdate('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private minifyJson(): void {
    const jsonInput = this.container.querySelector('#json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.events.onStatusUpdate('warning', 'No JSON to minify');
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const minified = JSON.stringify(parsed);
      jsonInput.value = minified;
      this.events.onStatusUpdate('success', 'JSON minified successfully');
    } catch (error) {
      this.events.onStatusUpdate('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseAndView(): void {
    const jsonInput = this.container.querySelector('#json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.events.onStatusUpdate('warning', 'No JSON to parse');
      this.events.onClearViewer();
      return;
    }

    try {
      const parsed = JSON.parse(text);
      this.events.onJsonParsed(parsed);
      this.events.onStatusUpdate('success', 'JSON parsed and displayed successfully');
    } catch (error) {
      this.events.onStatusUpdate('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.events.onClearViewer();
    }
  }

  private updateStatus(): void {
    const jsonInput = this.container.querySelector('#json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.events.onStatusUpdate('info', '');
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const size = JSON.stringify(parsed).length;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
      this.events.onStatusUpdate('info', `Valid JSON (${sizeStr})`);
    } catch (error) {
      this.events.onStatusUpdate('error', 'Invalid JSON syntax');
    }
  }

  public getJsonText(): string {
    const jsonInput = this.container.querySelector('#json-input') as HTMLTextAreaElement;
    return jsonInput?.value?.trim() || '';
  }

  public destroy(): void {
    // Clean up any resources if needed
    // Event listeners are automatically cleaned up when DOM is replaced
  }
}