import { describe, expect, it } from 'vitest';
import { ApiRequest } from '../../../shared/types';
import { RequestBuilder } from '../request-builder';

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

describe('request-builder.ts', () => {
  describe('buildUrlWithParams', () => {
    it('returns the base URL unchanged for missing or empty params', () => {
      const baseUrl = 'https://api.example.com/users';

      expect(RequestBuilder.buildUrlWithParams(baseUrl)).toBe(baseUrl);
      expect(RequestBuilder.buildUrlWithParams(baseUrl, [])).toBe(baseUrl);
      expect(RequestBuilder.buildUrlWithParams(baseUrl, {})).toBe(baseUrl);
    });

    it('handles array params by including enabled items and skipping invalid ones', () => {
      const url = RequestBuilder.buildUrlWithParams(
        'https://api.example.com/users',
        [
          { key: ' page ', value: ' 1 ', enabled: true },
          { key: 'disabled', value: 'nope', enabled: false },
          { key: '', value: 'missing-key', enabled: true },
          { key: 'missing-value', value: '   ', enabled: true },
          { key: 'sort', value: 'name', enabled: true },
        ]
      );

      expect(url).toBe('https://api.example.com/users?page=1&sort=name');
    });

    it('merges params into existing query strings without duplicating keys', () => {
      const url = RequestBuilder.buildUrlWithParams(
        'https://api.example.com/users?page=1&sort=old',
        [
          { key: 'sort', value: 'new', enabled: true },
          { key: 'filter', value: 'active', enabled: true },
        ]
      );

      expect(url).toBe(
        'https://api.example.com/users?page=1&sort=new&filter=active'
      );
    });

    it('handles record params, skips empty entries, and URL-encodes values', () => {
      const url = RequestBuilder.buildUrlWithParams(
        'https://api.example.com/search',
        {
          q: 'hello world',
          category: 'a&b',
          empty: '',
          '   ': 'ignored',
        }
      );

      expect(url).toBe(
        'https://api.example.com/search?q=hello+world&category=a%26b'
      );
    });

    it('preserves trailing slashes and fragments', () => {
      expect(
        RequestBuilder.buildUrlWithParams('https://api.example.com/users/', {
          page: '1',
        })
      ).toBe('https://api.example.com/users/?page=1');

      expect(
        RequestBuilder.buildUrlWithParams(
          'https://api.example.com/users#details',
          {
            page: '1',
          }
        )
      ).toBe('https://api.example.com/users?page=1#details');
    });
  });

  describe('buildHeaders', () => {
    it('includes only enabled, non-empty array headers and trims them', () => {
      const headers = RequestBuilder.buildHeaders(
        createRequest({
          headers: [
            { key: ' X-Test ', value: ' 123 ', enabled: true },
            { key: 'Disabled', value: 'ignored', enabled: false },
            { key: '', value: 'missing-key', enabled: true },
            { key: 'Missing-Value', value: '   ', enabled: true },
          ],
        })
      );

      expect(headers).toEqual({ 'X-Test': '123' });
    });

    it('includes only non-empty object headers', () => {
      const headers = RequestBuilder.buildHeaders(
        createRequest({
          headers: {
            ' X-Test ': ' 123 ',
            EmptyValue: '',
            '   ': 'ignored',
          },
        })
      );

      expect(headers).toEqual({ 'X-Test': '123' });
    });

    it('adds auth headers for oauth2, bearer, api-key header, and basic auth', () => {
      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'oauth2',
              config: { accessToken: 'oauth-token', headerPrefix: 'Token' },
            },
          })
        )
      ).toEqual({ Authorization: 'Token oauth-token' });

      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'bearer',
              config: { token: 'bearer-token' },
            },
          })
        )
      ).toEqual({ Authorization: 'Bearer bearer-token' });

      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'api-key',
              config: { location: 'header', value: 'secret' },
            },
          })
        )
      ).toEqual({ 'X-API-Key': 'secret' });

      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'basic',
              config: { username: 'user', password: 'pass' },
            },
          })
        )
      ).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
    });

    it('skips auth headers when config is incomplete or not applicable', () => {
      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'oauth2',
              config: {},
            },
          })
        )
      ).toEqual({});

      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'bearer',
              config: {},
            },
          })
        )
      ).toEqual({});

      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'api-key',
              config: { location: 'query', key: 'api_key', value: 'secret' },
            },
          })
        )
      ).toEqual({});

      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'basic',
              config: { username: 'user' },
            },
          })
        )
      ).toEqual({});

      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: {
              type: 'none',
              config: {},
            },
          })
        )
      ).toEqual({});
    });

    it('does not override a user-specified Authorization header', () => {
      const oauthHeaders = RequestBuilder.buildHeaders(
        createRequest({
          headers: [
            { key: 'Authorization', value: 'Custom abc', enabled: true },
          ],
          auth: { type: 'oauth2', config: { accessToken: 'oauth-token' } },
        })
      );

      const bearerHeaders = RequestBuilder.buildHeaders(
        createRequest({
          headers: [
            { key: 'Authorization', value: 'Custom abc', enabled: true },
          ],
          auth: { type: 'bearer', config: { token: 'bearer-token' } },
        })
      );

      expect(oauthHeaders.Authorization).toBe('Custom abc');
      expect(bearerHeaders.Authorization).toBe('Custom abc');
    });
  });

  describe('buildAuthQueryParams', () => {
    it('returns query params only for api-key auth configured for query usage', () => {
      expect(
        RequestBuilder.buildAuthQueryParams(
          createRequest({
            auth: {
              type: 'api-key',
              config: { location: 'query', key: 'token', value: 'secret' },
            },
          })
        )
      ).toEqual({ token: 'secret' });

      expect(
        RequestBuilder.buildAuthQueryParams(
          createRequest({
            auth: {
              type: 'api-key',
              config: { location: 'query', value: 'secret' },
            },
          })
        )
      ).toEqual({ api_key: 'secret' });
    });

    it.each([
      createRequest({
        auth: {
          type: 'api-key',
          config: { location: 'header', value: 'secret' },
        },
      }),
      createRequest({ auth: { type: 'none', config: {} } }),
      createRequest({ auth: { type: 'bearer', config: { token: 'secret' } } }),
      createRequest({
        auth: { type: 'api-key', config: { location: 'query', value: '   ' } },
      }),
    ])('returns an empty object for non-query auth cases', (request) => {
      expect(RequestBuilder.buildAuthQueryParams(request)).toEqual({});
    });
  });

  describe('mergeParams', () => {
    it('handles undefined and empty extra params without changing the original params', () => {
      const params = [{ key: 'page', value: '1', enabled: true }];

      expect(RequestBuilder.mergeParams(params)).toEqual(params);
      expect(RequestBuilder.mergeParams(params, {})).toEqual(params);
      expect(RequestBuilder.mergeParams(undefined, { page: '1' })).toEqual({
        page: '1',
      });
    });

    it('merges array and record params using the expected strategy', () => {
      expect(
        RequestBuilder.mergeParams(
          [{ key: 'page', value: '1', enabled: true }],
          { filter: 'active' }
        )
      ).toEqual([
        { key: 'page', value: '1', enabled: true },
        { key: 'filter', value: 'active', enabled: true },
      ]);

      expect(
        RequestBuilder.mergeParams(
          { page: '1', sort: 'old' },
          { sort: 'new', filter: 'active' }
        )
      ).toEqual({ page: '1', sort: 'new', filter: 'active' });
    });
  });

  describe('buildBody', () => {
    it('returns an empty object for missing or none bodies', () => {
      expect(RequestBuilder.buildBody(createRequest())).toEqual({});
      expect(
        RequestBuilder.buildBody(
          createRequest({ body: { type: 'none', content: '' } })
        )
      ).toEqual({});
    });

    it('returns body data and inferred content types for supported body variants', () => {
      expect(
        RequestBuilder.buildBody(
          createRequest({ body: { type: 'json', content: '{"ok":true}' } })
        )
      ).toEqual({ bodyData: '{"ok":true}', contentType: 'application/json' });

      expect(
        RequestBuilder.buildBody(
          createRequest({
            body: { type: 'form-urlencoded', content: 'a=1&b=2' },
          })
        )
      ).toEqual({
        bodyData: 'a=1&b=2',
        contentType: 'application/x-www-form-urlencoded',
      });

      expect(
        RequestBuilder.buildBody(
          createRequest({ body: { type: 'form-data', content: 'file=test' } })
        )
      ).toEqual({ bodyData: 'file=test', contentType: 'multipart/form-data' });

      expect(
        RequestBuilder.buildBody(
          createRequest({
            body: { type: 'raw', content: 'hello', format: 'text' },
          })
        )
      ).toEqual({ bodyData: 'hello', contentType: 'text/plain' });

      expect(
        RequestBuilder.buildBody(
          createRequest({
            body: { type: 'raw', content: '<xml/>', format: 'xml' },
          })
        )
      ).toEqual({ bodyData: '<xml/>', contentType: 'application/xml' });
    });
  });

  describe('addDefaultHeaders', () => {
    it('adds default content headers without mutating the input', () => {
      const headers = { Accept: 'application/json' };
      const result = RequestBuilder.addDefaultHeaders(
        headers,
        '{"ok":true}',
        'application/json'
      );

      expect(result).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': '11',
      });
      expect(headers).toEqual({ Accept: 'application/json' });
    });

    it('does not override Content-Type or Content-Length when already present', () => {
      const result = RequestBuilder.addDefaultHeaders(
        {
          'Content-Type': 'text/plain',
          'Content-Length': '999',
        },
        '{"ok":true}',
        'application/json'
      );

      expect(result).toEqual({
        'Content-Type': 'text/plain',
        'Content-Length': '999',
      });
    });

    it('does not add Content-Length when body data is undefined', () => {
      expect(
        RequestBuilder.addDefaultHeaders({}, undefined, 'application/json')
      ).toEqual({
        'Content-Type': 'application/json',
      });
    });
  });

  describe('buildBody — additional formats', () => {
    it('returns multipart/form-data content type for form-data', () => {
      const result = RequestBuilder.buildBody(
        createRequest({ body: { type: 'form-data', content: 'field1=value1' } })
      );
      expect(result.contentType).toBe('multipart/form-data');
      expect(result.bodyData).toBe('field1=value1');
    });

    it('respects explicit contentType override', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'raw', content: '<xml/>', contentType: 'application/xml' },
        })
      );
      expect(result.contentType).toBe('application/xml');
    });

    it('infers yaml content type from format', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'raw', content: 'key: value', format: 'yaml' },
        })
      );
      expect(result.contentType).toBe('application/x-yaml');
    });
  });

  describe('buildUrlWithParams — edge cases', () => {
    it('handles URL with both query and hash', () => {
      const url = RequestBuilder.buildUrlWithParams(
        'https://example.com/path?existing=1#section',
        { added: '2' }
      );
      expect(url).toContain('existing=1');
      expect(url).toContain('added=2');
      expect(url).toContain('#section');
    });

    it('handles empty URL', () => {
      const url = RequestBuilder.buildUrlWithParams('', { key: 'val' });
      expect(url).toContain('key=val');
    });
  });
});
