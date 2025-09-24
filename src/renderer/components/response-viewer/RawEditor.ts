/**
 * Raw JSON editor with CodeMirror 6 and perfect line number alignment
 */

import { EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, drawSelection } from '@codemirror/view';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { search, highlightSelectionMatches } from '@codemirror/search';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { ViewerStateManager } from './viewerState';
import { JsonUtils } from './utils/json';
import { VIEWER_CONSTANTS } from './types';

export interface RawEditorOptions {
  container: HTMLElement;
  stateManager: ViewerStateManager;
  onChange?: (content: string) => void;
  onCursorChange?: (line: number, column: number) => void;
  onSelectionChange?: (selection: { from: number; to: number }) => void;
  onSearch?: (query: string, matches: number) => void;
}

export interface RawEditorHandle {
  setValue: (content: string) => void;
  getValue: () => string;
  format: () => Promise<void>;
  minify: () => Promise<void>;
  goToLine: (line: number) => void;
  find: (query: string, direction?: 1 | -1) => void;
  toggleWrap: () => boolean;
  setFontSize: (size: number) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  focus: () => void;
  getState: () => any;
  restoreState: (state: any) => void;
  destroy: () => void;
}

export class RawEditor implements RawEditorHandle {
  private view: EditorView | null = null;
  private container: HTMLElement;
  private stateManager: ViewerStateManager;
  private options: RawEditorOptions;
  private extensions: Extension[] = [];
  private currentContent = '';
  private isUpdating = false;

  constructor(options: RawEditorOptions) {
    this.options = options;
    this.container = options.container;
    this.stateManager = options.stateManager;
    this.setupEditor();
  }

  private setupEditor(): void {
    this.buildExtensions();

    const state = EditorState.create({
      doc: this.currentContent,
      extensions: this.extensions,
    });

    this.view = new EditorView({
      state,
      parent: this.container,
    });

    this.restoreEditorState();
    this.setupEventListeners();
  }

  private buildExtensions(): void {
    const state = this.stateManager.getState();

    this.extensions = [
      // Basic editor features
      lineNumbers(),
      drawSelection(),

      // Language support
      json(),

      // Keymaps
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        {
          key: 'Ctrl-f',
          mac: 'Cmd-f',
          run: () => {
            this.openSearch();
            return true;
          }
        },
        {
          key: 'Ctrl-b',
          mac: 'Cmd-b',
          run: () => {
            this.format();
            return true;
          }
        },
        {
          key: 'Ctrl-m',
          mac: 'Cmd-m',
          run: () => {
            this.minify();
            return true;
          }
        },
        {
          key: 'Ctrl-w',
          mac: 'Cmd-w',
          run: () => {
            this.toggleWrap();
            return true;
          }
        }
      ]),

      // Search features
      search(),
      highlightSelectionMatches(),

      // Theme
      state.rawEditor.theme === 'dark' ? oneDark : [],

      // Word wrap
      state.rawEditor.wrapText ? EditorView.lineWrapping : [],

      // Font size
      EditorView.theme({
        '&': {
          fontSize: `${state.rawEditor.fontSize}px`,
          fontFamily: '"JetBrains Mono", "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
        },
        '.cm-content': {
          padding: '12px 8px',
          minHeight: '300px',
        },
        '.cm-editor': {
          height: '100%',
        },
        '.cm-scroller': {
          height: '100%',
        },
        '.cm-lineNumbers': {
          paddingRight: '8px',
          paddingLeft: '8px',
          backgroundColor: state.rawEditor.theme === 'dark' ? '#1e1e1e' : '#f8f9fa',
          borderRight: `1px solid ${state.rawEditor.theme === 'dark' ? '#333' : '#e0e0e0'}`,
        },
        '.cm-lineNumbers .cm-gutterElement': {
          textAlign: 'right',
          color: state.rawEditor.theme === 'dark' ? '#858585' : '#6c757d',
          fontWeight: '400',
        },
        '.cm-gutters': {
          backgroundColor: state.rawEditor.theme === 'dark' ? '#1e1e1e' : '#f8f9fa',
          borderRight: `1px solid ${state.rawEditor.theme === 'dark' ? '#333' : '#e0e0e0'}`,
        },
        '.cm-searchMatch': {
          backgroundColor: '#ffeb3b !important',
          color: '#000 !important',
        },
        '.cm-searchMatch-selected': {
          backgroundColor: '#ff9800 !important',
          color: '#fff !important',
        }
      }),

