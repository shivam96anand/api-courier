import { ipcMain, dialog, shell } from 'electron';
import { readFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc';
import { storeManager } from './store-manager';
import { requestManager } from './request-manager';
import { loadTestEngine } from './loadtest-engine';
import { loadTestExporter } from './loadtest-export';
import { oauthManager } from './oauth';
import { aiEngine } from './ai-engine';
import { mockServerManager } from './mock-server-manager';
import { executeCurl, cancelCurl } from './curl-executor';
import { updateManager } from './update-manager';
import {
  Collection,
  ApiRequest,
  AppState,
  LoadTestConfig,
  LoadTestSummary,
  OAuthConfig,
  CollectionsUIState,
  JsonViewerUIState,
  AiContext,
  AiSendMessageParams,
  MockServerCreateParams,
  MockServerUpdateParams,
  MockRouteCreateParams,
  MockRouteUpdateParams,
  MockRouteDeleteParams,
  MockRouteToggleParams,
  CurlExecuteRequest,
} from '../../shared/types';
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

    ipcMain.handle(IPC_CHANNELS.FILE_READ_BINARY, async (_, filePath: string) => {
      try {
        const content = readFileSync(filePath).toString('base64');
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
          const flattened = flattenCollection(preview.rootFolder);
          updatedCollections.push(...flattened);
        }

        // Add imported environments
        const updatedEnvironments = [...state.environments, ...preview.environments];

        // Auto-activate first imported environment if no environment is currently active
        let activeEnvironmentId = state.activeEnvironmentId;
        if (!activeEnvironmentId && preview.environments.length > 0) {
          activeEnvironmentId = preview.environments[0].id;
        }

        // Merge imported globals if present
        const updatedGlobals = { ...state.globals };
        if (preview.globals?.variables && Object.keys(preview.globals.variables).length > 0) {
          updatedGlobals.variables = { ...(updatedGlobals.variables || {}), ...preview.globals.variables };
          if (preview.globals.variableDescriptions) {
            updatedGlobals.variableDescriptions = {
              ...(updatedGlobals.variableDescriptions || {}),
              ...preview.globals.variableDescriptions,
            };
          }
        }

        storeManager.setState({
          collections: updatedCollections,
          environments: updatedEnvironments,
          activeEnvironmentId,
          globals: updatedGlobals,
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

    // JSON Viewer UI state IPC handlers
    ipcMain.handle(IPC_CHANNELS.JSONVIEWER_STATE_GET, (): JsonViewerUIState => {
      const state = storeManager.getState();
      return state.jsonViewerUIState || { expandedNodesByRequest: {}, requestAccessOrder: [] };
    });

    ipcMain.handle(IPC_CHANNELS.JSONVIEWER_STATE_SET, (_, uiState: JsonViewerUIState): void => {
      storeManager.setState({ jsonViewerUIState: uiState });
    });

    // Backup IPC handlers
    ipcMain.handle(IPC_CHANNELS.BACKUP_LIST, (): Array<{ id: string; filename: string; createdAt: number }> => {
      return storeManager.listBackups(5);
    });

    ipcMain.handle(IPC_CHANNELS.BACKUP_RESTORE, async (_, backupId: string): Promise<void> => {
      await storeManager.restoreBackup(backupId);
    });

    ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_, url: string): Promise<void> => {
      if (!url) {
        return;
      }
      await shell.openExternal(url);
    });

    // Notepad IPC handlers
    ipcMain.handle(IPC_CHANNELS.NOTEPAD_SAVE_FILE, async (_, args: { filePath?: string; content: string; defaultName?: string }) => {
      const { filePath, content, defaultName } = args;

      try {
        let targetPath = filePath;

        if (!targetPath) {
          const result = await dialog.showSaveDialog({
            defaultPath: defaultName || 'Untitled.txt',
            filters: [
              { name: 'Text Files', extensions: ['txt', 'md', 'log', 'json'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          });

          if (result.canceled || !result.filePath) {
            return { canceled: true };
          }

          targetPath = result.filePath;
        }

        await writeFile(targetPath, content ?? '', 'utf-8');
        return { canceled: false, filePath: targetPath };
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to save file');
      }
    });

    ipcMain.handle(IPC_CHANNELS.NOTEPAD_OPEN_FILE, async () => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'Text Files', extensions: ['txt', 'md', 'log', 'json', 'csv'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true };
        }

        const filePath = result.filePaths[0];
        const content = await readFile(filePath, 'utf-8');
        return { canceled: false, filePath, content };
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to open file');
      }
    });

    ipcMain.handle(IPC_CHANNELS.NOTEPAD_READ_FILE, async (_, filePath: string) => {
      try {
        const content = await readFile(filePath, 'utf-8');
        return { canceled: false, content };
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to read file');
      }
    });

    ipcMain.handle(IPC_CHANNELS.NOTEPAD_REVEAL, async (_, filePath: string) => {
      try {
        if (!filePath) return false;
        shell.showItemInFolder(filePath);
        return true;
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to reveal file');
      }
    });

    // AI Chat IPC handlers
    ipcMain.handle(IPC_CHANNELS.AI_GET_SESSIONS, () => {
      return aiEngine.getSessions();
    });

    ipcMain.handle(IPC_CHANNELS.AI_CREATE_SESSION, (_, context?: AiContext) => {
      return aiEngine.createSession(context);
    });

    ipcMain.handle(IPC_CHANNELS.AI_DELETE_SESSION, (_, sessionId: string) => {
      return aiEngine.deleteSession(sessionId);
    });

    ipcMain.handle(IPC_CHANNELS.AI_UPDATE_SESSION, (_, sessionId: string, updates: { title?: string; context?: AiContext }) => {
      return aiEngine.updateSession(sessionId, updates);
    });

    ipcMain.handle(IPC_CHANNELS.AI_SEND_MESSAGE, async (event, params: AiSendMessageParams) => {
      // Create a unique request ID for streaming
      const requestId = randomUUID();

      // Send streaming messages back to the renderer
      const streamCallback = (chunk: string) => {
        event.sender.send(IPC_CHANNELS.AI_MESSAGE_STREAM, { requestId, chunk });
      };

      // Start streaming and wait for completion
      const result = await aiEngine.sendMessage(params, streamCallback);

      // Send final result with requestId
      return { ...result, requestId };
    });

    ipcMain.handle(IPC_CHANNELS.AI_CHECK_ENGINE, async () => {
      return await aiEngine.checkEngine();
    });

    // Mock Server IPC handlers
    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_LIST, () => {
      return mockServerManager.list();
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_CREATE_SERVER, (_, params: MockServerCreateParams) => {
      return mockServerManager.createServer(params);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_UPDATE_SERVER, (_, params: MockServerUpdateParams) => {
      return mockServerManager.updateServer(params);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_DELETE_SERVER, (_, serverId: string) => {
      return mockServerManager.deleteServer(serverId);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_START_SERVER, async (_, serverId: string) => {
      return await mockServerManager.startServer(serverId);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_STOP_SERVER, async (_, serverId: string) => {
      return await mockServerManager.stopServer(serverId);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_ADD_ROUTE, (_, params: MockRouteCreateParams) => {
      return mockServerManager.addRoute(params);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_UPDATE_ROUTE, (_, params: MockRouteUpdateParams) => {
      return mockServerManager.updateRoute(params);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_DELETE_ROUTE, (_, params: MockRouteDeleteParams) => {
      return mockServerManager.deleteRoute(params);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_TOGGLE_ROUTE, (_, params: MockRouteToggleParams) => {
      return mockServerManager.toggleRoute(params);
    });

    ipcMain.handle(IPC_CHANNELS.MOCKSERVER_PICK_FILE, async () => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, data: { canceled: true, filePath: null } };
        }

        return { success: true, data: { canceled: false, filePath: result.filePaths[0] } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open file dialog',
        };
      }
    });

    // ─── cURL handlers ────────────────────────────────────────────────
    ipcMain.handle(IPC_CHANNELS.CURL_EXECUTE, async (_, request: CurlExecuteRequest) => {
      return await executeCurl(request);
    });

    ipcMain.handle(IPC_CHANNELS.CURL_CANCEL, (_, requestId: string) => {
      return cancelCurl(requestId);
    });

    // ─── Auto-updater handler ─────────────────────────────────────────
    ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
      updateManager.installAndRestart();
    });
  }
}

export const ipcManager = new IpcManager();
