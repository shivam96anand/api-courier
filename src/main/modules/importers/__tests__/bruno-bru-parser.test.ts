import { describe, expect, it } from 'vitest';
import { parseBruFile, dictToRecord, findBlock } from '../bruno-bru-parser';

describe('bruno .bru parser', () => {
  it('parses dict blocks with disabled keys', () => {
    const text = `meta {
  name: Get Users
  type: http
  seq: 1
}

headers {
  Accept: application/json
  ~X-Disabled: nope
}
`;
    const blocks = parseBruFile(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].name).toBe('meta');
    if (blocks[0].body.kind !== 'dict') throw new Error('expected dict');
    expect(dictToRecord(blocks[0].body.entries)).toEqual({
      name: 'Get Users',
      type: 'http',
      seq: '1',
    });

    if (blocks[1].body.kind !== 'dict') throw new Error('expected dict');
    expect(blocks[1].body.entries).toHaveLength(2);
    expect(blocks[1].body.entries[1]).toMatchObject({
      key: 'X-Disabled',
      value: 'nope',
      enabled: false,
    });
    // Disabled keys are dropped by dictToRecord.
    expect(dictToRecord(blocks[1].body.entries)).toEqual({
      Accept: 'application/json',
    });
  });

  it('captures raw body blocks verbatim including braces', () => {
    const text = `body:json {
  {
    "name": "alice",
    "tags": { "x": 1 }
  }
}
`;
    const blocks = parseBruFile(text);
    const body = findBlock(blocks, 'body:json');
    expect(body).toBeDefined();
    if (body!.body.kind !== 'raw') throw new Error('expected raw');
    expect(body!.body.text).toContain('"name": "alice"');
    expect(body!.body.text).toContain('"tags": { "x": 1 }');
  });

  it('throws on unmatched braces', () => {
    expect(() => parseBruFile('headers {\n  a: b\n')).toThrow(/unmatched/);
  });

  it('handles CRLF line endings', () => {
    const text = 'meta {\r\n  name: X\r\n}\r\n';
    const blocks = parseBruFile(text);
    expect(blocks).toHaveLength(1);
    if (blocks[0].body.kind !== 'dict') throw new Error('expected dict');
    expect(dictToRecord(blocks[0].body.entries)).toEqual({ name: 'X' });
  });
});
