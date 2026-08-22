/**
 * The `restbro-json` Monaco theme, shared by every request/response editor.
 *
 * It lives here (rather than inside `MonacoJsonEditor`) because Monaco falls
 * back to its LIGHT `vs` theme when asked for a theme name it doesn't know —
 * so an XML editor created before the first JSON editor rendered on a white
 * background. Any editor that uses the theme must define it first.
 */
import * as monaco from 'monaco-editor';
import { xmlTokenRules } from './monaco-xml-tokens';

function cssHex(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .replace('#', '');
}

export function defineRestbroJsonTheme(): void {
  const themeColor = cssHex('--primary-color');
  const valueColor = cssHex('--text-primary') || 'ffffff';
  // Brackets must always match the theme primary color. Reading
  // --primary-color directly (instead of the parallel --json-bracket var)
  // removes a sync hazard where the two variables briefly disagreed and
  // brackets rendered in the SCSS default magenta while keys already used
  // the user's selected theme color.
  const bracketColor = themeColor || 'da70d6';
  const editorBackground = cssHex('--bg-primary') || '1a1a1a';
  const lineNumberColor = cssHex('--json-line-number') || '6e6e6e';

  // IMPORTANT — DO NOT "simplify" the delimiter rules below.
  //
  // Monaco's JSON tokenizer emits these token names (NOT `delimiter.bracket.json`):
  //   - `delimiter.array.json`   for `[` and `]`
  //   - `delimiter.bracket.json` for `{` and `}`   (a.k.a. "object brackets")
  //   - `delimiter.colon.json`
  //   - `delimiter.comma.json`
  //
  // Listing only `delimiter.bracket.json` worked by accident for `{}` but left
  // `[]` (array brackets) unstyled. On first paint that fell through to Monaco's
  // built-in rainbow `editorBracketHighlight.foregroundN`, producing the
  // multi-color brace bug that "fixed itself" after a tab switch (which forced
  // a re-tokenize against an updated theme). All five rules MUST stay.
  monaco.editor.defineTheme('restbro-json', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: themeColor, fontStyle: 'bold' },
      { token: 'string.value.json', foreground: valueColor },
      { token: 'string.json', foreground: valueColor },
      { token: 'number.json', foreground: valueColor },
      { token: 'keyword.json', foreground: valueColor },
      {
        token: 'delimiter.array.json',
        foreground: bracketColor,
        fontStyle: 'bold',
      },
      {
        token: 'delimiter.bracket.json',
        foreground: bracketColor,
        fontStyle: 'bold',
      },
      { token: 'delimiter.colon.json', foreground: valueColor },
      { token: 'delimiter.comma.json', foreground: bracketColor },
      ...xmlTokenRules(themeColor, valueColor),
    ],
    colors: {
      'editor.background': `#${editorBackground}`,
      'editor.foreground': '#ffffff',
      'editorLineNumber.foreground': `#${lineNumberColor}`,
      'editor.selectionBackground': '#404040',
      'editor.lineHighlightBackground': '#2d2d2d',
      'editorBracketHighlight.foreground1': `#${bracketColor}`,
      'editorBracketHighlight.foreground2': `#${bracketColor}`,
      'editorBracketHighlight.foreground3': `#${bracketColor}`,
      'editorBracketHighlight.foreground4': `#${bracketColor}`,
      'editorBracketHighlight.foreground5': `#${bracketColor}`,
      'editorBracketHighlight.foreground6': `#${bracketColor}`,
      'editorBracketPairGuide.activeBackground1': `#${bracketColor}`,
      'editorBracketPairGuide.activeBackground2': `#${bracketColor}`,
      'editorBracketPairGuide.activeBackground3': `#${bracketColor}`,
      'editorBracketPairGuide.activeBackground4': `#${bracketColor}`,
      'editorBracketPairGuide.activeBackground5': `#${bracketColor}`,
      'editorBracketPairGuide.activeBackground6': `#${bracketColor}`,
      'editorBracketHighlight.unexpectedBracket.foreground': `#${bracketColor}`,
      // Theme-aware, professional scrollbar sliders (neutral at rest,
      // primary-tinted on hover/drag) — matches the app-wide native
      // scrollbars defined in `_scrollbars.scss`.
      'scrollbarSlider.background': '#ffffff26',
      'scrollbarSlider.hoverBackground': `#${themeColor}66`,
      'scrollbarSlider.activeBackground': `#${themeColor}99`,
    },
  });
}
