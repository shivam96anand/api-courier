import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock electron before import
vi.mock('electron', async () => import('../../../__mocks__/electron'));

// Mock dependencies
vi.mock('../store-manager', () => ({
  storeManager: {
    getState: vi.fn(),
  },
}));

vi.mock('../variables', () => ({
  composeFinalRequest: vi.fn(),
  buildFolderVars: vi.fn(),
  scanUnresolvedVars: vi.fn(),
}));

vi.mock('../oauth', () => ({
  oauthManager: {
    getTokenInfo: vi.fn(),
    refreshToken: vi.fn(),
  },
}));

vi.mock('../request-builder', () => ({
  RequestBuilder: {
    buildAuthQueryParams: vi.fn().mockReturnValue([]),
    mergeParams: vi.fn().mockImplementation((params) => params),
    buildUrlWithParams: vi.fn().mockImplementation((url) => url),
    buildHeaders: vi.fn().mockReturnValue({}),
    buildBody: vi.fn().mockReturnValue({ bodyData: null, contentType: null }),
    addDefaultHeaders: vi.fn().mockImplementation((headers) => headers),
  },
}));

vi.mock('../request-error-formatter', () => ({
  RequestErrorFormatter: {
    formatUnresolvedVariablesError: vi
      .fn()
      .mockReturnValue('{"error":"unresolved"}'),
    formatNetworkError: vi.fn().mockReturnValue('{"error":"network"}'),
    formatDecompressionError: vi
      .fn()
      .mockReturnValue('{"error":"decompression"}'),
    formatGeneralError: vi.fn().mockReturnValue('{"error":"general"}'),
    getErrorStatusCode: vi.fn().mockReturnValue(0),
    getErrorTitle: vi.fn().mockReturnValue('Error'),
  },
}));

vi.mock('../jks-parser', () => ({
  parseKeystoreJks: vi.fn().mockReturnValue({ cert: 'cert', key: 'key' }),
  parseTruststoreJks: vi.fn().mockReturnValue({ ca: 'ca' }),
}));

// Mock http/https
const mockReq = {
  write: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('http', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));

vi.mock('https', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
  Agent: vi.fn(),
}));

import { storeManager } from '../store-manager';
import {
  composeFinalRequest,
  buildFolderVars,
  scanUnresolvedVars,
} from '../variables';
import { oauthManager } from '../oauth';
import { RequestBuilder } from '../request-builder';
import { RequestErrorFormatter } from '../request-error-formatter';
import { requestManager } from '../request-manager';
import { ApiRequest, AppState } from '../../../shared/types';
import * as http from 'http';
import * as https from 'https';
import { PassThrough } from 'stream';

function createRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: {},
    ...overrides,
  };
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

function mockHttpResponse(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {}
) {
  const response = new PassThrough();
  (response as any).statusCode = statusCode;
  (response as any).statusMessage = 'OK';
  (response as any).headers = { 'content-type': 'application/json', ...headers };

  // Simulate async body writing
  setTimeout(() => {
    response.write(Buffer.from(body));
    response.end();
  }, 0);

  return response;
}

