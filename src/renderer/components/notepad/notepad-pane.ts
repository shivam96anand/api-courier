/**
 * A single notepad pane: its own tab strip, Monaco editor, and preview area.
 *
 * The notepad can show one pane (default) or two side-by-side (split view).
 * Each pane owns exactly one editor and renders only the tabs assigned to it
 * (see `NotepadStore` pane partitioning). `NotepadManager` coordinates panes,
 * global chrome (top bar, status bar, context menu) and cross-pane operations.
 */
import * as monaco from 'monaco-editor';
import { forceInitialViewportTokenization } from '../request/monaco-tokenization';
import {
  NotepadSettings,
  NotepadState,
  NotepadTab,
} from '../../../shared/types';
import { NotepadStore } from './notepad-store';
import {
  createNotepadEditor,
  setEditorLanguage,
  triggerFind,
  triggerGoToLine,
  triggerReplace,
} from './notepad-editor';
import { renderTabs, CursorPosition } from './notepad-tabs-ui';
import {
  detectLanguageFromContent,
  monacoLanguageFor,
} from './notepad-language';
import { renderMarkdown } from './notepad-markdown';
import { highlightCodeBlocks } from './notepad-md-highlight';
import { isSwaggerContent, renderSwagger } from './notepad-swagger';
import { formatJson } from './notepad-json';
import { formatText } from './notepad-format';

export interface PaneHost {
  store: NotepadStore;
  getSettings: () => NotepadSettings;
  getToastHost: () => HTMLElement;
  onFocusPane: (paneId: number) => void;
  onActivateTab: (paneId: number, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string) => void;
  onNewTab: (paneId: number) => void;
  onContextMenu: (
    tabId: string,
    x: number,
    y: number,
    hasFile: boolean
  ) => void;
  onReorderInPane: (paneId: number, fromRel: number, toRel: number) => void;
  /** Fired on content/cursor changes so the manager can refresh the status bar. */
  onEditorActivity: (paneId: number) => void;
  onDropFiles: (paneId: number, paths: string[]) => void;
}

interface PaneElements {
  tabStrip: HTMLElement;
  editorArea: HTMLElement;
  editorHost: HTMLElement;
  resizeSplitter: HTMLElement;
  previewPane: HTMLElement;
  previewBody: HTMLElement;
  previewHeaderText: HTMLElement;
  dropOverlay: HTMLElement;
}

export class PaneController {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private els!: PaneElements;
  private isApplyingState = false;
  private contentTimer: number | null = null;
  private previewTimer: number | null = null;
  private lastTabId: string | undefined;
  private focused = false;
  private cursor: CursorPosition = {
    lineNumber: 1,
    column: 1,
    selectionLength: 0,
  };

  constructor(
    readonly paneId: number,
    private readonly root: HTMLElement,
    private readonly host: PaneHost
  ) {}

  /** Build the pane DOM and create its Monaco editor. */
  init(): void {
    this.buildDom();
    const s = this.host.getSettings();
    this.editor = createNotepadEditor(
      this.els.editorHost,
      { fontSize: s.fontSize, wordWrap: s.wordWrap, tabSize: s.tabSize },
      {
        onContentChange: (value) => this.handleContentChange(value),
        onCursorChange: (lineNumber, column, selectionLength) => {
          this.cursor = { lineNumber, column, selectionLength };
          if (this.focused) this.host.onEditorActivity(this.paneId);
        },
      }
    );
    this.editor.onDidPaste(() => {
      if (this.isApplyingState) return;
      this.maybeAutoDetectLanguage(this.editor?.getValue() ?? '');
    });
    this.editor.onDidFocusEditorText(() => this.host.onFocusPane(this.paneId));
    this.attachPreviewSplitter();
    this.attachDragDrop();
  }

  /** Reconcile this pane's DOM with the store state (tab strip + editor + preview). */
  sync(state: NotepadState): void {
    this.renderStrip(state);
    const activeId = this.host.store.getPaneActiveTabId(this.paneId);
    if (activeId !== this.lastTabId) {
      // Persist the outgoing tab's edits + view state before switching.
      this.flushPending();
      this.saveViewState(this.lastTabId);
      this.lastTabId = activeId;
      this.loadActive();
    } else {
      // Same tab: keep the editor language in sync if it changed in the store
      // (e.g. auto-detected on save) without reloading the buffer.
      this.syncLanguage();
    }
    this.updatePreview();
  }

