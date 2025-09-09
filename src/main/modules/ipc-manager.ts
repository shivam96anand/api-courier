import { ipcMain, dialog, BrowserWindow } from 'electron';
import { StoreManager } from './store-manager';
import { RequestManager } from './request-manager';
import { Collection, Request, Response, AppSettings } from '../../shared/types';
import fs from 'fs';
import path from 'path';

export class IPCManager {
  constructor(
    private storeManager: StoreManager,
    private requestManager: RequestManager
  ) {
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Store handlers
    ipcMain.handle('store:get-collections', () => {
      return this.storeManager.getCollections();
    });

    ipcMain.handle('store:save-collection', (_, collection: Collection) => {
      return this.storeManager.saveCollection(collection);
    });

    ipcMain.handle('store:delete-collection', (_, id: string) => {
      return this.storeManager.deleteCollection(id);
    });

    ipcMain.handle('store:save-request', (_, request: Request) => {
      return this.storeManager.saveRequest(request);
    });

    ipcMain.handle('store:delete-request', (_, id: string) => {
      return this.storeManager.deleteRequest(id);
    });

    ipcMain.handle('store:get-settings', () => {
      return this.storeManager.getSettings();
    });

    ipcMain.handle('store:save-settings', (_, settings: Partial<AppSettings>) => {
      return this.storeManager.saveSettings(settings);
    });

    // Response handlers
    ipcMain.handle('store:save-response', (_, requestId: string, response: Response) => {
      return this.storeManager.saveResponse(requestId, response);
    });

    ipcMain.handle('store:get-response', (_, requestId: string) => {
      return this.storeManager.getResponse(requestId);
    });

    ipcMain.handle('store:delete-response', (_, requestId: string) => {
      return this.storeManager.deleteResponse(requestId);
    });

    // File handlers
    ipcMain.handle('file:import-collection', async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Import Collection',
          filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: ['openFile']
        });

        if (result.canceled || !result.filePaths.length) {
          return null;
        }

        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf-8');
        const collection: Collection = JSON.parse(content);
        
        // Validate collection structure
        if (!collection.id || !collection.name) {
          throw new Error('Invalid collection format');
        }

        return collection;
      } catch (error) {
        console.error('Failed to import collection:', error);
        return null;
      }
    });

    ipcMain.handle('file:export-collection', async (_, collection: Collection) => {
      try {
        const result = await dialog.showSaveDialog({
          title: 'Export Collection',
          defaultPath: `${collection.name}.json`,
          filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (result.canceled || !result.filePath) {
          return false;
        }

        fs.writeFileSync(result.filePath, JSON.stringify(collection, null, 2));
        return true;
      } catch (error) {
        console.error('Failed to export collection:', error);
        return false;
      }
    });

    // Request handlers
    ipcMain.handle('request:send', async (_, request: Request): Promise<Response> => {
      return await this.requestManager.sendRequest(request);
    });

    ipcMain.handle('request:cancel', (_, requestId: string) => {
      this.requestManager.cancelRequest(requestId);
    });

    // Window handlers
    ipcMain.handle('window:minimize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window?.minimize();
    });

    ipcMain.handle('window:maximize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window?.isMaximized()) {
        window.unmaximize();
      } else {
        window?.maximize();
      }
    });

    ipcMain.handle('window:close', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window?.close();
    });
  }
}
