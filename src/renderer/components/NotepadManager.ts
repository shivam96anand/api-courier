import * as monaco from 'monaco-editor';
import { NotepadTab } from '../../shared/types';
import { NotepadStore } from './notepad/notepad-store';

type CloseDecision = 'save' | 'discard' | 'cancel';

export class NotepadManager {
  private container: HTMLElement;
  private tabStrip!: HTMLElement;
  private editorHost!: HTMLElement;
  private statusFile!: HTMLElement;
  private statusState!: HTMLElement;
  private statusCursor!: HTMLElement;
  private statusLines!: HTMLElement;
  private statusChars!: HTMLElement;
  private contextMenu!: HTMLElement;
  private dirtyModal!: HTMLElement;

  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private store = new NotepadStore();
  private activeState: { tab?: NotepadTab } = {};
  private isApplyingState = false;
  private isMac = navigator.platform.toLowerCase().includes('mac');
  private contentTimer: number | null = null;

  private cursorPosition = { lineNumber: 1, column: 1 };

  constructor(container?: HTMLElement | null) {
    this.container = container || document.createElement('div');
  }

  async initialize(): Promise<void> {
    if (!this.container) return;

    this.buildLayout();
    this.attachGlobalListeners();
    this.attachContextMenuHandlers();
    this.attachModalHandlers();

    await this.store.hydrate();
    const state = this.store.getState();
    if (!state.tabs.length) {
      this.store.createTab();
    }
    if (!state.activeTabId && this.store.getState().tabs.length) {
      this.store.setActiveTab(this.store.getState().tabs[0].id);
    }

    this.renderState(this.store.getState());
    this.initializeEditor();
    this.loadActiveTabIntoEditor();

    this.store.subscribe((updated) => this.renderState(updated));
  }

