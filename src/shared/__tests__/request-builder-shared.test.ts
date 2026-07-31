import { describe, expect, it } from 'vitest';
import {
  appendParamsWithoutEncoding,
  buildAuthQueryParams,
  buildBody,
  buildUrlWithParams,
  collectParams,
  hasHeader,
  resolveContentType,
  restoreQuerySafeChars,
} from '../request-builder-shared';
import { ApiRequest } from '../types';

function createRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    ...overrides,
  };
}

describe('request-builder-shared.ts', () => {
  // ---------------------------------------------------------------------------
  // resolveContentType
  // ---------------------------------------------------------------------------
  describe('resolveContentType', () => {
    it('returns undefined for a missing body', () => {
      expect(resolveContentType(undefined)).toBeUndefined();
    });

    it('prefers an explicit contentType over format and type', () => {
      expect(
        resolveContentType({
          type: 'raw',
          content: '',
          format: 'json',
          contentType: 'application/vnd.custom+json',
        })
      ).toBe('application/vnd.custom+json');
    });

    it('derives the content type from format when no explicit override', () => {
      expect(
        resolveContentType({ type: 'raw', content: '', format: 'json' })
      ).toBe('application/json');
      expect(
        resolveContentType({ type: 'raw', content: '', format: 'xml' })
      ).toBe('application/xml');
      expect(
        resolveContentType({ type: 'raw', content: '', format: 'yaml' })
      ).toBe('application/x-yaml');
      expect(
        resolveContentType({ type: 'raw', content: '', format: 'text' })
      ).toBe('text/plain');
      expect(
        resolveContentType({
          type: 'raw',
          content: '',
          format: 'form-urlencoded',
        })
      ).toBe('application/x-www-form-urlencoded');
    });

    it('format takes precedence over the body type', () => {
      // type=json would normally be application/json, but format=xml wins.
      expect(
        resolveContentType({ type: 'json', content: '', format: 'xml' })
      ).toBe('application/xml');
    });

    it('falls back to the body type when no format is set', () => {
      expect(resolveContentType({ type: 'json', content: '' })).toBe(
        'application/json'
      );
      expect(resolveContentType({ type: 'form-data', content: '' })).toBe(
        'multipart/form-data'
      );
      expect(resolveContentType({ type: 'form-urlencoded', content: '' })).toBe(
        'application/x-www-form-urlencoded'
      );
    });

    it('returns undefined for a raw body with no format and no contentType', () => {
      expect(
        resolveContentType({ type: 'raw', content: 'hi' })
      ).toBeUndefined();
    });

    it('returns undefined for a none body', () => {
      expect(resolveContentType({ type: 'none', content: '' })).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // buildAuthQueryParams
  // ---------------------------------------------------------------------------
  describe('buildAuthQueryParams', () => {
    it('returns the api-key pair when configured for the query location', () => {
      expect(
        buildAuthQueryParams(
          createRequest({
            auth: {
              type: 'api-key',
              config: { location: 'query', key: 'token', value: 'secret' },
            },
          })
        )
      ).toEqual({ token: 'secret' });
    });

    it('defaults the key to api_key when not provided', () => {
      expect(
        buildAuthQueryParams(
          createRequest({
            auth: {
              type: 'api-key',
              config: { location: 'query', value: 'secret' },
            },
          })
        )
      ).toEqual({ api_key: 'secret' });
    });

    it('returns an empty object when the value is blank', () => {
      expect(
        buildAuthQueryParams(
          createRequest({
            auth: {
              type: 'api-key',
              config: { location: 'query', value: '   ' },
            },
          })
        )
      ).toEqual({});
    });

    it('returns an empty object for header-location api-key and other auth types', () => {
      expect(
        buildAuthQueryParams(
          createRequest({
            auth: {
              type: 'api-key',
              config: { location: 'header', value: 'secret' },
            },
          })
        )
      ).toEqual({});
      expect(
        buildAuthQueryParams(
          createRequest({ auth: { type: 'bearer', config: { token: 'x' } } })
        )
      ).toEqual({});
      expect(buildAuthQueryParams(createRequest())).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // hasHeader
  // ---------------------------------------------------------------------------
  describe('hasHeader', () => {
    it('matches header names case-insensitively', () => {
      const headers = { 'Content-Type': 'application/json' };
      expect(hasHeader(headers, 'content-type')).toBe(true);
      expect(hasHeader(headers, 'CONTENT-TYPE')).toBe(true);
      expect(hasHeader(headers, 'Content-Type')).toBe(true);
    });

    it('returns false when the header is absent', () => {
      expect(hasHeader({ Accept: '*/*' }, 'Authorization')).toBe(false);
      expect(hasHeader({}, 'Content-Type')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // collectParams
  // ---------------------------------------------------------------------------
  describe('collectParams', () => {
    it('returns an empty array for missing params', () => {
      expect(collectParams()).toEqual([]);
      expect(collectParams(undefined, undefined)).toEqual([]);
    });

    it('includes enabled array entries and trims key/value', () => {
      expect(
        collectParams([{ key: ' page ', value: ' 1 ', enabled: true }])
      ).toEqual([{ key: 'page', value: '1' }]);
    });

    it('skips disabled entries and blank keys, but keeps empty values', () => {
      expect(
        collectParams([
          { key: 'a', value: '1', enabled: true },
          { key: 'disabled', value: 'x', enabled: false },
          { key: '  ', value: 'blank-key', enabled: true },
          { key: 'flag', value: '', enabled: true },
        ])
      ).toEqual([
        { key: 'a', value: '1' },
        { key: 'flag', value: '' },
      ]);
    });

    it('handles the record format and skips blank keys', () => {
      expect(
        collectParams({ page: '1', '   ': 'ignored', sort: 'name' })
      ).toEqual([
        { key: 'page', value: '1' },
        { key: 'sort', value: 'name' },
      ]);
    });

    it('appends extraParams after the primary params', () => {
      expect(
        collectParams([{ key: 'page', value: '1', enabled: true }], {
          api_key: 'secret',
        })
      ).toEqual([
        { key: 'page', value: '1' },
        { key: 'api_key', value: 'secret' },
      ]);
    });

    it('skips blank keys within extraParams', () => {
      expect(collectParams(undefined, { '  ': 'skip', real: 'kept' })).toEqual([
        { key: 'real', value: 'kept' },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // appendParamsWithoutEncoding
  // ---------------------------------------------------------------------------
  describe('appendParamsWithoutEncoding', () => {
    it('appends params with ? when there is no existing query', () => {
      expect(
        appendParamsWithoutEncoding('https://x/api', [
          { key: 'a', value: '1' },
          { key: 'b', value: '2' },
        ])
      ).toBe('https://x/api?a=1&b=2');
    });

    it('appends params with & when a query already exists', () => {
      expect(
        appendParamsWithoutEncoding('https://x/api?z=0', [
          { key: 'a', value: '1' },
        ])
      ).toBe('https://x/api?z=0&a=1');
    });

    it('re-attaches the hash fragment after the query', () => {
      expect(
        appendParamsWithoutEncoding('https://x/api#frag', [
          { key: 'a', value: '1' },
        ])
      ).toBe('https://x/api?a=1#frag');
    });

    it('does NOT encode keys or values (raw append for template URLs)', () => {
      // This is by design: template-variable URLs are appended verbatim so the
      // {{var}} placeholders survive. Note the space and comma are left raw.
      expect(
        appendParamsWithoutEncoding('https://{{host}}/api', [
          { key: 'q', value: 'a b,c' },
        ])
      ).toBe('https://{{host}}/api?q=a b,c');
    });
  });

  // ---------------------------------------------------------------------------
  // restoreQuerySafeChars
  // ---------------------------------------------------------------------------
  describe('restoreQuerySafeChars', () => {
    it('restores every RFC 3986 query sub-delimiter it manages', () => {
      const encoded = 'a=%2C%2F%3A%3F%40%24%21%27%28%29%2A';
      expect(restoreQuerySafeChars(encoded)).toBe("a=,/:?@$!'()*");
    });

    it('is case-insensitive for the percent-encoded input', () => {
      expect(restoreQuerySafeChars('a=%2c%2f')).toBe('a=,/');
    });

    it('leaves structural characters (& = # +) encoded', () => {
      const encoded = 'a=%26%3D%23%2B';
      expect(restoreQuerySafeChars(encoded)).toBe('a=%26%3D%23%2B');
    });

    it('normalizes a "+" (space) to "%20"', () => {
      expect(restoreQuerySafeChars('a=b+c')).toBe('a=b%20c');
    });

    it('does not touch an already-encoded percent sign (no double-decode)', () => {
      // "%252C" is an encoded "%2C"; it must stay intact.
      expect(restoreQuerySafeChars('a=%252C')).toBe('a=%252C');
    });

    it('returns plain strings unchanged', () => {
      expect(restoreQuerySafeChars('a=1&b=2')).toBe('a=1&b=2');
      expect(restoreQuerySafeChars('')).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // buildUrlWithParams (shared)
  // ---------------------------------------------------------------------------
  describe('buildUrlWithParams', () => {
    it('returns the base URL unchanged when there are no params', () => {
      expect(buildUrlWithParams('https://x/api')).toBe('https://x/api');
      expect(buildUrlWithParams('https://x/api', [])).toBe('https://x/api');
      expect(buildUrlWithParams('https://x/api', {})).toBe('https://x/api');
    });

    it('encodes normal params and keeps commas literal', () => {
      expect(
        buildUrlWithParams('https://x/api', {
          ids: 'a,b,c',
          q: 'hello world',
        })
      ).toBe('https://x/api?ids=a,b,c&q=hello%20world');
    });

    it('keeps structural characters encoded inside values', () => {
      expect(buildUrlWithParams('https://x/api', { raw: 'a&b=c#d' })).toBe(
        'https://x/api?raw=a%26b%3Dc%23d'
      );
    });

    it('merges params into an existing query (params override matching keys)', () => {
      expect(
        buildUrlWithParams('https://x/api?page=1&sort=old', [
          { key: 'sort', value: 'new', enabled: true },
        ])
      ).toBe('https://x/api?page=1&sort=new');
    });

    it('preserves the hash fragment', () => {
      expect(buildUrlWithParams('https://x/api#frag', { a: '1' })).toBe(
        'https://x/api?a=1#frag'
      );
    });

    it('merges extraParams (e.g. api-key) alongside the params', () => {
      expect(
        buildUrlWithParams(
          'https://x/api',
          [{ key: 'page', value: '1', enabled: true }],
          { api_key: 'secret' }
        )
      ).toBe('https://x/api?page=1&api_key=secret');
    });

    it('takes the no-encoding branch for template-variable URLs', () => {
      // With {{vars}} present the whole query is appended verbatim.
      expect(
        buildUrlWithParams('https://{{host}}/api', {
          ids: 'a,b',
          q: 'x y',
        })
      ).toBe('https://{{host}}/api?ids=a,b&q=x y');
    });
  });

  // ---------------------------------------------------------------------------
  // buildBody (shared — string form, used for previews)
  // ---------------------------------------------------------------------------
  describe('buildBody', () => {
    it('returns an empty object for missing or none bodies', () => {
      expect(buildBody(createRequest())).toEqual({});
      expect(
        buildBody(createRequest({ body: { type: 'none', content: 'x' } }))
      ).toEqual({});
    });

    it('returns json content and content type', () => {
      expect(
        buildBody(
          createRequest({
            method: 'POST',
            body: { type: 'json', content: '{"a":1}' },
          })
        )
      ).toEqual({ bodyData: '{"a":1}', contentType: 'application/json' });
    });

    it('returns form-urlencoded content and content type', () => {
      expect(
        buildBody(
          createRequest({
            method: 'POST',
            body: { type: 'form-urlencoded', content: 'a=1&b=2' },
          })
        )
      ).toEqual({
        bodyData: 'a=1&b=2',
        contentType: 'application/x-www-form-urlencoded',
      });
    });

    it('returns raw content with a format-derived content type', () => {
      expect(
        buildBody(
          createRequest({
            method: 'POST',
            body: { type: 'raw', content: '<x/>', format: 'xml' },
          })
        )
      ).toEqual({ bodyData: '<x/>', contentType: 'application/xml' });
    });

    it('returns the raw form-data content and a boundary-less multipart type', () => {
      // The shared (preview) builder does not assemble a multipart buffer; it
      // just echoes the content and the generic content type.
      expect(
        buildBody(
          createRequest({
            method: 'POST',
            body: { type: 'form-data', content: 'a=1' },
          })
        )
      ).toEqual({ bodyData: 'a=1', contentType: 'multipart/form-data' });
    });

    it('coerces missing content to an empty string', () => {
      expect(
        buildBody(createRequest({ body: { type: 'json', content: '' } }))
      ).toEqual({ bodyData: '', contentType: 'application/json' });
    });
  });

  // ---------------------------------------------------------------------------
  // Null-safety & duplicate keys (fixed behaviors)
  // ---------------------------------------------------------------------------
  describe('null-safety & duplicate keys', () => {
    it('treats an undefined value as an empty string (no crash)', () => {
      expect(
        collectParams([
          { key: 'a', value: undefined as unknown as string, enabled: true },
        ])
      ).toEqual([{ key: 'a', value: '' }]);
    });

    it('skips an entry with an undefined key (no crash)', () => {
      expect(
        collectParams([
          { key: undefined as unknown as string, value: '1', enabled: true },
        ])
      ).toEqual([]);
    });

    it('preserves duplicate query keys (?id=1&id=2), matching Postman/Insomnia', () => {
      expect(
        buildUrlWithParams('https://x/api', [
          { key: 'id', value: '1', enabled: true },
          { key: 'id', value: '2', enabled: true },
        ])
      ).toBe('https://x/api?id=1&id=2');
    });

    it('preserves duplicate keys in the template-var branch too', () => {
      expect(
        buildUrlWithParams('https://{{host}}/api', [
          { key: 'id', value: '1', enabled: true },
          { key: 'id', value: '2', enabled: true },
        ])
      ).toBe('https://{{host}}/api?id=1&id=2');
    });

    it('overrides a matching base-URL key but keeps param duplicates', () => {
      expect(
        buildUrlWithParams('https://x/api?id=old', [
          { key: 'id', value: '1', enabled: true },
          { key: 'id', value: '2', enabled: true },
        ])
      ).toBe('https://x/api?id=1&id=2');
    });
  });

  describe('space encoding', () => {
    it('encodes spaces as %20, matching Insomnia/Postman', () => {
      expect(buildUrlWithParams('https://x/api', { q: 'a b' })).toBe(
        'https://x/api?q=a%20b'
      );
    });
  });
});