describe('request-manager.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(storeManager.getState).mockReturnValue(createState());
    vi.mocked(buildFolderVars).mockReturnValue({});
    vi.mocked(composeFinalRequest).mockImplementation((req) => ({
      url: req.url,
      params: req.params as any,
      headers: req.headers as any,
      body: req.body,
      auth: req.auth,
    }));
    vi.mocked(scanUnresolvedVars).mockReturnValue([]);
    vi.mocked(oauthManager.getTokenInfo).mockReturnValue({
      isValid: true,
      expiresIn: 3600,
    });
    vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
      'https://api.example.com/users'
    );
  });

  describe('variable resolution', () => {
    it('calls composeFinalRequest with env vars, globals, and folder vars', async () => {
      const env = {
        id: 'env-1',
        name: 'Dev',
        variables: { BASE_URL: 'http://localhost' },
      };
      const state = createState({
        environments: [env],
        activeEnvironmentId: 'env-1',
        globals: { variables: { GLOBAL_KEY: 'gval' } },
      });
      vi.mocked(storeManager.getState).mockReturnValue(state);
      vi.mocked(buildFolderVars).mockReturnValue({ FOLDER_KEY: 'fval' });

      // Set up https mock to return a response
      const res = mockHttpResponse(200, '{"ok":true}');
      vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });

      const request = createRequest({ url: 'https://api.example.com/api' });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/api'
      );

      await requestManager.sendRequest(request);

      expect(composeFinalRequest).toHaveBeenCalledWith(
        request,
        env,
        { variables: { GLOBAL_KEY: 'gval' } },
        { FOLDER_KEY: 'fval' }
      );
    });

    it('resolves folder vars for the parent folder when collectionId points to a request-type collection', async () => {
      const state = createState({
        collections: [
          {
            id: 'folder-1',
            name: 'Folder',
            type: 'folder',
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            variables: { X: '1' },
          },
          {
            id: 'req-col-1',
            name: 'Request',
            type: 'request',
            parentId: 'folder-1',
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      vi.mocked(storeManager.getState).mockReturnValue(state);

      const res = mockHttpResponse(200, '{}');
      vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });

      const request = createRequest({ collectionId: 'req-col-1' });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/users'
      );

      await requestManager.sendRequest(request);

      // Should call buildFolderVars with the parent folder ID
      expect(buildFolderVars).toHaveBeenCalledWith(
        'folder-1',
        state.collections
      );
    });

    it('returns 400 when unresolved variables are found in the URL', async () => {
      vi.mocked(scanUnresolvedVars).mockReturnValue([
        '{{MISSING_VAR}}',
      ]);

      const request = createRequest({
        url: 'https://api.example.com/{{MISSING_VAR}}',
      });
      const response = await requestManager.sendRequest(request);

      expect(response.status).toBe(400);
      expect(response.statusText).toBe('Unresolved Variables');
      expect(RequestErrorFormatter.formatUnresolvedVariablesError).toHaveBeenCalled();
    });

    it('proceeds with request when there are no unresolved variables', async () => {
      vi.mocked(scanUnresolvedVars).mockReturnValue([]);

      const res = mockHttpResponse(200, '{"ok":true}');
      vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/users'
      );

      const request = createRequest();
      const response = await requestManager.sendRequest(request);

      expect(response.status).toBe(200);
    });
  });

  describe('auth handling', () => {
    it('triggers OAuth refresh when token is invalid and refreshToken is present', async () => {
      vi.mocked(oauthManager.getTokenInfo).mockReturnValue({
        isValid: false,
        expiresIn: 0,
      });
      vi.mocked(oauthManager.refreshToken).mockResolvedValue({
        success: true,
        data: {
          accessToken: 'new-token',
          refreshToken: 'new-refresh',
          expiresIn: 3600,
          tokenType: 'Bearer',
        },
      });

      const res = mockHttpResponse(200, '{}');
      vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/users'
      );

      const request = createRequest({
        auth: {
          type: 'oauth2',
          config: {
            accessToken: 'expired-token',
            refreshToken: 'my-refresh-token',
            tokenUrl: 'https://auth.example.com/token',
            clientId: 'cid',
            clientSecret: 'csec',
          },
        },
      });

      await requestManager.sendRequest(request);

      expect(oauthManager.refreshToken).toHaveBeenCalled();
    });

    it('does not refresh when auth type is not oauth2', async () => {
      const res = mockHttpResponse(200, '{}');
      vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/users'
      );

      const request = createRequest({
        auth: {
          type: 'bearer',
          config: { token: 'my-token' },
        },
      });

      await requestManager.sendRequest(request);

      expect(oauthManager.refreshToken).not.toHaveBeenCalled();
    });
  });

  describe('cancellation', () => {
    it('cancels an in-flight request and returns true', async () => {
      // Set up https.request to capture the request but not respond immediately
      let capturedReq: any;
      vi.mocked(https.request).mockImplementation((_opts: any, _cb: any) => {
        capturedReq = {
          ...mockReq,
          destroy: vi.fn(),
        };
        return capturedReq as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/slow'
      );

      const request = createRequest({
        id: 'cancel-me',
        url: 'https://api.example.com/slow',
      });

      // Start the request but don't await it (it won't resolve because no response callback fires)
      const promise = requestManager.sendRequest(request);

      // Give the event loop a tick so the request is registered
      await new Promise((r) => setTimeout(r, 0));

      const cancelled = requestManager.cancelRequest('cancel-me');
      expect(cancelled).toBe(true);

      // The promise should reject due to cancellation
      await expect(promise).rejects.toThrow('Request cancelled by user');
    });

    it('returns false when cancelling an unknown request ID', () => {
      const result = requestManager.cancelRequest('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('response shape', () => {
    it('returns response with correct shape (status, headers, body, time, size, timestamp)', async () => {
      const res = mockHttpResponse(200, '{"data":"hello"}', {
        'x-custom': 'val',
      });
      vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/users'
      );

      const request = createRequest();
      const response = await requestManager.sendRequest(request);

      expect(response).toMatchObject({
        status: 200,
        statusText: 'OK',
        body: '{"data":"hello"}',
      });
      expect(response.headers).toHaveProperty('x-custom', 'val');
      expect(typeof response.time).toBe('number');
      expect(response.time).toBeGreaterThanOrEqual(0);
      expect(typeof response.size).toBe('number');
      expect(typeof response.timestamp).toBe('number');
    });

    it('handles network errors gracefully and returns formatted error response', async () => {
      vi.mocked(https.request).mockImplementation((_opts: any, _cb: any) => {
        const reqObj: any = {
          ...mockReq,
          on: vi.fn((event: string, handler: any) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('ECONNREFUSED')), 0);
            }
            return reqObj;
          }),
          write: vi.fn(),
          end: vi.fn(),
          destroy: vi.fn(),
        };
        return reqObj as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/users'
      );
      vi.mocked(RequestErrorFormatter.getErrorStatusCode).mockReturnValue(0);
      vi.mocked(RequestErrorFormatter.getErrorTitle).mockReturnValue(
        'Connection Refused'
      );

      const request = createRequest();
      const response = await requestManager.sendRequest(request);

      expect(response.statusText).toBe('Connection Refused');
      expect(RequestErrorFormatter.formatNetworkError).toHaveBeenCalled();
    });

    it('uses https module for https URLs', async () => {
      const res = mockHttpResponse(200, '{}');
      vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/users'
      );

      const request = createRequest({ url: 'https://api.example.com/users' });
      await requestManager.sendRequest(request);

      expect(https.request).toHaveBeenCalled();
    });

    it('uses http module for http URLs', async () => {
      const res = mockHttpResponse(200, '{}');
      vi.mocked(http.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'http://api.example.com/users'
      );

      const request = createRequest({ url: 'http://api.example.com/users' });
      await requestManager.sendRequest(request);

      expect(http.request).toHaveBeenCalled();
    });

    it('writes body data when present', async () => {
      vi.mocked(RequestBuilder.buildBody).mockReturnValue({
        bodyData: '{"name":"test"}',
        contentType: 'application/json',
      });

      const res = mockHttpResponse(201, '{}');
      vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
        cb(res);
        return mockReq as any;
      });
      vi.mocked(RequestBuilder.buildUrlWithParams).mockReturnValue(
        'https://api.example.com/users'
      );

      const request = createRequest({
        method: 'POST',
        url: 'https://api.example.com/users',
      });
      await requestManager.sendRequest(request);

      expect(mockReq.write).toHaveBeenCalledWith('{"name":"test"}');
      expect(mockReq.end).toHaveBeenCalled();
    });
  });
});
