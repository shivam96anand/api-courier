import { describe, expect, it, vi } from 'vitest';
import { applyCorsHeaders } from '../mock-server-utils';

function createRes() {
  const headers = new Map<string, string>();
  return {
    headers,
    hasHeader: (name: string) => headers.has(name),
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
  };
}

describe('mock-server-utils.ts — applyCorsHeaders', () => {
  it('echoes the request origin', () => {
    const res = createRes();
    applyCorsHeaders({ headers: { origin: 'http://localhost:3000' } }, res);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:3000'
    );
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('falls back to * when there is no origin', () => {
    const res = createRes();
    applyCorsHeaders({ headers: {} }, res);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.has('Vary')).toBe(false);
  });

  it('advertises the standard methods', () => {
    const res = createRes();
    applyCorsHeaders({ headers: {} }, res);
    const methods = res.headers.get('Access-Control-Allow-Methods') ?? '';
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].forEach((m) => {
      expect(methods).toContain(m);
    });
  });

  it('reflects the requested preflight headers', () => {
    const res = createRes();
    applyCorsHeaders(
      { headers: { 'access-control-request-headers': 'authorization' } },
      res
    );
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe(
      'authorization'
    );
  });

  it('never overwrites a header a route already set', () => {
    const res = createRes();
    res.setHeader('Access-Control-Allow-Origin', 'https://locked.example.com');
    applyCorsHeaders({ headers: { origin: 'http://evil.example.com' } }, res);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://locked.example.com'
    );
  });
});
