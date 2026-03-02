/**
 * Monaco-based JSON editor with validation and diff highlighting
 */

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as monaco from 'monaco-editor';
import type { DiffDecoration } from '../types';
import './JsonEditor.css';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  decorations: DiffDecoration[];
  onValidityChange: (valid: boolean, error?: string) => void;
}

export interface JsonEditorRef {
  revealPath: (path: string) => void;
  focusEditor: () => void;
}

const JsonEditor = forwardRef<JsonEditorRef, JsonEditorProps>(
  ({ value, onChange, label, decorations, onValidityChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const decorationsRef = useRef<string[]>([]);
    const decorationMapRef = useRef<Map<string, DiffDecoration>>(new Map());
    const errorDecorationsRef = useRef<string[]>([]);
    const [isValid, setIsValid] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string>('');

    const getCssHexVariable = (name: string) => {
      const color = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
      return color.replace('#', '');
    };

    // Helper to update Monaco theme with current app theme
    const updateMonacoTheme = () => {
      const themeColor = getCssHexVariable('--primary-color');
      const valueColor = getCssHexVariable('--text-primary') || 'ffffff';
      const bracketColor = getCssHexVariable('--json-bracket') || 'da70d6';
      const editorBackground = getCssHexVariable('--bg-primary') || '1a1a1a';
      const lineNumberColor = getCssHexVariable('--json-line-number') || '6e6e6e';

      monaco.editor.defineTheme('api-courier-json', {
        base: 'vs-dark',
        inherit: true,
        rules: [
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
        }
      });

      // Apply theme globally (affects all Monaco editors)
      monaco.editor.setTheme('api-courier-json');
    };

    // Initialize Monaco editor
    useEffect(() => {
      if (!containerRef.current) return;

      // Define initial theme
      updateMonacoTheme();

      const editor = monaco.editor.create(containerRef.current, {
        value,
        language: 'json',
        theme: 'api-courier-json',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
        lineNumbers: 'on',
        folding: true,
        formatOnPaste: true,
        formatOnType: true,
        fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
        glyphMargin: false,
        lineDecorationsWidth: 4,
        lineNumbersMinChars: 3
      });

      editorRef.current = editor;

      // Listen to content changes
      const changeDisposable = editor.onDidChangeModelContent(() => {
        const newValue = editor.getValue();
        onChange(newValue);
        validateJson(newValue);
      });

      validateJson(value);

      // Listen for theme changes
      const handleThemeChange = () => {
        updateMonacoTheme();
      };

      document.addEventListener('theme-changed', handleThemeChange);

      return () => {
        changeDisposable.dispose();
        editor.dispose();
        document.removeEventListener('theme-changed', handleThemeChange);
      };
    }, []);

    // Update editor value when prop changes
    useEffect(() => {
      if (editorRef.current && editorRef.current.getValue() !== value) {
        editorRef.current.setValue(value);
        validateJson(value);
      }
    }, [value]);

    // Clear error decorations
    const clearErrorDecorations = () => {
      if (!editorRef.current) return;
      errorDecorationsRef.current = editorRef.current.deltaDecorations(errorDecorationsRef.current, []);
    };

    // Add error decoration at position
    const addErrorDecoration = (text: string, errorMessage: string) => {
      if (!editorRef.current) return;

      // Parse error position from error message
      const positionMatch = errorMessage.match(/position (\d+)/);
      if (!positionMatch) {
        clearErrorDecorations();
        return;
      }

      const position = parseInt(positionMatch[1], 10);
      const model = editorRef.current.getModel();
      if (!model) return;

      // Convert character position to line/column
      const pos = model.getPositionAt(position);

      // Highlight the error position
      errorDecorationsRef.current = editorRef.current.deltaDecorations(errorDecorationsRef.current, [
        {
          range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column + 1),
          options: {
            className: 'json-error-decoration',
            glyphMarginClassName: 'json-error-glyph',
            inlineClassName: 'json-error-inline',
            minimap: {
              color: '#f85149',
              position: monaco.editor.MinimapPosition.Inline
            }
          }
        }
      ]);

      // Scroll to the error
      editorRef.current.revealPositionInCenter(pos);
    };

    // Validate JSON
    const validateJson = (text: string) => {
      if (!text.trim()) {
        clearErrorDecorations();
        setIsValid(true);
        setErrorMsg('');
        onValidityChange(true);
        return;
      }

      try {
        JSON.parse(text);
        clearErrorDecorations();
        setIsValid(true);
        setErrorMsg('');
        onValidityChange(true);
      } catch (err) {
        const error = err as Error;
        const msg = error.message;
        addErrorDecoration(text, msg);
        setIsValid(false);
        setErrorMsg(msg);
        onValidityChange(false, msg);
      }
    };

    // Apply decorations
    useEffect(() => {
      if (!editorRef.current) return;

      decorationMapRef.current = new Map();

      const monacoDecorations = decorations.map(dec => {
        decorationMapRef.current.set(dec.path, dec);
        return {
          range: new monaco.Range(dec.startLine, dec.startColumn, dec.endLine, dec.endColumn),
          options: {
            className: `diff-${dec.type}`,
            isWholeLine: false,
            inlineClassName: `diff-inline-${dec.type}`,
          }
        };
      });

      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, monacoDecorations);
    }, [decorations]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      revealPath: (path: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        const model = editor.getModel();
        if (!model) return;

        // Parse JSON Pointer segments (RFC 6901)
        const segments = path === '' ? [] : path.slice(1).split('/').map(s =>
          s.replace(/~1/g, '/').replace(/~0/g, '~')
        );

        if (segments.length === 0) {
          editor.revealLine(1, monaco.editor.ScrollType.Smooth);
          editor.focus();
          return;
        }

        // Walk each path segment, searching for "key": after the previous match.
        // Numeric segments (array indices) are skipped since they have no key to search.
        const lineCount = model.getLineCount();
        let searchStartLine = 1;
        let targetRange: monaco.Range | null = null;

        for (const seg of segments) {
          if (!isNaN(Number(seg))) continue; // array index — no key to find

          const searchRange = new monaco.Range(
            searchStartLine, 1, lineCount, model.getLineMaxColumn(lineCount)
          );
          // Escape special regex chars in the key name
          const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const matches = model.findMatches(`"${escaped}"\\s*:`, searchRange, true, false, null, false);
          if (matches.length === 0) break;

          targetRange = matches[0].range;
          searchStartLine = targetRange.startLineNumber + 1;
        }

        if (targetRange) {
          editor.revealRangeInCenter(targetRange, monaco.editor.ScrollType.Smooth);
          editor.setSelection(targetRange);
        }
        editor.focus();
      },
      focusEditor: () => {
        editorRef.current?.focus();
      }
    }));

    return (
      <div className="json-editor-wrapper">
        <div className="json-editor-header">
          <span className="editor-label">{label}</span>
          <span className={`validity-badge ${isValid ? 'valid' : 'invalid'}`}>
            {isValid ? (
              <>
                <svg className="ui-icon ui-icon--sm" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12l4 4 10-10" />
                </svg>
                Valid
              </>
            ) : (
              <>
                <svg className="ui-icon ui-icon--sm" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
                Invalid
              </>
            )}
          </span>
        </div>
        <div ref={containerRef} className="monaco-container" />
      </div>
    );
  }
);

JsonEditor.displayName = 'JsonEditor';

export default JsonEditor;
