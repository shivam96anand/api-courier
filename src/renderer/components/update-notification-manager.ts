/**
 * UpdateNotificationManager
 *
 * - When an update is downloaded, shows a header button "Updates installed, please restart"
 *   styled like the Time Machine / Theme buttons.
 * - On post-update launch, shows a centered popup: "RestBro is now up to date" + version.
 */
export class UpdateNotificationManager {
  private cleanups: (() => void)[] = [];

  initialize(): void {
    const api = window.restbro?.update;
    if (!api) return;

    this.cleanups.push(
      api.onDownloaded(({ version }) => {
        this.showHeaderButton(version);
      })
    );

    this.cleanups.push(
      api.onJustUpdated(({ version }) => {
        this.showUpdatedPopup(version);
      })
    );
  }

  destroy(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }

  private showHeaderButton(version: string): void {
    // Don't add duplicate
    if (document.getElementById('update-restart-btn')) return;

    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    const btn = document.createElement('button');
    btn.id = 'update-restart-btn';
    btn.className = 'update-restart-button';
    btn.title = `RestBro v${this.escapeHtml(version)} is ready to install`;
    btn.textContent = 'Updates installed, please restart';
    btn.addEventListener('click', () => {
      window.restbro.update.install();
    });

    // Insert before the first child (left of Time Machine)
    headerRight.insertBefore(btn, headerRight.firstChild);
  }

  private showUpdatedPopup(version: string): void {
    const overlay = document.createElement('div');
    overlay.className = 'update-popup-overlay';

    const popup = document.createElement('div');
    popup.className = 'update-popup';
    popup.innerHTML = `
      <div class="update-popup__title">RestBro is now up to date</div>
      <div class="update-popup__version">v${this.escapeHtml(version)}</div>
      <button class="update-popup__ok" id="update-popup-ok">Okay</button>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Trigger reflow then add visible class for animation
    requestAnimationFrame(() => {
      overlay.classList.add('update-popup-overlay--visible');
    });

    const dismiss = () => {
      overlay.classList.remove('update-popup-overlay--visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), {
        once: true,
      });
    };

    popup.querySelector('#update-popup-ok')?.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
