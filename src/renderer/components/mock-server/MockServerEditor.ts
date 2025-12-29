/**
 * Mock Server Editor Component
 * Renders the editor for a selected mock server
 */
import {
  MockServerDefinition,
  MockServerRuntimeStatus,
  MockRoute,
  MockHttpMethod,
  MockResponseType,
} from '../MockServerTabManager';
import { MockRouteEditor } from './MockRouteEditor';

type ServerUpdateFn = (serverId: string, updates: { name?: string; host?: string; port?: number | null }) => void;
type ServerIdFn = (serverId: string) => void;
type RouteAddFn = (serverId: string, route: Omit<MockRoute, 'id'>) => void;
type RouteUpdateFn = (serverId: string, routeId: string, updates: Partial<Omit<MockRoute, 'id'>>) => void;
type RouteDeleteFn = (serverId: string, routeId: string) => void;
type RouteToggleFn = (serverId: string, routeId: string, enabled: boolean) => void;

export class MockServerEditor {
  onServerUpdate: ServerUpdateFn | null = null;
  onServerStart: ServerIdFn | null = null;
  onServerStop: ServerIdFn | null = null;
  onRouteAdd: RouteAddFn | null = null;
  onRouteUpdate: RouteUpdateFn | null = null;
  onRouteDelete: RouteDeleteFn | null = null;
  onRouteToggle: RouteToggleFn | null = null;

  private routeEditor: MockRouteEditor;
  private editingRouteId: string | null = null;

  constructor() {
    this.routeEditor = new MockRouteEditor();
  }

