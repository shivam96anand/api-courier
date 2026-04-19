/**
 * Notepad layout builder. Constructs the full DOM for the tab and returns
 * references to interactive elements. Wires button click handlers; everything
 * else is wired by `NotepadManager`.
 */
import { PICKABLE_LANGUAGES } from './notepad-language';

export interface NotepadElements {
  root: HTMLElement;
  tabStrip: HTMLElement;
  editorArea: HTMLElement;
  editorHost: HTMLElement;
  previewPane: HTMLElement;
  previewBody: HTMLElement;
  dropOverlay: HTMLElement;
  statusFile: HTMLElement;
  statusState: HTMLElement;
  statusCursor: HTMLElement;
  statusLines: HTMLElement;
  statusChars: HTMLElement;
  statusLanguage: HTMLElement;
  statusSelection: HTMLElement;
  statusEol: HTMLElement;
  statusIndent: HTMLElement;
  contextMenu: HTMLElement;
  dirtyModal: HTMLElement;
  dirtyModalTitle: HTMLElement;
  dirtyModalBody: HTMLElement;
  settingsHost: HTMLElement;
  previewToggleBtn: HTMLButtonElement;
  settingsBtn: HTMLButtonElement;
  languagePicker: HTMLSelectElement;
  previewHeaderText: HTMLElement;
  resizeSplitter: HTMLElement;
}

export interface NotepadLayoutCallbacks {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onAddTab: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onTogglePreview: () => void;
  onSettingsClick: (anchor: HTMLElement) => void;
  onLanguageChange: (language: string) => void;
  onFind: () => void;
  onReplace: () => void;
}

