import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import { storeManager } from './store-manager';
import { requestManager } from './request-manager';
import { loadTestEngine } from './loadtest-engine';
import { loadTestExporter } from './loadtest-export';
import { Collection, ApiRequest, AppState, LoadTestConfig, LoadTestSummary } from '../../shared/types';
import { randomUUID } from 'crypto';

class IpcManager {
  initialize(): void {
    ipcMain.handle(IPC_CHANNELS.STORE_GET, (): AppState => {
      return storeManager.getState();
    });

    ipcMain.handle(IPC_CHANNELS.STORE_SET, (_, updates: Partial<AppState>): void => {
      storeManager.setState(updates);
    });

    ipcMain.handle(IPC_CHANNELS.REQUEST_SEND, async (_, request: ApiRequest) => {
      return await requestManager.sendRequest(request);
    });

    ipcMain.handle(IPC_CHANNELS.COLLECTION_CREATE, (_, collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Collection => {
      const newCollection: Collection = {
        ...collection,
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // If this is a request collection and no request is provided, create a default ApiRequest
      if (collection.type === 'request' && !collection.request) {
        const defaultRequest: ApiRequest = {
          id: randomUUID(),
          name: collection.name,
          method: 'GET',
          url: '',
          params: {},
          headers: {},
        };
        newCollection.request = defaultRequest;
      } else if (collection.type === 'request' && collection.request) {
        // Use the provided request data but ensure it has a unique ID
        newCollection.request = {
          ...collection.request,
          id: randomUUID()
        };
      }

      const state = storeManager.getState();
      const updatedCollections = [...state.collections, newCollection];
      storeManager.setState({ collections: updatedCollections });

      return newCollection;
    });

    ipcMain.handle(IPC_CHANNELS.COLLECTION_UPDATE, (_, id: string, updates: Partial<Collection>): void => {
      const state = storeManager.getState();
      const updatedCollections = state.collections.map(col =>
        col.id === id ? { ...col, ...updates, updatedAt: new Date() } : col
      );
      storeManager.setState({ collections: updatedCollections });
    });

    ipcMain.handle(IPC_CHANNELS.COLLECTION_DELETE, (_, id: string): void => {
      const state = storeManager.getState();
      const updatedCollections = state.collections.filter(col => col.id !== id);
      storeManager.setState({ collections: updatedCollections });
    });

    // Load Testing IPC handlers
    ipcMain.handle(IPC_CHANNELS.LOADTEST_START, async (_, config: LoadTestConfig) => {
      try {
        return await loadTestEngine.startLoadTest(config);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to start load test');
      }
    });

    ipcMain.handle(IPC_CHANNELS.LOADTEST_CANCEL, async (_, { runId }: { runId: string }) => {
      return await loadTestEngine.cancelLoadTest(runId);
    });

    ipcMain.handle(IPC_CHANNELS.LOADTEST_EXPORT_CSV, async (_, { runId }: { runId: string }) => {
      return await loadTestExporter.exportCsv(runId);
    });

    ipcMain.handle(IPC_CHANNELS.LOADTEST_EXPORT_PDF, async (_, { runId, summary }: { runId: string; summary: LoadTestSummary }) => {
      return await loadTestExporter.exportPdf(runId, summary);
    });

    // Set up load test event forwarding
    loadTestEngine.on('progress', (progress) => {
      // Forward progress events to renderer
      const { BrowserWindow } = require('electron');
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: any) => {
        window.webContents.send(IPC_CHANNELS.LOADTEST_PROGRESS, progress);
      });
    });

    loadTestEngine.on('summary', (summary) => {
      // Forward summary events to renderer
      const { BrowserWindow } = require('electron');
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: any) => {
        window.webContents.send(IPC_CHANNELS.LOADTEST_SUMMARY, summary);
      });
    });
  }
}

export const ipcManager = new IpcManager();