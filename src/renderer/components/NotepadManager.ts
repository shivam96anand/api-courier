/**
 * Coordinates the Notepad tab: global chrome (top-bar actions, status bar,
 * context menu, dirty modal, settings) plus one or two `PaneController`s for
 * the (optional) side-by-side split view. Per-editor concerns live in
 * `PaneController`; this class owns the store, cross-pane operations, focus
 * tracking and file/OS integration.
 */
import { NotepadState, NotepadTab } from '../../shared/types';
import { NotepadStore } from './notepad/notepad-store';
import { buildNotepadLayout, NotepadElements } from './notepad/notepad-layout';
import { PaneController, PaneHost } from './notepad/notepad-pane';
import {
  openFile,
  openFileByPath,
  saveActiveTab,
  saveTab,
  saveTabById,
  FileOperationsContext,
} from './notepad/notepad-file-ops';
import { updateStatusBar } from './notepad/notepad-tabs-ui';
import {
  createKeyboardHandler,
  handleContextMenuAction,
  KeyboardHandler,
} from './notepad/notepad-keyboard';
import { DirtyModal } from './notepad/notepad-modal';
import { SettingsMenu } from './notepad/notepad-settings';
import { showNotepadToast } from './notepad/notepad-toast';
import { formatJson } from './notepad/notepad-json';

// Re-export for callers that imported this helper from the old module.
export { detectLanguageFromPath } from './notepad/notepad-language';

export class NotepadManager {
  private readonly container: HTMLElement;
  private elements!: NotepadElements;
  private readonly store = new NotepadStore();
  private panes: PaneController[] = [];
  private modal!: DirtyModal;
  private settingsMenu!: SettingsMenu;
  private keyHandler: KeyboardHandler | null = null;
  private beforeQuitDispose: (() => void) | null = null;
  private initialized = false;
  private pendingRatio: number | null = null;

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
    if (!this.store.getState().tabs.length) this.store.createTab();
    if (!this.store.getActiveTab() && this.store.getState().tabs.length) {
      this.store.setActiveTab(this.store.getState().tabs[0].id);
    }

