import { ThemeManager } from '../utils/theme-manager';

export class ThemeOnboarding {
  private overlay: HTMLDivElement | null = null;
  private themeManager: ThemeManager;

  constructor(themeManager: ThemeManager) {
    this.themeManager = themeManager;
  }

  async maybeShow(): Promise<void> {
    const state = await window.apiCourier.store.get();
    if (state.hasCompletedThemeOnboarding) {
      return;
    }
    this.show();
  }

  openPicker(): void {
    this.show();
  }

  private show(): void {
    if (this.overlay) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'theme-onboarding-overlay';

    const modal = document.createElement('div');
    modal.className = 'theme-onboarding-modal';

    const title = document.createElement('div');
    title.className = 'theme-onboarding-title';
    title.textContent = 'Choose your theme';

    const subtitle = document.createElement('div');
    subtitle.className = 'theme-onboarding-subtitle';
    subtitle.textContent = 'Hover to preview, click to set';

    const swatches = document.createElement('div');
    swatches.className = 'theme-onboarding-swatches';

    this.themeManager.getAvailableThemes().forEach((theme) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'theme-onboarding-swatch';
      swatch.style.setProperty('--swatch-color', theme.primaryColor);
      swatch.setAttribute('title', theme.name);

      swatch.addEventListener('mouseenter', () => {
        this.themeManager.previewTheme(theme);
      });

      swatch.addEventListener('mouseleave', () => {
        this.themeManager.restoreTheme();
      });

      swatch.addEventListener('click', async () => {
        this.themeManager.setTheme(theme);
        await window.apiCourier.store.set({
          theme,
          hasCompletedThemeOnboarding: true,
        });
        this.close();
      });

      swatches.appendChild(swatch);
    });

    const actions = document.createElement('div');
    actions.className = 'theme-onboarding-actions';

    const keepButton = document.createElement('button');
    keepButton.type = 'button';
    keepButton.className = 'theme-onboarding-keep';
    keepButton.textContent = 'Keep current theme';
    keepButton.addEventListener('click', async () => {
      await window.apiCourier.store.set({ hasCompletedThemeOnboarding: true });
      this.close();
    });

    actions.appendChild(keepButton);

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(swatches);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  private close(): void {
    if (this.overlay && document.body.contains(this.overlay)) {
      document.body.removeChild(this.overlay);
    }
    this.overlay = null;
  }
}
