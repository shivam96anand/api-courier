import { describe, expect, it } from 'vitest';
import { isHarDocument, mapHarDocument } from '../har';

describe('har importer', () => {
  describe('isHarDocument', () => {
    it('detects valid HAR', () => {
      expect(isHarDocument({ log: { entries: [] } })).toBe(true);
    });
    it('rejects when log.entries missing', () => {
      expect(isHarDocument({ log: {} })).toBe(false);
      expect(isHarDocument({})).toBe(false);
      expect(isHarDocument(null)).toBe(false);
    });
  });

  it('groups requests by host and maps headers + json body', () => {
    const har = {
      log: {
        creator: { name: 'Chrome' },
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://api.example.com/users?verbose=true',
              headers: [
                { name: 'Accept', value: 'application/json' },
                { name: ':authority', value: 'api.example.com' },
                { name: 'Content-Length', value: '0' },
              ],
              queryString: [{ name: 'verbose', value: 'true' }],
            },
          },
          {
            request: {
              method: 'POST',
              url: 'https://api.example.com/users',
              headers: [{ name: 'Content-Type', value: 'application/json' }],
              postData: {
                mimeType: 'application/json',
                text: '{"name":"a"}',
              },
            },
          },
          {
            request: {
              method: 'GET',
              url: 'https://cdn.example.org/asset.js',
              headers: [],
            },
          },
        ],
      },
    };

    const { rootFolder } = mapHarDocument(har);
    expect(rootFolder.name).toBe('Chrome Capture');
    // Two host folders: api.example.com and cdn.example.org
    expect(rootFolder.children).toHaveLength(2);
    const apiFolder = rootFolder.children!.find(
      (c) => c.name === 'api.example.com'
    )!;
    expect(apiFolder.children).toHaveLength(2);

    const get = apiFolder.children![0].request!;
    expect(get.method).toBe('GET');
    // pseudo-headers and content-length stripped
    expect(get.headers).toEqual({ Accept: 'application/json' });
    expect(get.params).toEqual({ verbose: 'true' });

    const post = apiFolder.children![1].request!;
    expect(post.body).toEqual({ type: 'json', content: '{"name":"a"}' });
  });

  it('maps urlencoded body via params', () => {
    const har = {
      log: {
        entries: [
          {
            request: {
              method: 'POST',
              url: 'https://x/form',
              headers: [],
              postData: {
                mimeType: 'application/x-www-form-urlencoded',
                params: [
                  { name: 'a', value: '1' },
                  { name: 'b', value: '2' },
                ],
              },
            },
          },
        ],
      },
    };
    const { rootFolder } = mapHarDocument(har);
    const req = rootFolder.children![0].children![0].request!;
    expect(req.body).toEqual({ type: 'form-urlencoded', content: 'a=1&b=2' });
  });
});
