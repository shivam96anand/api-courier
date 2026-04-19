import { app, BrowserWindow } from 'electron';
import { windowManager } from './modules/window-manager';
import { storeManager } from './modules/store-manager';
import { ipcManager } from './modules/ipc-manager';
import { aiEngine } from './modules/ai-engine';
import { mockServerManager } from './modules/mock-server-manager';
import { updateManager } from './modules/update-manager';
import { notepadIpc } from './modules/notepad-ipc';
import * as path from 'path';

if (process.env.NODE_ENV !== 'development') {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

/**
 * Extract a file path from process.argv. The launcher's own executable path is
 * ignored; we only forward arguments that look like real file paths and are not
 * Electron/Chromium switches.
 */
function pickFilesFromArgv(argv: string[]): string[] {
  return argv.slice(1).filter((a) => {
    if (!a || typeof a !== 'string') return false;
    if (a.startsWith('-')) return false; // skip --switches
    return path.isAbsolute(a);
  });
}

class RestbroApp {
  private isQuitting = false;
  private quitGuardActive = true;

  async initialize(): Promise<void> {
    // Enforce single-instance so file-association double-clicks reuse the
    // existing window instead of spawning a second app process.
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      app.quit();
      return;
    }

    // macOS: queue file paths the OS hands us via 'open-file' (fires before ready).
    app.on('open-file', (event, filePath) => {
      event.preventDefault();
      notepadIpc.queueOpenFile(filePath);
    });

    // Windows/Linux: another launch was attempted (e.g. user double-clicked a
    // .md file). Receive its argv and surface the file in our existing window.
    app.on('second-instance', (_event, argv) => {
      for (const file of pickFilesFromArgv(argv)) {
        notepadIpc.queueOpenFile(file);
      }
      const win = windowManager.getMainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });

    await app.whenReady();

    // Parallelize independent I/O: store + AI sessions can load concurrently
    await Promise.all([storeManager.initialize(), aiEngine.initialize()]);

    storeManager.startAutoBackup();
    ipcManager.initialize();
    updateManager.initialize();
    this.createWindow();
    updateManager.notifyIfJustUpdated();
    this.setupEventHandlers();

    // Initial argv on Windows/Linux (macOS uses 'open-file' instead).
    for (const file of pickFilesFromArgv(process.argv)) {
      notepadIpc.queueOpenFile(file);
    }
  }

  private createWindow(): void {
    windowManager.createMainWindow();
  }

  private setupEventHandlers(): void {
    app.on('window-all-closed', async () => {
      if (process.platform !== 'darwin') {
        await this.quit();
      } else {
        // On macOS, flush when all windows close (app stays running)
        await storeManager.flush();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    app.on('before-quit', async (event) => {
      if (this.isQuitting) return;
      // Ask the renderer if it has unsaved notepad work first.
      if (this.quitGuardActive) {
        event.preventDefault();
        this.quitGuardActive = false;
        const canQuit = await notepadIpc.requestQuitDecision();
        if (!canQuit) {
          this.quitGuardActive = true;
          return;
        }
        this.isQuitting = true;
        try {
          await this.gracefulShutdown();
        } catch (error) {
          console.error('Error during graceful shutdown:', error);
        }
        app.quit();
        return;
      }
      if (!this.isQuitting) {
        event.preventDefault();
        this.isQuitting = true;
        try {
          await this.gracefulShutdown();
        } catch (error) {
          console.error('Error during graceful shutdown:', error);
        }
        app.quit();
      }
    });
  }

  private async gracefulShutdown(): Promise<void> {
    console.log('Graceful shutdown: flushing database...');
    await mockServerManager.stopAllServers();
    await storeManager.flush();
    storeManager.stopAutoBackup();
    await aiEngine.flush();
    // If an update was downloaded, install it on quit so next launch is updated
    if (updateManager.isUpdateReady()) {
      updateManager.installOnQuitIfReady();
    }
    updateManager.destroy();
    console.log('Database flushed successfully');
  }

  private async quit(): Promise<void> {
    this.isQuitting = true;
    await storeManager.flush();
    storeManager.stopAutoBackup();
    await aiEngine.flush();
    updateManager.destroy();
    app.quit();
  }
}

const restbroApp = new RestbroApp();

if (require.main === module) {
  restbroApp.initialize().catch(console.error);
}
