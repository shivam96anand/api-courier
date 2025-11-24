import { ipcMain, dialog, shell } from 'electron';
import { readFileSync } from 'fs';
import { IPC_CHANNELS } from '../../shared/ipc';
import { storeManager } from './store-manager';
import { requestManager } from './request-manager';
import { loadTestEngine } from './loadtest-engine';
import { loadTestExporter } from './loadtest-export';
import { oauthManager } from './oauth';
import { Collection, ApiRequest, AppState, LoadTestConfig, LoadTestSummary, OAuthConfig, CollectionsUIState } from '../../shared/types';
import { randomUUID } from 'crypto';
import { detectAndParse, generatePreview, parseJsonFile, ImportPreview } from './importers';

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

    ipcMain.handle(IPC_CHANNELS.REQUEST_CANCEL, async (_, requestId: string) => {
      return requestManager.cancelRequest(requestId);
    });

    ipcMain.handle(IPC_CHANNELS.COLLECTION_CREATE, (_, collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Collection => {
      const state = storeManager.getState();

      // Calculate order: find max order among siblings and add 1000
      const siblings = state.collections.filter(c => c.parentId === collection.parentId);
      const maxOrder = siblings.length > 0
        ? Math.max(...siblings.map(c => c.order ?? 0))
        : -1000;
      const newOrder = maxOrder + 1000;

      const newCollection: Collection = {
        ...collection,
        id: randomUUID(),
        order: collection.order ?? newOrder, // Use provided order or calculate new one
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

      // Helper to recursively find all descendant IDs
      const getAllDescendantIds = (parentId: string, collections: Collection[]): string[] => {
        const childIds: string[] = [];
        collections.forEach(col => {
          if (col.parentId === parentId) {
            childIds.push(col.id);
            // Recursively get descendants of this child
            childIds.push(...getAllDescendantIds(col.id, collections));
          }
        });
        return childIds;
      };

      // Get all IDs to delete (the collection itself + all descendants)
      const idsToDelete = new Set<string>([id, ...getAllDescendantIds(id, state.collections)]);

      // Filter out all collections with IDs in the deletion set
      const updatedCollections = state.collections.filter(col => !idsToDelete.has(col.id));
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

    // OAuth IPC handlers
    ipcMain.handle(IPC_CHANNELS.OAUTH_START_FLOW, async (_, config: OAuthConfig) => {
      try {
        return await oauthManager.startFlow(config);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to start OAuth flow');
      }
    });

    ipcMain.handle(IPC_CHANNELS.OAUTH_REFRESH_TOKEN, async (_, config: OAuthConfig) => {
      try {
        return await oauthManager.refreshToken(config);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to refresh OAuth token');
      }
    });

    ipcMain.handle(IPC_CHANNELS.OAUTH_GET_TOKEN_INFO, (_, config: OAuthConfig) => {
      return oauthManager.getTokenInfo(config);
    });

    // File operations IPC handlers
    ipcMain.handle(IPC_CHANNELS.FILE_OPEN_DIALOG, async () => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Collection Files', extensions: ['json', 'yaml', 'yml'] },
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'YAML Files', extensions: ['yaml', 'yml'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true, filePaths: [] };
        }

        return { canceled: false, filePaths: result.filePaths };
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to open file dialog');
      }
    });

    ipcMain.handle(IPC_CHANNELS.FILE_READ_CONTENT, async (_, filePath: string) => {
      try {
        const content = readFileSync(filePath, 'utf-8');
        return { success: true, content, filePath };
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to read file');
      }
    });

    // Import IPC handlers
    ipcMain.handle(IPC_CHANNELS.IMPORT_PARSE_PREVIEW, async (_, fileContent: string) => {
      try {
        const jsonData = parseJsonFile(fileContent);
        const importResult = detectAndParse(jsonData);

        if (importResult.kind === 'unknown') {
          throw new Error('Unknown or unsupported file format. Please import a valid Postman or Insomnia file.');
        }

        const preview = generatePreview(importResult);
        return { success: true, preview };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to parse import file',
        };
      }
    });

    ipcMain.handle(IPC_CHANNELS.IMPORT_COMMIT, async (_, preview: ImportPreview) => {
      try {
        const state = storeManager.getState();

        // Helper function to flatten nested collections into a flat array
        const flattenCollection = (collection: Collection): Collection[] => {
          const result: Collection[] = [];

          // Add the current collection without the children array
          const { children, ...collectionWithoutChildren } = collection;
          result.push(collectionWithoutChildren);

          // Recursively flatten children
          if (children && children.length > 0) {
            children.forEach(child => {
              result.push(...flattenCollection(child));
            });
          }

          return result;
        };

        // Add imported collections to root level
        const updatedCollections = [...state.collections];
        if (preview.rootFolder) {
          // If the root folder has children and no request (it's a wrapper folder),
          // add its children directly instead of the wrapper
          if (
            preview.rootFolder.type === 'folder' &&
            preview.rootFolder.children &&
            preview.rootFolder.children.length > 0 &&
            !preview.rootFolder.request
          ) {
            // Flatten each child and add to collections
            preview.rootFolder.children.forEach(child => {
              const { parentId, ...childWithoutParent } = child;
              const flattened = flattenCollection(childWithoutParent as Collection);
              updatedCollections.push(...flattened);
            });
          } else {
            // Flatten and add the folder
            const flattened = flattenCollection(preview.rootFolder);
            updatedCollections.push(...flattened);
          }
        }

        // Add imported environments
        const updatedEnvironments = [...state.environments, ...preview.environments];

        // Auto-activate first imported environment if no environment is currently active
        let activeEnvironmentId = state.activeEnvironmentId;
        if (!activeEnvironmentId && preview.environments.length > 0) {
          activeEnvironmentId = preview.environments[0].id;
        }

        storeManager.setState({
          collections: updatedCollections,
          environments: updatedEnvironments,
          activeEnvironmentId,
        });

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to commit import',
        };
      }
    });

    // Collections UI state IPC handlers
    ipcMain.handle(IPC_CHANNELS.COLLECTIONS_STATE_GET, (): CollectionsUIState => {
      const state = storeManager.getState();
      return state.collectionsUIState || { expandedFolderIds: [] };
    });

    ipcMain.handle(IPC_CHANNELS.COLLECTIONS_STATE_SET, (_, uiState: CollectionsUIState): void => {
      storeManager.setState({ collectionsUIState: uiState });
    });

    ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_, url: string): Promise<void> => {
      if (!url) {
        return;
      }
      await shell.openExternal(url);
    });
  }
}

export const ipcManager = new IpcManager();
