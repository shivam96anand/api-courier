/**
 * JSON Compare Tab - Vanilla TypeScript integration wrapper
 * React + MUI + Monaco are loaded lazily on first tab activation.
 */

export class JsonCompareTabManager {
  private container: HTMLElement;
  private reactRoot: import('react-dom/client').Root | null = null;
  private initialized = false;

  constructor() {
    this.container = document.getElementById('json-compare-tab')!;
  }

  /**
   * Lazy initialization — call when the tab is first shown.
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (!this.container) {
      console.error('JSON Compare tab container not found');
      return;
    }

    // Dynamic imports so React/MUI/Monaco aren't pulled in at startup
    const [
      React,
      ReactDOM,
      { ThemeProvider, createTheme },
      CssBaseline,
      { default: JsonCompareTab },
    ] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('@mui/material/styles'),
      import('@mui/material/CssBaseline'),
      import('../tabs/json-compare/JsonCompareTab'),
    ]);

    // Clear the "Coming Soon" placeholder
    this.container.innerHTML = '<div id="json-compare-root"></div>';

    const rootElement = document.getElementById('json-compare-root');
    if (!rootElement) return;

    // Create Material-UI dark theme
    const darkTheme = createTheme({
      palette: {
        mode: 'dark',
        primary: {
          main: '#3b82f6',
        },
        background: {
          default: '#1a1a1a',
          paper: '#2d2d2d',
        },
      },
    });

    // Mount React component
    this.reactRoot = ReactDOM.createRoot(rootElement);
    this.reactRoot.render(
      React.createElement(ThemeProvider, { theme: darkTheme },
        React.createElement(React.Fragment, null,
          React.createElement(CssBaseline.default || CssBaseline),
          React.createElement(JsonCompareTab)
        )
      )
    );
  }

  public destroy(): void {
    if (this.reactRoot) {
      this.reactRoot.unmount();
      this.reactRoot = null;
    }
  }
}