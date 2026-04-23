import { Collection, Environment } from '../../../shared/types';
import { ImportDialog } from './import-dialog';

export class ImportManager {
  private dialog: ImportDialog;
  private onImportComplete?: () => void;

  constructor(onImportComplete?: () => void) {
    this.onImportComplete = onImportComplete;
    this.dialog = new ImportDialog(this.handleImport.bind(this));
  }

  /**
   * Entry point from the Import button. Asks the user whether they want to
   * import a JSON/YAML export file (Postman, Insomnia, Hoppscotch, Restbro,
   * API Courier, OpenAPI, HAR, Thunder Client, Paw, REST Client, WSDL),
   * a Bruno collection folder, or paste a cURL command / .http snippet,
   * then dispatches accordingly.
   */
  async showImportDialog(): Promise<void> {
    const choice = await this.promptSourceChoice();
    if (choice === 'cancel') return;
    if (choice === 'folder') {
      await this.showFolderImport();
      return;
    }
    if (choice === 'paste') {
      await this.showPasteImport();
      return;
    }
    await this.showFileImport();
  }

  private async showFileImport(): Promise<void> {
    try {
      const result = await window.restbro.files.openDialog();

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      // Read file content
      const filePath = result.filePaths[0];
      const fileResult = await window.restbro.files.readContent(filePath);

      if (!fileResult.success) {
        this.showError('Failed to read file');
        return;
      }

      // Parse and preview
      const parseResult = await window.restbro.import.parsePreview(
        fileResult.content
      );

      if (!parseResult.success) {
        this.showError(parseResult.error || 'Failed to parse import file');
        return;
      }

      // Show preview dialog
      await this.dialog.show(parseResult.preview);
    } catch (error) {
      console.error('Import failed:', error);
      this.showError(error instanceof Error ? error.message : 'Import failed');
    }
  }

  private async showFolderImport(): Promise<void> {
    try {
      const picked = await window.restbro.import.pickFolder();
      if (picked.canceled || !picked.folderPath) return;

      const parseResult = await window.restbro.import.parseFolderPreview(
        picked.folderPath
      );
      if (!parseResult.success) {
        this.showError(
          parseResult.error || 'Failed to parse Bruno collection folder'
        );
        return;
      }

      await this.dialog.show(parseResult.preview);
    } catch (error) {
      console.error('Bruno folder import failed:', error);
      this.showError(error instanceof Error ? error.message : 'Import failed');
    }
  }

  /** Prompt for raw text (cURL command, .http snippet, WSDL XML, etc.). */
  private async showPasteImport(): Promise<void> {
    const text = await this.promptForText();
    if (!text) return;
    try {
      const parseResult = await window.restbro.import.parsePreview(text);
      if (!parseResult.success) {
        this.showError(parseResult.error || 'Failed to parse pasted content');
        return;
      }
      await this.dialog.show(parseResult.preview);
    } catch (error) {
      console.error('Paste import failed:', error);
      this.showError(error instanceof Error ? error.message : 'Import failed');
    }
  }

