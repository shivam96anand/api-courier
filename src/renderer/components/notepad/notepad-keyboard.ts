/**
 * Notepad keyboard shortcuts. The handler short-circuits when the notepad tab
 * is not active, so shortcuts in other tabs are unaffected.
 *
 * Shortcuts (Cmd on macOS, Ctrl elsewhere):
 *   Cmd/Ctrl + S          Save
 *   Cmd/Ctrl + Shift + S  Save As
 *   Cmd/Ctrl + O          Open file
 *   Cmd/Ctrl + N or T     New tab
 *   Cmd/Ctrl + W          Close active tab
 *   Cmd/Ctrl + F          Find
 *   Cmd/Ctrl + Alt/Opt + F (mac) / Cmd/Ctrl + H  Find & Replace
 *   Cmd/Ctrl + L          Go to line
 *   Cmd/Ctrl + P          Quick tab switcher (planned, no-op if unhandled)
 *   Ctrl + Tab            Next tab
 *   Ctrl + Shift + Tab    Previous tab
 */
import { isNotepadActive } from './notepad-utils';

export interface KeyboardHandlerCallbacks {
  onSave: (saveAs: boolean) => void;
  onOpenFile: () => void;
  onNewTab: () => void;
  onCloseActiveTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onFind: () => void;
  onReplace: () => void;
  onGoToLine: () => void;
}

export type KeyboardHandler = (event: KeyboardEvent) => void;

export function createKeyboardHandler(
  isMac: boolean,
  callbacks: KeyboardHandlerCallbacks
): KeyboardHandler {
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
    } else if (key === 'f' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      callbacks.onFind();
    } else if (
      key === 'h' ||
      (key === 'f' && (event.altKey || event.shiftKey))
    ) {
      event.preventDefault();
      callbacks.onReplace();
    } else if (key === 'l' || key === 'g') {
      event.preventDefault();
      callbacks.onGoToLine();
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
  onCopyPath: (tabId: string) => void;
}

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
  } else if (action === 'copyPath' && tabId) {
    callbacks.onCopyPath(tabId);
  }
}
