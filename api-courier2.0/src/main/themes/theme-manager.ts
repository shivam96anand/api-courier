import { ThemePalette } from '../../shared/types';

export const DEFAULT_THEMES: ThemePalette[] = [
  {
    id: 'dark-blue',
    name: 'Dark Blue (Default)',
    colors: {
      primary: '#0078d4',
      secondary: '#005a9e',
      accent: '#40e0d0',
      background: '#1e1e1e',
      surface: '#2d2d30',
      text: '#ffffff',
      textSecondary: '#cccccc',
      border: '#3c3c3c',
      success: '#107c10',
      warning: '#ff8c00',
      error: '#d13438'
    }
  },
  {
    id: 'dark-purple',
    name: 'Dark Purple',
    colors: {
      primary: '#7b68ee',
      secondary: '#6a5acd',
      accent: '#da70d6',
      background: '#1a1a2e',
      surface: '#16213e',
      text: '#ffffff',
      textSecondary: '#b8b8d4',
      border: '#2a3663',
      success: '#32cd32',
      warning: '#ffa500',
      error: '#ff6347'
    }
  },
  {
    id: 'dark-green',
    name: 'Dark Green',
    colors: {
      primary: '#32cd32',
      secondary: '#228b22',
      accent: '#7fff00',
      background: '#0d1b0d',
      surface: '#1a2e1a',
      text: '#ffffff',
      textSecondary: '#b8d4b8',
      border: '#2a4f2a',
      success: '#00ff00',
      warning: '#ffff00',
      error: '#ff0000'
    }
  },
  {
    id: 'dark-orange',
    name: 'Dark Orange',
    colors: {
      primary: '#ff6b35',
      secondary: '#e55528',
      accent: '#ffab00',
      background: '#1a0f0a',
      surface: '#2d1b13',
      text: '#ffffff',
      textSecondary: '#d4c4b8',
      border: '#4f3a2a',
      success: '#4caf50',
      warning: '#ff9800',
      error: '#f44336'
    }
  },
  {
    id: 'dark-cyan',
    name: 'Dark Cyan',
    colors: {
      primary: '#00bcd4',
      secondary: '#0097a7',
      accent: '#80deea',
      background: '#0a1a1a',
      surface: '#132d2d',
      text: '#ffffff',
      textSecondary: '#b8d4d4',
      border: '#2a4f4f',
      success: '#4caf50',
      warning: '#ff9800',
      error: '#f44336'
    }
  },
  {
    id: 'light-modern',
    name: 'Light Modern',
    colors: {
      primary: '#0078d4',
      secondary: '#106ebe',
      accent: '#0099ff',
      background: '#ffffff',
      surface: '#f8f9fa',
      text: '#323130',
      textSecondary: '#605e5c',
      border: '#edebe9',
      success: '#107c10',
      warning: '#f7630c',
      error: '#d13438'
    }
  }
];

export class ThemeManager {
  private currentTheme: ThemePalette;
  
  constructor() {
    this.currentTheme = DEFAULT_THEMES[0];
  }

  /**
   * Get all available themes
   */
  public getAvailableThemes(): ThemePalette[] {
    return DEFAULT_THEMES;
  }

  /**
   * Get current active theme
   */
  public getCurrentTheme(): ThemePalette {
    return this.currentTheme;
  }

  /**
   * Set active theme by ID
   */
  public setTheme(themeId: string): boolean {
    const theme = DEFAULT_THEMES.find(t => t.id === themeId);
    if (theme) {
      this.currentTheme = theme;
      this.applyTheme(theme);
      return true;
    }
    return false;
  }

  /**
   * Apply theme to document
   */
  private applyTheme(theme: ThemePalette): void {
    // This would be called from the renderer process
    // We'll handle the actual application in the renderer
    console.log('Applying theme:', theme.name);
  }