  /**
   * Lightweight modal that asks the user whether to import a single export
   * file, a Bruno collection folder, or paste raw text (cURL / .http / WSDL).
   */
  private promptSourceChoice(): Promise<
    'file' | 'folder' | 'paste' | 'cancel'
  > {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000;
      `;
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px; padding: 20px 24px; width: 480px;
        color: var(--text-primary); font-size: 14px;
      `;
      const title = document.createElement('h3');
      title.textContent = 'Import Collection';
      title.style.cssText = 'margin: 0 0 8px 0; font-size: 16px;';
      const desc = document.createElement('p');
      desc.textContent =
        'Choose an import source. Supports Postman, Insomnia, Hoppscotch, Restbro, OpenAPI/Swagger, HAR, Thunder Client, Paw, REST Client (.http), WSDL, cURL, and Bruno folders.';
      desc.style.cssText =
        'margin: 0 0 16px 0; color: var(--text-secondary); font-size: 13px;';

      const btnRow = document.createElement('div');
      btnRow.style.cssText =
        'display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.className = 'btn btn-secondary';
      const pasteBtn = document.createElement('button');
      pasteBtn.textContent = 'Paste cURL / text…';
      pasteBtn.className = 'btn btn-secondary';
      const folderBtn = document.createElement('button');
      folderBtn.textContent = 'Bruno folder…';
      folderBtn.className = 'btn btn-secondary';
      const fileBtn = document.createElement('button');
      fileBtn.textContent = 'Export file…';
      fileBtn.className = 'btn btn-primary';

      const close = (choice: 'file' | 'folder' | 'paste' | 'cancel') => {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
        resolve(choice);
      };

      cancelBtn.addEventListener('click', () => close('cancel'));
      pasteBtn.addEventListener('click', () => close('paste'));
      folderBtn.addEventListener('click', () => close('folder'));
      fileBtn.addEventListener('click', () => close('file'));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close('cancel');
      });

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(pasteBtn);
      btnRow.appendChild(folderBtn);
      btnRow.appendChild(fileBtn);
      modal.appendChild(title);
      modal.appendChild(desc);
      modal.appendChild(btnRow);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  /** Modal with a textarea for pasting raw cURL / .http / WSDL content. */
  private promptForText(): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000;
      `;
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px; padding: 20px 24px; width: 640px;
        color: var(--text-primary); font-size: 14px;
        display: flex; flex-direction: column; gap: 12px;
      `;
      const title = document.createElement('h3');
      title.textContent = 'Paste content';
      title.style.cssText = 'margin: 0; font-size: 16px;';
      const desc = document.createElement('p');
      desc.textContent =
        'Paste a cURL command, a .http / .rest snippet, or a WSDL document. The format is detected automatically.';
      desc.style.cssText =
        'margin: 0; color: var(--text-secondary); font-size: 13px;';

      const textarea = document.createElement('textarea');
      textarea.style.cssText = `
        width: 100%; min-height: 200px; box-sizing: border-box;
        background: var(--bg-primary); color: var(--text-primary);
        border: 1px solid var(--border-color); border-radius: 4px;
        padding: 8px; font-family: var(--mono-font, monospace);
        font-size: 13px; resize: vertical;
      `;
      textarea.placeholder = `curl 'https://api.example.com/users' -H 'Accept: application/json'`;

      const btnRow = document.createElement('div');
      btnRow.style.cssText =
        'display: flex; gap: 8px; justify-content: flex-end;';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.className = 'btn btn-secondary';
      const importBtn = document.createElement('button');
      importBtn.textContent = 'Preview';
      importBtn.className = 'btn btn-primary';

      const close = (value: string | null) => {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
        resolve(value);
      };
      cancelBtn.addEventListener('click', () => close(null));
      importBtn.addEventListener('click', () => {
        const v = textarea.value.trim();
        if (!v) {
          this.showError('Please paste some content first');
          return;
        }
        close(v);
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null);
      });

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(importBtn);
      modal.appendChild(title);
      modal.appendChild(desc);
      modal.appendChild(textarea);
      modal.appendChild(btnRow);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      setTimeout(() => textarea.focus(), 0);
    });
  }

  private async handleImport(preview: any): Promise<boolean> {
    try {
      const result = await window.restbro.import.commit(preview);

      if (!result.success) {
        this.showError(result.error || 'Failed to import');
        return false;
      }

      this.showSuccess(
        `Successfully imported: ${preview.summary.requests} requests, ${preview.summary.environments} environments`
      );

      // Notify completion
      if (this.onImportComplete) {
        this.onImportComplete();
      }

      return true;
    } catch (error) {
      console.error('Import commit failed:', error);
      this.showError(
        error instanceof Error ? error.message : 'Import commit failed'
      );
      return false;
    }
  }

  private showError(message: string): void {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--error-color);
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 4000);
  }

  private showSuccess(message: string): void {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--success-color, #4caf50);
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 3000);
  }
}
