import { Collection, Environment } from '../../../shared/types';
import { ImportDialog } from './import-dialog';

export class ImportManager {
  private dialog: ImportDialog;
  private onImportComplete?: () => void;

  constructor(onImportComplete?: () => void) {
    this.onImportComplete = onImportComplete;
    this.dialog = new ImportDialog(this.handleImport.bind(this));
  }

  async showImportDialog(): Promise<void> {
    // Open file dialog
    try {
      const result = await window.apiCourier.files.openDialog();

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      // Read file content
      const filePath = result.filePaths[0];
      const fileResult = await window.apiCourier.files.readContent(filePath);

      if (!fileResult.success) {
        this.showError('Failed to read file');
        return;
      }

      // Parse and preview
      const parseResult = await window.apiCourier.import.parsePreview(fileResult.content);

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

  private async handleImport(preview: any): Promise<boolean> {
    try {
      const result = await window.apiCourier.import.commit(preview);

      if (!result.success) {
        this.showError(result.error || 'Failed to import');
        return false;
      }

      this.showSuccess(`Successfully imported: ${preview.summary.requests} requests, ${preview.summary.environments} environments`);

      // Notify completion
      if (this.onImportComplete) {
        this.onImportComplete();
      }

      return true;
    } catch (error) {
      console.error('Import commit failed:', error);
      this.showError(error instanceof Error ? error.message : 'Import commit failed');
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
