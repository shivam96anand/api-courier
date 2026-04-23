import { describe, expect, it } from 'vitest';
import { isPawExport, mapPawExport } from '../paw';

describe('paw importer', () => {
  describe('isPawExport', () => {
    it('detects numeric-keyed paw doc', () => {
      expect(
        isPawExport({
          '1': { title: 'X', method: 'GET', url: 'https://x' },
        })
      ).toBe(true);
    });
    it('rejects empty / non-numeric', () => {
      expect(isPawExport({})).toBe(false);
      expect(isPawExport({ a: { method: 'GET', url: 'x' } })).toBe(false);
      expect(isPawExport([])).toBe(false);
    });
  });

  it('maps groups + requests with parent linking', () => {
    const doc = {
      '1': { title: 'Users', type: 'group', children: ['2'] },
      '2': {
        title: 'Get user',
        method: 'GET',
        url: 'https://api/users/42',
        parent: 1,
        headers: { Accept: 'application/json' },
      },
      '3': {
        title: 'Standalone',
        method: 'POST',
        url: 'https://api/x',
        body: '{"a":1}',
      },
    };
    const { rootFolder } = mapPawExport(doc);
    expect(rootFolder.children).toHaveLength(2);

    const group = rootFolder.children!.find((c) => c.name === 'Users')!;
    expect(group.type).toBe('folder');
    expect(group.children).toHaveLength(1);
    expect(group.children![0].request!.method).toBe('GET');
    expect(group.children![0].request!.headers).toEqual({
      Accept: 'application/json',
    });

    const standalone = rootFolder.children!.find(
      (c) => c.name === 'Standalone'
    )!;
    expect(standalone.request!.body).toEqual({
      type: 'json',
      content: '{"a":1}',
    });
  });
});
