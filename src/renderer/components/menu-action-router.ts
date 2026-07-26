import type { MenuActionMessage } from '../../shared/types';
import { TabsManager } from './tabs-manager';
import { NotepadManager } from './NotepadManager';
import { ThemeManager } from '../utils/theme-manager';
import { ThemeOnboarding } from './theme-onboarding';
import { SettingsModal } from './settings/settings-modal';

export interface MenuActionDeps {
  tabsManager: TabsManager;
  notepadManager: NotepadManager;
  themeManager: ThemeManager;
  themeOnboarding: ThemeOnboarding;
  settingsModal: SettingsModal;
  saveState: () => Promise<void>;
}

/**
 * Route native application-menu commands to the renderer's existing managers
 * and DOM events. The menu itself carries no accelerators for context-sensitive
 * actions (Save/Close/Open/New), so the in-app keyboard shortcuts still own
 * those keys; this router only handles explicit menu clicks. Returns a disposer.
 */
export function setupMenuActions(deps: MenuActionDeps): () => void {
  return window.restbro.menu.onAction((message) => {
    void handleMenuAction(message, deps);
  });
}

/** The active main view, derived from the highlighted nav tab. */
function activeView(): string {
  const active = document.querySelector<HTMLElement>('.nav-tab.active');
  return active?.dataset.tab ?? 'api';
}

function navigate(view: string): void {
  document.dispatchEvent(
    new CustomEvent('switch-to-tab', { detail: { tabName: view } })
  );
}

function clickById(id: string): void {
  document.getElementById(id)?.click();
}

async function handleMenuAction(
  message: MenuActionMessage,
  deps: MenuActionDeps
): Promise<void> {
  switch (message.action) {
    case 'new-request':
      navigate('api');
      (
        document.querySelector(
          '.request-tab[data-tab-id="new"]'
        ) as HTMLElement | null
      )?.click();
      break;
    case 'save':
      await save(false, deps);
      break;
    case 'save-as':
      await save(true, deps);
      break;
    case 'close-tab':
      if (activeView() === 'notepad') await deps.notepadManager.closeActive();
      else deps.tabsManager.closeActiveTab();
      break;
    case 'open-file':
      navigate('notepad');
      await deps.notepadManager.openFileDialog();
      break;
    case 'import':
      clickById('btn-import');
      break;
    case 'export':
      navigate('api');
      clickById('btn-export-collections');
      break;
    case 'backups':
      clickById('backup-button');
      break;
    case 'settings':
      deps.settingsModal.open();
      break;
    case 'history':
      document.dispatchEvent(new CustomEvent('open-history'));
      break;
    case 'toggle-layout':
      clickById('layout-toggle-btn');
      break;
    case 'choose-theme':
      deps.themeOnboarding.openPicker();
      break;
    case 'set-theme':
      applyTheme(message.theme, deps);
      break;
    case 'navigate':
      if (message.view) navigate(message.view);
      break;
  }
}

async function save(saveAs: boolean, deps: MenuActionDeps): Promise<void> {
  if (activeView() === 'notepad') {
    await deps.notepadManager.saveActive(saveAs);
    return;
  }
  const tab = deps.tabsManager.getActiveTab();
  if (!tab) return;
  document.dispatchEvent(
    new CustomEvent('request-save-tab', {
      detail: {
        tabId: tab.id,
        request: tab.request,
        collectionId: tab.collectionId,
        forceSaveAs: saveAs,
      },
    })
  );
}

function applyTheme(name: string | undefined, deps: MenuActionDeps): void {
  if (!name) return;
  const theme = deps.themeManager
    .getAvailableThemes()
    .find((t) => t.name === name);
  if (!theme) return;
  deps.themeManager.setTheme(theme);
  void deps.saveState();
}
