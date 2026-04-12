/**
 * UpdateNotificationManager
 *
 * Listens for auto-update events from the main process and shows
 * a non-intrusive banner at the bottom of the app.
 *
 * States: hidden → "downloading vX.Y.Z" → "ready to install" → (user clicks) → restart
 */
export class UpdateNotificationManager {
  private banner: HTMLElement | null = null;
  private cleanups: (() => void)[] = [];

  initialize(): void {
    const api = window.apiCourier?.update;
    if (!api) return;

    this.cleanups.push(
      api.onAvailable(({ version }) => {
        this.showBanner('downloading', version);
      })
    );

    this.cleanups.push(
      api.onDownloadProgress(({ percent }) => {
        this.updateProgress(percent);
      })
    );

    this.cleanups.push(
      api.onDownloaded(({ version }) => {
        this.showBanner('ready', version);
      })
    );

    this.cleanups.push(
      api.onError(() => {
        this.hideBanner();
      })
    );
  }

  destroy(): void {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
    this.hideBanner();
  }

  private showBanner(state: 'downloading' | 'ready', version: string): void {
    this.ensureBanner();
    if (!this.banner) return;

    this.banner.className = 'update-banner';
    this.banner.classList.add(`update-banner--${state}`);

    if (state === 'downloading') {
      this.banner.innerHTML = `
        <span class="update-banner__text">Downloading update v${this.escapeHtml(version)}…</span>
        <span class="update-banner__progress">0%</span>
      `;
    } else {
      this.banner.innerHTML = `
        <span class="update-banner__text">RestBro v${this.escapeHtml(version)} is ready</span>
        <button class="update-banner__action" id="update-install-btn">Restart to update</button>
        <button class="update-banner__dismiss" id="update-dismiss-btn" title="Dismiss">✕</button>
      `;
      document.getElementById('update-install-btn')?.addEventListener('click', () => {
        window.apiCourier.update.install();
      });
      document.getElementById('update-dismiss-btn')?.addEventListener('click', () => {
        this.hideBanner();
      });
    }

    this.banner.style.display = 'flex';
  }

  private updateProgress(percent: number): void {
    if (!this.banner) return;
    const el = this.banner.querySelector('.update-banner__progress');
    if (el) el.textContent = `${Math.round(percent)}%`;
  }

  private hideBanner(): void {
    if (this.banner) this.banner.style.display = 'none';
  }

  private ensureBanner(): void {
    if (this.banner) return;

    this.banner = document.createElement('div');
    this.banner.className = 'update-banner';
    this.banner.style.display = 'none';
    document.body.appendChild(this.banner);
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