  /**
   * Generate CSS variables for theme
   */
  public generateCSSVariables(theme: ThemePalette): string {
    const colors = theme.colors;
    return `
      :root {
        --primary-color: ${colors.primary};
        --secondary-color: ${colors.secondary};
        --accent-color: ${colors.accent};
        --background-color: ${colors.background};
        --surface-color: ${colors.surface};
        --text-color: ${colors.text};
        --text-secondary: ${colors.textSecondary};
        --border-color: ${colors.border};
        --success-color: ${colors.success};
        --warning-color: ${colors.warning};
        --error-color: ${colors.error};
        
        /* Derived colors */
        --hover-color: ${this.adjustOpacity(colors.accent, 0.1)};
        --focus-color: ${colors.accent};
        --disabled-color: ${this.adjustOpacity(colors.textSecondary, 0.5)};
        --shadow-color: ${this.adjustOpacity(colors.background === '#ffffff' ? '#000000' : '#000000', 0.2)};
        
        /* Component specific */
        --button-primary-bg: ${colors.primary};
        --button-primary-text: ${colors.background === '#ffffff' ? '#ffffff' : colors.text};
        --button-secondary-bg: transparent;
        --button-secondary-text: ${colors.primary};
        --button-secondary-border: ${colors.primary};
        
        --input-bg: ${colors.surface};
        --input-border: ${colors.border};
        --input-focus-border: ${colors.accent};
        
        --panel-bg: ${colors.surface};
        --panel-border: ${colors.border};
        --panel-header-bg: ${this.adjustBrightness(colors.surface, colors.background === '#ffffff' ? -5 : 5)};
        
        /* Syntax highlighting for JSON viewer */
        --json-property-color: ${colors.background === '#ffffff' ? '#0451a5' : '#9cdcfe'};
        --json-string-color: ${colors.background === '#ffffff' ? '#0a8a00' : '#ce9178'};
        --json-number-color: ${colors.background === '#ffffff' ? '#09885a' : '#b5cea8'};
        --json-boolean-color: ${colors.background === '#ffffff' ? '#0000ff' : '#569cd6'};
        --json-null-color: ${colors.background === '#ffffff' ? '#808080' : '#808080'};
        --json-punctuation-color: ${colors.background === '#ffffff' ? '#000000' : '#d4d4d4'};
      }
    `;
  }

  /**
   * Adjust color opacity
   */
  private adjustOpacity(color: string, opacity: number): string {
    // Convert hex to rgba
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  /**
   * Adjust color brightness
   */
  private adjustBrightness(color: string, percent: number): string {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + (percent * 255 / 100)));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + (percent * 255 / 100)));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + (percent * 255 / 100)));
    
    const toHex = (n: number) => {
      const hex = Math.round(n).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /**
   * Create custom theme
   */
  public createCustomTheme(name: string, colors: ThemePalette['colors']): ThemePalette {
    return {
      id: `custom_${Date.now()}`,
      name,
      colors
    };
  }

  /**
   * Validate theme colors
   */
  public validateTheme(theme: Partial<ThemePalette>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!theme.name || theme.name.trim().length === 0) {
      errors.push('Theme name is required');
    }

    if (!theme.colors) {
      errors.push('Theme colors are required');
      return { valid: false, errors };
    }

    const requiredColors = [
      'primary', 'secondary', 'accent', 'background', 'surface',
      'text', 'textSecondary', 'border', 'success', 'warning', 'error'
    ];

    requiredColors.forEach(colorKey => {
      if (!theme.colors![colorKey as keyof ThemePalette['colors']]) {
        errors.push(`Color '${colorKey}' is required`);
      } else {
        const color = theme.colors![colorKey as keyof ThemePalette['colors']];
        if (!this.isValidHexColor(color)) {
          errors.push(`Color '${colorKey}' must be a valid hex color`);
        }
      }
    });

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate hex color format
   */
  private isValidHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  /**
   * Get theme by ID
   */
  public getThemeById(id: string): ThemePalette | null {
    return DEFAULT_THEMES.find(theme => theme.id === id) || null;
  }

  /**
   * Export theme as JSON
   */
  public exportTheme(theme: ThemePalette): string {
    return JSON.stringify(theme, null, 2);
  }

  /**
   * Import theme from JSON
   */
  public importTheme(jsonString: string): { success: boolean; theme?: ThemePalette; error?: string } {
    try {
      const theme = JSON.parse(jsonString) as ThemePalette;
      const validation = this.validateTheme(theme);
      
      if (!validation.valid) {
        return { success: false, error: validation.errors.join(', ') };
      }

      return { success: true, theme };
    } catch (error) {
      return { success: false, error: 'Invalid JSON format' };
    }
  }
}
