import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { WindowManager } from './windows/window-manager';
import { PersistenceManager } from './persistence/persistence-manager';
import { IPCManager } from './ipc/ipc-manager';
import { NetworkManager } from './networking/network-manager';

/**
 * Main entry point for the Electron application
 */
class APIController {
  private windowManager!: WindowManager;
  private persistenceManager!: PersistenceManager;
  private ipcManager!: IPCManager;
  private networkManager!: NetworkManager;
  private isDev: boolean;

  constructor() {
    this.isDev = process.argv.includes('--dev');
    this.init();
  }

  private async init(): Promise<void> {
    // Initialize core managers
    this.persistenceManager = new PersistenceManager();
    this.networkManager = new NetworkManager();
    this.windowManager = new WindowManager(this.isDev);
    
    // Initialize IPC with dependencies
    this.ipcManager = new IPCManager(this.persistenceManager, this.networkManager);

    // Wait for Electron to be ready
    await app.whenReady();
    
    // Initialize persistence
    await this.persistenceManager.initialize();
    
    // Setup IPC handlers
    this.ipcManager.setupHandlers();
    
    // Create main window
    this.windowManager.createMainWindow();

    this.setupAppEventHandlers();
  }

  private setupAppEventHandlers(): void {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.windowManager.createMainWindow();
      }
    });

    app.on('before-quit', async () => {
      await this.persistenceManager.flush();
    });
  }
}

// Initialize the application
new APIController();
