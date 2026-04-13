import { app, BrowserWindow } from 'electron';
import { windowManager } from './modules/window-manager';
import { storeManager } from './modules/store-manager';
import { ipcManager } from './modules/ipc-manager';
import { aiEngine } from './modules/ai-engine';
import { mockServerManager } from './modules/mock-server-manager';
import { updateManager } from './modules/update-manager';

if (process.env.NODE_ENV !== 'development') {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

class ApiCourierApp {
  private isQuitting = false;

  async initialize(): Promise<void> {
    await app.whenReady();

    // Parallelize independent I/O: store + AI sessions can load concurrently
    await Promise.all([storeManager.initialize(), aiEngine.initialize()]);

    storeManager.startAutoBackup();
    ipcManager.initialize();
    updateManager.initialize();
    this.createWindow();
    this.setupEventHandlers();
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

const apiCourierApp = new ApiCourierApp();

if (require.main === module) {
  apiCourierApp.initialize().catch(console.error);
}