  private syncLanguage(): void {
    const tab = this.getActiveTab();
    if (!tab || !this.editor) return;
    const desired = monacoLanguageFor(tab.language, this.editor.getValue());
    if (this.editor.getModel()?.getLanguageId() !== desired) {
      setEditorLanguage(this.editor, desired);
    }
  }

  getEditor(): monaco.editor.IStandaloneCodeEditor | null {
    return this.editor;
  }

  getEditorValue(): string | undefined {
    return this.editor?.getValue();
  }

  getActiveTab(): NotepadTab | undefined {
    return this.host.store.getActiveTab(this.paneId);
  }

  getCursor(): CursorPosition {
    return this.cursor;
  }

  hasTabs(): boolean {
    return this.host.store.getTabsForPane(this.paneId).length > 0;
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.root.classList.toggle('focused', focused);
  }

  focus(): void {
    this.editor?.focus();
  }

  layout(): void {
    this.editor?.layout();
  }

  applySettings(s: NotepadSettings): void {
    this.editor?.updateOptions({
      fontSize: s.fontSize,
      wordWrap: s.wordWrap,
      tabSize: s.tabSize,
    });
  }

  setLanguage(language: string): void {
    if (!this.editor) return;
    setEditorLanguage(
      this.editor,
      monacoLanguageFor(language, this.editor.getValue())
    );
  }

  find(): void {
    if (this.editor) triggerFind(this.editor);
  }

  replace(): void {
    if (this.editor) triggerReplace(this.editor);
  }

  goToLine(): void {
    if (this.editor) triggerGoToLine(this.editor);
  }

  /**
   * Pretty-print the active tab in place (preserves the undo stack).
   * Returns the formatter error when the content can't be formatted.
   */
  formatDocument(): { ok: boolean; error?: string } {
    if (!this.editor) return { ok: false };
    const current = this.editor.getValue();
    const language = this.getActiveTab()?.language;
    const result = formatText(
      current,
      language,
      this.host.getSettings().tabSize
    );
    if (!result.ok) return { ok: false, error: result.error };
    if (result.text === current) return { ok: true };
    const model = this.editor.getModel();
    if (!model) return { ok: false };
    this.editor.executeEdits('notepad-format', [
      { range: model.getFullModelRange(), text: result.text },
    ]);
    this.editor.pushUndoStop();
    return { ok: true };
  }

  /** Re-render the preview pane immediately (used on preview toggle). */
  refreshPreview(): void {
    this.updatePreview();
    this.layout();
  }

  /** Force-flush any in-flight content debounce into the store. */
  flushPending(): void {
    if (this.contentTimer === null) return;
    clearTimeout(this.contentTimer);
    this.contentTimer = null;
    const value = this.editor?.getValue();
    if (this.lastTabId !== undefined && value !== undefined) {
      this.host.store.updateContent(this.lastTabId, value, true);
    }
  }

  /** Persist the active tab's view state (cursor + scroll + folds). */
  saveViewState(tabId?: string): void {
    if (!this.editor || !tabId) return;
    const viewState = this.editor.saveViewState();
    if (viewState) this.host.store.setViewState(tabId, viewState);
  }

  dispose(): void {
    if (this.contentTimer) clearTimeout(this.contentTimer);
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.editor?.dispose();
    this.editor = null;
    this.root.innerHTML = '';
  }

  // ---- internals ---------------------------------------------------------

  private handleContentChange(value: string): void {
    if (this.isApplyingState) return;
    const tabId = this.lastTabId;
    if (!tabId) return;
    if (!value.trim()) this.maybeAutoDetectLanguage(value);
    if (this.focused) this.host.onEditorActivity(this.paneId);
    this.schedulePreviewRender(value);
    if (this.contentTimer) clearTimeout(this.contentTimer);
    this.contentTimer = window.setTimeout(() => {
      this.contentTimer = null;
      const stillExists = this.host.store
        .getState()
        .tabs.some((t) => t.id === tabId);
      if (!stillExists) return;
      this.host.store.updateContent(tabId, value, true);
    }, 300);
  }

