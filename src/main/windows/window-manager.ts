import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

/**
 * Manages application windows
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private isDev: boolean;

  constructor(isDev: boolean = false) {
    this.isDev = isDev;
  }

  /**
   * Creates the main application window
   */
  public createMainWindow(): BrowserWindow {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    this.mainWindow = new BrowserWindow({
      width: Math.min(1400, width - 100),
      height: Math.min(900, height - 100),
      minWidth: 1000,
      minHeight: 700,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, '../../preload/preload.js'),
      },
      titleBarStyle: 'hiddenInset',
      show: false,
      backgroundColor: '#1a1a1a',
    });

    // Load the renderer HTML
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    this.mainWindow.loadFile(htmlPath);

    // Show window when ready to prevent visual flash
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      if (this.isDev) {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  /**
   * Gets the main window instance
   */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Focuses the main window
   */
  public focusMainWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.focus();
    }
  }
}
