import { describe, expect, it } from 'vitest';
import {
  isHoppscotchCollection,
  isHoppscotchEnvironment,
  mapHoppscotchCollection,
  mapHoppscotchEnvironment,
} from '../hoppscotch';

describe('hoppscotch importer', () => {
  describe('isHoppscotchCollection', () => {
    it('detects a single root collection', () => {
      expect(
        isHoppscotchCollection({
          v: 2,
          name: 'Root',
          folders: [],
          requests: [],
        })
      ).toBe(true);
    });

    it('detects an array of root collections', () => {
      expect(
        isHoppscotchCollection([
          { v: 2, name: 'A', folders: [], requests: [] },
          { v: 2, name: 'B', folders: [], requests: [] },
        ])
      ).toBe(true);
    });

    it('rejects Postman collections', () => {
      expect(
        isHoppscotchCollection({
          info: {
            name: 'X',
            schema:
              'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
          },
          item: [],
        })
      ).toBe(false);
    });

    it('rejects Insomnia exports', () => {
      expect(
        isHoppscotchCollection({ __export_format: 4, resources: [] })
      ).toBe(false);
    });

    it('rejects unrelated objects', () => {
      expect(isHoppscotchCollection({ name: 'foo' })).toBe(false);
      expect(isHoppscotchCollection(null)).toBe(false);
    });
  });

  describe('isHoppscotchEnvironment', () => {
    it('detects a single environment', () => {
      expect(
        isHoppscotchEnvironment({
          name: 'Dev',
          variables: [{ key: 'baseUrl', value: 'http://x' }],
        })
      ).toBe(true);
    });

    it('detects an environment array', () => {
      expect(
        isHoppscotchEnvironment([
          { name: 'A', variables: [] },
          { name: 'B', variables: [{ key: 'k', value: 'v' }] },
        ])
      ).toBe(true);
    });

    it('rejects Postman environments (uses values not variables)', () => {
      expect(
        isHoppscotchEnvironment({
          name: 'X',
          values: [{ key: 'k', value: 'v' }],
        })
      ).toBe(false);
    });
  });

  describe('mapHoppscotchCollection', () => {
    it('maps requests with headers, params, json body, bearer auth', () => {
      const data = {
        v: 2,
        name: 'Users API',
        folders: [],
        requests: [
          {
            v: 2,
            name: 'Get user',
            method: 'GET',
            endpoint: 'https://api.example.com/users/{{id}}',
            params: [
              { key: 'verbose', value: 'true', active: true },
              { key: 'skip', value: 'x', active: false },
            ],
            headers: [
              { key: 'Accept', value: 'application/json', active: true },
            ],
            body: { contentType: null, body: null },
            auth: { authType: 'bearer', authActive: true, token: '{{token}}' },
          },
          {
            v: 2,
            name: 'Create user',
            method: 'POST',
            endpoint: 'https://api.example.com/users',
            params: [],
            headers: [],
            body: {
              contentType: 'application/json',
              body: '{"name":"alice"}',
            },
            auth: { authType: 'none' },
          },
        ],
      };

      const { rootFolder } = mapHoppscotchCollection(data);
      expect(rootFolder.name).toBe('Users API');
      expect(rootFolder.children).toHaveLength(2);

      const get = rootFolder.children![0];
      expect(get.type).toBe('request');
      expect(get.request!.method).toBe('GET');
      expect(get.request!.url).toBe('https://api.example.com/users/{{id}}');
      expect(get.request!.params).toEqual({ verbose: 'true' });
      expect(get.request!.headers).toEqual({ Accept: 'application/json' });
      expect(get.request!.auth).toEqual({
        type: 'bearer',
        config: { token: '{{token}}' },
      });

      const post = rootFolder.children![1];
      expect(post.request!.method).toBe('POST');
      expect(post.request!.body).toEqual({
        type: 'json',
        content: '{"name":"alice"}',
      });
      expect(post.request!.auth).toBeUndefined();
    });

    it('maps nested folders recursively', () => {
      const data = {
        v: 2,
        name: 'Root',
        folders: [
          {
            v: 2,
            name: 'Sub',
            folders: [],
            requests: [
              {
                v: 2,
                name: 'Ping',
                method: 'GET',
                endpoint: 'https://x/ping',
                params: [],
                headers: [],
              },
            ],
          },
        ],
        requests: [],
      };
      const { rootFolder } = mapHoppscotchCollection(data);
      expect(rootFolder.children).toHaveLength(1);
      const sub = rootFolder.children![0];
      expect(sub.type).toBe('folder');
      expect(sub.name).toBe('Sub');
      expect(sub.children).toHaveLength(1);
      expect(sub.children![0].request!.url).toBe('https://x/ping');
    });

    it('wraps multiple roots under a synthetic folder', () => {
      const data = [
        { v: 2, name: 'A', folders: [], requests: [] },
        { v: 2, name: 'B', folders: [], requests: [] },
      ];
      const { rootFolder } = mapHoppscotchCollection(data);
      expect(rootFolder.name).toBe('Hoppscotch Import');
      expect(rootFolder.children).toHaveLength(2);
    });

    it('maps urlencoded body', () => {
      const data = {
        v: 2,
        name: 'R',
        folders: [],
        requests: [
          {
            v: 2,
            name: 'Form',
            method: 'POST',
            endpoint: 'https://x/form',
            params: [],
            headers: [],
            body: {
              contentType: 'application/x-www-form-urlencoded',
              body: [
                { key: 'a', value: '1', active: true },
                { key: 'b', value: '2', active: true },
                { key: 'c', value: '3', active: false },
              ],
            },
          },
        ],
      };
      const { rootFolder } = mapHoppscotchCollection(data);
      expect(rootFolder.children![0].request!.body).toEqual({
        type: 'form-urlencoded',
        content: 'a=1&b=2',
      });
    });

    it('maps oauth2 with grantTypeInfo', () => {
      const data = {
        v: 3,
        name: 'R',
        folders: [],
        requests: [
          {
            v: 3,
            name: 'Auth',
            method: 'GET',
            endpoint: 'https://x/me',
            params: [],
            headers: [],
            auth: {
              authType: 'oauth-2',
              authActive: true,
              grantTypeInfo: {
                grantType: 'AUTHORIZATION_CODE',
                authEndpoint: 'https://auth/x',
                tokenEndpoint: 'https://auth/token',
                clientID: 'cid',
                clientSecret: 'sec',
                scopes: 'read write',
                token: 'abc',
              },
            },
          },
        ],
      };
      const { rootFolder } = mapHoppscotchCollection(data);
      expect(rootFolder.children![0].request!.auth).toEqual({
        type: 'oauth2',
        config: {
          grantType: 'AUTHORIZATION_CODE',
          authUrl: 'https://auth/x',
          tokenUrl: 'https://auth/token',
          accessTokenUrl: 'https://auth/token',
          clientId: 'cid',
          clientSecret: 'sec',
          scope: 'read write',
          accessToken: 'abc',
        },
      });
    });
  });

  describe('mapHoppscotchEnvironment', () => {
    it('maps a single environment', () => {
      const envs = mapHoppscotchEnvironment({
        name: 'Dev',
        variables: [
          { key: 'baseUrl', value: 'https://api.dev' },
          { key: 'token', value: 'xxx' },
          { key: '', value: 'skipped' },
        ],
      });
      expect(envs).toHaveLength(1);
      expect(envs[0].name).toBe('Dev');
      expect(envs[0].variables).toEqual({
        baseUrl: 'https://api.dev',
        token: 'xxx',
      });
    });

    it('maps an environment array', () => {
      const envs = mapHoppscotchEnvironment([
        { name: 'A', variables: [] },
        { name: 'B', variables: [{ key: 'k', value: 'v' }] },
      ]);
      expect(envs).toHaveLength(2);
      expect(envs[1].variables).toEqual({ k: 'v' });
    });
  });
});
