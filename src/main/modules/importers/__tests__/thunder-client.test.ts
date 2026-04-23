import { describe, expect, it } from 'vitest';
import {
  isThunderClientCollection,
  isThunderClientEnvironment,
  mapThunderClientCollection,
  mapThunderClientEnvironment,
} from '../thunder-client';

describe('thunder client importer', () => {
  describe('detection', () => {
    it('detects collection', () => {
      expect(
        isThunderClientCollection({
          clientName: 'Thunder Client',
          collectionName: 'X',
          requests: [],
        })
      ).toBe(true);
    });
    it('rejects non-Thunder docs', () => {
      expect(isThunderClientCollection({ requests: [] })).toBe(false);
      expect(isThunderClientCollection(null)).toBe(false);
    });
    it('detects environment', () => {
      expect(
        isThunderClientEnvironment({
          clientName: 'Thunder Client',
          name: 'Dev',
          data: [],
        })
      ).toBe(true);
    });
  });

  describe('mapThunderClientCollection', () => {
    it('maps folders, requests, body, auth, path params', () => {
      const data = {
        clientName: 'Thunder Client',
        collectionName: 'Users',
        folders: [{ _id: 'f1', name: 'Auth', containerId: '', sortNum: 1 }],
        requests: [
          {
            _id: 'r1',
            containerId: 'f1',
            name: 'Get user',
            url: 'https://api/users/:id',
            method: 'GET',
            sortNum: 1,
            headers: [{ name: 'Accept', value: 'application/json' }],
            params: [
              { name: 'id', value: '42', isPath: true },
              { name: 'verbose', value: 'true' },
            ],
            auth: { type: 'bearer', bearer: 'xyz' },
          },
          {
            _id: 'r2',
            containerId: '',
            name: 'Create',
            url: 'https://api/things',
            method: 'POST',
            sortNum: 2,
            body: { type: 'json', raw: '{"name":"a"}' },
          },
        ],
      };
      const { rootFolder } = mapThunderClientCollection(data);
      expect(rootFolder.name).toBe('Users');
      // r2 is at root, f1 (Auth) is also at root
      expect(rootFolder.children).toHaveLength(2);
      const folder = rootFolder.children!.find((c) => c.type === 'folder')!;
      expect(folder.name).toBe('Auth');
      expect(folder.children).toHaveLength(1);

      const get = folder.children![0].request!;
      expect(get.method).toBe('GET');
      expect(get.params).toEqual({ verbose: 'true' });
      expect(get.variables).toEqual({ id: '42' });
      expect(get.auth).toEqual({ type: 'bearer', config: { token: 'xyz' } });

      const post = rootFolder.children!.find(
        (c) => c.type === 'request'
      )!.request!;
      expect(post.body).toEqual({ type: 'json', content: '{"name":"a"}' });
    });

    it('maps formencoded body', () => {
      const data = {
        clientName: 'Thunder Client',
        collectionName: 'C',
        requests: [
          {
            _id: 'r1',
            name: 'F',
            url: 'https://x',
            method: 'POST',
            body: {
              type: 'formencoded',
              form: [
                { name: 'a', value: '1' },
                { name: 'b', value: '2', isDisabled: true },
              ],
            },
          },
        ],
      };
      const { rootFolder } = mapThunderClientCollection(data);
      const req = rootFolder.children![0].request!;
      expect(req.body).toEqual({ type: 'form-urlencoded', content: 'a=1' });
    });
  });

  it('maps environment', () => {
    const env = mapThunderClientEnvironment({
      clientName: 'Thunder Client',
      name: 'Dev',
      data: [
        { name: 'baseUrl', value: 'https://x' },
        { name: 'token', value: 't' },
      ],
    });
    expect(env.name).toBe('Dev');
    expect(env.variables).toEqual({ baseUrl: 'https://x', token: 't' });
  });
});
