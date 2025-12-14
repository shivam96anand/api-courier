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
    const [isValid, setIsValid] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string>('');

    // Helper to get current theme color from CSS
    const getCurrentThemeColor = () => {
      const color = getComputedStyle(document.documentElement)
        .getPropertyValue('--primary-color')
        .trim();
      return color.replace('#', '');
    };

    // Helper to update Monaco theme with current app theme
    const updateMonacoTheme = () => {
      const themeColor = getCurrentThemeColor();

      monaco.editor.defineTheme('api-courier-json', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'string.key.json', foreground: themeColor, fontStyle: 'bold' },
          { token: 'string.value.json', foreground: 'ffffff' },
          { token: 'number.json', foreground: 'ffffff' },
          { token: 'keyword.json', foreground: 'ffffff' },
          { token: 'delimiter.bracket.json', foreground: 'da70d6', fontStyle: 'bold' },
        ],
        colors: {
          'editor.background': '#1a1a1a',
          'editor.foreground': '#ffffff',
          'editorLineNumber.foreground': '#6e6e6e',
          'editor.selectionBackground': '#404040',
          'editor.lineHighlightBackground': '#2d2d2d',
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
        lineNumbers: 'off',
        folding: true,
        formatOnPaste: true,
        formatOnType: true,
        fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
        glyphMargin: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0
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

    // Validate JSON
    const validateJson = (text: string) => {
      if (!text.trim()) {
        setIsValid(true);
        setErrorMsg('');
        onValidityChange(true);
        return;
      }

      try {
        JSON.parse(text);
        setIsValid(true);
        setErrorMsg('');
        onValidityChange(true);
      } catch (err) {
        const error = err as Error;
        setIsValid(false);
        const msg = error.message;
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
        if (!editorRef.current) return;

        const decoration = decorationMapRef.current.get(path);
        let range: monaco.Range | null = null;

        if (decoration) {
          range = new monaco.Range(
            decoration.startLine,
            decoration.startColumn,
            decoration.endLine,
            decoration.endColumn
          );
        } else if (decorationMapRef.current.size > 0) {
          const fallback = decorationMapRef.current.values().next().value as DiffDecoration | undefined;
          if (fallback) {
            range = new monaco.Range(
              fallback.startLine,
              fallback.startColumn,
              fallback.endLine,
              fallback.endColumn
            );
          }
        }

        if (!range) {
          const model = editorRef.current.getModel();
          if (model) {
            range = model.getFullModelRange();
          }
        }

        if (!range) {
          return;
        }

        editorRef.current.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
        editorRef.current.setSelection(range);
        editorRef.current.focus();
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
            {isValid ? 'Valid ✓' : 'Invalid ✕'}
          </span>
        </div>
        {!isValid && errorMsg && (
          <div className="error-message">{errorMsg}</div>
        )}
        <div ref={containerRef} className="monaco-container" />
      </div>
    );
  }
);

JsonEditor.displayName = 'JsonEditor';

export default JsonEditor;