export function buildNotepadLayout(
  container: HTMLElement,
  callbacks: NotepadLayoutCallbacks
): NotepadElements {
  const languageOptions = PICKABLE_LANGUAGES.map(
    (lang) => `<option value="${lang.id}">${lang.label}</option>`
  ).join('');

  container.innerHTML = `
    <div class="notepad-layout">
      <div class="notepad-topbar">
        <div class="notepad-tabs-area">
          <div class="notepad-tabs" id="notepad-tab-strip"></div>
          <button class="notepad-tab add" id="np-add-tab" title="New Tab">+</button>
        </div>
        <div class="notepad-actions">
          <button class="np-btn icon" id="np-zoom-out" title="Zoom Out">A-</button>
          <button class="np-btn icon" id="np-zoom-in" title="Zoom In">A+</button>
          <button class="np-btn ghost" id="np-find" title="Find (Ctrl/Cmd+F)">Find</button>
          <button class="np-btn ghost" id="np-replace" title="Replace (Ctrl/Cmd+H)">Replace</button>
          <button class="np-btn ghost" id="np-toggle-preview" title="Toggle Preview">Preview</button>
          <button class="np-btn ghost" id="np-open-file" title="Open File (Ctrl/Cmd+O)">Open</button>
          <button class="np-btn primary" id="np-save" title="Save (Ctrl/Cmd+S)">Save</button>
          <button class="np-btn settings" id="np-settings" title="Notepad Settings" aria-haspopup="menu" aria-label="Notepad Settings">⚙</button>
        </div>
      </div>
      <div class="notepad-editor-area" id="notepad-editor-area">
        <div class="notepad-editor" id="notepad-editor"></div>
        <div class="notepad-resize-splitter hidden" id="notepad-resize-splitter" title="Drag to resize"></div>
        <div class="notepad-preview hidden" id="notepad-preview" aria-label="Preview">
          <div class="notepad-preview-header">
            <span id="notepad-preview-header-text">Markdown Preview</span>
          </div>
          <div class="notepad-preview-body" id="notepad-preview-body"></div>
        </div>
        <div class="notepad-drop-overlay hidden" id="notepad-drop-overlay">
          <div class="notepad-drop-overlay-inner">Drop files to open in Notepad</div>
        </div>
      </div>
      <div class="notepad-status-bar">
        <div class="status-left">
          <span class="status-file" id="np-status-file">No file</span>
          <span class="status-state" id="np-status-state">Unsaved</span>
        </div>
        <div class="status-right">
          <select class="status-language-picker" id="np-status-language-picker"
            title="Change syntax language">
            ${languageOptions}
          </select>
          <span class="status-metric" id="np-status-language">Plain Text</span>
          <span class="status-metric" id="np-status-cursor">Ln 1, Col 1</span>
          <span class="status-metric status-metric--muted" id="np-status-selection"></span>
          <span class="status-metric" id="np-status-lines">0 lines</span>
          <span class="status-metric" id="np-status-chars">0 chars</span>
          <span class="status-metric status-metric--muted" id="np-status-eol">LF</span>
          <span class="status-metric status-metric--muted" id="np-status-indent">Spaces: 2</span>
        </div>
      </div>
      <div class="notepad-context-menu hidden" id="notepad-context-menu" role="menu">
        <button data-action="new" role="menuitem">New Tab</button>
        <button data-action="rename" role="menuitem">Rename</button>
        <button data-action="save" role="menuitem">Save</button>
        <button data-action="saveAs" role="menuitem">Save As</button>
        <button data-action="close" role="menuitem">Close</button>
        <button data-action="closeOthers" role="menuitem">Close Others</button>
        <button data-action="closeAll" role="menuitem">Close All</button>
        <button data-action="reveal" role="menuitem">Reveal in Finder/Explorer</button>
        <button data-action="copyPath" role="menuitem">Copy Full Path</button>
      </div>
      <div class="notepad-modal hidden" id="notepad-dirty-modal" role="dialog" aria-modal="true">
        <div class="notepad-modal-content">
          <div class="modal-title" id="notepad-dirty-modal-title">Unsaved Changes</div>
          <div class="modal-body" id="notepad-dirty-modal-body">
            This tab has unsaved changes. Save before closing?
          </div>
          <div class="modal-actions">
            <button class="np-btn primary" data-action="save">Save</button>
            <button class="np-btn ghost" data-action="discard">Don't Save</button>
            <button class="np-btn" data-action="cancel">Cancel</button>
          </div>
        </div>
      </div>
      <div class="notepad-settings-host"></div>
    </div>
  `;

  const elements: NotepadElements = {
    root: container.querySelector('.notepad-layout') as HTMLElement,
    tabStrip: container.querySelector('#notepad-tab-strip') as HTMLElement,
    editorArea: container.querySelector('#notepad-editor-area') as HTMLElement,
    editorHost: container.querySelector('#notepad-editor') as HTMLElement,
    previewPane: container.querySelector('#notepad-preview') as HTMLElement,
    previewBody: container.querySelector(
      '#notepad-preview-body'
    ) as HTMLElement,
    dropOverlay: container.querySelector(
      '#notepad-drop-overlay'
    ) as HTMLElement,
    statusFile: container.querySelector('#np-status-file') as HTMLElement,
    statusState: container.querySelector('#np-status-state') as HTMLElement,
    statusCursor: container.querySelector('#np-status-cursor') as HTMLElement,
    statusLines: container.querySelector('#np-status-lines') as HTMLElement,
    statusChars: container.querySelector('#np-status-chars') as HTMLElement,
    statusLanguage: container.querySelector(
      '#np-status-language'
    ) as HTMLElement,
    statusSelection: container.querySelector(
      '#np-status-selection'
    ) as HTMLElement,
    statusEol: container.querySelector('#np-status-eol') as HTMLElement,
    statusIndent: container.querySelector('#np-status-indent') as HTMLElement,
    contextMenu: container.querySelector(
      '#notepad-context-menu'
    ) as HTMLElement,
    dirtyModal: container.querySelector('#notepad-dirty-modal') as HTMLElement,
    dirtyModalTitle: container.querySelector(
      '#notepad-dirty-modal-title'
    ) as HTMLElement,
    dirtyModalBody: container.querySelector(
      '#notepad-dirty-modal-body'
    ) as HTMLElement,
    settingsHost: container.querySelector(
      '.notepad-settings-host'
    ) as HTMLElement,
    previewToggleBtn: container.querySelector(
      '#np-toggle-preview'
    ) as HTMLButtonElement,
    settingsBtn: container.querySelector('#np-settings') as HTMLButtonElement,
    languagePicker: container.querySelector(
      '#np-status-language-picker'
    ) as HTMLSelectElement,
    previewHeaderText: container.querySelector(
      '#notepad-preview-header-text'
    ) as HTMLElement,
    resizeSplitter: container.querySelector(
      '#notepad-resize-splitter'
    ) as HTMLElement,
  };

  // Click on empty space in tab area opens a new tab.
  const tabsArea = container.querySelector('.notepad-tabs-area') as HTMLElement;
  tabsArea?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target === tabsArea || target.id === 'notepad-tab-strip') {
      callbacks.onAddTab();
    }
  });

  // Wire toolbar buttons.
  container
    .querySelector('#np-zoom-out')
    ?.addEventListener('click', callbacks.onZoomOut);
  container
    .querySelector('#np-zoom-in')
    ?.addEventListener('click', callbacks.onZoomIn);
  container
    .querySelector('#np-add-tab')
    ?.addEventListener('click', callbacks.onAddTab);
  container
    .querySelector('#np-open-file')
    ?.addEventListener('click', callbacks.onOpenFile);
  container
    .querySelector('#np-save')
    ?.addEventListener('click', callbacks.onSave);
  container
    .querySelector('#np-find')
    ?.addEventListener('click', callbacks.onFind);
  container
    .querySelector('#np-replace')
    ?.addEventListener('click', callbacks.onReplace);
  elements.previewToggleBtn.addEventListener(
    'click',
    callbacks.onTogglePreview
  );
  elements.settingsBtn.addEventListener('click', () =>
    callbacks.onSettingsClick(elements.settingsBtn)
  );
  elements.languagePicker.addEventListener('change', () =>
    callbacks.onLanguageChange(elements.languagePicker.value)
  );

  return elements;
}
