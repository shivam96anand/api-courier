import { AppTheme } from '../../shared/types';

export class ThemeManager {
  private themes: AppTheme[] = [
    { name: 'teal', primaryColor: '#14b8a6', accentColor: '#0f766e' },
    { name: 'sky', primaryColor: '#38bdf8', accentColor: '#0ea5e9' },
    { name: 'emerald', primaryColor: '#22c55e', accentColor: '#16a34a' },
    { name: 'amber', primaryColor: '#f59e0b', accentColor: '#d97706' },
    { name: 'coral', primaryColor: '#f97316', accentColor: '#ea580c' },
    { name: 'magenta', primaryColor: '#E20074', accentColor: '#B8005A' },
  ];

  private currentTheme: AppTheme;

  constructor() {
    this.currentTheme = this.themes[0]; // Default to teal
  }

  initialize(): void {
    this.setupThemeDropdown();
    this.applyTheme(this.currentTheme);
  }

  private setupThemeDropdown(): void {
    const dropdown = document.getElementById('theme-dropdown') as HTMLSelectElement;
    if (!dropdown) return;

    dropdown.addEventListener('change', () => {
      const selectedTheme = this.themes.find(theme => theme.name === dropdown.value);
      if (selectedTheme) {
        this.setTheme(selectedTheme);
      }
    });

    // Set initial value
    dropdown.value = this.currentTheme.name;
  }

  setTheme(theme: AppTheme): void {
    this.currentTheme = theme;
    this.applyTheme(theme);
    this.updateDropdown();
    this.notifyThemeChange();
  }

  previewTheme(theme: AppTheme): void {
    this.applyTheme(theme);
  }

  restoreTheme(): void {
    this.applyTheme(this.currentTheme);
  }

  private applyTheme(theme: AppTheme): void {
    document.body.setAttribute('data-theme', theme.name);

    // Update CSS custom properties
    document.documentElement.style.setProperty('--primary-color', theme.primaryColor);
    document.documentElement.style.setProperty('--primary-dark', theme.accentColor);
    document.documentElement.style.setProperty('--json-bracket', theme.primaryColor);

    // Calculate lighter variant
    const lightColor = this.lightenColor(theme.primaryColor, 20);
    document.documentElement.style.setProperty('--primary-light', lightColor);

    // Set RGB values for rgba() usage in variable highlighting
    const rgb = this.hexToRgb(theme.primaryColor);
    document.documentElement.style.setProperty('--primary-color-rgb', rgb);
  }

  private hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '37, 99, 235'; // Default blue RGB
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }

  private lightenColor(color: string, percent: number): string {
    // Simple color lightening - convert hex to RGB, lighten, convert back
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    const lighten = (color: number) => Math.min(255, Math.floor(color + (255 - color) * (percent / 100)));

    const newR = lighten(r).toString(16).padStart(2, '0');
    const newG = lighten(g).toString(16).padStart(2, '0');
    const newB = lighten(b).toString(16).padStart(2, '0');

    return `#${newR}${newG}${newB}`;
  }

  private updateDropdown(): void {
    const dropdown = document.getElementById('theme-dropdown') as HTMLSelectElement;
    if (dropdown) {
      dropdown.value = this.currentTheme.name;
    }
  }

  private notifyThemeChange(): void {
    const event = new CustomEvent('theme-changed', {
      detail: { theme: this.currentTheme }
    });
    document.dispatchEvent(event);
  }

  getCurrentTheme(): AppTheme {
    return this.currentTheme;
  }

  getAvailableThemes(): AppTheme[] {
    return [...this.themes];
  }
}
