import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * UpdateManager — wraps electron-updater with safe defaults.
 *
 * - Only runs in packaged (production) builds; no-ops in dev mode.
 * - Checks for updates immediately on app start and again every 4 hours.
 * - Downloads updates completely silently in the background.
 * - Only notifies renderer when download is complete (header button).
 * - Auto-installs pending updates on quit.
 * - Detects post-update launch and notifies renderer to show a popup.
 */
class UpdateManager {
  private checkInterval: NodeJS.Timeout | null = null;
  private updateReady = false;
  private readonly CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

  initialize(): void {
    // Auto-updates only make sense in signed, packaged production builds.
    if (!app.isPackaged) {
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.registerListeners();

    // First check shortly after the window appears, then on a schedule.
    setTimeout(() => this.checkForUpdates(), 10_000);
    this.checkInterval = setInterval(
      () => this.checkForUpdates(),
      this.CHECK_INTERVAL_MS
    );
  }

  /**
   * Check if the app was just updated by comparing current version to
   * the last stored version. Sends 'update:just-updated' to the renderer
   * if a version change is detected.
   */
  notifyIfJustUpdated(): void {
    const currentVersion = app.getVersion();
    const lastVersionPath = join(app.getPath('userData'), '.last-version');

    let justUpdated = false;
    if (existsSync(lastVersionPath)) {
      try {
        const lastVersion = readFileSync(lastVersionPath, 'utf-8').trim();
        if (lastVersion && lastVersion !== currentVersion) {
          justUpdated = true;
        }
      } catch {
        // ignore read errors
      }
    }

    writeFileSync(lastVersionPath, currentVersion, 'utf-8');

    if (justUpdated) {
      // Delay slightly so the renderer is ready to receive the event
      setTimeout(() => {
        this.send('update:just-updated', { version: currentVersion });
      }, 2000);
    }
  }

  /** Returns true if an update has been downloaded and is ready to install. */
  isUpdateReady(): boolean {
    return this.updateReady;
  }

  /** Installs the pending update and restarts the app. */
  installAndRestart(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Called during graceful shutdown. If an update is downloaded,
   * install it so the next launch gets the new version.
   */
  installOnQuitIfReady(): void {
    if (this.updateReady) {
      autoUpdater.quitAndInstall(true, true);
    }
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private checkForUpdates(): void {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] Update check failed:', err?.message ?? err);
    });
  }

  private send(channel: string, payload?: unknown): void {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  private registerListeners(): void {
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      console.log(`[updater] Update available: ${info.version}`);
      // Download silently — no UI shown to user
      autoUpdater.downloadUpdate().catch((err) => {
        console.error('[updater] Download failed:', err?.message ?? err);
      });
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[updater] App is up to date.');
    });

    autoUpdater.on('download-progress', (progress) => {
      // Silent — no UI shown to user
      console.log(
        `[updater] Download progress: ${Math.round(progress.percent)}%`
      );
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      console.log(`[updater] Update downloaded: ${info.version}`);
      this.updateReady = true;
      // Notify the renderer to show the header restart button
      this.send('update:downloaded', { version: info.version });
    });

    autoUpdater.on('error', (err: Error) => {
      console.error('[updater] Error:', err?.message ?? err);
    });
  }
}

export const updateManager = new UpdateManager();