  private loadActive(): void {
    const tab = this.getActiveTab();
    this.applyContent(tab?.content ?? '', tab);
  }

  private applyContent(content: string, tab: NotepadTab | undefined): void {
    if (!this.editor) return;
    if (this.contentTimer) {
      clearTimeout(this.contentTimer);
      this.contentTimer = null;
    }
    this.isApplyingState = true;
    this.editor.setValue(content);
    // Tokenize the initial viewport synchronously so switching to a large JSON
    // tab paints the visible lines immediately (no white-then-colored lag).
    forceInitialViewportTokenization(this.editor);
    const desired = monacoLanguageFor(tab?.language, content);
    if (this.editor.getModel()?.getLanguageId() !== desired) {
      setEditorLanguage(this.editor, desired);
    }
    if (tab?.viewState) {
      try {
        this.editor.restoreViewState(
          tab.viewState as monaco.editor.ICodeEditorViewState
        );
      } catch {
        // View state from an older Monaco version — ignore and reset.
      }
    } else {
      this.cursor = { lineNumber: 1, column: 1, selectionLength: 0 };
    }
    this.isApplyingState = false;
    if (this.focused) this.editor.focus();
  }

  private renderStrip(state: NotepadState): void {
    renderTabs(
      {
        tabStrip: this.els.tabStrip,
        paneId: this.paneId,
        store: this.host.store,
        onTabClick: (id) => this.host.onActivateTab(this.paneId, id),
        onTabClose: (id) => this.host.onCloseTab(id),
        onTabRename: (id) => this.host.onRenameTab(id),
        onContextMenu: (id, x, y, hasFile) =>
          this.host.onContextMenu(id, x, y, hasFile),
        onReorder: (from, to) =>
          this.host.onReorderInPane(this.paneId, from, to),
      },
      state
    );
  }

  private maybeAutoDetectLanguage(value: string): void {
    const tabId = this.lastTabId;
    if (!tabId) return;
    const tab = this.host.store.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (!value.trim()) {
      if (tab.language && tab.language !== 'plaintext') {
        this.host.store.updateTab(tabId, { language: 'plaintext' });
        this.setLanguage('plaintext');
      }
      return;
    }

    let effective = tab.language;
    if (effective === 'swagger' && !isSwaggerContent(value)) {
      this.host.store.updateTab(tabId, { language: 'plaintext' });
      this.setLanguage('plaintext');
      effective = 'plaintext';
    }
    if (effective && effective !== 'plaintext') return;

    const detected = detectLanguageFromContent(value);
    if (!detected || detected === tab.language) return;
    this.host.store.updateTab(tabId, { language: detected });
    this.setLanguage(detected);
    if (
      (detected === 'markdown' || detected === 'swagger') &&
      !tab.previewMode
    ) {
      if (this.contentTimer) {
        clearTimeout(this.contentTimer);
        this.contentTimer = null;
      }
      this.host.store.updateContent(tabId, value, true);
      this.host.store.updateTab(tabId, { previewMode: true });
    }
  }

