/**
 * Orchestrates the Notepad tab: layout, editor, store, file operations,
 * shortcuts, drag-drop, markdown preview, settings, and OS file-association.
 *
 * Single responsibility per helper module; this class only wires them.
 */
import * as monaco from 'monaco-editor';
import { NotepadState, NotepadTab } from '../../shared/types';
import { NotepadStore } from './notepad/notepad-store';
import { buildNotepadLayout, NotepadElements } from './notepad/notepad-layout';
import {
  createNotepadEditor,
  setEditorLanguage,
  triggerFind,
  triggerGoToLine,
  triggerReplace,
} from './notepad/notepad-editor';
import {
  openFile,
  openFileByPath,
  saveActiveTab,
  saveTab,
  saveTabById,
  FileOperationsContext,
} from './notepad/notepad-file-ops';
import {
  CursorPosition,
  renderTabs,
  updateStatusBar,
} from './notepad/notepad-tabs-ui';
import {
  createKeyboardHandler,
  handleContextMenuAction,
  KeyboardHandler,
} from './notepad/notepad-keyboard';
import { DirtyModal } from './notepad/notepad-modal';
import { SettingsMenu } from './notepad/notepad-settings';
import {
  detectLanguageFromContent,
  detectLanguageFromPath,
} from './notepad/notepad-language';
import { renderMarkdown } from './notepad/notepad-markdown';
import { showNotepadToast } from './notepad/notepad-toast';

export class NotepadManager {
  private container: HTMLElement;
  private elements!: NotepadElements;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private store = new NotepadStore();
  private isApplyingState = false;
  private contentTimer: number | null = null;
  private previewTimer: number | null = null;
  private cursorPosition: CursorPosition = {
    lineNumber: 1,
    column: 1,
    selectionLength: 0,
  };
  private modal!: DirtyModal;
  private settingsMenu!: SettingsMenu;
  private keyHandler: KeyboardHandler | null = null;
  private fileOpenedDispose: (() => void) | null = null;
  private beforeQuitDispose: (() => void) | null = null;
  private initialized = false;
  /** Last activeTabId we rendered the editor for. Drives editor reload on switch. */
  private lastEditorTabId: string | undefined;

  constructor(container?: HTMLElement | null) {
    this.container = container || document.createElement('div');
  }

