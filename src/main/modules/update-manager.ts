import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app, BrowserWindow, dialog } from 'electron';
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
  private readonly CHECK_INTERVAL_MS = 1 * 60 * 60 * 1000; // 1 hour

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
   * Manual "Check for Updates…" triggered from the application menu. Unlike the
   * silent background checks, this always reports a result to the user. In
   * unpackaged (dev) builds it explains updates are unavailable rather than
   * throwing from electron-updater.
   */
  async checkForUpdatesManual(): Promise<void> {
    if (!app.isPackaged) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Check for Updates',
        message: 'Updates are only available in the installed app.',
        buttons: ['OK'],
      });
      return;
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      const latest = result?.updateInfo?.version;
      const current = app.getVersion();
      if (latest && latest !== current) {
        // The 'update-available' listener downloads it silently in the
        // background; the header restart button appears when it's ready.
        await dialog.showMessageBox({
          type: 'info',
          title: 'Update Available',
          message: `A new version (${latest}) is available.`,
          detail:
            'It is downloading in the background. You will be prompted to restart when it is ready.',
          buttons: ['OK'],
        });
      } else {
        await dialog.showMessageBox({
          type: 'info',
          title: 'You are up to date',
          message: `Restbro ${current} is the latest version.`,
          buttons: ['OK'],
        });
      }
    } catch (err) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates.',
        detail: err instanceof Error ? err.message : String(err),
        buttons: ['OK'],
      });
    }
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
