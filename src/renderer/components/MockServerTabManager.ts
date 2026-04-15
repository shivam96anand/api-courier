/**
 * Mock Server Tab Manager
 * Main component for the Mock Server tab in the renderer
 */
import { MockServerList } from './mock-server/MockServerList';
import { MockServerEditor } from './mock-server/MockServerEditor';

// Types mirrored from shared/types.ts for renderer usage
export type MockResponseType = 'json' | 'text' | 'binary' | 'file';
export type MockHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Path matching strategies for mock routes:
 * - 'exact': Path must match exactly (default)
 * - 'prefix': Path must start with the specified prefix (e.g., /api/* matches /api/users, /api/products)
 * - 'wildcard': Supports * for single segment and ** for multiple segments
 * - 'regex': Path is treated as a regular expression pattern
 */
export type MockPathMatchType = 'exact' | 'prefix' | 'wildcard' | 'regex';

export interface MockRouteHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface MockRoute {
  id: string;
  enabled: boolean;
  method: MockHttpMethod;
  path: string;
  pathMatchType?: MockPathMatchType;
  statusCode: number;
  headers: MockRouteHeader[];
  delayMs?: number;
  responseType: MockResponseType;
  body: string;
  contentType?: string;
}

export interface MockServerDefinition {
  id: string;
  name: string;
  host: string;
  port: number | null;
  routes: MockRoute[];
  createdAt: number;
  updatedAt: number;
}

export interface MockServerRuntimeStatus {
  serverId: string;
  isRunning: boolean;
  error?: string;
}

export class MockServerTabManager {
  private container: HTMLElement;
  private serverList: MockServerList;
  private serverEditor: MockServerEditor;
  private servers: MockServerDefinition[] = [];
  private runtimeStatus: MockServerRuntimeStatus[] = [];
  private selectedServerId: string | null = null;
  private statusCleanup: (() => void) | null = null;

  constructor() {
    this.container = document.getElementById('mock-server-tab')!;
    this.serverList = new MockServerList();
    this.serverEditor = new MockServerEditor();
  }

  async initialize(): Promise<void> {
    this.render();
    this.setupEventListeners();
    await this.loadServers();
    this.setupIpcListeners();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="mock-server-container">
        <div class="mock-server-sidebar">
          <div class="mock-server-sidebar-header">
            <h3>Mock Servers</h3>
            <button class="btn-add-server" id="add-server-btn" title="Add New Server">+</button>
          </div>
          <div id="mock-server-list" class="mock-server-list"></div>
        </div>
        <div class="mock-server-main">
          <div id="mock-server-editor" class="mock-server-editor-container">
            <div class="empty-state">
              <h3>No Server Selected</h3>
              <p>Select a server from the list or create a new one</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Add server button
    const addBtn = this.container.querySelector('#add-server-btn');
    addBtn?.addEventListener('click', () => this.handleAddServer());

    // Server selection from list
    this.serverList.onSelect = (serverId) => this.handleServerSelect(serverId);
    this.serverList.onDelete = (serverId) => this.handleDeleteServer(serverId);

    // Editor events
    this.serverEditor.onServerUpdate = (serverId, updates) =>
      this.handleServerUpdate(serverId, updates);
    this.serverEditor.onServerStart = (serverId) =>
      this.handleServerStart(serverId);
    this.serverEditor.onServerStop = (serverId) =>
      this.handleServerStop(serverId);
    this.serverEditor.onRouteAdd = (serverId, route) =>
      this.handleRouteAdd(serverId, route);
    this.serverEditor.onRouteUpdate = (serverId, routeId, updates) =>
      this.handleRouteUpdate(serverId, routeId, updates);
    this.serverEditor.onRouteDelete = (serverId, routeId) =>
      this.handleRouteDelete(serverId, routeId);
    this.serverEditor.onRouteToggle = (serverId, routeId, enabled) =>
      this.handleRouteToggle(serverId, routeId, enabled);
  }

  private setupIpcListeners(): void {
    this.statusCleanup = window.restbro.mockServer.onStatusChanged((event) => {
      this.handleStatusChanged(event);
    });
  }

  private async loadServers(): Promise<void> {
    try {
      const result = await window.restbro.mockServer.list();
      if (result.success && result.data) {
        this.servers = result.data.servers;
        this.runtimeStatus = result.data.runtimeStatus;
        this.renderServerList();
      }
    } catch (error) {
      console.error('Failed to load mock servers:', error);
    }
  }

  private renderServerList(): void {
    const listContainer = this.container.querySelector('#mock-server-list');
    if (listContainer) {
      this.serverList.render(
        listContainer as HTMLElement,
        this.servers,
        this.runtimeStatus,
        this.selectedServerId
      );
    }
  }

  private renderEditor(): void {
    const editorContainer = this.container.querySelector('#mock-server-editor');
    if (!editorContainer) return;

    if (!this.selectedServerId) {
      editorContainer.innerHTML = `
        <div class="empty-state">
          <h3>No Server Selected</h3>
          <p>Select a server from the list or create a new one</p>
        </div>
      `;
      return;
    }

    const server = this.servers.find((s) => s.id === this.selectedServerId);
    const status = this.runtimeStatus.find(
      (s) => s.serverId === this.selectedServerId
    );
    if (server) {
      this.serverEditor.render(editorContainer as HTMLElement, server, status);
    }
  }

  private handleServerSelect(serverId: string): void {
    this.selectedServerId = serverId;
    this.renderServerList();
    this.renderEditor();
  }

  private async handleAddServer(): Promise<void> {
    try {
      const result = await window.restbro.mockServer.createServer({
        name: 'New Server',
        host: '127.0.0.1',
        port: null,
      });
      if (result.success && result.data) {
        this.servers.push(result.data);
        this.runtimeStatus.push({ serverId: result.data.id, isRunning: false });
        this.selectedServerId = result.data.id;
        this.renderServerList();
        this.renderEditor();
      }
    } catch (error) {
      console.error('Failed to create server:', error);
    }
  }

  private async handleDeleteServer(serverId: string): Promise<void> {
    try {
      const result = await window.restbro.mockServer.deleteServer(serverId);
      if (result.success) {
        this.servers = this.servers.filter((s) => s.id !== serverId);
        this.runtimeStatus = this.runtimeStatus.filter(
          (s) => s.serverId !== serverId
        );
        if (this.selectedServerId === serverId) {
          this.selectedServerId =
            this.servers.length > 0 ? this.servers[0].id : null;
        }
        this.renderServerList();
        this.renderEditor();
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  }

  private async handleServerUpdate(
    serverId: string,
    updates: { name?: string; host?: string; port?: number | null }
  ): Promise<void> {
    try {
      const result = await window.restbro.mockServer.updateServer({
        serverId,
        ...updates,
      });
      if (result.success && result.data) {
        const index = this.servers.findIndex((s) => s.id === serverId);
        if (index !== -1) {
          this.servers[index] = result.data;
          this.renderServerList();
        }
      }
    } catch (error) {
      console.error('Failed to update server:', error);
    }
  }

  private async handleServerStart(serverId: string): Promise<void> {
    try {
      const result = await window.restbro.mockServer.startServer(serverId);
      if (!result.success) {
        // Show error in editor
        const status = this.runtimeStatus.find((s) => s.serverId === serverId);
        if (status) {
          status.error = result.error;
        }
        this.renderEditor();
      }
    } catch (error) {
      console.error('Failed to start server:', error);
    }
  }

  private async handleServerStop(serverId: string): Promise<void> {
    try {
      await window.restbro.mockServer.stopServer(serverId);
    } catch (error) {
      console.error('Failed to stop server:', error);
    }
  }

  private async handleRouteAdd(
    serverId: string,
    route: Omit<MockRoute, 'id'>
  ): Promise<void> {
    try {
      const result = await window.restbro.mockServer.addRoute({
        serverId,
        route,
      });
      if (result.success && result.data) {
        const server = this.servers.find((s) => s.id === serverId);
        if (server) {
          server.routes.push(result.data);
          this.renderEditor();
        }
      }
    } catch (error) {
      console.error('Failed to add route:', error);
    }
  }

  private async handleRouteUpdate(
    serverId: string,
    routeId: string,
    updates: Partial<Omit<MockRoute, 'id'>>
  ): Promise<void> {
    try {
      const result = await window.restbro.mockServer.updateRoute({
        serverId,
        routeId,
        updates,
      });
      if (result.success && result.data) {
        const server = this.servers.find((s) => s.id === serverId);
        if (server) {
          const routeIndex = server.routes.findIndex((r) => r.id === routeId);
          if (routeIndex !== -1) {
            server.routes[routeIndex] = result.data;
            this.renderEditor();
          }
        }
      }
    } catch (error) {
      console.error('Failed to update route:', error);
    }
  }

  private async handleRouteDelete(
    serverId: string,
    routeId: string
  ): Promise<void> {
    try {
      const result = await window.restbro.mockServer.deleteRoute({
        serverId,
        routeId,
      });
      if (result.success) {
        const server = this.servers.find((s) => s.id === serverId);
        if (server) {
          server.routes = server.routes.filter((r) => r.id !== routeId);
          this.renderEditor();
        }
      }
    } catch (error) {
      console.error('Failed to delete route:', error);
    }
  }

  private async handleRouteToggle(
    serverId: string,
    routeId: string,
    enabled: boolean
  ): Promise<void> {
    try {
      const result = await window.restbro.mockServer.toggleRoute({
        serverId,
        routeId,
        enabled,
      });
      if (result.success && result.data) {
        const server = this.servers.find((s) => s.id === serverId);
        if (server) {
          const route = server.routes.find((r) => r.id === routeId);
          if (route) {
            route.enabled = result.data.enabled;
          }
        }
      }
    } catch (error) {
      console.error('Failed to toggle route:', error);
    }
  }

  private handleStatusChanged(event: {
    serverId: string;
    isRunning: boolean;
    error?: string;
  }): void {
    const status = this.runtimeStatus.find(
      (s) => s.serverId === event.serverId
    );
    if (status) {
      status.isRunning = event.isRunning;
      status.error = event.error;
    } else {
      this.runtimeStatus.push({
        serverId: event.serverId,
        isRunning: event.isRunning,
        error: event.error,
      });
    }
    this.renderServerList();
    if (this.selectedServerId === event.serverId) {
      this.renderEditor();
    }
  }

  destroy(): void {
    if (this.statusCleanup) {
      this.statusCleanup();
    }
  }
}