      // Update listeners
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !this.isUpdating) {
          this.currentContent = this.view?.state.doc.toString() || '';
          this.saveEditorState();
          this.options.onChange?.(this.currentContent);
        }

        if (update.selectionSet) {
          const selection = update.state.selection.main;
          const line = update.state.doc.lineAt(selection.head);
          const column = selection.head - line.from;

          this.options.onCursorChange?.(line.number, column);

          if (selection.from !== selection.to) {
            this.options.onSelectionChange?.({
              from: selection.from,
              to: selection.to
            });
          }

          this.saveEditorState();
        }
      }),

      // Handle scrolling for state persistence
      EditorView.scrollHandler.of((view) => {
        const scrollTop = view.scrollDOM.scrollTop;
        this.stateManager.updateRawEditor({ scrollPosition: scrollTop });
        return false;
      }),
    ];
  }

  private setupEventListeners(): void {
    // Handle resize events
    const resizeObserver = new ResizeObserver(() => {
      if (this.view) {
        this.view.requestMeasure();
      }
    });
    resizeObserver.observe(this.container);
  }

  private saveEditorState(): void {
    if (!this.view) return;

    const selection = this.view.state.selection.main;
    const scrollPosition = this.view.scrollDOM.scrollTop;

    this.stateManager.updateRawEditor({
      scrollPosition,
      cursorPosition: selection.head,
      selection: selection.from !== selection.to ? {
        from: selection.from,
        to: selection.to
      } : undefined,
    });
  }

  private restoreEditorState(): void {
    if (!this.view) return;

    const state = this.stateManager.getState();
    const rawState = state.rawEditor;

    // Restore scroll position
    if (rawState.scrollPosition > 0) {
      setTimeout(() => {
        this.view?.scrollDOM.scrollTo({
          top: rawState.scrollPosition,
          behavior: 'instant'
        });
      }, 100);
    }

    // Restore cursor and selection
    if (rawState.cursorPosition > 0) {
      const doc = this.view.state.doc;
      const cursorPos = Math.min(rawState.cursorPosition, doc.length);

      let selection;
      if (rawState.selection) {
        const from = Math.min(rawState.selection.from, doc.length);
        const to = Math.min(rawState.selection.to, doc.length);
        selection = { anchor: from, head: to };
      } else {
        selection = { anchor: cursorPos, head: cursorPos };
      }

      this.view.dispatch({
        selection: selection
      });
    }
  }

  private rebuildEditor(): void {
    if (!this.view) return;

    const currentDoc = this.view.state.doc.toString();
    const currentSelection = this.view.state.selection;

    this.buildExtensions();
    this.view.destroy();

    const newState = EditorState.create({
      doc: currentDoc,
      extensions: this.extensions,
      selection: currentSelection
    });

    this.view = new EditorView({
      state: newState,
      parent: this.container,
    });
  }

  private openSearch(): void {
    // Simple search implementation - focus will be handled by external search bar
    console.log('Search functionality will be handled by external search bar');
  }

  // Public API methods

  public setValue(content: string): void {
    if (this.currentContent === content) return;

    this.isUpdating = true;
    this.currentContent = content;

    if (this.view) {
      this.view.dispatch({
        changes: {
          from: 0,
          to: this.view.state.doc.length,
          insert: content
        }
      });
    }
    this.isUpdating = false;
  }

  public getValue(): string {
    return this.currentContent;
  }

  public async format(): Promise<void> {
    try {
      const parseResult = await JsonUtils.parseJson(this.currentContent);
      if (parseResult.success && parseResult.data !== undefined) {
        const formatResult = await JsonUtils.formatJson(parseResult.data, 2);
        if (formatResult.success && formatResult.formatted) {
          this.setValue(formatResult.formatted);
        } else {
          console.error('Format failed:', formatResult.error);
        }
      } else {
        console.error('Parse failed:', parseResult.error);
      }
    } catch (error) {
      console.error('Format operation failed:', error);
    }
  }

  public async minify(): Promise<void> {
    try {
      const parseResult = await JsonUtils.parseJson(this.currentContent);
      if (parseResult.success && parseResult.data !== undefined) {
        const minifyResult = await JsonUtils.minifyJson(parseResult.data);
        if (minifyResult.success && minifyResult.formatted) {
          this.setValue(minifyResult.formatted);
        } else {
          console.error('Minify failed:', minifyResult.error);
        }
      } else {
        console.error('Parse failed:', parseResult.error);
      }
    } catch (error) {
      console.error('Minify operation failed:', error);
    }
  }

  public goToLine(line: number): void {
    if (!this.view) return;

    const doc = this.view.state.doc;
    if (line < 1 || line > doc.lines) return;

    const lineInfo = doc.line(line);
    this.view.dispatch({
      selection: { anchor: lineInfo.from, head: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' })
    });
  }

  public find(query: string, direction: 1 | -1 = 1): void {
    if (!this.view || !query) return;

    // Simple text search implementation
    const doc = this.view.state.doc.toString();
    const currentPos = this.view.state.selection.main.head;

    let searchPos = direction === 1 ? currentPos : currentPos - query.length;
    let found = -1;

    if (direction === 1) {
      found = doc.indexOf(query, searchPos);
      if (found === -1) {
        // Wrap around to beginning
        found = doc.indexOf(query, 0);
      }
    } else {
      found = doc.lastIndexOf(query, searchPos);
      if (found === -1) {
        // Wrap around to end
        found = doc.lastIndexOf(query);
      }
    }

    if (found !== -1) {
      this.view.dispatch({
        selection: { anchor: found, head: found + query.length },
        effects: EditorView.scrollIntoView(found, { y: 'center' })
      });
    }
  }

  public toggleWrap(): boolean {
    const newWrapState = this.stateManager.toggleTextWrap();
    this.rebuildEditor();
    return newWrapState;
  }

  public setFontSize(size: number): void {
    this.stateManager.setFontSize(size);
    this.rebuildEditor();
  }

  public setTheme(theme: 'light' | 'dark'): void {
    this.stateManager.updateRawEditor({ theme });
    this.stateManager.saveGlobalSettings({ theme });
    this.rebuildEditor();
  }

  public focus(): void {
    if (this.view) {
      this.view.focus();
    }
  }

  public getState(): any {
    if (!this.view) return null;

    return {
      doc: this.view.state.doc.toString(),
      selection: this.view.state.selection.toJSON(),
      scrollTop: this.view.scrollDOM.scrollTop,
    };
  }

  public restoreState(state: any): void {
    if (!this.view || !state) return;

    // Restore document
    if (state.doc) {
      this.setValue(state.doc);
    }

    // Restore scroll and selection
    if (state.scrollTop) {
      this.view.scrollDOM.scrollTop = state.scrollTop;
    }

    if (state.selection) {
      try {
        // Simple selection restoration
        this.view.dispatch({
          selection: { anchor: state.selection.anchor || 0, head: state.selection.head || 0 }
        });
      } catch (error) {
        console.warn('Failed to restore selection state:', error);
      }
    }
  }

  public destroy(): void {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
  }
}