import { describe, expect, it } from 'vitest';
import { splitUrlAndParams, mergeParams } from '../url-query-parser';

describe('url-query-parser.ts — splitUrlAndParams', () => {
  it('leaves a URL without a query untouched', () => {
    expect(splitUrlAndParams('https://api.example.com/users')).toEqual({
      baseUrl: 'https://api.example.com/users',
      params: [],
    });
  });

  it('splits a simple query string', () => {
    const result = splitUrlAndParams('https://api.example.com/get?a=1&b=two');
    expect(result.baseUrl).toBe('https://api.example.com/get');
    expect(result.params).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: 'two', enabled: true },
    ]);
  });

  it('handles a trailing question mark with no pairs', () => {
    expect(splitUrlAndParams('https://api.example.com/get?')).toEqual({
      baseUrl: 'https://api.example.com/get',
      params: [],
    });
  });

  it('ignores a trailing ampersand', () => {
    const result = splitUrlAndParams('https://api.example.com/get?a=1&');
    expect(result.params).toEqual([{ key: 'a', value: '1', enabled: true }]);
  });

  it('keeps repeated keys as separate rows', () => {
    const result = splitUrlAndParams('https://api.example.com/get?a=1&a=2');
    expect(result.params).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'a', value: '2', enabled: true },
    ]);
  });

  it('supports a key with no value', () => {
    const result = splitUrlAndParams('https://api.example.com/get?flag');
    expect(result.params).toEqual([{ key: 'flag', value: '', enabled: true }]);
  });

  it('keeps equals signs that appear inside a value', () => {
    const result = splitUrlAndParams('https://api.example.com/get?q=a=b');
    expect(result.params).toEqual([{ key: 'q', value: 'a=b', enabled: true }]);
  });

  it('preserves a fragment on the base URL', () => {
    const result = splitUrlAndParams('https://api.example.com/p?a=1#section');
    expect(result.baseUrl).toBe('https://api.example.com/p#section');
    expect(result.params).toEqual([{ key: 'a', value: '1', enabled: true }]);
  });

  it('percent-decodes keys and values for display', () => {
    const result = splitUrlAndParams(
      'https://api.example.com/get?q=hello%20world%26x%3D1'
    );
    expect(result.params).toEqual([
      { key: 'q', value: 'hello world&x=1', enabled: true },
    ]);
  });

  it('decodes + as a space', () => {
    const result = splitUrlAndParams('https://api.example.com/get?q=a+b');
    expect(result.params[0].value).toBe('a b');
  });

  it('falls back to the raw text for malformed escapes', () => {
    const result = splitUrlAndParams('https://api.example.com/get?q=%zz');
    expect(result.params[0].value).toBe('%zz');
  });

  it('keeps template variables intact', () => {
    const result = splitUrlAndParams('https://{{host}}/get?tok={{token}}&id=7');
    expect(result.baseUrl).toBe('https://{{host}}/get');
    expect(result.params).toEqual([
      { key: 'tok', value: '{{token}}', enabled: true },
      { key: 'id', value: '7', enabled: true },
    ]);
  });

  it('drops pairs whose key is empty', () => {
    const result = splitUrlAndParams('https://api.example.com/get?=1&a=2');
    expect(result.params).toEqual([{ key: 'a', value: '2', enabled: true }]);
  });
});

describe('url-query-parser.ts — mergeParams', () => {
  it('drops blank placeholder rows before appending', () => {
    const { params } = mergeParams(
      [{ key: '', value: '', enabled: true }],
      [{ key: 'a', value: '1', enabled: true }]
    );
    expect(params).toEqual([{ key: 'a', value: '1', enabled: true }]);
  });

  it('appends without overwriting an existing key', () => {
    const { params, duplicateKeys } = mergeParams(
      [{ key: 'postId', value: '2', enabled: true }],
      [{ key: 'postId', value: '1', enabled: true }]
    );
    expect(params).toEqual([
      { key: 'postId', value: '2', enabled: true },
      { key: 'postId', value: '1', enabled: true },
    ]);
    expect(duplicateKeys).toEqual(['postId']);
  });

  it('reports no duplicates for disjoint keys', () => {
    const { params, duplicateKeys } = mergeParams(
      [{ key: 'a', value: '1', enabled: true }],
      [{ key: 'b', value: '2', enabled: true }]
    );
    expect(params).toHaveLength(2);
    expect(duplicateKeys).toEqual([]);
  });
});
