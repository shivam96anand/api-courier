import * as monaco from 'monaco-editor';
import { NotepadTab, NotepadState } from '../../shared/types';
import { NotepadStore } from './notepad/notepad-store';
import { buildNotepadLayout, NotepadElements } from './notepad/notepad-layout';
import { createNotepadEditor } from './notepad/notepad-editor';
import {
  openFile,
  saveActiveTab,
  saveTabById,
  saveTab,
} from './notepad/notepad-file-ops';
import {
  renderTabs,
  updateStatusBar,
  CursorPosition,
} from './notepad/notepad-tabs-ui';
import {
  createKeyboardHandler,
  handleContextMenuAction,
} from './notepad/notepad-keyboard';

type CloseDecision = 'save' | 'discard' | 'cancel';

export class NotepadManager {
  private container: HTMLElement;
  private elements!: NotepadElements;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private store = new NotepadStore();
  private isApplyingState = false;
  private contentTimer: number | null = null;
  private fontSize = 14;
  private readonly minFontSize = 10;
  private readonly maxFontSize = 24;
  private cursorPosition: CursorPosition = { lineNumber: 1, column: 1 };
  private modalResolver: ((decision: CloseDecision) => void) | null = null;

  constructor(container?: HTMLElement | null) {
    this.container = container || document.createElement('div');
  }

  private initialized = false;

  /**
   * Lazy initialization — safe to call multiple times; only runs once.
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this._doInitialize();
  }

  /** @deprecated Use ensureInitialized() instead */
  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  private async _doInitialize(): Promise<void> {
    if (!this.container) return;

    this.buildLayout();
    this.attachListeners();

    await this.store.hydrate();
    const state = this.store.getState();
    if (!state.tabs.length) this.store.createTab();
    if (!state.activeTabId && this.store.getState().tabs.length) {
      this.store.setActiveTab(this.store.getState().tabs[0].id);
    }

    this.renderState(this.store.getState());
    this.initializeEditor();
    this.loadActiveTabIntoEditor();
    this.store.subscribe((updated) => this.renderState(updated));
  }

  private buildLayout(): void {
    this.elements = buildNotepadLayout(this.container, {
      onZoomOut: () => this.adjustZoom(-1),
      onZoomIn: () => this.adjustZoom(1),
      onAddTab: () => this.store.createTab(),
      onOpenFile: () => void openFile(this.getFileOpsContext()),
      onSave: () => void saveActiveTab(this.getFileOpsContext()),
      onSaveAs: () => void saveActiveTab(this.getFileOpsContext(), true),
    });
  }

