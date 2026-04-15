import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock electron before import
vi.mock('electron', async () => import('../../../__mocks__/electron'));

// Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('file-content'),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('file-content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock crypto
vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('mock-uuid-1234'),
}));

// Mock all module dependencies
vi.mock('../store-manager', () => ({
  storeManager: {
    getState: vi.fn(),
    setState: vi.fn(),
    listBackups: vi.fn().mockReturnValue([]),
    restoreBackup: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../request-manager', () => ({
  requestManager: {
    sendRequest: vi.fn().mockResolvedValue({ status: 200 }),
    cancelRequest: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../loadtest-engine', () => {
  const engine = {
    startLoadTest: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    cancelLoadTest: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    emit: vi.fn(),
  };
  return { loadTestEngine: engine };
});

vi.mock('../loadtest-export', () => ({
  loadTestExporter: {
    exportCsv: vi.fn().mockResolvedValue({ success: true }),
    exportPdf: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../oauth', () => ({
  oauthManager: {
    startFlow: vi.fn().mockResolvedValue({ success: true }),
    refreshToken: vi.fn().mockResolvedValue({ success: true }),
    getTokenInfo: vi.fn().mockReturnValue({ isValid: true }),
  },
}));

vi.mock('../ai-engine', () => ({
  aiEngine: {
    getSessions: vi.fn().mockReturnValue([]),
    createSession: vi.fn().mockReturnValue({ id: 'session-1' }),
    deleteSession: vi.fn(),
    updateSession: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({ content: 'reply' }),
    checkEngine: vi.fn().mockResolvedValue({ available: true }),
  },
}));

vi.mock('../mock-server-manager', () => ({
  mockServerManager: {
    list: vi.fn().mockReturnValue([]),
    createServer: vi.fn(),
    updateServer: vi.fn(),
    deleteServer: vi.fn(),
    startServer: vi.fn().mockResolvedValue(undefined),
    stopServer: vi.fn().mockResolvedValue(undefined),
    addRoute: vi.fn(),
    updateRoute: vi.fn(),
    deleteRoute: vi.fn(),
    toggleRoute: vi.fn(),
  },
}));

vi.mock('../curl-executor', () => ({
  executeCurl: vi.fn().mockResolvedValue({ id: 'curl-1', status: 200 }),
  cancelCurl: vi.fn().mockReturnValue(true),
}));

vi.mock('../update-manager', () => ({
  updateManager: {
    installAndRestart: vi.fn(),
  },
}));

vi.mock('../importers', () => ({
  detectAndParse: vi.fn().mockReturnValue({ kind: 'postman' }),
  generatePreview: vi
    .fn()
    .mockReturnValue({ rootFolder: null, environments: [] }),
  parseJsonFile: vi.fn().mockReturnValue({}),
}));

import { ipcMain, dialog, shell } from 'electron';
import { storeManager } from '../store-manager';
import { requestManager } from '../request-manager';
import { loadTestEngine } from '../loadtest-engine';
import { loadTestExporter } from '../loadtest-export';
import { oauthManager } from '../oauth';
import { aiEngine } from '../ai-engine';
import { mockServerManager } from '../mock-server-manager';
import { executeCurl, cancelCurl } from '../curl-executor';
import { updateManager } from '../update-manager';
import { ipcManager } from '../ipc-manager';
import { IPC_CHANNELS } from '../../../shared/ipc';
import { Collection, AppState } from '../../../shared/types';

/**
 * Helper to extract the handler registered for a given channel.
 * ipcMain.handle is mocked; each call records (channel, handler).
 */
function getHandler(channel: string): ((...args: any[]) => any) | undefined {
  const calls = vi.mocked(ipcMain.handle).mock.calls;
  const match = calls.find(([ch]) => ch === channel);
  return match ? match[1] : undefined;
}

function createState(overrides: Partial<AppState> = {}): AppState {
  return {
    collections: [],
    openTabs: [],
    history: [],
    theme: { name: 'dark', primaryColor: '#000', accentColor: '#fff' },
    navOrder: [],
    environments: [],
    globals: { variables: {} },
    ...overrides,
  };
}

describe('ipc-manager.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-initialize to register handlers fresh
    ipcManager.initialize();
  });

  describe('channel registration', () => {
    it('registers handlers for all IPC_CHANNELS that need a handler', () => {
      const registeredChannels = vi
        .mocked(ipcMain.handle)
        .mock.calls.map(([ch]) => ch);

      // All channels that have ipcMain.handle in the source
      const expectedChannels = [
        IPC_CHANNELS.STORE_GET,
        IPC_CHANNELS.STORE_SET,
        IPC_CHANNELS.REQUEST_SEND,
        IPC_CHANNELS.REQUEST_CANCEL,
        IPC_CHANNELS.COLLECTION_CREATE,
        IPC_CHANNELS.COLLECTION_UPDATE,
        IPC_CHANNELS.COLLECTION_DELETE,
        IPC_CHANNELS.LOADTEST_START,
        IPC_CHANNELS.LOADTEST_CANCEL,
        IPC_CHANNELS.LOADTEST_EXPORT_CSV,
        IPC_CHANNELS.LOADTEST_EXPORT_PDF,
        IPC_CHANNELS.OAUTH_START_FLOW,
        IPC_CHANNELS.OAUTH_REFRESH_TOKEN,
        IPC_CHANNELS.OAUTH_GET_TOKEN_INFO,
        IPC_CHANNELS.FILE_OPEN_DIALOG,
        IPC_CHANNELS.FILE_READ_CONTENT,
        IPC_CHANNELS.FILE_READ_BINARY,
        IPC_CHANNELS.IMPORT_PARSE_PREVIEW,
        IPC_CHANNELS.IMPORT_COMMIT,
        IPC_CHANNELS.COLLECTIONS_STATE_GET,
        IPC_CHANNELS.COLLECTIONS_STATE_SET,
        IPC_CHANNELS.JSONVIEWER_STATE_GET,
        IPC_CHANNELS.JSONVIEWER_STATE_SET,
        IPC_CHANNELS.BACKUP_LIST,
        IPC_CHANNELS.BACKUP_RESTORE,
        IPC_CHANNELS.OPEN_EXTERNAL,
        IPC_CHANNELS.NOTEPAD_SAVE_FILE,
        IPC_CHANNELS.NOTEPAD_OPEN_FILE,
        IPC_CHANNELS.NOTEPAD_READ_FILE,
        IPC_CHANNELS.NOTEPAD_REVEAL,
        IPC_CHANNELS.AI_GET_SESSIONS,
        IPC_CHANNELS.AI_CREATE_SESSION,
        IPC_CHANNELS.AI_DELETE_SESSION,
        IPC_CHANNELS.AI_UPDATE_SESSION,
        IPC_CHANNELS.AI_SEND_MESSAGE,
        IPC_CHANNELS.AI_CHECK_ENGINE,
        IPC_CHANNELS.MOCKSERVER_LIST,
        IPC_CHANNELS.MOCKSERVER_CREATE_SERVER,
        IPC_CHANNELS.MOCKSERVER_UPDATE_SERVER,
        IPC_CHANNELS.MOCKSERVER_DELETE_SERVER,
        IPC_CHANNELS.MOCKSERVER_START_SERVER,
        IPC_CHANNELS.MOCKSERVER_STOP_SERVER,
        IPC_CHANNELS.MOCKSERVER_ADD_ROUTE,
        IPC_CHANNELS.MOCKSERVER_UPDATE_ROUTE,
        IPC_CHANNELS.MOCKSERVER_DELETE_ROUTE,
        IPC_CHANNELS.MOCKSERVER_TOGGLE_ROUTE,
        IPC_CHANNELS.MOCKSERVER_PICK_FILE,
        IPC_CHANNELS.CURL_EXECUTE,
        IPC_CHANNELS.CURL_CANCEL,
        IPC_CHANNELS.UPDATE_INSTALL,
      ];

      for (const channel of expectedChannels) {
        expect(registeredChannels).toContain(channel);
      }
    });

    it('registers the expected number of unique channels', () => {
      const registeredChannels = vi
        .mocked(ipcMain.handle)
        .mock.calls.map(([ch]) => ch);

      // Should register at least 40 handlers (all the ipcMain.handle calls)
      expect(registeredChannels.length).toBeGreaterThanOrEqual(40);
    });
  });

  describe('store:get / store:set', () => {
    it('store:get returns current state from storeManager', () => {
      const state = createState({
        collections: [
          {
            id: 'c1',
            name: 'Test',
            type: 'folder',
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      vi.mocked(storeManager.getState).mockReturnValue(state);

      const handler = getHandler(IPC_CHANNELS.STORE_GET)!;
      const result = handler();

      expect(result).toEqual(state);
      expect(storeManager.getState).toHaveBeenCalled();
    });

    it('store:set delegates to storeManager.setState with updates', () => {
      const handler = getHandler(IPC_CHANNELS.STORE_SET)!;
      const updates = { activeTabId: 'tab-1' };

      handler({}, updates);

      expect(storeManager.setState).toHaveBeenCalledWith(updates);
    });
  });

  describe('collection:create', () => {
    it('assigns a UUID to the new collection', () => {
      vi.mocked(storeManager.getState).mockReturnValue(createState());

      const handler = getHandler(IPC_CHANNELS.COLLECTION_CREATE)!;
      const result = handler(
        {},
        {
          name: 'New Folder',
          type: 'folder',
        }
      );

      expect(result.id).toBe('mock-uuid-1234');
    });

    it('calculates order as max sibling order + 1000', () => {
      const state = createState({
        collections: [
          {
            id: 'c1',
            name: 'First',
            type: 'folder',
            order: 2000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'c2',
            name: 'Second',
            type: 'folder',
            order: 3000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      vi.mocked(storeManager.getState).mockReturnValue(state);

      const handler = getHandler(IPC_CHANNELS.COLLECTION_CREATE)!;
      const result = handler(
        {},
        {
          name: 'Third',
          type: 'folder',
          parentId: undefined,
        }
      );

      // max(2000, 3000) + 1000 = 4000
      expect(result.order).toBe(4000);
    });

    it('sets createdAt and updatedAt timestamps', () => {
      vi.mocked(storeManager.getState).mockReturnValue(createState());

      const handler = getHandler(IPC_CHANNELS.COLLECTION_CREATE)!;
      const result = handler(
        {},
        {
          name: 'Timestamped',
          type: 'folder',
        }
      );

      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('creates a default ApiRequest for request-type collections without a request', () => {
      vi.mocked(storeManager.getState).mockReturnValue(createState());

      const handler = getHandler(IPC_CHANNELS.COLLECTION_CREATE)!;
      const result = handler(
        {},
        {
          name: 'My Request',
          type: 'request',
        }
      );

      expect(result.request).toBeDefined();
      expect(result.request.id).toBe('mock-uuid-1234');
      expect(result.request.method).toBe('GET');
      expect(result.request.url).toBe('');
      expect(result.request.name).toBe('My Request');
    });
  });

  describe('collection:update', () => {
    it('updates the matching collection and sets updatedAt', () => {
      const existingDate = new Date('2024-01-01');
      const state = createState({
        collections: [
          {
            id: 'c1',
            name: 'Original',
            type: 'folder',
            order: 0,
            createdAt: existingDate,
            updatedAt: existingDate,
          },
        ],
      });
      vi.mocked(storeManager.getState).mockReturnValue(state);

      const handler = getHandler(IPC_CHANNELS.COLLECTION_UPDATE)!;
      handler({}, 'c1', { name: 'Renamed' });

      const call = vi.mocked(storeManager.setState).mock.calls[0][0] as any;
      const updated = call.collections.find((c: Collection) => c.id === 'c1');
      expect(updated.name).toBe('Renamed');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        existingDate.getTime()
      );
    });

    it('does not modify other collections', () => {
      const state = createState({
        collections: [
          {
            id: 'c1',
            name: 'First',
            type: 'folder',
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'c2',
            name: 'Second',
            type: 'folder',
            order: 1000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      vi.mocked(storeManager.getState).mockReturnValue(state);

      const handler = getHandler(IPC_CHANNELS.COLLECTION_UPDATE)!;
      handler({}, 'c1', { name: 'Updated First' });

      const call = vi.mocked(storeManager.setState).mock.calls[0][0] as any;
      const c2 = call.collections.find((c: Collection) => c.id === 'c2');
      expect(c2.name).toBe('Second');
    });
  });

  describe('collection:delete', () => {
    it('deletes the target collection', () => {
      const state = createState({
        collections: [
          {
            id: 'c1',
            name: 'ToDelete',
            type: 'folder',
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'c2',
            name: 'Keep',
            type: 'folder',
            order: 1000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      vi.mocked(storeManager.getState).mockReturnValue(state);

      const handler = getHandler(IPC_CHANNELS.COLLECTION_DELETE)!;
      handler({}, 'c1');

      const call = vi.mocked(storeManager.setState).mock.calls[0][0] as any;
      expect(call.collections).toHaveLength(1);
      expect(call.collections[0].id).toBe('c2');
    });

    it('cascades deletion to all descendants', () => {
      const state = createState({
        collections: [
          {
            id: 'root',
            name: 'Root',
            type: 'folder',
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'child-1',
            name: 'Child 1',
            type: 'folder',
            parentId: 'root',
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'grandchild-1',
            name: 'Grandchild 1',
            type: 'request',
            parentId: 'child-1',
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'sibling',
            name: 'Sibling',
            type: 'folder',
            order: 1000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      vi.mocked(storeManager.getState).mockReturnValue(state);

      const handler = getHandler(IPC_CHANNELS.COLLECTION_DELETE)!;
      handler({}, 'root');

      const call = vi.mocked(storeManager.setState).mock.calls[0][0] as any;
      // Only 'sibling' should remain
      expect(call.collections).toHaveLength(1);
      expect(call.collections[0].id).toBe('sibling');
    });
  });

  describe('request:send / request:cancel', () => {
    it('delegates request:send to requestManager.sendRequest', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '{}',
        time: 50,
        size: 2,
        timestamp: Date.now(),
      };
      vi.mocked(requestManager.sendRequest).mockResolvedValue(mockResponse);

      const handler = getHandler(IPC_CHANNELS.REQUEST_SEND)!;
      const request = {
        id: 'req-1',
        name: 'Test',
        method: 'GET' as const,
        url: 'https://api.example.com',
        headers: {},
      };

      const result = await handler({}, request);

      expect(requestManager.sendRequest).toHaveBeenCalledWith(request);
      expect(result).toEqual(mockResponse);
    });

    it('delegates request:cancel to requestManager.cancelRequest', async () => {
      vi.mocked(requestManager.cancelRequest).mockReturnValue(true);

      const handler = getHandler(IPC_CHANNELS.REQUEST_CANCEL)!;
      const result = await handler({}, 'req-1');

      expect(requestManager.cancelRequest).toHaveBeenCalledWith('req-1');
      expect(result).toBe(true);
    });
  });

  describe('loadtest handlers', () => {
    it('loadtest:start delegates to loadTestEngine.startLoadTest', async () => {
      const handler = getHandler(IPC_CHANNELS.LOADTEST_START)!;
      const config = { rpm: 60, durationSec: 10, target: { kind: 'adhoc', method: 'GET', url: 'http://example.com' } };
      const result = await handler({}, config);
      expect(loadTestEngine.startLoadTest).toHaveBeenCalledWith(config);
      expect(result).toEqual({ runId: 'run-1' });
    });

    it('loadtest:start wraps errors', async () => {
      vi.mocked(loadTestEngine.startLoadTest).mockRejectedValueOnce(new Error('bad config'));
      const handler = getHandler(IPC_CHANNELS.LOADTEST_START)!;
      await expect(handler({}, {})).rejects.toThrow('bad config');
    });

    it('loadtest:cancel delegates to loadTestEngine.cancelLoadTest', async () => {
      const handler = getHandler(IPC_CHANNELS.LOADTEST_CANCEL)!;
      const result = await handler({}, { runId: 'run-1' });
      expect(loadTestEngine.cancelLoadTest).toHaveBeenCalledWith('run-1');
    });

    it('loadtest:export-csv delegates to loadTestExporter', async () => {
      const handler = getHandler(IPC_CHANNELS.LOADTEST_EXPORT_CSV)!;
      const result = await handler({}, { runId: 'run-1' });
      expect(loadTestExporter.exportCsv).toHaveBeenCalledWith('run-1');
      expect(result).toEqual({ success: true });
    });

    it('loadtest:export-pdf delegates to loadTestExporter', async () => {
      const handler = getHandler(IPC_CHANNELS.LOADTEST_EXPORT_PDF)!;
      const summary = { runId: 'run-1', totalPlanned: 10 };
      const result = await handler({}, { runId: 'run-1', summary });
      expect(loadTestExporter.exportPdf).toHaveBeenCalledWith('run-1', summary);
      expect(result).toEqual({ success: true });
    });
  });

  describe('oauth handlers', () => {
    it('oauth:start-flow delegates to oauthManager.startFlow', async () => {
      const handler = getHandler(IPC_CHANNELS.OAUTH_START_FLOW)!;
      const config = { grantType: 'client_credentials', clientId: 'id', tokenUrl: 'http://token' };
      const result = await handler({}, config);
      expect(oauthManager.startFlow).toHaveBeenCalledWith(config);
      expect(result).toEqual({ success: true });
    });

    it('oauth:start-flow wraps errors', async () => {
      vi.mocked(oauthManager.startFlow).mockRejectedValueOnce(new Error('auth error'));
      const handler = getHandler(IPC_CHANNELS.OAUTH_START_FLOW)!;
      await expect(handler({}, {})).rejects.toThrow('auth error');
    });

    it('oauth:refresh-token delegates to oauthManager.refreshToken', async () => {
      const handler = getHandler(IPC_CHANNELS.OAUTH_REFRESH_TOKEN)!;
      const result = await handler({}, { refreshToken: 'tok' });
      expect(oauthManager.refreshToken).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('oauth:get-token-info delegates to oauthManager.getTokenInfo', () => {
      const handler = getHandler(IPC_CHANNELS.OAUTH_GET_TOKEN_INFO)!;
      const result = handler({}, { accessToken: 'tok' });
      expect(oauthManager.getTokenInfo).toHaveBeenCalled();
      expect(result).toEqual({ isValid: true });
    });
  });

  describe('environment / state handlers', () => {
    it('collections-state:get returns collectionsUIState from store', () => {
      vi.mocked(storeManager.getState).mockReturnValue(
        createState({ collectionsUIState: { expandedFolderIds: ['f1'] } } as any)
      );
      const handler = getHandler(IPC_CHANNELS.COLLECTIONS_STATE_GET)!;
      const result = handler();
      expect(result).toEqual({ expandedFolderIds: ['f1'] });
    });

    it('collections-state:get returns default when absent', () => {
      vi.mocked(storeManager.getState).mockReturnValue(createState());
      const handler = getHandler(IPC_CHANNELS.COLLECTIONS_STATE_GET)!;
      const result = handler();
      expect(result).toEqual({ expandedFolderIds: [] });
    });

    it('collections-state:set delegates to storeManager', () => {
      const handler = getHandler(IPC_CHANNELS.COLLECTIONS_STATE_SET)!;
      handler({}, { expandedFolderIds: ['f1'] });
      expect(storeManager.setState).toHaveBeenCalledWith({ collectionsUIState: { expandedFolderIds: ['f1'] } });
    });

    it('jsonviewer-state:get returns jsonViewerUIState from store', () => {
      vi.mocked(storeManager.getState).mockReturnValue(
        createState({ jsonViewerUIState: { expandedNodesByRequest: { r1: ['n1'] }, requestAccessOrder: ['r1'] } } as any)
      );
      const handler = getHandler(IPC_CHANNELS.JSONVIEWER_STATE_GET)!;
      const result = handler();
      expect(result.expandedNodesByRequest).toEqual({ r1: ['n1'] });
    });

    it('jsonviewer-state:set delegates to storeManager', () => {
      const handler = getHandler(IPC_CHANNELS.JSONVIEWER_STATE_SET)!;
      const uiState = { expandedNodesByRequest: {}, requestAccessOrder: [] };
      handler({}, uiState);
      expect(storeManager.setState).toHaveBeenCalledWith({ jsonViewerUIState: uiState });
    });
  });

  describe('backup handlers', () => {
    it('backup:list returns backups from storeManager', () => {
      const handler = getHandler(IPC_CHANNELS.BACKUP_LIST)!;
      const result = handler();
      expect(storeManager.listBackups).toHaveBeenCalledWith(5);
      expect(result).toEqual([]);
    });

    it('backup:restore delegates to storeManager', async () => {
      const handler = getHandler(IPC_CHANNELS.BACKUP_RESTORE)!;
      await handler({}, 'backup-1');
      expect(storeManager.restoreBackup).toHaveBeenCalledWith('backup-1');
    });
  });

  describe('AI handlers', () => {
    it('ai:get-sessions delegates to aiEngine', () => {
      const handler = getHandler(IPC_CHANNELS.AI_GET_SESSIONS)!;
      const result = handler();
      expect(aiEngine.getSessions).toHaveBeenCalled();
    });

    it('ai:create-session delegates to aiEngine', () => {
      const handler = getHandler(IPC_CHANNELS.AI_CREATE_SESSION)!;
      const result = handler({}, { request: { id: 'r1' } });
      expect(aiEngine.createSession).toHaveBeenCalled();
      expect(result).toEqual({ id: 'session-1' });
    });

    it('ai:delete-session delegates to aiEngine', () => {
      const handler = getHandler(IPC_CHANNELS.AI_DELETE_SESSION)!;
      handler({}, 'session-1');
      expect(aiEngine.deleteSession).toHaveBeenCalledWith('session-1');
    });

    it('ai:update-session delegates to aiEngine', () => {
      const handler = getHandler(IPC_CHANNELS.AI_UPDATE_SESSION)!;
      handler({}, 'session-1', { title: 'New Title' });
      expect(aiEngine.updateSession).toHaveBeenCalledWith('session-1', { title: 'New Title' });
    });

    it('ai:check-engine delegates to aiEngine', async () => {
      const handler = getHandler(IPC_CHANNELS.AI_CHECK_ENGINE)!;
      const result = await handler();
      expect(aiEngine.checkEngine).toHaveBeenCalled();
      expect(result).toEqual({ available: true });
    });
  });

  describe('mock server handlers', () => {
    it('mockserver:list delegates to mockServerManager', () => {
      const handler = getHandler(IPC_CHANNELS.MOCKSERVER_LIST)!;
      handler();
      expect(mockServerManager.list).toHaveBeenCalled();
    });

    it('mockserver:create delegates to mockServerManager', () => {
      const handler = getHandler(IPC_CHANNELS.MOCKSERVER_CREATE_SERVER)!;
      handler({}, { name: 'Test' });
      expect(mockServerManager.createServer).toHaveBeenCalledWith({ name: 'Test' });
    });

    it('mockserver:update delegates to mockServerManager', () => {
      const handler = getHandler(IPC_CHANNELS.MOCKSERVER_UPDATE_SERVER)!;
      handler({}, { serverId: 's1', name: 'Updated' });
      expect(mockServerManager.updateServer).toHaveBeenCalledWith({ serverId: 's1', name: 'Updated' });
    });

    it('mockserver:delete delegates to mockServerManager', () => {
      const handler = getHandler(IPC_CHANNELS.MOCKSERVER_DELETE_SERVER)!;
      handler({}, 'server-1');
      expect(mockServerManager.deleteServer).toHaveBeenCalledWith('server-1');
    });

    it('mockserver:start delegates to mockServerManager', async () => {
      const handler = getHandler(IPC_CHANNELS.MOCKSERVER_START_SERVER)!;
      await handler({}, 'server-1');
      expect(mockServerManager.startServer).toHaveBeenCalledWith('server-1');
    });

    it('mockserver:stop delegates to mockServerManager', async () => {
      const handler = getHandler(IPC_CHANNELS.MOCKSERVER_STOP_SERVER)!;
      await handler({}, 'server-1');
      expect(mockServerManager.stopServer).toHaveBeenCalledWith('server-1');
    });

    it('route CRUD delegates to mockServerManager', () => {
      getHandler(IPC_CHANNELS.MOCKSERVER_ADD_ROUTE)!({}, { serverId: 's1' });
      expect(mockServerManager.addRoute).toHaveBeenCalled();

      getHandler(IPC_CHANNELS.MOCKSERVER_UPDATE_ROUTE)!({}, { serverId: 's1', routeId: 'r1' });
      expect(mockServerManager.updateRoute).toHaveBeenCalled();

      getHandler(IPC_CHANNELS.MOCKSERVER_DELETE_ROUTE)!({}, { serverId: 's1', routeId: 'r1' });
      expect(mockServerManager.deleteRoute).toHaveBeenCalled();

      getHandler(IPC_CHANNELS.MOCKSERVER_TOGGLE_ROUTE)!({}, { serverId: 's1', routeId: 'r1' });
      expect(mockServerManager.toggleRoute).toHaveBeenCalled();
    });
  });

  describe('curl handlers', () => {
    it('curl:execute delegates to executeCurl', async () => {
      const handler = getHandler(IPC_CHANNELS.CURL_EXECUTE)!;
      const result = await handler({}, { command: 'curl http://example.com' });
      expect(executeCurl).toHaveBeenCalled();
      expect(result).toEqual({ id: 'curl-1', status: 200 });
    });

    it('curl:cancel delegates to cancelCurl', () => {
      const handler = getHandler(IPC_CHANNELS.CURL_CANCEL)!;
      const result = handler({}, 'req-1');
      expect(cancelCurl).toHaveBeenCalledWith('req-1');
      expect(result).toBe(true);
    });
  });

  describe('update handler', () => {
    it('update:install delegates to updateManager', () => {
      const handler = getHandler(IPC_CHANNELS.UPDATE_INSTALL)!;
      handler();
      expect(updateManager.installAndRestart).toHaveBeenCalled();
    });
  });

  describe('open-external handler', () => {
    it('delegates to shell.openExternal', async () => {
      const handler = getHandler(IPC_CHANNELS.OPEN_EXTERNAL)!;
      await handler({}, 'https://example.com');
      expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('does nothing for empty URL', async () => {
      const handler = getHandler(IPC_CHANNELS.OPEN_EXTERNAL)!;
      await handler({}, '');
      expect(shell.openExternal).not.toHaveBeenCalled();
    });
  });

  describe('file operation handlers', () => {
    it('file:open-dialog returns file paths or canceled', async () => {
      const handler = getHandler(IPC_CHANNELS.FILE_OPEN_DIALOG)!;
      const result = await handler();
      expect(result).toHaveProperty('canceled');
      expect(result).toHaveProperty('filePaths');
    });

    it('file:read-content reads file and returns content', async () => {
      const handler = getHandler(IPC_CHANNELS.FILE_READ_CONTENT)!;
      const result = await handler({}, '/tmp/test.json');
      expect(result.success).toBe(true);
      expect(result.content).toBe('file-content');
    });

    it('file:read-binary reads file as base64', async () => {
      const handler = getHandler(IPC_CHANNELS.FILE_READ_BINARY)!;
      const result = await handler({}, '/tmp/test.bin');
      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/test.bin');
    });
  });

  describe('import handlers', () => {
    it('import:parse-preview returns parsed preview', async () => {
      const handler = getHandler(IPC_CHANNELS.IMPORT_PARSE_PREVIEW)!;
      const result = await handler({}, '{"info":{"schema":"postman"}}');
      expect(result).toHaveProperty('success');
    });

    it('import:commit merges imported collections into state', async () => {
      vi.mocked(storeManager.getState).mockReturnValue(createState());
      const handler = getHandler(IPC_CHANNELS.IMPORT_COMMIT)!;
      const preview = {
        rootFolder: {
          id: 'root',
          name: 'Import',
          type: 'folder' as const,
          children: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        environments: [],
      };
      const result = await handler({}, preview);
      expect(result.success).toBe(true);
      expect(storeManager.setState).toHaveBeenCalled();
    });
  });

  describe('notepad handlers', () => {
    it('notepad:save-file saves content to file', async () => {
      const handler = getHandler(IPC_CHANNELS.NOTEPAD_SAVE_FILE)!;
      const result = await handler({}, {
        filePath: '/tmp/test.txt',
        content: 'Hello World',
      });
      expect(result).toHaveProperty('canceled');
    });

    it('notepad:open-file opens dialog and reads file', async () => {
      const handler = getHandler(IPC_CHANNELS.NOTEPAD_OPEN_FILE)!;
      const result = await handler();
      expect(result).toHaveProperty('filePath');
    });

    it('notepad:read-file reads file content', async () => {
      const handler = getHandler(IPC_CHANNELS.NOTEPAD_READ_FILE)!;
      const result = await handler({}, '/tmp/test.txt');
      expect(result.content).toBe('file-content');
    });

    it('notepad:reveal shows item in folder', async () => {
      const handler = getHandler(IPC_CHANNELS.NOTEPAD_REVEAL)!;
      const result = await handler({}, '/tmp/test.txt');
      expect(result).toBe(true);
    });

    it('notepad:reveal returns false for empty path', async () => {
      const handler = getHandler(IPC_CHANNELS.NOTEPAD_REVEAL)!;
      const result = await handler({}, '');
      expect(result).toBe(false);
    });
  });

  describe('ai:send-message handler', () => {
    it('delegates to aiEngine.sendMessage with stream callback', async () => {
      const handler = getHandler(IPC_CHANNELS.AI_SEND_MESSAGE)!;
      const mockEvent = { sender: { send: vi.fn() } };
      const result = await handler(mockEvent, {
        sessionId: 'session-1',
        message: 'Hello',
      });
      expect(aiEngine.sendMessage).toHaveBeenCalled();
      expect(result).toHaveProperty('requestId');
    });
  });
});