  render(
    container: HTMLElement,
    server: MockServerDefinition,
    status: MockServerRuntimeStatus | undefined
  ): void {
    const isRunning = status?.isRunning ?? false;
    const error = status?.error;

    container.innerHTML = `
      <div class="mock-server-editor">
        <div class="mock-server-editor-header">
          <div class="mock-server-config">
            <div class="mock-server-config-row">
              <label>Name</label>
              <input type="text" class="mock-input" id="server-name" value="${this.escapeAttr(server.name)}" />
            </div>
            <div class="mock-server-config-row">
              <label>Host</label>
              <input type="text" class="mock-input" id="server-host" value="${this.escapeAttr(server.host)}" />
            </div>
            <div class="mock-server-config-row">
              <label>Port</label>
              <input type="number" class="mock-input" id="server-port" value="${server.port ?? ''}" placeholder="e.g. 8080" />
            </div>
          </div>
          <div class="mock-server-controls">
            <button class="btn-mock ${isRunning ? 'btn-stop' : 'btn-start'}" id="toggle-server-btn">
              ${isRunning ? 'Stop' : 'Start'}
            </button>
            ${error ? `<div class="mock-server-error">${this.escapeHtml(error)}</div>` : ''}
            ${isRunning ? `<div class="mock-server-running-badge">Running on ${server.host}:${server.port}</div>` : ''}
          </div>
        </div>

        <div class="mock-routes-section">
          <div class="mock-routes-header">
            <h4>Routes</h4>
            <button class="btn-add-route" id="add-route-btn">+ Add Route</button>
          </div>
          <div class="mock-routes-list" id="routes-list">
            ${this.renderRoutesList(server.routes)}
          </div>
          <div class="mock-route-editor-panel" id="route-editor-panel" style="display: none;">
            <!-- Route editor will be rendered here -->
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners(container, server);
  }

  private renderRoutesList(routes: MockRoute[]): string {
    if (routes.length === 0) {
      return `<div class="mock-routes-empty">No routes configured. Click "Add Route" to create one.</div>`;
    }

    return `
      <table class="mock-routes-table">
        <thead>
          <tr>
            <th>Enabled</th>
            <th>Method</th>
            <th>Path</th>
            <th>Status</th>
            <th>Type</th>
            <th>Delay</th>
            <th class="route-actions-header">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${routes.map((route) => this.renderRouteRow(route)).join('')}
        </tbody>
      </table>
    `;
  }

  private renderRouteRow(route: MockRoute): string {
    const matchType = route.pathMatchType || 'exact';
    const matchTypeIcon = this.getMatchTypeIcon(matchType);
    const matchTypeTitle = this.getMatchTypeTitle(matchType);

    return `
      <tr class="mock-route-row ${route.enabled ? '' : 'disabled'}" data-route-id="${route.id}">
        <td>
          <input type="checkbox" class="route-enabled-toggle" ${route.enabled ? 'checked' : ''} data-route-id="${route.id}" />
        </td>
        <td><span class="method-badge method-${route.method.toLowerCase()}">${route.method}</span></td>
        <td class="route-path">
          <span class="path-match-type-indicator" title="${matchTypeTitle}">${matchTypeIcon}</span>
          ${this.escapeHtml(route.path)}
        </td>
        <td>${route.statusCode}</td>
        <td>${route.responseType}</td>
        <td>${route.delayMs ? `${route.delayMs}ms` : '-'}</td>
        <td class="route-actions">
          <button class="btn-icon btn-edit-route" data-route-id="${route.id}" title="Edit">✎</button>
          <button class="btn-icon btn-test-route" data-route-id="${route.id}" title="Test">▶</button>
          <button class="btn-icon btn-delete-route" data-route-id="${route.id}" title="Delete">×</button>
        </td>
      </tr>
    `;
  }

  private getMatchTypeIcon(matchType: string): string {
    switch (matchType) {
      case 'exact':
        return '<span class="match-icon match-exact">=</span>';
      case 'prefix':
        return '<span class="match-icon match-prefix">▸</span>';
      case 'wildcard':
        return '<span class="match-icon match-wildcard">*</span>';
      case 'regex':
        return '<span class="match-icon match-regex">.*</span>';
      default:
        return '<span class="match-icon match-exact">=</span>';
    }
  }

  private getMatchTypeTitle(matchType: string): string {
    switch (matchType) {
      case 'exact':
        return 'Exact match';
      case 'prefix':
        return 'Prefix match';
      case 'wildcard':
        return 'Wildcard match (* for single segment, ** for multiple)';
      case 'regex':
        return 'Regular expression match';
      default:
        return 'Exact match';
    }
  }

  private setupEventListeners(container: HTMLElement, server: MockServerDefinition): void {
    // Server config changes
    const nameInput = container.querySelector('#server-name') as HTMLInputElement;
    const hostInput = container.querySelector('#server-host') as HTMLInputElement;
    const portInput = container.querySelector('#server-port') as HTMLInputElement;

    nameInput?.addEventListener('change', () => {
      this.onServerUpdate?.(server.id, { name: nameInput.value });
    });

    hostInput?.addEventListener('change', () => {
      this.onServerUpdate?.(server.id, { host: hostInput.value });
    });

    portInput?.addEventListener('change', () => {
      const port = portInput.value ? parseInt(portInput.value, 10) : null;
      this.onServerUpdate?.(server.id, { port });
    });

    // Start/Stop button
    const toggleBtn = container.querySelector('#toggle-server-btn');
    toggleBtn?.addEventListener('click', () => {
      const status = toggleBtn.classList.contains('btn-stop');
      if (status) {
        this.onServerStop?.(server.id);
      } else {
        this.onServerStart?.(server.id);
      }
    });

    // Add route button
    const addRouteBtn = container.querySelector('#add-route-btn');
    addRouteBtn?.addEventListener('click', () => {
      this.showRouteEditor(container, server, null);
    });

    // Route toggle checkboxes
    container.querySelectorAll('.route-enabled-toggle').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const routeId = (checkbox as HTMLElement).dataset.routeId;
        if (routeId) {
          this.onRouteToggle?.(server.id, routeId, (e.target as HTMLInputElement).checked);
        }
      });
    });

    // Edit route buttons
    container.querySelectorAll('.btn-edit-route').forEach((btn) => {
      btn.addEventListener('click', () => {
        const routeId = (btn as HTMLElement).dataset.routeId;
        const route = server.routes.find((r) => r.id === routeId);
        if (route) {
          this.showRouteEditor(container, server, route);
        }
      });
    });

    // Delete route buttons
    container.querySelectorAll('.btn-delete-route').forEach((btn) => {
      btn.addEventListener('click', () => {
        const routeId = (btn as HTMLElement).dataset.routeId;
        if (routeId && confirm('Delete this route?')) {
          this.onRouteDelete?.(server.id, routeId);
        }
      });
    });

    // Test route buttons
    container.querySelectorAll('.btn-test-route').forEach((btn) => {
      btn.addEventListener('click', () => {
        const routeId = (btn as HTMLElement).dataset.routeId;
        const route = server.routes.find((r) => r.id === routeId);
        if (route) {
          this.testRoute(server, route);
        }
      });
    });
  }

  private showRouteEditor(container: HTMLElement, server: MockServerDefinition, route: MockRoute | null): void {
    const panel = container.querySelector('#route-editor-panel') as HTMLElement;
    if (!panel) return;

    panel.style.display = 'block';
    this.editingRouteId = route?.id ?? null;

    this.routeEditor.render(panel, route);

    this.routeEditor.onSave = (routeData) => {
      if (this.editingRouteId) {
        this.onRouteUpdate?.(server.id, this.editingRouteId, routeData);
      } else {
        this.onRouteAdd?.(server.id, routeData as Omit<MockRoute, 'id'>);
      }
      panel.style.display = 'none';
      this.editingRouteId = null;
    };

    this.routeEditor.onCancel = () => {
      panel.style.display = 'none';
      this.editingRouteId = null;
    };
  }

  private async testRoute(server: MockServerDefinition, route: MockRoute): Promise<void> {
    if (server.port === null) {
      alert('Server port is not configured');
      return;
    }

    const url = `http://${server.host}:${server.port}${route.path}`;

    try {
      const options: RequestInit = {
        method: route.method,
      };

      const response = await fetch(url, options);
      const body = await response.text();

      // Show result in a simple alert (could be improved with a modal)
      let preview = body;
      if (preview.length > 500) {
        preview = preview.substring(0, 500) + '...';
      }

      alert(`Status: ${response.status} ${response.statusText}\n\nBody:\n${preview}`);
    } catch (error) {
      alert(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private escapeAttr(str: string): string {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