    this.renderState(this.store.getState());
    this.attachListeners();
    this.store.subscribe((updated) => this.renderState(updated));
    this.focusedPane().focus();
  }

  private buildLayout(): void {
    this.elements = buildNotepadLayout(this.container, {
      onZoomOut: () => this.adjustZoom(-1),
      onZoomIn: () => this.adjustZoom(1),
      onOpenFile: () => void openFile(this.getFileOpsContext()),
      onSave: () => void saveActiveTab(this.getFileOpsContext()),
      onTogglePreview: () => this.togglePreview(),
      onToggleSplit: () => this.toggleSplit(),
      onFormatJson: () => this.formatActiveTabJson(),
      onSettingsClick: (anchor) =>
        this.settingsMenu.toggle(anchor, this.store.getSettings()),
      onLanguageChange: (lang) => this.setActiveTabLanguage(lang),
      onFind: () => this.focusedPane().find(),
      onReplace: () => this.focusedPane().replace(),
    });

    const host = this.getPaneHost();
    this.panes = [
      new PaneController(0, this.elements.pane0Root, host),
      new PaneController(1, this.elements.pane1Root, host),
    ];
    this.panes.forEach((p) => p.init());

    this.modal = new DirtyModal(this.elements.dirtyModal, {
      titleEl: this.elements.dirtyModalTitle,
      bodyEl: this.elements.dirtyModalBody,
    });
    this.settingsMenu = new SettingsMenu(this.elements.settingsHost, {
      onChange: (updates) => {
        this.store.updateSettings(updates);
        this.applySettingsToEditors();
      },
    });

    this.attachDivider();
  }

  private getPaneHost(): PaneHost {
    return {
      store: this.store,
      getSettings: () => this.store.getSettings(),
      getToastHost: () => this.elements.root,
      onFocusPane: (paneId) => this.focusPane(paneId),
      onActivateTab: (paneId, tabId) => this.activateTab(paneId, tabId),
      onCloseTab: (tabId) => void this.requestCloseTab(tabId),
      onRenameTab: (tabId) => this.renameTab(tabId),
      onNewTab: (paneId) => this.createNewTab(paneId),
      onContextMenu: (tabId, x, y, hasFile) =>
        this.showContextMenu(tabId, x, y, hasFile),
      onReorderInPane: (paneId, from, to) =>
        this.store.moveTabWithinPane(paneId, from, to),
      onEditorActivity: (paneId) => {
        if (this.store.getFocusedPaneId() === paneId) {
          this.doUpdateStatusBar(this.store.getActiveTab());
        }
      },
      onDropFiles: (paneId, paths) => void this.handleDropFiles(paneId, paths),
    };
  }

  private focusedPane(): PaneController {
    return this.panes[this.store.getFocusedPaneId()] ?? this.panes[0];
  }

  private focusPane(paneId: number): void {
    if (this.store.getFocusedPaneId() === paneId) return;
    if (!this.store.getTabsForPane(paneId).length) return;
    this.store.setFocusedPane(paneId);
  }

  private renderState(state: NotepadState): void {
    this.applySplitLayout();
    const focused = this.store.getFocusedPaneId();
    this.panes.forEach((p) => p.setFocused(p.paneId === focused));
    this.panes.forEach((p) => p.sync(state));
    this.updateGlobalChrome();
  }

  /** Show/hide the second pane + divider and apply the split ratio. */
  private applySplitLayout(): void {
    const split = this.store.isSplitEnabled();
    this.elements.pane1Root.classList.toggle('hidden', !split);
    this.elements.paneDivider.classList.toggle('hidden', !split);
    this.elements.panesHost.classList.toggle('split', split);
    if (split) {
      const ratio = this.store.getSplitRatio();
      this.elements.pane0Root.style.flex = `0 0 ${ratio * 100}%`;
      this.elements.pane1Root.style.flex = '1 1 0';
    } else {
      this.elements.pane0Root.style.flex = '';
      this.elements.pane1Root.style.flex = '';
    }
  }

  /** Update global chrome (status bar, toolbar button states) for the focused pane. */
  private updateGlobalChrome(): void {
    const active = this.store.getActiveTab();
    const isJson = active?.language === 'json';
    this.elements.formatJsonBtn.classList.toggle('hidden', !isJson);
    this.elements.previewToggleBtn.disabled = isJson;
    this.elements.previewToggleBtn.classList.toggle(
      'active',
      Boolean(active?.previewMode)
    );
    this.elements.languagePicker.value = active?.language ?? 'plaintext';

    const split = this.store.isSplitEnabled();
    this.elements.splitBtn.classList.toggle('active', split);
    this.elements.splitBtn.setAttribute('aria-pressed', String(split));
    this.elements.splitBtn.textContent = split ? 'Unsplit' : 'Split';

    this.doUpdateStatusBar(active);
  }

  private getFileOpsContext(): FileOperationsContext {
    return {
      store: this.store,
      getEditorValue: () => this.focusedPane().getEditorValue(),
      getActiveTabId: () => this.store.getActiveTab()?.id,
      loadActiveTabIntoEditor: () => this.focusedPane().focus(),
      getEditor: () => this.focusedPane().getEditor(),
      getToastHost: () => this.elements.root,
      // Flush every pane so a Save/switch/quit never writes a stale buffer,
      // regardless of which pane the target tab lives in.
      flushPendingContent: () => this.panes.forEach((p) => p.flushPending()),
    };
  }

  private activateTab(paneId: number, tabId: string): void {
    this.store.setActiveTab(tabId, paneId);
    this.panes[paneId]?.focus();
  }

  private createNewTab(paneId?: number): void {
    const p = paneId ?? this.store.getFocusedPaneId();
    this.store.createTab(undefined, p);
    this.panes[p]?.focus();
  }

  /** Toggle the split view (Split ↔ Unsplit toolbar button). */
  private toggleSplit(): void {
    this.panes.forEach((pane) => {
      pane.flushPending();
      pane.saveViewState(this.store.getPaneActiveTabId(pane.paneId));
    });
    if (this.store.isSplitEnabled()) this.store.disableSplit();
    else this.store.enableSplit();
    requestAnimationFrame(() => {
      this.panes.forEach((p) => p.layout());
      this.focusedPane().focus();
    });
  }

  /** Move a tab to the other pane (context-menu "Move to Other View"). */
  private moveTabToOtherView(tabId: string): void {
    const tab = this.store.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const target = (tab.paneId ?? 0) === 0 ? 1 : 0;
    this.panes.forEach((p) => p.flushPending());
    this.store.moveTabToPane(tabId, target);
    requestAnimationFrame(() => {
      this.panes.forEach((p) => p.layout());
      this.focusedPane().focus();
    });
  }

  /**
   * Open a new Notepad tab containing pretty-printed JSON. Entry point for the
   * response viewer's "Open in Notepad" action. Invalid JSON opens as-is with a
   * non-blocking notice so the payload is never lost.
   */
  async openJson(text: string, title = 'response.json'): Promise<void> {
    await this.ensureInitialized();
    const formatted = formatJson(text);
    this.store.createTab({ title, content: formatted.text, language: 'json' });
    this.focusedPane().focus();
    if (!formatted.ok) {
      showNotepadToast(
        this.elements.root,
        'Opened as-is — the content is not valid JSON.',
        'info'
      );
    }
  }

  /**
   * Open a file by absolute path (used by the app-level OS file-open bridge).
   * De-dupes: `openFileByPath` re-activates an existing tab for the same path.
   */
  async openPath(filePath: string): Promise<void> {
    await this.ensureInitialized();
    await openFileByPath(this.getFileOpsContext(), filePath);
    this.focusedPane().focus();
  }

  /** Open the OS file picker in the Notepad (application menu "Open File…"). */
  async openFileDialog(): Promise<void> {
    await this.ensureInitialized();
    await openFile(this.getFileOpsContext());
  }

  /** Save the active Notepad tab (application menu Save / Save As). */
  async saveActive(saveAs = false): Promise<void> {
    await this.ensureInitialized();
    if (saveAs) {
      const active = this.store.getActiveTab();
      if (active) await saveTabById(this.getFileOpsContext(), active.id, true);
      return;
    }
    await saveActiveTab(this.getFileOpsContext());
  }

  /** Close the active Notepad tab (application menu Close Tab). */
  async closeActive(): Promise<void> {
    await this.ensureInitialized();
    const active = this.store.getActiveTab();
    if (active) await this.requestCloseTab(active.id);
  }

  private async handleDropFiles(
    paneId: number,
    paths: string[]
  ): Promise<void> {
    this.focusPane(paneId);
    for (const p of paths) {
      await openFileByPath(this.getFileOpsContext(), p);
    }
  }

  private adjustZoom(delta: number): void {
    const settings = this.store.getSettings();
    const next = Math.min(24, Math.max(10, settings.fontSize + delta));
    if (next === settings.fontSize) return;
    this.store.updateSettings({ fontSize: next });
    this.applySettingsToEditors();
  }

  private applySettingsToEditors(): void {
    const s = this.store.getSettings();
    this.panes.forEach((p) => p.applySettings(s));
  }

  private formatActiveTabJson(): void {
    if (!this.focusedPane().formatJson()) {
      showNotepadToast(
        this.elements.root,
        'Invalid JSON — nothing changed.',
        'error'
      );
    }
  }

  private switchTab(direction: 1 | -1): void {
    const p = this.store.getFocusedPaneId();
    const tabs = this.store.getTabsForPane(p);
    if (tabs.length < 2) return;
    const activeId = this.store.getPaneActiveTabId(p);
    let idx = tabs.findIndex((t) => t.id === activeId);
    if (idx === -1) idx = 0;
    const next = (idx + direction + tabs.length) % tabs.length;
    this.activateTab(p, tabs[next].id);
  }

  private setActiveTabLanguage(language: string): void {
    const active = this.store.getActiveTab();
    if (!active) return;
    this.store.updateTab(active.id, { language });
    this.focusedPane().setLanguage(language);
  }

  private togglePreview(): void {
    const active = this.store.getActiveTab();
    if (!active) return;
    this.store.updateTab(active.id, { previewMode: !active.previewMode });
    requestAnimationFrame(() => this.focusedPane().layout());
  }

  private doUpdateStatusBar(tab?: NotepadTab): void {
    const pane = this.focusedPane();
    const model = pane.getEditor()?.getModel() ?? null;
    const metrics =
      tab && model
        ? {
            lines: model.getLineCount(),
            chars: model.getValueLength(),
            eol: (model.getEOL() === '\r\n' ? 'CRLF' : 'LF') as 'LF' | 'CRLF',
          }
        : undefined;
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
      pane.getCursor(),
      { tabSize: this.store.getSettings().tabSize },
      tab,
      undefined,
      metrics
    );
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
      if (!this.store.getState().tabs.some((t) => t.id === tab.id)) continue;
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
      onFind: () => this.focusedPane().find(),
      onReplace: () => this.focusedPane().replace(),
      onGoToLine: () => this.focusedPane().goToLine(),
      onZoomIn: () => this.adjustZoom(1),
      onZoomOut: () => this.adjustZoom(-1),
    });
    document.addEventListener('keydown', this.keyHandler);

    // ESC closes the preview pane of the focused tab.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const active = this.store.getActiveTab();
        if (active?.previewMode) {
          e.preventDefault();
          this.store.updateTab(active.id, { previewMode: false });
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      this.panes.forEach((p) => p.flushPending());
      void this.store.flushPersist();
    });

    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('#notepad-context-menu')) {
        this.hideContextMenu();
      }
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
        onMoveToOtherView: (id) => this.moveTabToOtherView(id),
        onClose: (id) => void this.requestCloseTab(id),
        onCloseOthers: (id) => this.store.closeOthers(id),
        onCloseLeft: (id) => this.store.closeTabsToLeft(id),
        onCloseRight: (id) => this.store.closeTabsToRight(id),
        onCloseAll: () => void this.closeAllTabs(),
        onReveal: (id) => this.revealTab(id),
        onCopyPath: (id) => void this.copyTabPath(id),
      });
    });

    // App-wide before-quit IPC: flush notepad state and allow quit.
    this.beforeQuitDispose = window.restbro.notepad.onBeforeQuit(
      async (requestId) => {
        this.panes.forEach((p) => p.flushPending());
        await this.store.flushPersist();
        window.restbro.notepad.sendQuitDecision(requestId, true);
      }
    );
  }

  /** Make the split divider draggable; persists the ratio on release. */
  private attachDivider(): void {
    const divider = this.elements.paneDivider;
    const host = this.elements.panesHost;
    let dragging = false;

    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const rect = host.getBoundingClientRect();
      const ratio = Math.max(
        0.2,
        Math.min(0.8, (e.clientX - rect.left) / rect.width)
      );
      this.pendingRatio = ratio;
      this.elements.pane0Root.style.flex = `0 0 ${ratio * 100}%`;
      this.elements.pane1Root.style.flex = '1 1 0';
      this.panes.forEach((p) => p.layout());
    };
    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('notepad-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (this.pendingRatio !== null) {
        this.store.setSplitRatio(this.pendingRatio);
        this.pendingRatio = null;
      }
    };

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      document.body.classList.add('notepad-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
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
    const toggle = (action: string, show: boolean): void => {
      const btn = this.elements.contextMenu.querySelector(
        `[data-action="${action}"]`
      ) as HTMLElement | null;
      if (btn) btn.style.display = show ? 'block' : 'none';
    };
    toggle('reveal', hasFile);
    toggle('copyPath', hasFile);
    // Only offer "Close to the Left/Right" when there are tabs on that side
    // within the tab's own pane.
    const tab = this.store.getState().tabs.find((t) => t.id === tabId);
    const inPane = this.store.getTabsForPane(tab?.paneId ?? 0);
    const idx = inPane.findIndex((t) => t.id === tabId);
    toggle('closeLeft', idx > 0);
    toggle('closeRight', idx >= 0 && idx < inPane.length - 1);
  }

  private hideContextMenu(): void {
    this.elements.contextMenu.classList.add('hidden');
    delete this.elements.contextMenu.dataset.tabId;
  }
}
