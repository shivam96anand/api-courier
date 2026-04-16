import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', async () => import('../../../../__mocks__/electron'));

vi.mock('../mock-server-store', () => ({
  getMockServersState: vi.fn(),
  saveMockServersState: vi.fn(),
}));

import {
  getMockServersState,
  saveMockServersState,
} from '../mock-server-store';
import { MockRouteManager } from '../mock-route-manager';
import {
  MockServerDefinition,
  MockRoute,
  MockRouteHeader,
} from '../../../../shared/types';

function createServer(
  overrides: Partial<MockServerDefinition> = {}
): MockServerDefinition {
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

function createRouteInput(): Omit<MockRoute, 'id'> {
  return {
    enabled: true,
    method: 'GET',
    path: '/api/test',
    pathMatchType: 'exact',
    statusCode: 200,
    headers: [
      { key: 'Content-Type', value: 'application/json', enabled: true },
    ],
    responseType: 'json',
    body: '{"message": "ok"}',
  };
}

describe('mock-route-manager.ts', () => {
  let routeManager: MockRouteManager;

  beforeEach(() => {
    vi.clearAllMocks();
    routeManager = new MockRouteManager();
  });

  describe('addRoute', () => {
    it('adds a route with a generated UUID', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = routeManager.addRoute({
        serverId: 'server-1',
        route: createRouteInput(),
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBeDefined();
      expect(result.data!.method).toBe('GET');
      expect(result.data!.path).toBe('/api/test');
    });

    it('persists state after adding route', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      routeManager.addRoute({
        serverId: 'server-1',
        route: createRouteInput(),
      });

      expect(saveMockServersState).toHaveBeenCalled();
    });

    it('returns error if server not found', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = routeManager.addRoute({
        serverId: 'nonexistent',
        route: createRouteInput(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });

    it('pushes route to the server routes array', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      routeManager.addRoute({
        serverId: 'server-1',
        route: createRouteInput(),
      });

      expect(server.routes.length).toBe(1);
    });

    it('updates server updatedAt timestamp', () => {
      const server = createServer({ updatedAt: 1000 });
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      routeManager.addRoute({
        serverId: 'server-1',
        route: createRouteInput(),
      });

      expect(server.updatedAt).toBeGreaterThan(1000);
    });
  });

  describe('updateRoute', () => {
    it('updates route properties', () => {
      const route: MockRoute = { ...createRouteInput(), id: 'route-1' };
      const server = createServer({ routes: [route] });
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = routeManager.updateRoute({
        serverId: 'server-1',
        routeId: 'route-1',
        updates: { statusCode: 404, body: '{"error": "not found"}' },
      });

      expect(result.success).toBe(true);
      expect(result.data!.statusCode).toBe(404);
      expect(result.data!.body).toBe('{"error": "not found"}');
    });

    it('returns error if server not found', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = routeManager.updateRoute({
        serverId: 'nonexistent',
        routeId: 'route-1',
        updates: { statusCode: 404 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });

    it('returns error if route not found', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = routeManager.updateRoute({
        serverId: 'server-1',
        routeId: 'nonexistent',
        updates: { statusCode: 404 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Route not found');
    });
  });

  describe('deleteRoute', () => {
    it('removes route from server', () => {
      const route: MockRoute = { ...createRouteInput(), id: 'route-1' };
      const server = createServer({ routes: [route] });
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = routeManager.deleteRoute({
        serverId: 'server-1',
        routeId: 'route-1',
      });

      expect(result.success).toBe(true);
      expect(server.routes.length).toBe(0);
    });

    it('returns error if server not found', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = routeManager.deleteRoute({
        serverId: 'nonexistent',
        routeId: 'route-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });

    it('returns error if route not found', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = routeManager.deleteRoute({
        serverId: 'server-1',
        routeId: 'nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Route not found');
    });
  });

  describe('toggleRoute', () => {
    it('enables a route', () => {
      const route: MockRoute = {
        ...createRouteInput(),
        id: 'route-1',
        enabled: false,
      };
      const server = createServer({ routes: [route] });
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = routeManager.toggleRoute({
        serverId: 'server-1',
        routeId: 'route-1',
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.enabled).toBe(true);
    });

    it('disables a route', () => {
      const route: MockRoute = {
        ...createRouteInput(),
        id: 'route-1',
        enabled: true,
      };
      const server = createServer({ routes: [route] });
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = routeManager.toggleRoute({
        serverId: 'server-1',
        routeId: 'route-1',
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.data!.enabled).toBe(false);
    });

    it('returns error if server not found', () => {
      vi.mocked(getMockServersState).mockReturnValue({ servers: [] });

      const result = routeManager.toggleRoute({
        serverId: 'nonexistent',
        routeId: 'route-1',
        enabled: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });

    it('returns error if route not found', () => {
      const server = createServer();
      vi.mocked(getMockServersState).mockReturnValue({ servers: [server] });

      const result = routeManager.toggleRoute({
        serverId: 'server-1',
        routeId: 'nonexistent',
        enabled: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Route not found');
    });
  });
});