  private attachListeners(): void {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    document.addEventListener(
      'keydown',
      createKeyboardHandler(isMac, {
        onSave: (saveAs) =>
          void saveActiveTab(this.getFileOpsContext(), saveAs),
        onOpenFile: () => void openFile(this.getFileOpsContext()),
        onNewTab: () => this.store.createTab(),
        onCloseActiveTab: () => {
          const active = this.store.getActiveTab();
          if (active) void this.requestCloseTab(active.id);
        },
        onNextTab: () => this.switchTab(1),
        onPrevTab: () => this.switchTab(-1),
      })
    );

    window.addEventListener('beforeunload', () => {
      // Flush any pending persist so dirty content is saved before close
      this.store.flushPersist();
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
        onNew: () => this.store.createTab(),
        onRename: (id) => this.renameTab(id),
        onSave: (id) => void saveTabById(this.getFileOpsContext(), id),
        onSaveAs: (id) => void saveTabById(this.getFileOpsContext(), id, true),
        onClose: (id) => void this.requestCloseTab(id),
        onCloseOthers: (id) => this.store.closeOthers(id),
        onCloseAll: () => void this.closeAllTabs(),
        onReveal: (id) => {
          const tab = this.store.getState().tabs.find((t) => t.id === id);
          if (tab?.filePath)
            window.apiCourier.notepad.revealInFolder(tab.filePath);
        },
      });
    });

    this.elements.dirtyModal
      .querySelectorAll('[data-action]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          this.resolveModal(
            (btn as HTMLElement).dataset.action as CloseDecision
          );
        });
      });
  }

  private initializeEditor(): void {
    this.editor = createNotepadEditor(
      this.elements.editorHost,
      { fontSize: this.fontSize },
      {
        onContentChange: (value) => {
          if (this.isApplyingState) return;
          const activeTab = this.store.getActiveTab();
          if (!activeTab) return;
          this.doUpdateStatusBar(activeTab, value);
          if (this.contentTimer) clearTimeout(this.contentTimer);
          this.contentTimer = window.setTimeout(() => {
            this.store.updateContent(activeTab.id, value, true);
            this.contentTimer = null;
          }, 300);
        },
        onCursorChange: (lineNumber, column) => {
          this.cursorPosition = { lineNumber, column };
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
        onTabClick: (id) => {
          this.store.setActiveTab(id);
          this.loadActiveTabIntoEditor();
        },
        onTabClose: (id) => void this.requestCloseTab(id),
        onTabRename: (id) => this.renameTab(id),
        onContextMenu: (id, x, y, hasFile) =>
          this.showContextMenu(id, x, y, hasFile),
      },
      state
    );

    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    if (activeTab) {
      this.doUpdateStatusBar(activeTab);
      if (this.editor?.getValue() !== activeTab.content)
        this.applyContentToEditor(activeTab.content);
    } else {
      this.applyContentToEditor('');
      this.doUpdateStatusBar(undefined);
    }
  }

  private getFileOpsContext() {
    return {
      store: this.store,
      getEditorValue: () => this.editor?.getValue(),
      getActiveTabId: () => this.store.getActiveTab()?.id,
      loadActiveTabIntoEditor: () => this.loadActiveTabIntoEditor(),
    };
  }

  private loadActiveTabIntoEditor(): void {
    const activeTab = this.store.getActiveTab();
    if (!activeTab) return;
    this.applyContentToEditor(activeTab.content);
    this.doUpdateStatusBar(activeTab);
  }

  private adjustZoom(delta: number): void {
    this.fontSize = Math.min(
      this.maxFontSize,
      Math.max(this.minFontSize, this.fontSize + delta)
    );
    this.editor?.updateOptions({ fontSize: this.fontSize });
  }

  private switchTab(direction: 1 | -1): void {
    const tabs = this.store.getState().tabs;
    if (tabs.length < 2) return;
    const activeId = this.store.getState().activeTabId;
    let idx = tabs.findIndex((tab) => tab.id === activeId);
    if (idx === -1) idx = 0;
    const nextIdx = (idx + direction + tabs.length) % tabs.length;
    this.store.setActiveTab(tabs[nextIdx].id);
    this.loadActiveTabIntoEditor();
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

  private async requestCloseTab(tabId: string): Promise<void> {
    const tab = this.store.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tab.isDirty) {
      this.performClose(tabId);
      return;
    }

    const decision = await this.showDirtyModal();
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

  private doUpdateStatusBar(tab?: NotepadTab, valueOverride?: string): void {
    updateStatusBar(
      {
        statusFile: this.elements.statusFile,
        statusState: this.elements.statusState,
        statusCursor: this.elements.statusCursor,
        statusLines: this.elements.statusLines,
        statusChars: this.elements.statusChars,
      },
      this.cursorPosition,
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
    this.elements.contextMenu.style.left = `${x}px`;
    this.elements.contextMenu.style.top = `${y}px`;
    this.elements.contextMenu.dataset.tabId = tabId;
    this.elements.contextMenu.classList.remove('hidden');
    const revealBtn = this.elements.contextMenu.querySelector(
      '[data-action="reveal"]'
    ) as HTMLElement;
    if (revealBtn) revealBtn.style.display = hasFile ? 'block' : 'none';
  }

  private hideContextMenu(): void {
    this.elements.contextMenu.classList.add('hidden');
  }

  private showDirtyModal(): Promise<CloseDecision> {
    return new Promise((resolve) => {
      this.modalResolver = resolve;
      this.elements.dirtyModal.classList.remove('hidden');
    });
  }

  private resolveModal(decision: CloseDecision): void {
    this.elements.dirtyModal.classList.add('hidden');
    if (this.modalResolver) {
      this.modalResolver(decision);
      this.modalResolver = null;
    }
  }
}
