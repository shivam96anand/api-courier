import {
  app,
  Menu,
  MenuItemConstructorOptions,
  BrowserWindow,
  dialog,
  shell,
} from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { MenuActionMessage } from '../../shared/types';
import { updateManager } from './update-manager';

const SITE_URL = 'https://restbro.com';
const REPO_URL = 'https://github.com/shivam96anand/restbro-app';
const ISSUES_URL =
  'https://github.com/shivam96anand/restbro-app/issues/new/choose';

/** Theme names mirror ThemeManager in the renderer (src/renderer/utils/theme-manager.ts). */
const THEME_NAMES = ['teal', 'sky', 'emerald', 'amber', 'coral', 'magenta'];

const isMac = process.platform === 'darwin';

/**
 * Builds and installs the native application menu, translating menu clicks into
 * `menu:action` pushes the renderer routes to existing managers/DOM events.
 *
 * Accelerator policy: File items (New/Save/Save As/Open/Close) carry NO
 * accelerators on purpose — the renderer owns Cmd+N/S/O/W contextually (request
 * tabs vs Notepad), and registering them here would globally hijack those keys.
 * Reload, page Zoom and DevTools are intentionally omitted (Reload is blocked
 * by design, Cmd +/- is remapped in-app, DevTools is a product decision).
 */
class MenuManager {
  /** Build and install the application menu. Call once after the app is ready. */
  build(): void {
    app.setAboutPanelOptions({
      applicationName: 'Restbro',
      applicationVersion: app.getVersion(),
      copyright: '© Restbro',
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(this.template()));
  }

  /** Push a menu command to the focused (or main) renderer window. */
  private send(
    action: MenuActionMessage['action'],
    extra: Partial<MenuActionMessage> = {}
  ): void {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      const message: MenuActionMessage = { action, ...extra };
      win.webContents.send(IPC_CHANNELS.MENU_ACTION, message);
    }
  }

  private async showAbout(): Promise<void> {
    await dialog.showMessageBox({
      type: 'info',
      title: 'About Restbro',
      message: 'Restbro',
      detail: `Version ${app.getVersion()}\nA privacy-first API testing tool.`,
      buttons: ['OK'],
    });
  }

  private themeSubmenu(): MenuItemConstructorOptions[] {
    const items: MenuItemConstructorOptions[] = THEME_NAMES.map((name) => ({
      label: name.charAt(0).toUpperCase() + name.slice(1),
      click: () => this.send('set-theme', { theme: name }),
    }));
    items.push(
      { type: 'separator' },
      { label: 'Choose Theme…', click: () => this.send('choose-theme') }
    );
    return items;
  }

  private appMenu(): MenuItemConstructorOptions[] {
    if (!isMac) return [];
    return [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          {
            label: 'Check for Updates…',
            click: () => void updateManager.checkForUpdatesManual(),
          },
          { type: 'separator' },
          {
            label: 'Settings…',
            accelerator: 'Cmd+,',
            click: () => this.send('settings'),
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
    ];
  }

  private fileMenu(): MenuItemConstructorOptions {
    const tail: MenuItemConstructorOptions[] = isMac
      ? []
      : [
          { type: 'separator' },
          {
            label: 'Settings…',
            accelerator: 'Ctrl+,',
            click: () => this.send('settings'),
          },
          { role: 'quit', label: 'Exit' },
        ];
    return {
      label: 'File',
      submenu: [
        { label: 'New Request', click: () => this.send('new-request') },
        { type: 'separator' },
        { label: 'Import…', click: () => this.send('import') },
        { label: 'Open File…', click: () => this.send('open-file') },
        { type: 'separator' },
        { label: 'Save', click: () => this.send('save') },
        { label: 'Save As…', click: () => this.send('save-as') },
        { label: 'Export Collections…', click: () => this.send('export') },
        { type: 'separator' },
        { label: 'Backups…', click: () => this.send('backups') },
        { label: 'Close Tab', click: () => this.send('close-tab') },
        ...tail,
      ],
    };
  }

  private editMenu(): MenuItemConstructorOptions {
    const trailing: MenuItemConstructorOptions[] = isMac
      ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
        ]
      : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }];
    return {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...trailing,
      ],
    };
  }

  private viewMenu(): MenuItemConstructorOptions {
    return {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Request/Response Layout',
          click: () => this.send('toggle-layout'),
        },
        { label: 'Theme', submenu: this.themeSubmenu() },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    };
  }

  private goMenu(): MenuItemConstructorOptions {
    const view = (label: string, v: string): MenuItemConstructorOptions => ({
      label,
      click: () => this.send('navigate', { view: v }),
    });
    return {
      label: 'Go',
      submenu: [
        view('API Client', 'api'),
        view('JSON Compare', 'json-compare'),
        view('Notepad', 'notepad'),
        view('Load Testing', 'load-testing'),
        view('Mock Server', 'mock-server'),
        view('Ask AI', 'ask-ai'),
        view('cURL', 'curl-tool'),
        { type: 'separator' },
        { label: 'History', click: () => this.send('history') },
      ],
    };
  }

  private windowMenu(): MenuItemConstructorOptions {
    // Deliberately omit "Close (Cmd+W)" — Cmd+W closes the in-app tab.
    const trailing: MenuItemConstructorOptions[] = isMac
      ? [{ type: 'separator' }, { role: 'front' }]
      : [];
    return {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...trailing],
    };
  }

  private helpMenu(): MenuItemConstructorOptions {
    const trailing: MenuItemConstructorOptions[] = isMac
      ? []
      : [
          { type: 'separator' },
          {
            label: 'Check for Updates…',
            click: () => void updateManager.checkForUpdatesManual(),
          },
          { label: 'About Restbro', click: () => void this.showAbout() },
        ];
    return {
      role: 'help',
      submenu: [
        {
          label: 'Restbro Website',
          click: () => void shell.openExternal(SITE_URL),
        },
        {
          label: 'Documentation',
          click: () => void shell.openExternal(REPO_URL),
        },
        {
          label: 'Report an Issue',
          click: () => void shell.openExternal(ISSUES_URL),
        },
        ...trailing,
      ],
    };
  }

  private template(): MenuItemConstructorOptions[] {
    return [
      ...this.appMenu(),
      this.fileMenu(),
      this.editMenu(),
      this.viewMenu(),
      this.goMenu(),
      this.windowMenu(),
      this.helpMenu(),
    ];
  }
}

export const menuManager = new MenuManager();
