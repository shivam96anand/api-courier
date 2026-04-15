import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock http/https before importing the module
const mockReqWrite = vi.fn();
const mockReqEnd = vi.fn();
const mockReqDestroy = vi.fn();

function createMockReq() {
  const emitter = new EventEmitter();
  (emitter as any).write = mockReqWrite;
  (emitter as any).end = mockReqEnd;
  (emitter as any).destroy = mockReqDestroy;
  return emitter;
}

function createMockResponse(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {},
  statusMessage = 'OK'
) {
  const res = new EventEmitter();
  (res as any).statusCode = statusCode;
  (res as any).statusMessage = statusMessage;
  (res as any).headers = { 'content-type': 'text/plain', ...headers };
  (res as any).resume = vi.fn();
  (res as any).pipe = vi.fn().mockReturnValue(res); // for zlib piping
  return { res, emitBody: () => {
    (res as any).emit('data', Buffer.from(body));
    (res as any).emit('end');
  }};
}

vi.mock('http', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));

vi.mock('https', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));

import * as http from 'http';
import * as https from 'https';
import { executeCurl, cancelCurl } from '../curl-executor';

describe('curl-executor.ts — executeCurl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an error response when no URL is found in the curl command', async () => {
    const result = await executeCurl({
      id: 'test-1',
      rawCommand: 'curl -X GET',
    });

    expect(result.id).toBe('test-1');
    expect(result.status).toBe(0);
    expect(result.error).toBe('No URL found in curl command');
  });

  it('executes a simple GET request and returns a well-shaped response', async () => {
    const { res, emitBody } = createMockResponse(200, '{"ok":true}', {
      'content-type': 'application/json',
    });

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      const req = createMockReq();
      // Defer response so event listeners are attached first
      process.nextTick(() => {
        cb(res);
        emitBody();
      });
      return req as any;
    });

    const result = await executeCurl({
      id: 'test-2',
      rawCommand: 'curl https://api.example.com/data',
    });

    expect(result.id).toBe('test-2');
    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK');
    expect(result.body).toBe('{"ok":true}');
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.parsed.method).toBe('GET');
    expect(result.parsed.url).toBe('https://api.example.com/data');
    expect(typeof result.time).toBe('number');
    expect(typeof result.size).toBe('number');
    expect(result.error).toBeUndefined();
  });

  it('sends body data for POST requests', async () => {
    const { res, emitBody } = createMockResponse(201, '{"id":1}');

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      const req = createMockReq();
      process.nextTick(() => {
        cb(res);
        emitBody();
      });
      return req as any;
    });

    const result = await executeCurl({
      id: 'test-3',
      rawCommand: `curl -X POST -d '{"name":"test"}' https://api.example.com/users`,
    });

    expect(result.status).toBe(201);
    expect(mockReqWrite).toHaveBeenCalledWith('{"name":"test"}');
    expect(mockReqEnd).toHaveBeenCalled();
  });

  it('uses http module for http:// URLs', async () => {
    const { res, emitBody } = createMockResponse(200, 'ok');

    vi.mocked(http.request).mockImplementation((_opts: any, cb: any) => {
      const req = createMockReq();
      process.nextTick(() => {
        cb(res);
        emitBody();
      });
      return req as any;
    });

    await executeCurl({
      id: 'test-4',
      rawCommand: 'curl http://localhost:3000/api',
    });

    expect(http.request).toHaveBeenCalled();
    expect(https.request).not.toHaveBeenCalled();
  });

  it('handles request errors gracefully', async () => {
    vi.mocked(https.request).mockImplementation((_opts: any, _cb: any) => {
      const req = createMockReq();
      process.nextTick(() => {
        req.emit('error', new Error('ECONNREFUSED'));
      });
      return req as any;
    });

    const result = await executeCurl({
      id: 'test-5',
      rawCommand: 'curl https://api.example.com/fail',
    });

    expect(result.id).toBe('test-5');
    expect(result.status).toBe(0);
    expect(result.statusText).toBe('Error');
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('returns parsed curl structure in every response', async () => {
    const { res, emitBody } = createMockResponse(200, '');

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      const req = createMockReq();
      process.nextTick(() => {
        cb(res);
        emitBody();
      });
      return req as any;
    });

    const result = await executeCurl({
      id: 'test-6',
      rawCommand:
        "curl -X POST -H 'Content-Type: application/json' -d '{\"a\":1}' https://api.example.com/data -k",
    });

    expect(result.parsed).toEqual({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
      flags: ['-k'],
    });
  });

  it('catches URL parse errors and returns an error response', async () => {
    const result = await executeCurl({
      id: 'test-7',
      rawCommand: 'curl ://invalid',
    });

    expect(result.id).toBe('test-7');
    expect(result.status).toBe(0);
    expect(result.error).toBeDefined();
  });
});

describe('curl-executor.ts — cancelCurl', () => {
  it('returns false when no active request exists for the given ID', () => {
    const result = cancelCurl('nonexistent-id');
    expect(result).toBe(false);
  });
});
