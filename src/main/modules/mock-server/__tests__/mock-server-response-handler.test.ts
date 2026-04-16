import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as http from 'http';
import { MockServerResponseHandler } from '../mock-server-response-handler';
import { MockRoute, MockRouteHeader } from '../../../../shared/types';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'fs/promises';

function createMockRes(): http.ServerResponse {
  const headers: Record<string, string | number> = {};
  const res = {
    statusCode: 200,
    setHeader: vi.fn((key: string, value: string | number) => {
      headers[key] = value;
    }),
    hasHeader: vi.fn((key: string) => key in headers),
    end: vi.fn(),
    _headers: headers,
  };
  return res as unknown as http.ServerResponse;
}

function createRoute(overrides: Partial<MockRoute> = {}): MockRoute {
  return {
    id: 'route-1',
    enabled: true,
    method: 'GET',
    path: '/api/test',
    pathMatchType: 'exact',
    statusCode: 200,
    headers: [],
    responseType: 'json',
    body: '{"message": "ok"}',
    ...overrides,
  };
}

describe('mock-server-response-handler.ts', () => {
  let handler: MockServerResponseHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new MockServerResponseHandler();
  });

  describe('sendRouteResponse — JSON', () => {
    it('sends JSON response with correct status and headers', async () => {
      const res = createMockRes();
      const route = createRoute({
        responseType: 'json',
        body: '{"name": "test"}',
        statusCode: 200,
      });

      await handler.sendRouteResponse(res, route);

      expect(res.statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/json; charset=utf-8'
      );
      expect(res.end).toHaveBeenCalledWith('{"name": "test"}');
    });

    it('sends 500 for invalid JSON body', async () => {
      const res = createMockRes();
      const route = createRoute({
        responseType: 'json',
        body: '{invalid json',
      });

      await handler.sendRouteResponse(res, route);

      expect(res.statusCode).toBe(500);
      expect(res.end).toHaveBeenCalled();
    });

    it('uses default body {} when body is empty', async () => {
      const res = createMockRes();
      const route = createRoute({
        responseType: 'json',
        body: '',
      });

      await handler.sendRouteResponse(res, route);

      expect(res.statusCode).toBe(200);
      expect(res.end).toHaveBeenCalledWith('{}');
    });
  });

  describe('sendRouteResponse — text', () => {
    it('sends text response with correct content type', async () => {
      const res = createMockRes();
      const route = createRoute({
        responseType: 'text',
        body: 'Hello world',
        statusCode: 200,
      });

      await handler.sendRouteResponse(res, route);

      expect(res.statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; charset=utf-8'
      );
      expect(res.end).toHaveBeenCalledWith('Hello world');
    });

    it('uses custom contentType if specified', async () => {
      const res = createMockRes();
      const route = createRoute({
        responseType: 'text',
        body: '<html></html>',
        contentType: 'text/html; charset=utf-8',
      });

      await handler.sendRouteResponse(res, route);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/html; charset=utf-8'
      );
    });
  });

  describe('sendRouteResponse — binary', () => {
    it('sends binary response from base64', async () => {
      const res = createMockRes();
      const base64Content = Buffer.from('binary data').toString('base64');
      const route = createRoute({
        responseType: 'binary',
        body: base64Content,
        statusCode: 200,
      });

      await handler.sendRouteResponse(res, route);

      expect(res.statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/octet-stream'
      );
      expect(res.end).toHaveBeenCalledWith(expect.any(Buffer));
    });
  });

  describe('sendRouteResponse — file', () => {
    it('sends file content as response', async () => {
      const res = createMockRes();
      const fileContent = Buffer.from('file content');
      vi.mocked(readFile).mockResolvedValue(fileContent);

      const route = createRoute({
        responseType: 'file',
        body: '/path/to/file.txt',
        statusCode: 200,
      });

      await handler.sendRouteResponse(res, route);

      expect(readFile).toHaveBeenCalledWith('/path/to/file.txt');
      expect(res.statusCode).toBe(200);
      expect(res.end).toHaveBeenCalledWith(fileContent);
    });

    it('sends 500 when file path is empty', async () => {
      const res = createMockRes();
      const route = createRoute({
        responseType: 'file',
        body: '',
      });

      await handler.sendRouteResponse(res, route);

      expect(res.statusCode).toBe(500);
    });

    it('sends 500 when file read fails', async () => {
      const res = createMockRes();
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const route = createRoute({
        responseType: 'file',
        body: '/nonexistent/file.txt',
      });

      await handler.sendRouteResponse(res, route);

      expect(res.statusCode).toBe(500);
    });
  });

  describe('sendRouteResponse — unknown type', () => {
    it('sends 500 for unknown response type', async () => {
      const res = createMockRes();
      const route = createRoute({
        responseType: 'unknown' as any,
      });

      await handler.sendRouteResponse(res, route);

      expect(res.statusCode).toBe(500);
    });
  });

  describe('custom headers', () => {
    it('sets custom headers from route configuration', async () => {
      const res = createMockRes();
      const route = createRoute({
        responseType: 'json',
        body: '{}',
        headers: [
          { key: 'X-Custom', value: 'test-value', enabled: true },
          { key: 'X-Disabled', value: 'should-not-appear', enabled: false },
          { key: '', value: 'empty-key', enabled: true },
        ],
      });

      await handler.sendRouteResponse(res, route);

      expect(res.setHeader).toHaveBeenCalledWith('X-Custom', 'test-value');
      // Disabled or empty key headers should not be set
      const setHeaderCalls = vi
        .mocked(res.setHeader)
        .mock.calls.map((c) => c[0]);
      expect(setHeaderCalls).not.toContain('X-Disabled');
    });
  });

  describe('sendJsonResponse (utility)', () => {
    it('sends structured JSON error response', () => {
      const res = createMockRes();

      handler.sendJsonResponse(res, 404, { error: 'Not found' });

      expect(res.statusCode).toBe(404);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/json; charset=utf-8'
      );
      expect(res.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Not found' })
      );
    });
  });
});
