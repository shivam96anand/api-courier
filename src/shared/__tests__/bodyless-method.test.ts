import { describe, expect, it } from 'vitest';
import {
  buildBody,
  isBodylessMethod,
  isBodySuppressedByMethod,
  hasSendableBodyContent,
} from '../request-builder-shared';
import type { ApiRequest } from '../types';

const request = (overrides: Partial<ApiRequest>): ApiRequest =>
  ({
    id: 'r1',
    name: 'test',
    method: 'GET',
    url: 'https://api.example.com',
    headers: {},
    ...overrides,
  }) as ApiRequest;

const jsonBody = { type: 'json' as const, content: '{"a":1}' };

describe('request-builder-shared.ts — bodyless methods', () => {
  it('identifies GET and HEAD as bodyless', () => {
    expect(isBodylessMethod('GET')).toBe(true);
    expect(isBodylessMethod('get')).toBe(true);
    expect(isBodylessMethod('HEAD')).toBe(true);
    expect(isBodylessMethod(undefined)).toBe(true);
  });

  it('treats every other method as body-capable', () => {
    ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].forEach((m) => {
      expect(isBodylessMethod(m)).toBe(false);
    });
  });

  it('detects sendable content', () => {
    expect(hasSendableBodyContent(request({ body: jsonBody }))).toBe(true);
    expect(
      hasSendableBodyContent(request({ body: { type: 'none', content: '' } }))
    ).toBe(false);
    expect(hasSendableBodyContent(request({}))).toBe(false);
  });
});

describe('request-builder-shared.ts — buildBody', () => {
  it('omits the body on GET by default', () => {
    const req = request({ method: 'GET', body: jsonBody });
    expect(isBodySuppressedByMethod(req)).toBe(true);
    expect(buildBody(req)).toEqual({});
  });

  it('omits the body on HEAD by default', () => {
    const req = request({ method: 'HEAD', body: jsonBody });
    expect(buildBody(req)).toEqual({});
  });

  it('sends the body on GET when explicitly opted in', () => {
    const req = request({
      method: 'GET',
      body: jsonBody,
      allowBodyOnBodylessMethod: true,
    });
    expect(isBodySuppressedByMethod(req)).toBe(false);
    expect(buildBody(req).bodyData).toBe('{"a":1}');
  });

  it('is unchanged for POST', () => {
    const req = request({ method: 'POST', body: jsonBody });
    expect(buildBody(req).bodyData).toBe('{"a":1}');
    expect(buildBody(req).contentType).toContain('json');
  });

  it('is unchanged for PUT, PATCH and DELETE', () => {
    (['PUT', 'PATCH', 'DELETE'] as const).forEach((method) => {
      const req = request({ method, body: jsonBody });
      expect(buildBody(req).bodyData).toBe('{"a":1}');
    });
  });

  it('returns nothing when there is no body at all', () => {
    expect(buildBody(request({ method: 'POST' }))).toEqual({});
  });
});
