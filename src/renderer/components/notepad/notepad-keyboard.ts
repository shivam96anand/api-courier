/**
 * Notepad keyboard shortcuts handler
 */
import { isNotepadActive } from './notepad-utils';

export interface KeyboardHandlerCallbacks {
  onSave: (saveAs: boolean) => void;
  onOpenFile: () => void;
  onNewTab: () => void;
  onCloseActiveTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
}

/**
 * Create a keyboard event handler for notepad shortcuts
 */
export function createKeyboardHandler(
  isMac: boolean,
  callbacks: KeyboardHandlerCallbacks
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (!isNotepadActive()) return;
    const key = event.key.toLowerCase();
    if (key === 'tab' && event.ctrlKey) {
      event.preventDefault();
      if (event.shiftKey) {
        callbacks.onPrevTab();
      } else {
        callbacks.onNextTab();
      }
      return;
    }

    const cmd = isMac ? event.metaKey : event.ctrlKey;
    if (!cmd) return;

    if (key === 's') {
      event.preventDefault();
      callbacks.onSave(event.shiftKey);
    } else if (key === 'o') {
      event.preventDefault();
      callbacks.onOpenFile();
    } else if (key === 'n' || key === 't') {
      event.preventDefault();
      callbacks.onNewTab();
    } else if (key === 'w') {
      event.preventDefault();
      callbacks.onCloseActiveTab();
    }
  };
}

export interface ContextMenuCallbacks {
  onNew: () => void;
  onRename: (tabId: string) => void;
  onSave: (tabId: string) => void;
  onSaveAs: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseAll: () => void;
  onReveal: (tabId: string) => void;
}

/**
 * Handle context menu action
 */
export function handleContextMenuAction(
  action: string,
  tabId: string | undefined,
  callbacks: ContextMenuCallbacks
): void {
  if (action === 'new') {
    callbacks.onNew();
  } else if (action === 'rename' && tabId) {
    callbacks.onRename(tabId);
  } else if (action === 'save' && tabId) {
    callbacks.onSave(tabId);
  } else if (action === 'saveAs' && tabId) {
    callbacks.onSaveAs(tabId);
  } else if (action === 'close' && tabId) {
    callbacks.onClose(tabId);
  } else if (action === 'closeOthers' && tabId) {
    callbacks.onCloseOthers(tabId);
  } else if (action === 'closeAll') {
    callbacks.onCloseAll();
  } else if (action === 'reveal' && tabId) {
    callbacks.onReveal(tabId);
  }
}
