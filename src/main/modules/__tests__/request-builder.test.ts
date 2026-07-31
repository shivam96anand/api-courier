import { describe, expect, it, vi } from 'vitest';
import { ApiRequest, FormDataField } from '../../../shared/types';
import { RequestBuilder } from '../request-builder';
import { composeFinalRequest } from '../variables';

// Mock fs for file upload tests
vi.mock('fs', () => ({
  readFileSync: vi.fn((filePath: string) => {
    if (filePath === '/tmp/photo.png') {
      return Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    }
    if (filePath === '/tmp/doc.pdf') {
      return Buffer.from('%PDF-1.4');
    }
    if (filePath === '/tmp/missing.txt') {
      throw new Error('ENOENT: no such file or directory');
    }
    return Buffer.from('file-content');
  }),
}));

function createRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Test Request',
    // POST so body-building cases aren't suppressed by the GET/HEAD rule.
    method: 'POST',
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

      expect(url).toBe(
        'https://api.example.com/users?page=1&missing-value=&sort=name'
      );
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
        'https://api.example.com/search?q=hello%20world&category=a%26b&empty='
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

    it('keeps commas literal in list values instead of encoding to %2C', () => {
      // Regression: URLSearchParams encodes "," to "%2C", which some APIs
      // treat as a single literal token, returning only the first item.
      // Postman/Insomnia leave commas literal (RFC 3986 sub-delimiter).
      const url = RequestBuilder.buildUrlWithParams(
        'https://api.example.com/product',
        [
          {
            key: 'contractIdList',
            value: 'GK10075387,GK10077247',
            enabled: true,
          },
          { key: 'view', value: 'V', enabled: true },
        ]
      );

      expect(url).toBe(
        'https://api.example.com/product?contractIdList=GK10075387,GK10077247&view=V'
      );
    });

    it('leaves other RFC 3986 query sub-delimiters literal but keeps separators encoded', () => {
      const url = RequestBuilder.buildUrlWithParams(
        'https://api.example.com/search',
        {
          path: 'a/b:c@d',
          list: 'x,y,z',
          keep: 'a&b=c',
        }
      );

      // "/", ":", "@", "," stay literal; "&" and "=" inside a value stay encoded
      expect(url).toBe(
        'https://api.example.com/search?path=a/b:c@d&list=x,y,z&keep=a%26b%3Dc'
      );
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

      expect(headers).toEqual({ 'X-Test': '123', 'Missing-Value': '' });
    });

    it('preserves empty object header values and skips blank keys', () => {
      const headers = RequestBuilder.buildHeaders(
        createRequest({
          headers: {
            ' X-Test ': ' 123 ',
            EmptyValue: '',
            '   ': 'ignored',
          },
        })
      );

      // Empty values are intentionally preserved (some APIs require headers
      // like `X-Trace-Hint:` with no value). Only blank keys are dropped.
      expect(headers).toEqual({ 'X-Test': '123', EmptyValue: '' });
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

      const formDataResult = RequestBuilder.buildBody(
        createRequest({ body: { type: 'form-data', content: 'file=test' } })
      );
      expect(formDataResult.contentType).toContain('multipart/form-data');
      expect(formDataResult.contentType).toContain('boundary=');

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
      expect(result.contentType).toContain('multipart/form-data');
      expect(result.contentType).toContain('boundary=');
      expect(result.bodyData).toBeInstanceOf(Buffer);
    });

    it('respects explicit contentType override', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: {
            type: 'raw',
            content: '<xml/>',
            contentType: 'application/xml',
          },
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

  describe('buildBody — form-data with formDataFields', () => {
    it('builds multipart body with text fields', () => {
      const fields: FormDataField[] = [
        { key: 'name', value: 'John', type: 'text', enabled: true },
        {
          key: 'email',
          value: 'john@example.com',
          type: 'text',
          enabled: true,
        },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: '', formDataFields: fields },
        })
      );

      expect(result.contentType).toContain('multipart/form-data');
      expect(result.contentType).toContain('boundary=');
      expect(result.bodyData).toBeInstanceOf(Buffer);

      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('Content-Disposition: form-data; name="name"');
      expect(bodyStr).toContain('John');
      expect(bodyStr).toContain('Content-Disposition: form-data; name="email"');
      expect(bodyStr).toContain('john@example.com');
    });

    it('builds multipart body with file fields', () => {
      const fields: FormDataField[] = [
        {
          key: 'avatar',
          value: '/tmp/photo.png',
          type: 'file',
          enabled: true,
          fileName: 'photo.png',
          contentType: 'image/png',
        },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: '', formDataFields: fields },
        })
      );

      expect(result.contentType).toContain('multipart/form-data');
      const bodyBuf = result.bodyData as Buffer;
      const bodyStr = bodyBuf.toString();

      expect(bodyStr).toContain('name="avatar"; filename="photo.png"');
      expect(bodyStr).toContain('Content-Type: image/png');
      // The buffer should contain the PNG magic bytes
      expect(bodyBuf.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(
        true
      );
    });

    it('handles mixed text and file fields', () => {
      const fields: FormDataField[] = [
        {
          key: 'description',
          value: 'My file upload',
          type: 'text',
          enabled: true,
        },
        {
          key: 'document',
          value: '/tmp/doc.pdf',
          type: 'file',
          enabled: true,
          fileName: 'doc.pdf',
          contentType: 'application/pdf',
        },
        { key: 'tag', value: 'important', type: 'text', enabled: true },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: '', formDataFields: fields },
        })
      );

      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('name="description"');
      expect(bodyStr).toContain('My file upload');
      expect(bodyStr).toContain('name="document"; filename="doc.pdf"');
      expect(bodyStr).toContain('Content-Type: application/pdf');
      expect(bodyStr).toContain('name="tag"');
      expect(bodyStr).toContain('important');
    });

    it('skips disabled fields', () => {
      const fields: FormDataField[] = [
        { key: 'included', value: 'yes', type: 'text', enabled: true },
        { key: 'excluded', value: 'no', type: 'text', enabled: false },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: '', formDataFields: fields },
        })
      );

      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('name="included"');
      expect(bodyStr).not.toContain('name="excluded"');
    });

    it('skips fields with empty keys', () => {
      const fields: FormDataField[] = [
        { key: '', value: 'orphan-value', type: 'text', enabled: true },
        { key: '  ', value: 'whitespace-key', type: 'text', enabled: true },
        { key: 'valid', value: 'ok', type: 'text', enabled: true },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: '', formDataFields: fields },
        })
      );

      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).not.toContain('orphan-value');
      expect(bodyStr).not.toContain('whitespace-key');
      expect(bodyStr).toContain('name="valid"');
    });

    it('skips unreadable file fields gracefully', () => {
      const fields: FormDataField[] = [
        {
          key: 'file',
          value: '/tmp/missing.txt',
          type: 'file',
          enabled: true,
          fileName: 'missing.txt',
        },
        { key: 'name', value: 'still works', type: 'text', enabled: true },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: '', formDataFields: fields },
        })
      );

      const bodyStr = (result.bodyData as Buffer).toString();
      // File field should be skipped, text field should be present
      expect(bodyStr).not.toContain('name="file"');
      expect(bodyStr).toContain('name="name"');
      expect(bodyStr).toContain('still works');
    });

    it('uses application/octet-stream when file contentType is missing', () => {
      const fields: FormDataField[] = [
        {
          key: 'upload',
          value: '/tmp/data.bin',
          type: 'file',
          enabled: true,
          fileName: 'data.bin',
        },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: '', formDataFields: fields },
        })
      );

      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('Content-Type: application/octet-stream');
    });

    it('falls back to legacy text format when formDataFields is empty', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: 'key1=val1', formDataFields: [] },
        })
      );

      expect(result.contentType).toContain('multipart/form-data');
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('name="key1"');
      expect(bodyStr).toContain('val1');
    });

    it('prefers formDataFields over legacy content when both are present', () => {
      const fields: FormDataField[] = [
        { key: 'field', value: 'from-fields', type: 'text', enabled: true },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: {
            type: 'form-data',
            content: 'legacy=from-content',
            formDataFields: fields,
          },
        })
      );

      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('from-fields');
      expect(bodyStr).not.toContain('from-content');
    });

    it('returns empty for form-data with no content and no fields', () => {
      const result = RequestBuilder.buildBody(
        createRequest({ body: { type: 'form-data', content: '' } })
      );
      expect(result.bodyData).toBeUndefined();
      expect(result.contentType).toBeUndefined();
    });

    it('ends multipart body with closing boundary', () => {
      const fields: FormDataField[] = [
        { key: 'x', value: 'y', type: 'text', enabled: true },
      ];
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: '', formDataFields: fields },
        })
      );

      const bodyStr = (result.bodyData as Buffer).toString();
      // Extract boundary from content type
      const boundary = result.contentType!.split('boundary=')[1];
      expect(bodyStr).toContain(`--${boundary}--`);
    });
  });

  describe('buildUrlWithParams — encoding corner cases', () => {
    it('percent-encodes unicode values as UTF-8', () => {
      expect(
        RequestBuilder.buildUrlWithParams('https://api.example.com/s', {
          q: '你好',
        })
      ).toBe('https://api.example.com/s?q=%E4%BD%A0%E5%A5%BD');
    });

    it('keeps a literal plus sign encoded as %2B (distinct from space)', () => {
      // A space becomes "%20"; a literal "+" becomes "%2B" so they never alias.
      expect(
        RequestBuilder.buildUrlWithParams('https://api.example.com/s', {
          formula: '1+2 = 3',
        })
      ).toBe('https://api.example.com/s?formula=1%2B2%20%3D%203');
    });

    it('keeps structural characters (& = #) encoded inside values', () => {
      expect(
        RequestBuilder.buildUrlWithParams('https://api.example.com/s', {
          raw: 'a&b=c#d',
        })
      ).toBe('https://api.example.com/s?raw=a%26b%3Dc%23d');
    });

    it('restores /, :, ?, @ but keeps = encoded in a redirect-uri style value', () => {
      expect(
        RequestBuilder.buildUrlWithParams('https://api.example.com/authorize', {
          redirect_uri: 'https://app.example.com/cb?x=1',
        })
      ).toBe(
        'https://api.example.com/authorize?redirect_uri=https://app.example.com/cb?x%3D1'
      );
    });

    it('produces an empty value segment for empty-string params', () => {
      expect(
        RequestBuilder.buildUrlWithParams('https://api.example.com/s', {
          flag: '',
        })
      ).toBe('https://api.example.com/s?flag=');
    });
  });

  describe('buildHeaders — corner cases', () => {
    it('uses the default Bearer prefix for oauth2 when headerPrefix is absent', () => {
      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            auth: { type: 'oauth2', config: { accessToken: 'tok' } },
          })
        )
      ).toEqual({ Authorization: 'Bearer tok' });
    });

    it('does not override an existing header for a custom api-key (case-insensitive)', () => {
      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            headers: [{ key: 'x-custom', value: 'user', enabled: true }],
            auth: {
              type: 'api-key',
              config: { location: 'header', key: 'X-Custom', value: 'secret' },
            },
          })
        )
      ).toEqual({ 'x-custom': 'user' });
    });

    it('base64-encodes basic auth credentials as UTF-8 (unicode round-trips)', () => {
      const headers = RequestBuilder.buildHeaders(
        createRequest({
          auth: {
            type: 'basic',
            config: { username: 'usér', password: 'pä✓' },
          },
        })
      );
      const encoded = headers.Authorization.split(' ')[1];
      expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe('usér:pä✓');
    });

    it('normalizes SOAPAction header casing variants for SOAP requests', () => {
      for (const variant of ['soapaction', 'Soap-Action', 'SoapAction']) {
        const headers = RequestBuilder.buildHeaders(
          createRequest({
            soap: { version: '1.1' },
            headers: [{ key: variant, value: 'urn:doStuff', enabled: true }],
          })
        );
        expect(headers).toEqual({ SOAPAction: 'urn:doStuff' });
      }
    });

    it('leaves SOAPAction casing untouched for non-SOAP requests', () => {
      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            headers: [{ key: 'soapaction', value: 'urn:x', enabled: true }],
          })
        )
      ).toEqual({ soapaction: 'urn:x' });
    });

    it('supports the object header format alongside auth headers', () => {
      expect(
        RequestBuilder.buildHeaders(
          createRequest({
            headers: { Accept: 'application/json' },
            auth: { type: 'bearer', config: { token: 't' } },
          })
        )
      ).toEqual({ Accept: 'application/json', Authorization: 'Bearer t' });
    });
  });

  describe('addDefaultHeaders — byte length & content type', () => {
    it('computes Content-Length as UTF-8 byte length for multibyte strings', () => {
      // '你好' is 6 UTF-8 bytes, not 2 characters.
      const result = RequestBuilder.addDefaultHeaders({}, '你好', 'text/plain');
      expect(result['Content-Length']).toBe('6');
    });

    it('computes Content-Length for a Buffer body', () => {
      const result = RequestBuilder.addDefaultHeaders(
        {},
        Buffer.from([1, 2, 3, 4, 5]),
        'application/octet-stream'
      );
      expect(result['Content-Length']).toBe('5');
    });

    it('does not override a user Content-Type provided in lowercase', () => {
      const result = RequestBuilder.addDefaultHeaders(
        { 'content-type': 'text/plain' },
        'body',
        'application/json'
      );
      expect(result['content-type']).toBe('text/plain');
      expect(result['Content-Type']).toBeUndefined();
    });
  });

  describe('buildBody — legacy multipart parsing', () => {
    it('splits each line on the first = and keeps later = in the value', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: 'url=https://x/y?a=1' },
        })
      );
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('name="url"');
      expect(bodyStr).toContain('https://x/y?a=1');
    });

    it('skips lines without an = and lines with a blank key', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: 'novalue\n=orphan\nkey=val' },
        })
      );
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).not.toContain('novalue');
      expect(bodyStr).not.toContain('orphan');
      expect(bodyStr).toContain('name="key"');
      expect(bodyStr).toContain('val');
    });

    it('resolves the file name from the path when fileName is omitted', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: {
            type: 'form-data',
            content: '',
            formDataFields: [
              {
                key: 'upload',
                value: '/tmp/data.bin',
                type: 'file',
                enabled: true,
              },
            ],
          },
        })
      );
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('filename="data.bin"');
    });
  });

  describe('mergeParams — corner cases', () => {
    it('overrides matching keys for the record format', () => {
      expect(
        RequestBuilder.mergeParams({ a: '1', b: '2' }, { b: '3', c: '4' })
      ).toEqual({ a: '1', b: '3', c: '4' });
    });

    it('returns the original params reference when extraParams is empty', () => {
      const params = [{ key: 'a', value: '1', enabled: true }];
      expect(RequestBuilder.mergeParams(params, {})).toBe(params);
    });
  });

  // ===========================================================================
  // KNOWN ISSUES (characterization tests).
  // These lock in the CURRENT behavior and are documented in the session
  // report. Each marks a real discrepancy, not an endorsement.
  // ===========================================================================
  describe('duplicate keys, null-safety & variable encoding (fixed)', () => {
    it('does not throw on an undefined param value (treated as empty)', () => {
      expect(
        RequestBuilder.buildUrlWithParams('https://x/api', [
          { key: 'a', value: undefined as unknown as string, enabled: true },
        ])
      ).toBe('https://x/api?a=');
    });

    it('preserves duplicate query keys (?tag=a&tag=b), matching Postman/Insomnia', () => {
      expect(
        RequestBuilder.buildUrlWithParams('https://x/api', [
          { key: 'tag', value: 'a', enabled: true },
          { key: 'tag', value: 'b', enabled: true },
        ])
      ).toBe('https://x/api?tag=a&tag=b');
    });

    it('encodes variable-resolved param values exactly once (no double-encoding)', () => {
      // composeFinalRequest resolves {{ids}} -> "a,b" WITHOUT pre-encoding, then
      // buildUrlWithParams encodes once and restoreQuerySafeChars keeps the
      // comma literal -> matches Insomnia.
      const resolved = composeFinalRequest(
        createRequest({
          url: 'https://x/api',
          params: [{ key: 'ids', value: '{{ids}}', enabled: true }],
          variables: { ids: 'a,b' },
        })
      );
      expect(
        RequestBuilder.buildUrlWithParams('https://x/api', resolved.params)
      ).toBe('https://x/api?ids=a,b');
    });

    it('single-encodes a space in a variable-resolved value', () => {
      const resolved = composeFinalRequest(
        createRequest({
          url: 'https://x/api',
          params: [{ key: 'q', value: '{{term}}', enabled: true }],
          variables: { term: 'a b' },
        })
      );
      expect(
        RequestBuilder.buildUrlWithParams('https://x/api', resolved.params)
      ).toBe('https://x/api?q=a%20b');
    });

    it('safely encodes an ampersand in a variable value (not a separator)', () => {
      const resolved = composeFinalRequest(
        createRequest({
          url: 'https://x/api',
          params: [{ key: 'q', value: '{{term}}', enabled: true }],
          variables: { term: 'a&b' },
        })
      );
      expect(
        RequestBuilder.buildUrlWithParams('https://x/api', resolved.params)
      ).toBe('https://x/api?q=a%26b');
    });
  });

  describe('legacy form-data — CRLF handling (fixed)', () => {
    it('does not leave a stray \\r in values from CRLF-delimited content', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: 'a=1\r\nb=2' },
        })
      );
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('name="a"\r\n\r\n1\r\n');
      expect(bodyStr).toContain('name="b"\r\n\r\n2\r\n');
      expect(bodyStr).not.toContain('1\r\r\n');
    });

    it('still parses plain \\n-delimited content', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: { type: 'form-data', content: 'a=1\nb=2' },
        })
      );
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('name="a"\r\n\r\n1\r\n');
      expect(bodyStr).toContain('name="b"\r\n\r\n2\r\n');
    });
  });

  describe('space & multipart encoding (fixed)', () => {
    it('encodes spaces as %20, matching Insomnia/Postman', () => {
      expect(
        RequestBuilder.buildUrlWithParams('https://x/api', { q: 'a b' })
      ).toBe('https://x/api?q=a%20b');
    });

    it('escapes double-quotes in multipart field names (no injection)', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: {
            type: 'form-data',
            content: '',
            formDataFields: [
              {
                key: 'evil"; name="injected',
                value: 'x',
                type: 'text',
                enabled: true,
              },
            ],
          },
        })
      );
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('name="evil%22; name=%22injected"');
      expect(bodyStr).not.toContain('name="evil"; name="injected"');
    });

    it('escapes CR/LF in multipart field names (no header injection)', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: {
            type: 'form-data',
            content: '',
            formDataFields: [
              {
                key: 'a\r\nX-Injected: 1',
                value: 'x',
                type: 'text',
                enabled: true,
              },
            ],
          },
        })
      );
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('name="a%0D%0AX-Injected: 1"');
      expect(bodyStr).not.toContain('\r\nX-Injected: 1');
    });

    it('escapes a file filename and strips CR/LF from its Content-Type', () => {
      const result = RequestBuilder.buildBody(
        createRequest({
          body: {
            type: 'form-data',
            content: '',
            formDataFields: [
              {
                key: 'upload',
                value: '/tmp/photo.png',
                type: 'file',
                enabled: true,
                fileName: 'a".png',
                contentType: 'image/png\r\nX-Evil: 1',
              },
            ],
          },
        })
      );
      const bodyStr = (result.bodyData as Buffer).toString();
      expect(bodyStr).toContain('filename="a%22.png"');
      expect(bodyStr).toContain('Content-Type: image/pngX-Evil: 1');
      expect(bodyStr).not.toContain('image/png\r\nX-Evil: 1');
    });
  });
});
