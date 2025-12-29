import * as http from 'http';
import { BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../../../shared/ipc';
import {
  MockServerDefinition,
  MockRoute,
  MockServerRuntimeStatus,
  MockServerIpcResponse,
  MockServerListResponse,
  MockServerCreateParams,
  MockServerUpdateParams,
  MockRouteCreateParams,
  MockRouteUpdateParams,
  MockRouteDeleteParams,
  MockRouteToggleParams,
  MockServerStatusChangedEvent,
} from '../../../shared/types';
import { RunningServerInfo, redactHeaders, delay, matchPath, getMatchSpecificity } from './mock-server-utils';
import { mockServerResponseHandler } from './mock-server-response-handler';
import { getMockServersState, saveMockServersState } from './mock-server-store';
import { mockRouteManager } from './mock-route-manager';

class MockServerManager {
  private runningServers = new Map<string, RunningServerInfo>();

  /**
   * Emit status changed event to all renderer windows
   */
  private emitStatusChanged(event: MockServerStatusChangedEvent): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      window.webContents.send(IPC_CHANNELS.MOCKSERVER_STATUS_CHANGED, event);
    });
  }

  /**
   * List all server definitions with runtime status
   */
  list(): MockServerIpcResponse<MockServerListResponse> {
    const state = getMockServersState();
    const runtimeStatus: MockServerRuntimeStatus[] = state.servers.map((server) => ({
      serverId: server.id,
      isRunning: this.runningServers.has(server.id),
    }));
    return {
      success: true,
      data: { servers: state.servers, runtimeStatus },
    };
  }

  /**
   * Create a new mock server definition
   */
  createServer(params: MockServerCreateParams): MockServerIpcResponse<MockServerDefinition> {
    const state = getMockServersState();
    const now = Date.now();
    const newServer: MockServerDefinition = {
      id: randomUUID(),
      name: params.name || 'New Server',
      host: params.host || '127.0.0.1',
      port: params.port ?? null,
      routes: [],
      createdAt: now,
      updatedAt: now,
    };
    state.servers.push(newServer);
    saveMockServersState(state);
    return { success: true, data: newServer };
  }

  /**
   * Update an existing mock server definition
   */
  updateServer(params: MockServerUpdateParams): MockServerIpcResponse<MockServerDefinition> {
    const state = getMockServersState();
    const serverIndex = state.servers.findIndex((s) => s.id === params.serverId);
    if (serverIndex === -1) {
      return { success: false, error: 'Server not found' };
    }
    const server = state.servers[serverIndex];
    if (params.name !== undefined) server.name = params.name;
    if (params.host !== undefined) server.host = params.host;
    if (params.port !== undefined) server.port = params.port;
    server.updatedAt = Date.now();
    saveMockServersState(state);
    return { success: true, data: server };
  }

  /**
   * Delete a mock server definition
   */
  deleteServer(serverId: string): MockServerIpcResponse<void> {
    // Stop server if running
    if (this.runningServers.has(serverId)) {
      this.stopServer(serverId);
    }
    const state = getMockServersState();
    const serverIndex = state.servers.findIndex((s) => s.id === serverId);
    if (serverIndex === -1) {
      return { success: false, error: 'Server not found' };
    }
    state.servers.splice(serverIndex, 1);
    saveMockServersState(state);
    return { success: true };
  }

  /**
   * Start a mock server
   */
  startServer(serverId: string): Promise<MockServerIpcResponse<void>> {
    if (this.runningServers.has(serverId)) {
      return Promise.resolve({ success: false, error: 'Server is already running' });
    }
    const state = getMockServersState();
    const serverDef = state.servers.find((s) => s.id === serverId);
    if (!serverDef) {
      return Promise.resolve({ success: false, error: 'Server not found' });
    }
    if (serverDef.port === null || serverDef.port === undefined) {
      return Promise.resolve({ success: false, error: 'Port is not configured' });
    }

    const server = http.createServer((req, res) => {
      this.handleRequest(serverId, req, res);
    });

    const port = serverDef.port;
    const host = serverDef.host;

    return new Promise<MockServerIpcResponse<void>>((resolve) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        let errorMessage = err.message;
        if (err.code === 'EADDRINUSE') {
          errorMessage = `Port ${port} is already in use`;
        } else if (err.code === 'EACCES') {
          errorMessage = `Permission denied to bind to port ${port}`;
        }
        this.emitStatusChanged({ serverId, isRunning: false, error: errorMessage });
        resolve({ success: false, error: errorMessage });
      });

      server.listen(port, host, () => {
        this.runningServers.set(serverId, { server, serverId });
        console.log(`[MockServer] Started server "${serverDef.name}" on ${host}:${port}`);
        this.emitStatusChanged({ serverId, isRunning: true });
        resolve({ success: true });
      });
    });
  }

  /**
   * Stop a running mock server
   */
  stopServer(serverId: string): Promise<MockServerIpcResponse<void>> {
    const runningInfo = this.runningServers.get(serverId);
    if (!runningInfo) {
      return Promise.resolve({ success: false, error: 'Server is not running' });
    }
    return new Promise<MockServerIpcResponse<void>>((resolve) => {
      runningInfo.server.close((err) => {
        this.runningServers.delete(serverId);
        if (err) {
          console.error(`[MockServer] Error stopping server ${serverId}:`, err.message);
        }
        console.log(`[MockServer] Stopped server ${serverId}`);
        this.emitStatusChanged({ serverId, isRunning: false });
        resolve({ success: true });
      });
    });
  }

  /**
   * Add a route to a server
   */
  addRoute(params: MockRouteCreateParams): MockServerIpcResponse<MockRoute> {
    return mockRouteManager.addRoute(params);
  }

  /**
   * Update an existing route
   */
  updateRoute(params: MockRouteUpdateParams): MockServerIpcResponse<MockRoute> {
    return mockRouteManager.updateRoute(params);
  }

  /**
   * Delete a route from a server
   */
  deleteRoute(params: MockRouteDeleteParams): MockServerIpcResponse<void> {
    return mockRouteManager.deleteRoute(params);
  }

  /**
   * Toggle a route's enabled status
   */
  toggleRoute(params: MockRouteToggleParams): MockServerIpcResponse<MockRoute> {
    return mockRouteManager.toggleRoute(params);
  }

  /**
   * Get runtime status for all servers
   */
  getRuntimeStatus(): MockServerRuntimeStatus[] {
    const state = getMockServersState();
    return state.servers.map((server) => ({
      serverId: server.id,
      isRunning: this.runningServers.has(server.id),
    }));
  }

  /**
   * Stop all running servers (for graceful shutdown)
   */
  async stopAllServers(): Promise<void> {
    const promises: Promise<MockServerIpcResponse<void>>[] = [];
    for (const serverId of this.runningServers.keys()) {
      promises.push(Promise.resolve(this.stopServer(serverId)));
    }
    await Promise.all(promises);
  }

  /**
   * Handle an incoming HTTP request
   */
  private async handleRequest(
    serverId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const state = getMockServersState();
    const serverDef = state.servers.find((s) => s.id === serverId);

    if (!serverDef) {
      mockServerResponseHandler.sendJsonResponse(res, 500, { error: 'Server configuration not found' });
      return;
    }

    const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
    const method = (req.method || 'GET').toUpperCase();

    console.log(`[MockServer] ${serverDef.name} - ${method} ${urlPath}`, {
      headers: redactHeaders(req.headers as Record<string, string>),
    });

    // Find matching routes with their specificity scores
    const matchingRoutes = serverDef.routes
      .filter((route) => {
        if (!route.enabled || route.method !== method) return false;
        const matchType = route.pathMatchType || 'exact';
        return matchPath(route.path, urlPath, matchType);
      })
      .map((route) => ({
        route,
        specificity: getMatchSpecificity(route.path, route.pathMatchType || 'exact'),
      }))
      .sort((a, b) => b.specificity - a.specificity);

    // Use the most specific match
    const matchedRoute = matchingRoutes[0]?.route;

    if (!matchedRoute) {
      mockServerResponseHandler.sendJsonResponse(res, 404, {
        error: 'No mock matched',
        method,
        path: urlPath,
      });
      return;
    }

    console.log(`[MockServer] Matched route: ${matchedRoute.path} (${matchedRoute.pathMatchType || 'exact'})`);

    // Apply delay if configured
    if (matchedRoute.delayMs && matchedRoute.delayMs > 0) {
      await delay(matchedRoute.delayMs);
    }

    try {
      await mockServerResponseHandler.sendRouteResponse(res, matchedRoute);
    } catch (err) {
      console.error(`[MockServer] Error sending response:`, err);
      mockServerResponseHandler.sendJsonResponse(res, 500, {
        error: 'Internal mock server error',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export const mockServerManager = new MockServerManager();
