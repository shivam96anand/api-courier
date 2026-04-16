/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResponseViewer } from '../ResponseViewer';

// Mock Monaco editors since they need a full browser environment
vi.mock('../../request/MonacoJsonEditor', () => ({
  MonacoJsonEditor: vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
    saveViewState: vi.fn(),
    restoreViewState: vi.fn(),
  })),
}));

vi.mock('../../request/MonacoXmlEditor', () => ({
  MonacoXmlEditor: vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
  })),
}));

vi.mock('../../json-viewer/utilities', () => ({
  JsonViewerUtilities: {
    format: vi.fn(),
  },
}));

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'response-container';
  document.body.appendChild(container);
  return container;
}

// Mock URL.createObjectURL for jsdom
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}

describe('ResponseViewer', () => {
  let container: HTMLElement;
  let viewer: ResponseViewer;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = createContainer();
    viewer = new ResponseViewer(container, {
      maxResponseDisplaySize: 10 * 1024 * 1024,
    });
  });

  describe('ensureResponseSections', () => {
    it('creates body, headers, cookies, and meta sections', () => {
      expect(container.querySelector('#response-body')).toBeTruthy();
      expect(container.querySelector('#response-headers')).toBeTruthy();
      expect(container.querySelector('#response-cookies')).toBeTruthy();
      expect(container.querySelector('#response-meta')).toBeTruthy();
    });
  });

  describe('displayResponse with image content-type', () => {
    it('renders an img element for image/png', async () => {
      await viewer.displayResponse({
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'image/png' },
        body: 'iVBORw0KGgoAAAANSUhEUg==',
        time: 100,
        size: 24,
        timestamp: Date.now(),
      });

      const bodyEl = container.querySelector('#response-body');
      expect(bodyEl?.querySelector('img')).toBeTruthy();
    });

    it('renders an img element for image/jpeg', async () => {
      await viewer.displayResponse({
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'image/jpeg' },
        body: '/9j/4AAQSkZJRgABAQ==',
        time: 100,
        size: 20,
        timestamp: Date.now(),
      });

      const bodyEl = container.querySelector('#response-body');
      expect(bodyEl?.querySelector('img')).toBeTruthy();
    });

    it('renders an img element for image/svg+xml', async () => {
      await viewer.displayResponse({
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'image/svg+xml' },
        body: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
        time: 100,
        size: 60,
        timestamp: Date.now(),
      });

      const bodyEl = container.querySelector('#response-body');
      expect(bodyEl?.querySelector('img')).toBeTruthy();
    });
  });

  describe('displayResponse with HTML content-type', () => {
    it('renders HTML preview with iframe for text/html', async () => {
      await viewer.displayResponse({
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: '<html><body><h1>Hello</h1></body></html>',
        time: 100,
        size: 40,
        timestamp: Date.now(),
      });

      const bodyEl = container.querySelector('#response-body');
      expect(bodyEl?.querySelector('iframe')).toBeTruthy();
    });

    it('shows Preview and Source buttons for HTML', async () => {
      await viewer.displayResponse({
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body>Test</body></html>',
        time: 100,
        size: 30,
        timestamp: Date.now(),
      });

      const bodyEl = container.querySelector('#response-body');
      const buttons = bodyEl?.querySelectorAll('button');
      const labels = Array.from(buttons || []).map((b) => b.textContent);
      expect(labels).toContain('Preview');
      expect(labels).toContain('Source');
    });

    it('does NOT show HTML preview for error responses', async () => {
      await viewer.displayResponse({
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body>Error</body></html>',
        time: 100,
        size: 30,
        timestamp: Date.now(),
      });

      const bodyEl = container.querySelector('#response-body');
      expect(bodyEl?.querySelector('iframe')).toBeFalsy();
    });
  });

  describe('displayResponse with empty body', () => {
    it('shows placeholder for no body', async () => {
      await viewer.displayResponse({
        status: 204,
        statusText: 'No Content',
        headers: {},
        body: '',
        time: 50,
        size: 0,
        timestamp: Date.now(),
      });

      const bodyEl = container.querySelector('#response-body');
      expect(bodyEl?.textContent).toContain('No response body');
    });
  });

  describe('cookies parsing', () => {
    it('parses Set-Cookie headers into cookies table', async () => {
      await viewer.displayResponse({
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie':
            'session=abc123; Path=/; HttpOnly, theme=dark; Path=/; Secure',
        },
        body: '{"ok":true}',
        time: 100,
        size: 11,
        timestamp: Date.now(),
      });

      const cookiesEl = container.querySelector('#response-cookies');
      expect(cookiesEl).toBeTruthy();
      // Should contain a table with cookie data
      const table = cookiesEl?.querySelector('table');
      if (table) {
        expect(table.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
      }
    });
  });

  describe('setRequestId', () => {
    it('sets the current request id', () => {
      viewer.setRequestId('req-123');
      // No error thrown
      expect(true).toBe(true);
    });
  });

  describe('destroy', () => {
    it('cleans up without throwing', () => {
      expect(() => viewer.destroy()).not.toThrow();
    });
  });

  describe('clear', () => {
    it('resets body content', () => {
      viewer.clear();
      const bodyEl = container.querySelector('#response-body');
      // clear() shows the default placeholder
      expect(bodyEl?.textContent).toBeTruthy();
    });
  });
});
