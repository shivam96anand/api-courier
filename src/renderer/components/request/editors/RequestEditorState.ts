import { EditorType, RequestEditorStateConfig } from '../../../types/request-types';

export interface EditorState {
  activeEditor: EditorType;
  editorContents: Record<EditorType, any>;
  preferences: Record<string, any>;
}

export class RequestEditorState {
  private state: EditorState;
  private onStateChangeCallback: ((state: EditorState) => void) | null = null;

  constructor(private config: RequestEditorStateConfig) {
    this.state = {
      activeEditor: this.config.defaultEditor || 'json',
      editorContents: {} as Record<EditorType, any>,
      preferences: {}
    };
  }

  public setActiveEditor(type: EditorType): void {
    if (this.state.activeEditor !== type) {
      this.state.activeEditor = type;
      this.notifyStateChange();
    }
  }

  public getActiveEditor(): EditorType {
    return this.state.activeEditor;
  }

  public setEditorContent(type: EditorType, content: any): void {
    this.state.editorContents[type] = content;
    this.notifyStateChange();
  }

  public getEditorContent(type: EditorType): any {
    return this.state.editorContents[type];
  }

  public setPreference(key: string, value: any): void {
    this.state.preferences[key] = value;
    this.notifyStateChange();
  }

  public getPreference(key: string): any {
    return this.state.preferences[key];
  }

  public getState(): EditorState {
    return { ...this.state };
  }

  public setState(newState: Partial<EditorState>): void {
    this.state = { ...this.state, ...newState };
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    if (this.config.persistState) {
      this.onStateChangeCallback?.(this.getState());
    }
  }

  public onStateChange(callback: (state: EditorState) => void): void {
    this.onStateChangeCallback = callback;
  }

  public destroy(): void {
    this.onStateChangeCallback = null;
  }
}