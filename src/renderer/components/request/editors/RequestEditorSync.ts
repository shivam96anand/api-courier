import { EditorType, RequestEditorSyncConfig } from '../../../types/request-types';

export class RequestEditorSync {
  private onHeaderSyncCallback: ((headers: Record<string, string>) => void) | null = null;

  constructor(private config: RequestEditorSyncConfig) {}

  public syncHeaders(content: any, editorType: EditorType): Record<string, string> {
    if (!this.config.autoSyncHeaders) {
      return {};
    }

    const headers: Record<string, string> = {};

    if (this.config.syncContentType) {
      const contentType = this.getContentTypeForEditor(editorType);
      if (contentType) {
        headers['Content-Type'] = contentType;
      }
    }

    if (this.config.syncContentLength && content) {
      const contentLength = this.calculateContentLength(content, editorType);
      if (contentLength !== null) {
        headers['Content-Length'] = contentLength.toString();
      }
    }

    if (Object.keys(headers).length > 0) {
      this.onHeaderSyncCallback?.(headers);
    }

    return headers;
  }

  private getContentTypeForEditor(editorType: EditorType): string | null {
    const contentTypeMap: Record<EditorType, string> = {
      'json': 'application/json',
      'form-data': 'multipart/form-data',
      'x-www-form-urlencoded': 'application/x-www-form-urlencoded',
      'raw': 'text/plain',
      'binary': 'application/octet-stream'
    };

    return contentTypeMap[editorType] || null;
  }

  private calculateContentLength(content: any, editorType: EditorType): number | null {
    try {
      let contentString: string;

      switch (editorType) {
        case 'json':
          contentString = typeof content === 'string' ? content : JSON.stringify(content);
          break;
        case 'raw':
          contentString = typeof content === 'string' ? content : String(content);
          break;
        case 'form-data':
          // Form data content length is calculated by the browser
          return null;
        case 'x-www-form-urlencoded':
          if (typeof content === 'object') {
            contentString = new URLSearchParams(content).toString();
          } else {
            contentString = String(content);
          }
          break;
        case 'binary':
          // Binary content length depends on the actual file/blob
          return null;
        default:
          return null;
      }

      // Calculate byte length (not character length)
      return new Blob([contentString]).size;
    } catch (error) {
      return null;
    }
  }

  public onHeaderSync(callback: (headers: Record<string, string>) => void): void {
    this.onHeaderSyncCallback = callback;
  }

  public destroy(): void {
    this.onHeaderSyncCallback = null;
  }
}