  private schedulePreviewRender(value: string): void {
    const active = this.getActiveTab();
    if (!active?.previewMode) return;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      this.renderPreview(value, this.getActiveTab()?.language);
    }, 200);
  }

  private updatePreview(): void {
    const active = this.getActiveTab();
    const on = Boolean(active?.previewMode);
    this.els.previewPane.classList.toggle('hidden', !on);
    this.els.resizeSplitter.classList.toggle('hidden', !on);
    if (on && active) {
      this.renderPreview(active.content, active.language);
    } else {
      this.els.editorHost.style.flex = '';
      this.els.previewPane.style.flex = '';
    }
  }

  private renderPreview(source: string, language = 'plaintext'): void {
    const headerEl = this.els.previewHeaderText;
    if (language === 'html') {
      headerEl.textContent = 'HTML Preview';
      this.els.previewBody.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.className = 'notepad-preview-iframe';
      iframe.setAttribute('sandbox', '');
      iframe.srcdoc = source;
      this.els.previewBody.appendChild(iframe);
      return;
    }
    if (language === 'markdown') {
      headerEl.textContent = 'Markdown Preview';
      this.els.previewBody.innerHTML = renderMarkdown(source);
      void highlightCodeBlocks(this.els.previewBody);
      return;
    }
    if (language === 'swagger') {
      headerEl.textContent = 'Swagger/OpenAPI Preview';
      void renderSwagger(source, this.els.previewBody);
      return;
    }
    const isJson = language === 'json';
    headerEl.textContent = isJson
      ? 'JSON Preview'
      : `${language.charAt(0).toUpperCase() + language.slice(1)} Preview`;
    const pre = document.createElement('pre');
    pre.className = 'notepad-code-preview';
    const code = document.createElement('code');
    code.textContent = isJson ? formatJson(source).text : source;
    pre.appendChild(code);
    this.els.previewBody.innerHTML = '';
    this.els.previewBody.appendChild(pre);
  }

  private attachPreviewSplitter(): void {
    const splitter = this.els.resizeSplitter;
    const area = this.els.editorArea;
    const editorHost = this.els.editorHost;
    const preview = this.els.previewPane;
    let dragging = false;
    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const rect = area.getBoundingClientRect();
      const ratio = Math.max(
        0.2,
        Math.min(0.8, (e.clientX - rect.left) / rect.width)
      );
      editorHost.style.flex = `0 0 ${ratio * 100}%`;
      preview.style.flex = `0 0 ${(1 - ratio) * 100}%`;
      this.editor?.layout();
    };
    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('notepad-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      document.body.classList.add('notepad-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  private attachDragDrop(): void {
    const overlay = this.els.dropOverlay;
    const area = this.els.editorArea;
    let depth = 0;
    area.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth += 1;
      overlay.classList.remove('hidden');
    });
    area.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    area.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) overlay.classList.add('hidden');
    });
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      overlay.classList.add('hidden');
      const paths = Array.from(e.dataTransfer?.files || [])
        .map((f) => (f as File & { path?: string }).path)
        .filter((p): p is string => Boolean(p));
      if (paths.length) this.host.onDropFiles(this.paneId, paths);
    });
  }

  private buildDom(): void {
    this.root.classList.add('notepad-pane');
    this.root.dataset.paneId = String(this.paneId);
    this.root.innerHTML = `
      <div class="notepad-tabs-area">
        <div class="notepad-tabs" data-role="tab-strip"></div>
        <button class="notepad-tab add" data-role="add-tab" title="New Tab">+</button>
      </div>
      <div class="notepad-editor-area" data-role="editor-area">
        <div class="notepad-editor" data-role="editor-host"></div>
        <div class="notepad-resize-splitter hidden" data-role="resize-splitter" title="Drag to resize"></div>
        <div class="notepad-preview hidden" data-role="preview" aria-label="Preview">
          <div class="notepad-preview-header">
            <span data-role="preview-header-text">Markdown Preview</span>
            <button class="notepad-preview-close" data-role="preview-close" title="Close preview (Esc)">✕</button>
          </div>
          <div class="notepad-preview-body" data-role="preview-body"></div>
        </div>
        <div class="notepad-drop-overlay hidden" data-role="drop-overlay">
          <div class="notepad-drop-overlay-inner">Drop files to open in Notepad</div>
        </div>
      </div>
    `;
    const q = (role: string): HTMLElement =>
      this.root.querySelector(`[data-role="${role}"]`) as HTMLElement;
    this.els = {
      tabStrip: q('tab-strip'),
      editorArea: q('editor-area'),
      editorHost: q('editor-host'),
      resizeSplitter: q('resize-splitter'),
      previewPane: q('preview'),
      previewBody: q('preview-body'),
      previewHeaderText: q('preview-header-text'),
      dropOverlay: q('drop-overlay'),
    };
    q('add-tab').addEventListener('click', () =>
      this.host.onNewTab(this.paneId)
    );
    q('preview-close').addEventListener('click', () => {
      const active = this.getActiveTab();
      if (active) this.host.store.updateTab(active.id, { previewMode: false });
    });
    // Focus this pane when the user clicks anywhere in it.
    this.root.addEventListener('mousedown', () =>
      this.host.onFocusPane(this.paneId)
    );
    const tabsArea = this.root.querySelector(
      '.notepad-tabs-area'
    ) as HTMLElement;
    tabsArea.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (target === tabsArea || target.dataset.role === 'tab-strip') {
        this.host.onNewTab(this.paneId);
      }
    });
  }
}