  /** Lazy initialization — safe to call multiple times; only runs once. */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this._doInitialize();
  }

  /** @deprecated Use ensureInitialized() instead. */
  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  private async _doInitialize(): Promise<void> {
    if (!this.container) return;
    this.buildLayout();

    // Hydrate BEFORE attaching keyboard listeners so a Cmd+S between init and
    // hydrate can't save an empty buffer over a real file.
    await this.store.hydrate();
    const state = this.store.getState();
    if (!state.tabs.length) this.store.createTab();
    if (!state.activeTabId && this.store.getState().tabs.length) {
      this.store.setActiveTab(this.store.getState().tabs[0].id);
    }

    this.initializeEditor();
    this.renderState(this.store.getState());
    this.loadActiveTabIntoEditor();
    this.lastEditorTabId = this.store.getActiveTab()?.id;

    this.attachListeners();
    this.store.subscribe((updated) => {
      this.renderState(updated);
      // Any state change that flips the active tab (new tab, close, reorder)
      // must reload the editor with the new tab's content.
      if (updated.activeTabId !== this.lastEditorTabId) {
        this.lastEditorTabId = updated.activeTabId;
        this.loadActiveTabIntoEditor();
      }
    });

    // Drain any files queued by the OS before the renderer was ready.
    this.drainPendingFiles();
  }

  private buildLayout(): void {
    this.elements = buildNotepadLayout(this.container, {
      onZoomOut: () => this.adjustZoom(-1),
      onZoomIn: () => this.adjustZoom(1),
      onAddTab: () => this.createNewTab(),
      onOpenFile: () => void openFile(this.getFileOpsContext()),
      onSave: () => void saveActiveTab(this.getFileOpsContext()),
      onTogglePreview: () => this.togglePreview(),
      onSettingsClick: (anchor) =>
        this.settingsMenu.toggle(anchor, this.store.getSettings()),
      onLanguageChange: (lang) => this.setActiveTabLanguage(lang),
      onFind: () => this.editor && triggerFind(this.editor),
      onReplace: () => this.editor && triggerReplace(this.editor),
    });

    this.modal = new DirtyModal(this.elements.dirtyModal, {
      titleEl: this.elements.dirtyModalTitle,
      bodyEl: this.elements.dirtyModalBody,
    });

    this.settingsMenu = new SettingsMenu(this.elements.settingsHost, {
      onChange: (updates) => {
        this.store.updateSettings(updates);
        this.applySettingsToEditor();
      },
    });
  }

  private attachListeners(): void {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    this.keyHandler = createKeyboardHandler(isMac, {
      onSave: (saveAs) => void saveActiveTab(this.getFileOpsContext(), saveAs),
      onOpenFile: () => void openFile(this.getFileOpsContext()),
      onNewTab: () => this.createNewTab(),
      onCloseActiveTab: () => {
        const active = this.store.getActiveTab();
        if (active) void this.requestCloseTab(active.id);
      },
      onNextTab: () => this.switchTab(1),
      onPrevTab: () => this.switchTab(-1),
      onFind: () => this.editor && triggerFind(this.editor),
      onReplace: () => this.editor && triggerReplace(this.editor),
      onGoToLine: () => this.editor && triggerGoToLine(this.editor),
    });
    document.addEventListener('keydown', this.keyHandler);

    window.addEventListener('beforeunload', () => {
      // Best-effort sync flush; the proper async path goes through the
      // before-quit confirmation IPC below.
      void this.store.flushPersist();
    });

    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('#notepad-context-menu'))
        this.hideContextMenu();
    });

    this.elements.contextMenu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      const tabId = this.elements.contextMenu.dataset.tabId;
      if (!action) return;
      e.preventDefault();
      this.hideContextMenu();
      handleContextMenuAction(action, tabId, {
        onNew: () => this.createNewTab(),
        onRename: (id) => this.renameTab(id),
        onSave: (id) => void saveTabById(this.getFileOpsContext(), id),
        onSaveAs: (id) => void saveTabById(this.getFileOpsContext(), id, true),
        onClose: (id) => void this.requestCloseTab(id),
        onCloseOthers: (id) => this.store.closeOthers(id),
        onCloseAll: () => void this.closeAllTabs(),
        onReveal: (id) => this.revealTab(id),
        onCopyPath: (id) => void this.copyTabPath(id),
      });
    });

    this.attachDragDropListeners();

    // OS file-association: a path was opened via the OS shell.
    this.fileOpenedDispose = window.restbro.notepad.onFileOpened((filePath) => {
      void openFileByPath(this.getFileOpsContext(), filePath);
    });

    // App-wide before-quit IPC: confirm with the user when there are unsaved
    // notepad tabs.
    this.beforeQuitDispose = window.restbro.notepad.onBeforeQuit(
      async (requestId) => {
        const settings = this.store.getSettings();
        if (!settings.promptOnExit || !this.store.hasDirtyTabs()) {
          window.restbro.notepad.sendQuitDecision(requestId, true);
          return;
        }
        const dirtyCount = this.store
          .getState()
          .tabs.filter((t) => t.isDirty).length;
        const decision = await this.modal.prompt({
          title: 'Unsaved notepad changes',
          body: `You have ${dirtyCount} unsaved notepad tab${dirtyCount === 1 ? '' : 's'}. Save before exiting?`,
        });
        if (decision === 'cancel') {
          window.restbro.notepad.sendQuitDecision(requestId, false);
          return;
        }
        if (decision === 'save') {
          for (const tab of this.store
            .getState()
            .tabs.filter((t) => t.isDirty)) {
            const ok = await saveTab(
              this.getFileOpsContext(),
              tab,
              !tab.filePath
            );
            if (!ok) {
              window.restbro.notepad.sendQuitDecision(requestId, false);
              return;
            }
          }
        }
        await this.store.flushPersist();
        window.restbro.notepad.sendQuitDecision(requestId, true);
      }
    );

    this.attachResizeSplitter();
  }

  /**
   * Makes the preview pane resizable by dragging the splitter handle.
   * The ratio is applied via flex-basis so it survives window resizes.
   */
  private attachResizeSplitter(): void {
    const splitter = this.elements.resizeSplitter;
    const area = this.elements.editorArea;
    const editorHost = this.elements.editorHost;
    const preview = this.elements.previewPane;

    let dragging = false;

    const onMouseMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const rect = area.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const totalWidth = rect.width;
      // Clamp between 20% and 80% of the editor area.
      const ratio = Math.max(0.2, Math.min(0.8, offsetX / totalWidth));
      editorHost.style.flex = `0 0 ${ratio * 100}%`;
      preview.style.flex = `0 0 ${(1 - ratio) * 100}%`;
      // Tell Monaco the container changed size.
      this.editor?.layout();
    };

    const onMouseUp = (): void => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('notepad-resizing');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      document.body.classList.add('notepad-resizing');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private attachDragDropListeners(): void {
    const overlay = this.elements.dropOverlay;
    const area = this.elements.editorArea;
    let dragDepth = 0;
    area.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragDepth += 1;
      overlay.classList.remove('hidden');
    });
    area.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    area.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) overlay.classList.add('hidden');
    });
    area.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragDepth = 0;
      overlay.classList.add('hidden');
      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        // Electron exposes a non-standard `path` property on dropped files.
        const filePath = (file as File & { path?: string }).path;
        if (!filePath) continue;
        await openFileByPath(this.getFileOpsContext(), filePath);
      }
    });
  }

  private initializeEditor(): void {
    const settings = this.store.getSettings();
    this.editor = createNotepadEditor(
      this.elements.editorHost,
      {
        fontSize: settings.fontSize,
        wordWrap: settings.wordWrap,
        tabSize: settings.tabSize,
      },
      {
        onContentChange: (value) => {
          if (this.isApplyingState) return;
          const activeTab = this.store.getActiveTab();
          if (!activeTab) return;
          this.maybeAutoDetectLanguage(activeTab.id, value);
          this.doUpdateStatusBar(activeTab, value);
          this.schedulePreviewRender(value);
          if (this.contentTimer) clearTimeout(this.contentTimer);
          const tabId = activeTab.id;
          this.contentTimer = window.setTimeout(() => {
            this.contentTimer = null;
            // Tab may have been closed during the debounce window — verify.
            const stillExists = this.store
              .getState()
              .tabs.some((t) => t.id === tabId);
            if (!stillExists) return;
            this.store.updateContent(tabId, value, true);
          }, 300);
        },
        onCursorChange: (lineNumber, column, selectionLength) => {
          this.cursorPosition = { lineNumber, column, selectionLength };
          const activeTab = this.store.getActiveTab();
          if (activeTab) this.doUpdateStatusBar(activeTab);
        },
      }
    );
  }

  private renderState(state: NotepadState): void {
    renderTabs(
      {
        tabStrip: this.elements.tabStrip,
        store: this.store,
        onTabClick: (id) => this.activateTab(id),
        onTabClose: (id) => void this.requestCloseTab(id),
        onTabRename: (id) => this.renameTab(id),
        onContextMenu: (id, x, y, hasFile) =>
          this.showContextMenu(id, x, y, hasFile),
        onReorder: (from, to) => this.store.reorderTabs(from, to),
      },
      state
    );

    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    if (activeTab) {
      this.doUpdateStatusBar(activeTab);
      this.elements.languagePicker.value = activeTab.language ?? 'plaintext';
      // Keep editor language in sync.
      if (this.editor) {
        const desired = activeTab.language ?? 'plaintext';
        const model = this.editor.getModel();
        if (model && model.getLanguageId() !== desired) {
          setEditorLanguage(this.editor, desired);
        }
      }
      // Reflect preview-mode toggle button state.
      this.elements.previewToggleBtn.classList.toggle(
        'active',
        Boolean(activeTab.previewMode)
      );
      this.elements.previewPane.classList.toggle(
        'hidden',
        !activeTab.previewMode
      );
      this.elements.resizeSplitter.classList.toggle(
        'hidden',
        !activeTab.previewMode
      );
      if (activeTab.previewMode) {
        this.renderPreview(activeTab.content, activeTab.language);
      }
    } else {
      this.applyContentToEditor('', undefined);
      this.doUpdateStatusBar(undefined);
      this.elements.previewPane.classList.add('hidden');
      this.elements.resizeSplitter.classList.add('hidden');
    }
  }

  private getFileOpsContext(): FileOperationsContext {
    return {
      store: this.store,
      getEditorValue: () => this.editor?.getValue(),
      getActiveTabId: () => this.store.getActiveTab()?.id,
      loadActiveTabIntoEditor: () => this.loadActiveTabIntoEditor(),
      getEditor: () => this.editor,
      getToastHost: () => this.elements.root,
      flushPendingContent: () => this.flushPendingContent(),
    };
  }

  /**
   * Switch to a tab, persisting the current tab's view state first so we can
   * restore cursor + scroll on the next switch back.
   */
  private activateTab(id: string): void {
    if (this.editor) {
      const current = this.store.getActiveTab();
      if (current && current.id !== id) {
        const viewState = this.editor.saveViewState();
        if (viewState) this.store.setViewState(current.id, viewState);
        this.flushPendingContent();
      }
    }
    this.store.setActiveTab(id);
  }

  /**
   * Create a new tab, preserving view state of the current tab. The store
   * subscriber will switch the editor over once the new active tab is set.
   */
  private createNewTab(): void {
    if (this.editor) {
      const current = this.store.getActiveTab();
      if (current) {
        const viewState = this.editor.saveViewState();
        if (viewState) this.store.setViewState(current.id, viewState);
        this.flushPendingContent();
      }
    }
    this.store.createTab();
  }

  private loadActiveTabIntoEditor(): void {
    const activeTab = this.store.getActiveTab();
    if (!activeTab) return;
    this.applyContentToEditor(activeTab.content, activeTab);
    this.doUpdateStatusBar(activeTab);
  }

  private adjustZoom(delta: number): void {
    const settings = this.store.getSettings();
    const next = Math.min(24, Math.max(10, settings.fontSize + delta));
    if (next === settings.fontSize) return;
    this.store.updateSettings({ fontSize: next });
    this.editor?.updateOptions({ fontSize: next });
  }

  private applySettingsToEditor(): void {
    if (!this.editor) return;
    const s = this.store.getSettings();
    this.editor.updateOptions({
      fontSize: s.fontSize,
      wordWrap: s.wordWrap,
      tabSize: s.tabSize,
    });
  }

  private switchTab(direction: 1 | -1): void {
    const tabs = this.store.getState().tabs;
    if (tabs.length < 2) return;
    const activeId = this.store.getState().activeTabId;
    let idx = tabs.findIndex((tab) => tab.id === activeId);
    if (idx === -1) idx = 0;
    const nextIdx = (idx + direction + tabs.length) % tabs.length;
    this.activateTab(tabs[nextIdx].id);
  }

  /**
   * Replace the editor's value with `content`. Restores view state if `tab`
   * has one stored; otherwise leaves the cursor at (1,1).
   */
  private applyContentToEditor(
    content: string,
    tab: NotepadTab | undefined
  ): void {
    if (!this.editor) return;
    if (this.contentTimer) {
      clearTimeout(this.contentTimer);
      this.contentTimer = null;
    }
    this.isApplyingState = true;
    this.editor.setValue(content);
    if (tab?.viewState) {
      try {
        this.editor.restoreViewState(
          tab.viewState as monaco.editor.ICodeEditorViewState
        );
      } catch {
        // Stored view state is from an older Monaco version — ignore and reset.
      }
    } else {
      this.cursorPosition = { lineNumber: 1, column: 1, selectionLength: 0 };
    }
    this.isApplyingState = false;
    this.editor.focus();
  }

  /**
   * Force-flush any in-flight content debounce into the store. Used before
   * persistence-sensitive operations (save, tab switch, app exit).
   */
  private flushPendingContent(): void {
    if (this.contentTimer === null) return;
    clearTimeout(this.contentTimer);
    this.contentTimer = null;
    const activeTab = this.store.getActiveTab();
    const value = this.editor?.getValue();
    if (activeTab && value !== undefined) {
      this.store.updateContent(activeTab.id, value, true);
    }
  }

  private async requestCloseTab(tabId: string): Promise<void> {
    const tab = this.store.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tab.isDirty) {
      this.performClose(tabId);
      return;
    }

    const decision = await this.modal.prompt();
    if (decision === 'cancel') return;
    if (decision === 'save') {
      const saved = await saveTab(this.getFileOpsContext(), tab, !tab.filePath);
      if (!saved) return;
    }
    this.performClose(tabId);
  }

  private performClose(tabId: string): void {
    this.store.closeTab(tabId);
    if (this.store.getState().tabs.length === 0) this.store.createTab();
  }

  private async closeAllTabs(): Promise<void> {
    const tabs = [...this.store.getState().tabs];
    for (const tab of tabs) {
      if (!this.store.getState().tabs.find((t) => t.id === tab.id)) continue;
      await this.requestCloseTab(tab.id);
    }
    if (this.store.getState().tabs.length === 0) this.store.createTab();
  }

  private renameTab(tabId: string): void {
    const tab = this.store.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const next = prompt('Rename tab', tab.title);
    if (next?.trim()) this.store.updateTab(tabId, { title: next.trim() });
  }

  private revealTab(tabId: string): void {
    const tab = this.store.getState().tabs.find((t) => t.id === tabId);
    if (tab?.filePath) window.restbro.notepad.revealInFolder(tab.filePath);
  }

  private async copyTabPath(tabId: string): Promise<void> {
    const tab = this.store.getState().tabs.find((t) => t.id === tabId);
    if (!tab?.filePath) return;
    await window.restbro.notepad.copyPath(tab.filePath);
    showNotepadToast(
      this.elements.root,
      'Path copied to clipboard',
      'success',
      1800
    );
  }

  private setActiveTabLanguage(language: string): void {
    const active = this.store.getActiveTab();
    if (!active) return;
    this.store.updateTab(active.id, { language });
    if (this.editor) setEditorLanguage(this.editor, language);
  }

  private togglePreview(): void {
    const active = this.store.getActiveTab();
    if (!active) return;
    const next = !active.previewMode;
    this.store.updateTab(active.id, { previewMode: next });
    // Show / hide the resize splitter together with the preview.
    this.elements.resizeSplitter.classList.toggle('hidden', !next);
    if (next && this.editor) {
      this.renderPreview(this.editor.getValue(), active.language);
      this.editor.layout();
    }
  }

  private schedulePreviewRender(value: string): void {
    const active = this.store.getActiveTab();
    if (!active?.previewMode) return;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      this.renderPreview(value, this.store.getActiveTab()?.language);
    }, 200);
  }

  /**
   * Render the preview pane. Behaviour depends on the tab's language:
   *  - `html`     → sandboxed iframe (no scripts / same-origin).
   *  - `markdown` → parsed markdown → sanitised HTML.
   *  - anything else → syntax-highlighted `<pre><code>` block so JSON, XML,
   *    YAML, etc. are shown verbatim instead of being misinterpreted as markdown.
   */
  private renderPreview(source: string, language?: string): void {
    const lang = language ?? 'plaintext';
    const headerEl = this.elements.previewHeaderText;

    if (lang === 'html') {
      if (headerEl) headerEl.textContent = 'HTML Preview';
      this.elements.previewBody.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.className = 'notepad-preview-iframe';
      iframe.setAttribute('sandbox', '');
      iframe.srcdoc = source;
      this.elements.previewBody.appendChild(iframe);
      return;
    }

    if (lang === 'markdown') {
      if (headerEl) headerEl.textContent = 'Markdown Preview';
      this.elements.previewBody.innerHTML = renderMarkdown(source);
      return;
    }

    // All other languages — show as formatted code.
    if (headerEl) {
      headerEl.textContent = `${lang.charAt(0).toUpperCase() + lang.slice(1)} Preview`;
    }
    const pre = document.createElement('pre');
    pre.className = 'notepad-code-preview';
    const code = document.createElement('code');
    code.textContent = source;
    pre.appendChild(code);
    this.elements.previewBody.innerHTML = '';
    this.elements.previewBody.appendChild(pre);
  }

  /**
   * Detect the language from content and apply it when the tab is still
   * "unset" (no language, or stuck at plaintext from a fresh untitled tab).
   * Once a language has been applied (auto or manual), we never overwrite it.
   */
  private maybeAutoDetectLanguage(tabId: string, value: string): void {
    const tab = this.store.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.language && tab.language !== 'plaintext') return;
    const detected = detectLanguageFromContent(value);
    if (!detected || detected === tab.language) return;
    this.store.updateTab(tabId, { language: detected });
    if (this.editor && tabId === this.store.getActiveTab()?.id) {
      setEditorLanguage(this.editor, detected);
    }
  }

  private async drainPendingFiles(): Promise<void> {
    try {
      const files = await window.restbro.notepad.getPendingFiles();
      for (const file of files) {
        await openFileByPath(this.getFileOpsContext(), file);
      }
    } catch {
      // pending-files API is best-effort; ignore failures.
    }
  }

  private doUpdateStatusBar(tab?: NotepadTab, valueOverride?: string): void {
    updateStatusBar(
      {
        statusFile: this.elements.statusFile,
        statusState: this.elements.statusState,
        statusCursor: this.elements.statusCursor,
        statusLines: this.elements.statusLines,
        statusChars: this.elements.statusChars,
        statusLanguage: this.elements.statusLanguage,
        statusSelection: this.elements.statusSelection,
        statusEol: this.elements.statusEol,
        statusIndent: this.elements.statusIndent,
      },
      this.cursorPosition,
      { tabSize: this.store.getSettings().tabSize },
      tab,
      valueOverride
    );
  }

  private showContextMenu(
    tabId: string,
    x: number,
    y: number,
    hasFile: boolean
  ): void {
    if (!this.store.getState().tabs.some((t) => t.id === tabId)) return;
    this.elements.contextMenu.style.left = `${x}px`;
    this.elements.contextMenu.style.top = `${y}px`;
    this.elements.contextMenu.dataset.tabId = tabId;
    this.elements.contextMenu.classList.remove('hidden');
    const togglePathBtn = (action: string) => {
      const btn = this.elements.contextMenu.querySelector(
        `[data-action="${action}"]`
      ) as HTMLElement | null;
      if (btn) btn.style.display = hasFile ? 'block' : 'none';
    };
    togglePathBtn('reveal');
    togglePathBtn('copyPath');
  }

  private hideContextMenu(): void {
    this.elements.contextMenu.classList.add('hidden');
    delete this.elements.contextMenu.dataset.tabId;
  }
}

// Re-export for any callers that destructured from the old module.
export { detectLanguageFromPath };
