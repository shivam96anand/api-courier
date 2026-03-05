/**
 * Notepad Monaco editor initialization and theme management
 */
import * as monaco from 'monaco-editor';

export interface NotepadEditorOptions {
  fontSize: number;
}

export interface NotepadEditorCallbacks {
  onContentChange: (value: string) => void;
  onCursorChange: (lineNumber: number, column: number) => void;
}

/**
 * Get a CSS hex variable value (without the # prefix)
 */
function getCssHexVariable(name: string): string {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return color.replace('#', '');
}

/**
 * Define and apply the custom Monaco theme for the notepad
 */
export function updateMonacoTheme(): void {
  const themeColor = getCssHexVariable('--primary-color');
  const valueColor = getCssHexVariable('--text-primary') || 'ffffff';
  const bracketColor = getCssHexVariable('--json-bracket') || 'da70d6';
  const editorBackground = getCssHexVariable('--bg-primary') || '1a1a1a';
  const lineNumberColor = getCssHexVariable('--json-line-number') || '6e6e6e';

  monaco.editor.defineTheme('api-courier-notepad', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: valueColor },
      { token: 'string.key.json', foreground: themeColor, fontStyle: 'bold' },
      { token: 'string.value.json', foreground: valueColor },
      { token: 'string.json', foreground: valueColor },
      { token: 'number.json', foreground: valueColor },
      { token: 'keyword.json', foreground: valueColor },
      { token: 'delimiter.bracket.json', foreground: bracketColor, fontStyle: 'bold' },
      { token: 'delimiter.colon.json', foreground: valueColor },
      { token: 'delimiter.comma.json', foreground: bracketColor },
    ],
    colors: {
      'editor.background': `#${editorBackground}`,
      'editor.foreground': '#ffffff',
      'editorLineNumber.foreground': `#${lineNumberColor}`,
      'editor.selectionBackground': '#404040',
      'editor.lineHighlightBackground': '#2d2d2d',
    },
  });

  monaco.editor.setTheme('api-courier-notepad');
}

/**
 * Create and configure a Monaco editor instance for the notepad
 */
export function createNotepadEditor(
  container: HTMLElement,
  options: NotepadEditorOptions,
  callbacks: NotepadEditorCallbacks
): monaco.editor.IStandaloneCodeEditor {
  updateMonacoTheme();

  const editor = monaco.editor.create(container, {
    value: '',
    language: 'plaintext',
    theme: 'api-courier-notepad',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: options.fontSize,
    lineNumbers: 'on',
    wordWrap: 'on',
    padding: { top: 12, bottom: 12 },
    bracketPairColorization: { enabled: true },
    renderWhitespace: 'selection',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'off',
    tabCompletion: 'off',
    suggest: {
      preview: false,
      inlineSuggest: false,
    },
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false,
    },
  });

  // Wire up content change handler (with external guard for isApplyingState)
  editor.onDidChangeModelContent(() => {
    const value = editor.getValue();
    callbacks.onContentChange(value);
  });

  // Wire up cursor position handler
  editor.onDidChangeCursorPosition((evt) => {
    callbacks.onCursorChange(evt.position.lineNumber, evt.position.column);
  });

  // Listen for theme changes
  document.addEventListener('theme-changed', () => updateMonacoTheme());

  return editor;
}
