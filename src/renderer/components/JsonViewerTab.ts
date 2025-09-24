import { JsonViewer } from './JsonViewer';

export class JsonViewerTab {
  private container: HTMLElement;
  private jsonViewer: JsonViewer | null = null;
  private isFloatingSearchVisible = false;

  constructor() {
    this.container = document.getElementById('json-viewer-tab')!;
    this.initialize();
  }

  private initialize(): void {
    this.setupDOM();
    this.setupEventListeners();
    this.setupFloatingSearchEvents();
  }

  private setupDOM(): void {
    this.container.innerHTML = `
      <div class="json-viewer-layout">
        <!-- Left Panel: JSON Input -->
        <div class="json-input-panel">
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
          <div class="resize-handle" data-panel="json-input"></div>
        </div>

        <!-- Right Panel: JSON Viewer -->
        <div class="json-viewer-panel">
          <div class="panel-header">
            <h3>JSON Viewer</h3>
          </div>
          <div class="viewer-actions" id="viewer-actions">
            <button id="viewer-copy-btn" class="response-action-btn" title="Copy JSON to clipboard">Copy</button>
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
              <div class="empty-state-icon">📄</div>
              <div class="empty-state-text">
                <h4>No JSON to display</h4>
                <p>Paste JSON content or upload a file to get started</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Floating Search Bar (hidden by default) -->
        <div id="json-viewer-floating-search-bar" class="floating-search-bar" style="display: none;">
          <input type="text" class="floating-search-input" placeholder="Search in JSON...">
          <div class="floating-search-results">0/0</div>
          <button id="json-viewer-search-prev" class="floating-search-nav">↑</button>
          <button id="json-viewer-search-next" class="floating-search-nav">↓</button>
          <button id="json-viewer-search-close" class="floating-search-close">×</button>
        </div>
      </div>
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
        const section = document.getElementById(`${method}-section`);
        if (section) {
          section.classList.add('active');
        }
      });
    });

    // JSON input textarea
    const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;
    jsonInput?.addEventListener('input', () => this.updateStatus());

    // Action buttons
    document.getElementById('clear-input-btn')?.addEventListener('click', () => this.clearInput());
    document.getElementById('format-btn')?.addEventListener('click', () => this.formatJson());
    document.getElementById('minify-btn')?.addEventListener('click', () => this.minifyJson());
    document.getElementById('parse-btn')?.addEventListener('click', () => this.parseAndView());

    // File upload
    this.setupFileUpload();

    // Viewer action buttons
    document.getElementById('viewer-copy-btn')?.addEventListener('click', () => this.copyJson());
    document.getElementById('viewer-search-btn')?.addEventListener('click', () => this.toggleFloatingSearch());
    document.getElementById('viewer-collapse-btn')?.addEventListener('click', () => this.collapseAll());
    document.getElementById('viewer-expand-btn')?.addEventListener('click', () => this.expandAll());
    document.getElementById('viewer-top-btn')?.addEventListener('click', () => this.scrollToTop());
    document.getElementById('viewer-bottom-btn')?.addEventListener('click', () => this.scrollToBottom());
    document.getElementById('viewer-enlarge-btn')?.addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('viewer-ask-ai-btn')?.addEventListener('click', () => this.handleAskAI());
  }

  private setupFileUpload(): void {
    const uploadArea = document.getElementById('upload-area')!;
    const fileInput = document.getElementById('file-input') as HTMLInputElement;

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

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleFileUpload(files[0]);
      }
    });
  }

  private setupFloatingSearchEvents(): void {
    const floatingSearchBar = document.getElementById('json-viewer-floating-search-bar');
    const searchInput = floatingSearchBar?.querySelector('.floating-search-input') as HTMLInputElement;
    const searchClose = document.getElementById('json-viewer-search-close');
    const searchPrev = document.getElementById('json-viewer-search-prev');
    const searchNext = document.getElementById('json-viewer-search-next');

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

  private async handleFileUpload(file: File): Promise<void> {
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      this.setStatus('error', 'File size exceeds 10MB limit');
      return;
    }

    // Check file type
    if (!file.name.toLowerCase().endsWith('.json') && !file.name.toLowerCase().endsWith('.txt')) {
      this.setStatus('error', 'Please upload a .json or .txt file');
      return;
    }

    try {
      this.setStatus('info', 'Reading file...');

      const text = await file.text();
      const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;

      jsonInput.value = text;
      this.setStatus('success', `File "${file.name}" loaded successfully`);

      // Auto-parse if it looks like valid JSON
      try {
        JSON.parse(text);
        this.parseAndView();
      } catch {
        this.setStatus('warning', 'File loaded but JSON appears invalid. Please check and parse manually.');
      }
    } catch (error) {
      this.setStatus('error', `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private clearInput(): void {
    const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;
    jsonInput.value = '';
    this.updateStatus();
    this.clearViewer();
  }

  private formatJson(): void {
    const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.setStatus('warning', 'No JSON to format');
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      jsonInput.value = formatted;
      this.setStatus('success', 'JSON formatted successfully');
    } catch (error) {
      this.setStatus('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private minifyJson(): void {
    const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.setStatus('warning', 'No JSON to minify');
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const minified = JSON.stringify(parsed);
      jsonInput.value = minified;
      this.setStatus('success', 'JSON minified successfully');
    } catch (error) {
      this.setStatus('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseAndView(): void {
    const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.setStatus('warning', 'No JSON to parse');
      this.clearViewer();
      return;
    }

    try {
      const parsed = JSON.parse(text);
      this.displayJson(parsed);
      this.setStatus('success', 'JSON parsed and displayed successfully');
    } catch (error) {
      this.setStatus('error', `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.clearViewer();
    }
  }

  private displayJson(jsonData: any): void {
    // Initialize JSON viewer if not already done
    if (!this.jsonViewer) {
      this.jsonViewer = new JsonViewer('json-viewer-tab-container');
    }

    this.jsonViewer.setData(jsonData);

    // Show viewer container, hide empty state
    const viewerContainer = document.getElementById('json-viewer-tab-container')!;
    const emptyState = document.getElementById('viewer-empty-state')!;

    viewerContainer.style.display = 'block';
    emptyState.style.display = 'none';
  }

  private clearViewer(): void {
    if (this.jsonViewer) {
      this.jsonViewer.clear();
    }

    // Hide viewer container, show empty state
    const viewerContainer = document.getElementById('json-viewer-tab-container')!;
    const emptyState = document.getElementById('viewer-empty-state')!;

    viewerContainer.style.display = 'none';
    emptyState.style.display = 'flex';
  }

  private updateStatus(): void {
    const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.clearStatus();
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const size = JSON.stringify(parsed).length;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
      this.setStatus('info', `Valid JSON (${sizeStr})`);
    } catch (error) {
      this.setStatus('error', 'Invalid JSON syntax');
    }
  }

  private setStatus(type: 'info' | 'success' | 'warning' | 'error', message: string): void {
    const statusEl = document.getElementById('json-status')!;
    statusEl.className = `json-status status-${type}`;
    statusEl.textContent = message;
  }

  private clearStatus(): void {
    const statusEl = document.getElementById('json-status')!;
    statusEl.className = 'json-status';
    statusEl.textContent = '';
  }

  // Viewer action methods
  private copyJson(): void {
    if (!this.jsonViewer) {
      this.setStatus('warning', 'No JSON to copy');
      return;
    }

    const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.setStatus('warning', 'No JSON to copy');
      return;
    }

    navigator.clipboard.writeText(text).then(() => {
      this.setStatus('success', 'JSON copied to clipboard');
    }).catch(() => {
      this.setStatus('error', 'Failed to copy to clipboard');
    });
  }

  private toggleFloatingSearch(): void {
    if (!this.jsonViewer) {
      this.setStatus('warning', 'No JSON to search');
      return;
    }

    const floatingSearchBar = document.getElementById('json-viewer-floating-search-bar')!;
    const searchInput = floatingSearchBar.querySelector('.floating-search-input') as HTMLInputElement;

    if (this.isFloatingSearchVisible) {
      this.hideFloatingSearch();
    } else {
      this.showFloatingSearch();
    }
  }

  private showFloatingSearch(): void {
    const floatingSearchBar = document.getElementById('json-viewer-floating-search-bar')!;
    const searchInput = floatingSearchBar.querySelector('.floating-search-input') as HTMLInputElement;

    floatingSearchBar.style.display = 'flex';
    this.isFloatingSearchVisible = true;

    setTimeout(() => {
      searchInput.focus();
    }, 100);
  }

  private hideFloatingSearch(): void {
    const floatingSearchBar = document.getElementById('json-viewer-floating-search-bar')!;
    floatingSearchBar.style.display = 'none';
    this.isFloatingSearchVisible = false;

    if (this.jsonViewer) {
      this.jsonViewer.clearSearch();
    }
  }

  private performFloatingSearch(query: string): void {
    if (!this.jsonViewer) return;

    this.jsonViewer.performSearch(query);
    this.updateFloatingSearchResults();
  }

  private navigateFloatingSearch(direction: number): void {
    if (!this.jsonViewer) return;

    this.jsonViewer.navigateSearch(direction);
    this.updateFloatingSearchResults();
  }

  private updateFloatingSearchResults(): void {
    const resultsSpan = document.querySelector('#json-viewer-floating-search-bar .floating-search-results') as HTMLElement;
    if (resultsSpan && this.jsonViewer) {
      const searchInfo = this.jsonViewer.getSearchInfo();
      resultsSpan.textContent = `${searchInfo.current}/${searchInfo.total}`;
    }
  }

  private collapseAll(): void {
    if (!this.jsonViewer) {
      this.setStatus('warning', 'No JSON to collapse');
      return;
    }

    this.jsonViewer.collapseAll();
    this.setStatus('info', 'All nodes collapsed');
  }

  private expandAll(): void {
    if (!this.jsonViewer) {
      this.setStatus('warning', 'No JSON to expand');
      return;
    }

    this.jsonViewer.expandAll();
    this.setStatus('info', 'All nodes expanded');
  }

  private scrollToTop(): void {
    if (!this.jsonViewer) return;

    const content = document.querySelector('#json-viewer-tab-container .json-content') as HTMLElement;
    if (content) {
      content.scrollTop = 0;
      this.setStatus('info', 'Scrolled to top');
    }
  }

  private scrollToBottom(): void {
    if (!this.jsonViewer) return;

    const content = document.querySelector('#json-viewer-tab-container .json-content') as HTMLElement;
    if (content) {
      content.scrollTop = content.scrollHeight;
      this.setStatus('info', 'Scrolled to bottom');
    }
  }

  private toggleFullscreen(): void {
    if (!this.jsonViewer) {
      this.setStatus('warning', 'No JSON to display in fullscreen');
      return;
    }

    this.jsonViewer.openFullscreen();
  }

  private handleAskAI(): void {
    const jsonInput = document.getElementById('json-input') as HTMLTextAreaElement;
    const text = jsonInput.value.trim();

    if (!text) {
      this.setStatus('warning', 'No JSON to analyze');
      return;
    }

    // Placeholder for AI integration
    this.setStatus('info', 'Ask AI feature coming soon...');
  }

  public destroy(): void {
    if (this.jsonViewer) {
      this.jsonViewer.clear();
    }
    this.jsonViewer = null;
  }
}