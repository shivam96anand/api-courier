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

import { ipcMain } from 'electron';
import { storeManager } from '../store-manager';
import { requestManager } from '../request-manager';
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
});