  private buildLayout(): void {
    this.container.innerHTML = `
      <div class="notepad-layout">
        <div class="notepad-topbar">
          <div class="notepad-tabs" id="notepad-tab-strip"></div>
          <div class="notepad-actions">
            <button class="np-btn ghost" id="np-new-tab" title="New Tab (Ctrl/Cmd+N)">+ New</button>
            <button class="np-btn ghost" id="np-open-file" title="Open File (Ctrl/Cmd+O)">Open</button>
            <button class="np-btn primary" id="np-save" title="Save (Ctrl/Cmd+S)">Save</button>
            <button class="np-btn" id="np-save-as" title="Save As (Ctrl/Cmd+Shift+S)">Save As</button>
          </div>
        </div>
        <div class="notepad-editor" id="notepad-editor"></div>
        <div class="notepad-status-bar">
          <div class="status-left">
            <span class="status-file" id="np-status-file">No file</span>
            <span class="status-state" id="np-status-state">Unsaved</span>
          </div>
          <div class="status-right">
            <span class="status-metric" id="np-status-cursor">Ln 1, Col 1</span>
            <span class="status-metric" id="np-status-lines">0 lines</span>
            <span class="status-metric" id="np-status-chars">0 chars</span>
          </div>
        </div>
        <div class="notepad-context-menu hidden" id="notepad-context-menu">
          <button data-action="new">New Tab</button>
          <button data-action="rename">Rename</button>
          <button data-action="save">Save</button>
          <button data-action="saveAs">Save As</button>
          <button data-action="close">Close</button>
          <button data-action="closeOthers">Close Others</button>
          <button data-action="closeAll">Close All</button>
          <button data-action="reveal">Reveal in Finder/Explorer</button>
        </div>
        <div class="notepad-modal hidden" id="notepad-dirty-modal">
          <div class="notepad-modal-content">
            <div class="modal-title">Unsaved Changes</div>
            <div class="modal-body">
              This tab has unsaved changes. Save before closing?
            </div>
            <div class="modal-actions">
              <button class="np-btn primary" data-action="save">Save</button>
              <button class="np-btn ghost" data-action="discard">Don't Save</button>
              <button class="np-btn" data-action="cancel">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.tabStrip = this.container.querySelector('#notepad-tab-strip') as HTMLElement;
    this.editorHost = this.container.querySelector('#notepad-editor') as HTMLElement;
    this.statusFile = this.container.querySelector('#np-status-file') as HTMLElement;
    this.statusState = this.container.querySelector('#np-status-state') as HTMLElement;
    this.statusCursor = this.container.querySelector('#np-status-cursor') as HTMLElement;
    this.statusLines = this.container.querySelector('#np-status-lines') as HTMLElement;
    this.statusChars = this.container.querySelector('#np-status-chars') as HTMLElement;
    this.contextMenu = this.container.querySelector('#notepad-context-menu') as HTMLElement;
    this.dirtyModal = this.container.querySelector('#notepad-dirty-modal') as HTMLElement;

    // Top actions
    this.container.querySelector('#np-new-tab')?.addEventListener('click', () => this.createTab());
    this.container.querySelector('#np-open-file')?.addEventListener('click', () => this.openFile());
    this.container.querySelector('#np-save')?.addEventListener('click', () => this.saveActiveTab());
    this.container.querySelector('#np-save-as')?.addEventListener('click', () => this.saveActiveTab(true));
  }

  private attachGlobalListeners(): void {
    document.addEventListener('keydown', (event) => {
      if (!this.isNotepadActive()) return;

      const cmd = this.isMac ? event.metaKey : event.ctrlKey;
      if (!cmd) return;

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (event.shiftKey) {
          this.saveActiveTab(true);
        } else {
          this.saveActiveTab();
        }
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        this.openFile();
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        this.createTab();
      } else if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        const active = this.store.getActiveTab();
        if (active) {
          void this.requestCloseTab(active.id);
        }
      }
    });

    window.addEventListener('beforeunload', (event) => {
      const dirty = this.store.getState().tabs.some(t => t.isDirty);
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('#notepad-context-menu')) {
        this.hideContextMenu();
      }
    });
  }

  private attachContextMenuHandlers(): void {
    this.contextMenu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      const tabId = this.contextMenu.dataset.tabId;
      if (!action) return;
      e.preventDefault();
      this.hideContextMenu();

      if (action === 'new') {
        this.createTab();
      } else if (action === 'rename' && tabId) {
        this.renameTab(tabId);
      } else if (action === 'save' && tabId) {
        this.saveTabById(tabId);
      } else if (action === 'saveAs' && tabId) {
        this.saveTabById(tabId, true);
      } else if (action === 'close' && tabId) {
        void this.requestCloseTab(tabId);
      } else if (action === 'closeOthers' && tabId) {
        this.store.closeOthers(tabId);
      } else if (action === 'closeAll') {
        void this.closeAllTabs();
      } else if (action === 'reveal' && tabId) {
        const tab = this.store.getState().tabs.find(t => t.id === tabId);
        if (tab?.filePath) {
          window.apiCourier.notepad.revealInFolder(tab.filePath);
        }
      }
    });
  }

  private attachModalHandlers(): void {
    this.dirtyModal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action as CloseDecision;
        this.resolveModal(action);
      });
    });
  }

  private initializeEditor(): void {
    this.updateMonacoTheme();
    this.editor = monaco.editor.create(this.editorHost, {
      value: '',
      language: 'plaintext',
      theme: 'api-courier-notepad',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      padding: { top: 12, bottom: 12 },
      bracketPairColorization: { enabled: true },
      renderWhitespace: 'selection',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: 'off',
      tabCompletion: 'off',
      suggest: {
        preview: false,
        inlineSuggest: false,
      },
    });

    this.editor.onDidChangeModelContent(() => {
      if (this.isApplyingState) return;
      const activeTab = this.store.getActiveTab();
      if (!activeTab) return;

      const value = this.editor?.getValue() || '';
      this.updateStatusBar(activeTab, value);
      if (this.contentTimer) {
        clearTimeout(this.contentTimer);
      }
      this.contentTimer = window.setTimeout(() => {
        this.store.updateContent(activeTab.id, value, true);
        this.contentTimer = null;
      }, 300);
    });

    this.editor.onDidChangeCursorPosition((evt) => {
      this.cursorPosition = { lineNumber: evt.position.lineNumber, column: evt.position.column };
      const activeTab = this.store.getActiveTab();
      if (activeTab) {
        this.updateStatusBar(activeTab);
      }
    });

    document.addEventListener('theme-changed', () => this.updateMonacoTheme());
  }

  private updateMonacoTheme(): void {
    const foreground = 'ffffff';
    monaco.editor.defineTheme('api-courier-notepad', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground },
      ],
      colors: {
        'editor.background': '#121212',
        'editor.foreground': '#ffffff',
        'editorLineNumber.foreground': '#6e6e6e',
        'editor.selectionBackground': '#263c55',
        'editor.lineHighlightBackground': '#1e1e1e',
      },
    });

    monaco.editor.setTheme('api-courier-notepad');
  }

  private renderState(state: ReturnType<NotepadStore['getState']>): void {
    this.renderTabs(state);
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    this.activeState.tab = activeTab;
    if (activeTab) {
      this.updateStatusBar(activeTab);
      const currentValue = this.editor?.getValue();
      if (currentValue !== activeTab.content) {
        this.applyContentToEditor(activeTab.content);
      }
    } else {
      this.applyContentToEditor('');
      this.updateStatusBar(undefined);
    }
  }

  private renderTabs(state: ReturnType<NotepadStore['getState']>): void {
    if (!this.tabStrip) return;
    this.tabStrip.innerHTML = '';

    state.tabs.forEach(tab => {
      const button = document.createElement('button');
      button.className = `notepad-tab ${tab.id === state.activeTabId ? 'active' : ''}`;
      button.dataset.tabId = tab.id;
      button.innerHTML = `
        <span class="tab-dirty ${tab.isDirty ? 'visible' : ''}">●</span>
        <span class="tab-title">${this.escape(tab.title)}</span>
        <span class="tab-close" title="Close">x</span>
      `;

      button.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('tab-close')) {
          void this.requestCloseTab(tab.id);
          return;
        }
        this.store.setActiveTab(tab.id);
        this.loadActiveTabIntoEditor();
      });

      button.addEventListener('dblclick', () => this.renameTab(tab.id));

      button.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          void this.requestCloseTab(tab.id);
        }
      });

      button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(tab.id, e.clientX, e.clientY, Boolean(tab.filePath));
      });

      this.tabStrip.appendChild(button);
    });

    // New tab pill
    const addBtn = document.createElement('button');
    addBtn.className = 'notepad-tab add';
    addBtn.textContent = '+';
    addBtn.title = 'New Tab';
    addBtn.addEventListener('click', () => this.createTab());
    this.tabStrip.appendChild(addBtn);
  }

  private loadActiveTabIntoEditor(): void {
    const activeTab = this.store.getActiveTab();
    if (!activeTab) return;
    this.applyContentToEditor(activeTab.content);
    this.updateStatusBar(activeTab);
  }

  private applyContentToEditor(content: string): void {
    if (!this.editor) return;
    if (this.contentTimer) {
      clearTimeout(this.contentTimer);
      this.contentTimer = null;
    }
    this.cursorPosition = { lineNumber: 1, column: 1 };
    this.isApplyingState = true;
    this.editor.setValue(content);
    this.isApplyingState = false;
  }

  private createTab(): void {
    this.store.createTab();
  }

  private async openFile(): Promise<void> {
    const result = await window.apiCourier.notepad.openFile();
    if (result?.canceled || !result.filePath || result.content === undefined) return;

    const existing = this.store.getTabByFilePath(result.filePath);
    if (existing) {
      this.store.setActiveTab(existing.id);
      this.loadActiveTabIntoEditor();
      return;
    }

    this.store.createTab({
      title: this.getFileName(result.filePath),
      content: result.content,
      filePath: result.filePath,
    });
  }

  private async saveActiveTab(forceSaveAs = false): Promise<boolean> {
    const activeTab = this.store.getActiveTab();
    if (!activeTab) return false;
    return this.saveTab(activeTab, forceSaveAs);
  }

  private async saveTabById(tabId: string, forceSaveAs = false): Promise<boolean> {
    const tab = this.store.getState().tabs.find(t => t.id === tabId);
    if (!tab) return false;
    return this.saveTab(tab, forceSaveAs);
  }

  private async saveTab(tab: NotepadTab, forceSaveAs = false): Promise<boolean> {
    try {
      const active = this.store.getActiveTab();
      const latestContent = tab.id === active?.id && this.editor ? this.editor.getValue() : tab.content;
      if (latestContent !== tab.content) {
        this.store.updateContent(tab.id, latestContent, false);
        tab = { ...tab, content: latestContent };
      }

      const useSaveAs = forceSaveAs || !tab.filePath;
      const result = await window.apiCourier.notepad.saveFile({
        filePath: useSaveAs ? undefined : tab.filePath,
        content: tab.content,
        defaultName: tab.title,
      });

      if (result?.canceled) return false;
      const finalPath = result?.filePath || tab.filePath;
      this.store.markSaved(tab.id, finalPath);
      return true;
    } catch (error) {
      console.error('Failed to save tab', error);
      return false;
    }
  }

  private async requestCloseTab(tabId: string): Promise<void> {
    const tab = this.store.getState().tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (!tab.isDirty) {
      this.performClose(tabId);
      return;
    }

    const decision = await this.showDirtyModal();
    if (decision === 'cancel') return;
    if (decision === 'save') {
      const saved = await this.saveTab(tab, !tab.filePath);
      if (!saved) return;
      this.performClose(tabId);
    } else if (decision === 'discard') {
      this.performClose(tabId);
    }
  }

  private performClose(tabId: string): void {
    this.store.closeTab(tabId);
    if (this.store.getState().tabs.length === 0) {
      this.store.createTab();
    }
  }

  private async closeAllTabs(): Promise<void> {
    const tabs = [...this.store.getState().tabs];
    for (const tab of tabs) {
      const stillOpen = this.store.getState().tabs.find(t => t.id === tab.id);
      if (!stillOpen) continue;
      await this.requestCloseTab(tab.id);
    }
    if (this.store.getState().tabs.length === 0) {
      this.store.createTab();
    }
  }

  private renameTab(tabId: string): void {
    const tab = this.store.getState().tabs.find(t => t.id === tabId);
    if (!tab) return;
    const next = prompt('Rename tab', tab.title);
    if (next && next.trim()) {
      this.store.updateTab(tabId, { title: next.trim() });
    }
  }

  private updateStatusBar(tab?: NotepadTab, valueOverride?: string): void {
    if (!tab) {
      this.statusFile.textContent = 'No file';
      this.statusState.textContent = '';
      this.statusCursor.textContent = 'Ln 0, Col 0';
      this.statusLines.textContent = '0 lines';
      this.statusChars.textContent = '0 chars';
      return;
    }

    const value = valueOverride !== undefined ? valueOverride : tab.content;
    const lines = value.split(/\r?\n/).length;
    const chars = value.length;

    this.statusFile.textContent = tab.filePath ? this.getFileName(tab.filePath) : tab.title;
    this.statusFile.title = tab.filePath || tab.title;
    this.statusState.textContent = tab.isDirty ? 'Unsaved' : 'Saved';
    this.statusState.className = `status-state ${tab.isDirty ? 'dirty' : 'clean'}`;
    this.statusCursor.textContent = `Ln ${this.cursorPosition.lineNumber}, Col ${this.cursorPosition.column}`;
    this.statusLines.textContent = `${lines} line${lines === 1 ? '' : 's'}`;
    this.statusChars.textContent = `${chars} char${chars === 1 ? '' : 's'}`;
  }

  private showContextMenu(tabId: string, x: number, y: number, hasFile: boolean): void {
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
    this.contextMenu.dataset.tabId = tabId;
    this.contextMenu.classList.remove('hidden');
    const revealBtn = this.contextMenu.querySelector('[data-action="reveal"]') as HTMLElement;
    if (revealBtn) {
      revealBtn.style.display = hasFile ? 'block' : 'none';
    }
  }

  private hideContextMenu(): void {
    this.contextMenu.classList.add('hidden');
  }

  private modalResolver: ((decision: CloseDecision) => void) | null = null;

  private showDirtyModal(): Promise<CloseDecision> {
    return new Promise(resolve => {
      this.modalResolver = resolve;
      this.dirtyModal.classList.remove('hidden');
    });
  }

  private resolveModal(decision: CloseDecision): void {
    this.dirtyModal.classList.add('hidden');
    if (this.modalResolver) {
      this.modalResolver(decision);
      this.modalResolver = null;
    }
  }

  private escape(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getFileName(filePath: string): string {
    const segments = filePath.split(/[/\\]/);
    return segments[segments.length - 1] || filePath;
  }

  private isNotepadActive(): boolean {
    const section = document.getElementById('notepad-tab');
    return Boolean(section && section.classList.contains('active'));
  }
}
