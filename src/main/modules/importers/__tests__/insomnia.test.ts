import { describe, expect, it } from 'vitest';
import { isInsomniaExport, mapInsomniaExport } from '../insomnia';

describe('insomnia.ts', () => {
  describe('isInsomniaExport', () => {
    it('returns true for V4 format (has __export_format and resources)', () => {
      expect(
        isInsomniaExport({
          __export_format: 4,
          resources: [{ _type: 'workspace', _id: 'wrk_1', name: 'My API' }],
        })
      ).toBe(true);
    });

    it('returns true for V5 format (has type containing "insomnia" and collection)', () => {
      expect(
        isInsomniaExport({
          type: 'insomnia.exportv5',
          collection: [{ name: 'test', method: 'GET', url: 'http://test.com' }],
        })
      ).toBeTruthy();
    });

    it('returns false for Postman payload', () => {
      expect(
        isInsomniaExport({
          info: { schema: 'https://schema.getpostman.com/v2.1.0' },
          item: [],
        })
      ).toBeFalsy();
    });

    it('returns false for empty object', () => {
      expect(isInsomniaExport({})).toBeFalsy();
    });

    it('throws for null/undefined (no guard)', () => {
      expect(() => isInsomniaExport(null)).toThrow();
      expect(() => isInsomniaExport(undefined)).toThrow();
    });
  });

  describe('mapInsomniaExport — V4', () => {
    const v4Data = {
      __export_format: 4,
      resources: [
        { _id: 'wrk_1', _type: 'workspace', name: 'My Workspace' },
        {
          _id: 'env_1',
          _type: 'environment',
          name: 'Dev',
          data: { host: 'localhost', port: '3000' },
          parentId: 'wrk_1',
        },
        {
          _id: 'fld_1',
          _type: 'request_group',
          name: 'Users',
          parentId: 'wrk_1',
        },
        {
          _id: 'req_1',
          _type: 'request',
          name: 'Get Users',
          url: 'https://{{_.host}}/users',
          method: 'GET',
          headers: [{ name: 'Accept', value: 'application/json' }],
          parentId: 'fld_1',
        },
      ],
    };

    it('creates root folder from workspace name', () => {
      const { rootFolder } = mapInsomniaExport(v4Data);
      expect(rootFolder.type).toBe('folder');
      expect(rootFolder.name).toBe('My Workspace');
    });

    it('maps environments with variables', () => {
      const { environments } = mapInsomniaExport(v4Data);
      expect(environments).toHaveLength(1);
      expect(environments[0].name).toBe('Dev');
      expect(environments[0].variables).toEqual({
        host: 'localhost',
        port: '3000',
      });
    });

    it('maps request groups as folder collections', () => {
      const { rootFolder } = mapInsomniaExport(v4Data);
      expect(rootFolder.children).toHaveLength(1);
      const folder = rootFolder.children![0];
      expect(folder.type).toBe('folder');
      expect(folder.name).toBe('Users');
    });

    it('maps requests as request collections', () => {
      const { rootFolder } = mapInsomniaExport(v4Data);
      const folder = rootFolder.children![0];
      expect(folder.children).toHaveLength(1);
      const req = folder.children![0];
      expect(req.type).toBe('request');
      expect(req.request?.method).toBe('GET');
    });

    it('converts Insomnia {{_. variables to {{}} format', () => {
      const { rootFolder } = mapInsomniaExport(v4Data);
      const req = rootFolder.children![0].children![0].request!;
      expect(req.url).toBe('https://{{host}}/users');
    });

    it('maps request headers', () => {
      const { rootFolder } = mapInsomniaExport(v4Data);
      const req = rootFolder.children![0].children![0].request!;
      expect(req.headers).toEqual({ Accept: 'application/json' });
    });
  });

  describe('mapInsomniaExport — V5', () => {
    const v5Data = {
      type: 'insomnia.exportv5',
      name: 'V5 Collection',
      collection: [
        {
          name: 'Auth',
          children: [
            {
              name: 'Login',
              method: 'POST',
              url: 'https://api.example.com/login',
              body: {
                mimeType: 'application/json',
                text: '{"user":"admin"}',
              },
            },
          ],
        },
      ],
      environments: {
        name: 'Base',
        host: 'api.example.com',
      },
    };

    it('maps V5 collection structure', () => {
      const { rootFolder } = mapInsomniaExport(v5Data);
      // V5 may unwrap single-child root; find the Auth folder
      const authFolder =
        rootFolder.name === 'Auth'
          ? rootFolder
          : (rootFolder.children?.find((c) => c.name === 'Auth') ?? rootFolder);
      expect(authFolder.name).toBe('Auth');
      expect(authFolder.type).toBe('folder');
    });

    it('maps V5 requests', () => {
      const { rootFolder } = mapInsomniaExport(v5Data);
      const authFolder =
        rootFolder.name === 'Auth'
          ? rootFolder
          : (rootFolder.children?.find((c) => c.name === 'Auth') ?? rootFolder);
      const loginReq = authFolder.children![0];
      expect(loginReq.type).toBe('request');
      expect(loginReq.request?.method).toBe('POST');
      expect(loginReq.request?.body?.type).toBe('json');
    });

    it('maps V5 environments', () => {
      const { environments } = mapInsomniaExport(v5Data);
      expect(environments).toHaveLength(1);
      expect(environments[0].name).toBe('Base');
      expect(environments[0].variables).toEqual({ host: 'api.example.com' });
    });
  });

  describe('mapInsomniaExport — invalid', () => {
    it('throws for invalid Insomnia format', () => {
      expect(() => mapInsomniaExport({ invalid: true })).toThrow(
        'Invalid Insomnia export format'
      );
    });
  });

  describe('mapInsomniaExport — V5 edge cases', () => {
    it('maps V5 folder variables', () => {
      const v5Data = {
        type: 'insomnia.exportv5',
        name: 'Env Test',
        collection: [
          {
            name: 'FolderWithVars',
            environment: { baseUrl: 'http://localhost:3000' },
            children: [
              {
                name: 'Get Data',
                method: 'GET',
                url: '{{baseUrl}}/data',
              },
            ],
          },
        ],
      };

      const { rootFolder } = mapInsomniaExport(v5Data);
      const folder =
        rootFolder.name === 'FolderWithVars'
          ? rootFolder
          : (rootFolder.children?.find((c) => c.name === 'FolderWithVars') ??
            rootFolder);
      expect(folder.variables).toEqual({ baseUrl: 'http://localhost:3000' });
    });

    it('maps V5 form-urlencoded body', () => {
      const v5Data = {
        type: 'insomnia.exportv5',
        collection: [
          {
            name: 'Form Request',
            method: 'POST',
            url: 'https://example.com/form',
            body: {
              mimeType: 'application/x-www-form-urlencoded',
              params: [
                { name: 'username', value: 'admin' },
                { name: 'password', value: 'secret' },
              ],
            },
          },
        ],
      };

      const { rootFolder } = mapInsomniaExport(v5Data);
      const req = (rootFolder.children?.[0] ?? rootFolder).request!;
      expect(req.body?.type).toBe('form-urlencoded');
      expect(req.body?.content).toContain('username=admin');
    });

    it('maps V5 multipart body', () => {
      const v5Data = {
        type: 'insomnia.exportv5',
        collection: [
          {
            name: 'Multipart',
            method: 'POST',
            url: 'https://example.com/upload',
            body: {
              mimeType: 'multipart/form-data',
              params: [{ name: 'file', value: 'data' }],
            },
          },
        ],
      };

      const { rootFolder } = mapInsomniaExport(v5Data);
      const req = (rootFolder.children?.[0] ?? rootFolder).request!;
      expect(req.body?.type).toBe('form-data');
    });

    it('maps V5 request with headers', () => {
      const v5Data = {
        type: 'insomnia.exportv5',
        collection: [
          {
            name: 'With Headers',
            method: 'GET',
            url: 'https://example.com',
            headers: [
              { name: 'Accept', value: 'application/json' },
              { name: 'X-Custom', value: 'test', disabled: false },
              { name: 'Disabled', value: 'skip', disabled: true },
            ],
          },
        ],
      };

      const { rootFolder } = mapInsomniaExport(v5Data);
      const req = (rootFolder.children?.[0] ?? rootFolder).request!;
      expect(req.headers).toEqual({
        Accept: 'application/json',
        'X-Custom': 'test',
      });
    });
  });
});
