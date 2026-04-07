import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app, BrowserWindow } from 'electron';

/**
 * UpdateManager — wraps electron-updater with safe defaults.
 *
 * - Only runs in packaged (production) builds; no-ops in dev mode.
 * - Checks for updates immediately on app start and again every 4 hours.
 * - Downloads updates silently; prompts the user before installing.
 * - Forwards progress/status to the renderer via the focused window so the
 *   UI can surface a non-intrusive update badge.
 */
class UpdateManager {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

  initialize(): void {
    // Auto-updates only make sense in signed, packaged production builds.
    if (!app.isPackaged) {
      return;
    }

    // Disable auto-downloading; we want to show a prompt first on macOS.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.registerListeners();

    // First check shortly after the window appears, then on a schedule.
    setTimeout(() => this.checkForUpdates(), 10_000);
    this.checkInterval = setInterval(() => this.checkForUpdates(), this.CHECK_INTERVAL_MS);
  }

  private checkForUpdates(): void {
    autoUpdater.checkForUpdates().catch(err => {
      // Update checks failing (e.g. no network) is non-fatal — log silently.
      console.error('[updater] Update check failed:', err?.message ?? err);
    });
  }

  private send(channel: string, payload?: unknown): void {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  private registerListeners(): void {
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      console.log(`[updater] Update available: ${info.version}`);
      this.send('update:available', { version: info.version });

      // Ask the user before downloading via the renderer (or auto-download here).
      // For now we trigger download immediately and let the renderer show progress.
      autoUpdater.downloadUpdate().catch(err => {
        console.error('[updater] Download failed:', err?.message ?? err);
      });
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[updater] App is up to date.');
    });

    autoUpdater.on('download-progress', progress => {
      this.send('update:download-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      console.log(`[updater] Update downloaded: ${info.version}`);
      // Notify the renderer so it can show an "Install & restart" prompt.
      this.send('update:downloaded', { version: info.version });
    });

    autoUpdater.on('error', (err: Error) => {
      console.error('[updater] Error:', err?.message ?? err);
      this.send('update:error', { message: err?.message ?? String(err) });
    });
  }

  /** Called by the renderer (via IPC) when the user accepts the update. */
  installAndRestart(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const updateManager = new UpdateManager();
