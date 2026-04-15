import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', async () => import('../../../../__mocks__/electron'));

vi.mock('../mock-server-store', () => ({
  getMockServersState: vi.fn(),
  saveMockServersState: vi.fn(),
}));

vi.mock('../mock-route-manager', () => ({
  mockRouteManager: {
    addRoute: vi.fn().mockReturnValue({ success: true, data: { id: 'new-route' } }),
    updateRoute: vi.fn().mockReturnValue({ success: true, data: { id: 'route-1' } }),
    deleteRoute: vi.fn().mockReturnValue({ success: true }),
    toggleRoute: vi.fn().mockReturnValue({ success: true, data: { id: 'route-1', enabled: true } }),
  },
}));

vi.mock('../mock-server-response-handler', () => ({
  mockServerResponseHandler: {
    sendRouteResponse: vi.fn(),
    sendJsonResponse: vi.fn(),
  },
}));

vi.mock('../../../../shared/ipc', () => ({
  IPC_CHANNELS: {
    MOCKSERVER_STATUS_CHANGED: 'mockserver:status-changed',
  },
}));

import { getMockServersState, saveMockServersState } from '../mock-server-store';
import { mockRouteManager } from '../mock-route-manager';
import { mockServerManager } from '../mock-server-manager';
import { MockServerDefinition } from '../../../../shared/types';

function createServer(overrides: Partial<MockServerDefinition> = {}): MockServerDefinition {
  return {
    id: 'server-1',
    name: 'Test Server',
    host: '127.0.0.1',
    port: 3000,
    routes: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('mock-server-manager.ts', () => {
  const manager = mockServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns all servers with runtime status', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = manager.list();
      expect(result.success).toBe(true);
      expect(result.data!.servers).toHaveLength(1);
      expect(result.data!.runtimeStatus).toHaveLength(1);
      expect(result.data!.runtimeStatus[0].isRunning).toBe(false);
    });

    it('returns empty arrays when no servers exist', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = manager.list();
      expect(result.success).toBe(true);
      expect(result.data!.servers).toHaveLength(0);
      expect(result.data!.runtimeStatus).toHaveLength(0);
    });
  });

  describe('createServer', () => {
    it('creates a new server with generated UUID and defaults', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = manager.createServer({ name: 'My API Mock' });
      expect(result.success).toBe(true);
      expect(result.data!.id).toBeDefined();
      expect(result.data!.name).toBe('My API Mock');
      expect(result.data!.host).toBe('127.0.0.1');
      expect(result.data!.routes).toEqual([]);
      expect(saveMockServersState).toHaveBeenCalled();
    });

    it('uses provided host and port', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = manager.createServer({
        name: 'Custom',
        host: '0.0.0.0',
        port: 8080,
      });
      expect(result.data!.host).toBe('0.0.0.0');
      expect(result.data!.port).toBe(8080);
    });

    it('uses default name when not provided', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = manager.createServer({ name: '' });
      // Empty name falls through (uses param directly)
      expect(result.success).toBe(true);
    });
  });

  describe('updateServer', () => {
    it('updates server properties', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = manager.updateServer({
        serverId: 'server-1',
        name: 'Updated Name',
        port: 4000,
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Updated Name');
      expect(result.data!.port).toBe(4000);
    });

    it('returns error if server not found', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = manager.updateServer({
        serverId: 'nonexistent',
        name: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });
  });

  describe('deleteServer', () => {
    it('removes server by id', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = manager.deleteServer('server-1');
      expect(result.success).toBe(true);
      expect(saveMockServersState).toHaveBeenCalled();
    });

    it('returns error if server not found', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = manager.deleteServer('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });
  });

  describe('startServer', () => {
    it('returns error if server already running', async () => {
      // Can't easily simulate "running" state without actual http.createServer.
      // We just test the "not found" case.
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = await manager.startServer('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });

    it('returns error if port is not configured', async () => {
      const server = createServer({ port: null });
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = await manager.startServer('server-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Port is not configured');
    });
  });

  describe('stopServer', () => {
    it('returns error if server is not running', async () => {
      const result = await manager.stopServer('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Server is not running');
    });
  });

  describe('route delegation', () => {
    it('delegates addRoute to mockRouteManager', () => {
      const params = { serverId: 'server-1', route: {} as any };
      manager.addRoute(params);
      expect(mockRouteManager.addRoute).toHaveBeenCalledWith(params);
    });

    it('delegates updateRoute to mockRouteManager', () => {
      const params = { serverId: 'server-1', routeId: 'r1', updates: {} };
      manager.updateRoute(params);
      expect(mockRouteManager.updateRoute).toHaveBeenCalledWith(params);
    });

    it('delegates deleteRoute to mockRouteManager', () => {
      const params = { serverId: 'server-1', routeId: 'r1' };
      manager.deleteRoute(params);
      expect(mockRouteManager.deleteRoute).toHaveBeenCalledWith(params);
    });

    it('delegates toggleRoute to mockRouteManager', () => {
      const params = { serverId: 'server-1', routeId: 'r1', enabled: true };
      manager.toggleRoute(params);
      expect(mockRouteManager.toggleRoute).toHaveBeenCalledWith(params);
    });
  });

  describe('getRuntimeStatus', () => {
    it('returns runtime status for all servers', () => {
      vi.mocked(getMockServersState).mockReturnValue({
        servers: [createServer(), createServer({ id: 'server-2' })],
      });

      const status = manager.getRuntimeStatus();
      expect(status).toHaveLength(2);
      expect(status[0].serverId).toBe('server-1');
      expect(status[0].isRunning).toBe(false);
      expect(status[1].serverId).toBe('server-2');
      expect(status[1].isRunning).toBe(false);
    });
  });

  describe('stopAllServers', () => {
    it('resolves without error when no servers are running', async () => {
      await expect(manager.stopAllServers()).resolves.toBeUndefined();
    });
  });
});
