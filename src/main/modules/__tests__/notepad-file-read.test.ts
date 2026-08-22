import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { looksBinary, readTextFile } from '../notepad-file-read';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'restbro-notepad-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(name: string, data: Buffer | string): Promise<string> {
  const filePath = join(dir, name);
  await writeFile(filePath, data);
  return filePath;
}

describe('looksBinary', () => {
  it('accepts plain text and empty files', () => {
    expect(looksBinary(Buffer.from('{"a":1}\n'))).toBe(false);
    expect(looksBinary(Buffer.from(''))).toBe(false);
    expect(looksBinary(Buffer.from('héllo — ünicode ✓'))).toBe(false);
  });

  it('rejects buffers containing a NUL byte', () => {
    expect(looksBinary(Buffer.from([0x50, 0x4b, 0x03, 0x00, 0x41]))).toBe(true);
  });

  it('rejects buffers dominated by control bytes', () => {
    expect(looksBinary(Buffer.alloc(64, 0x01))).toBe(true);
  });

  it('accepts UTF-16 text despite its NUL bytes', () => {
    expect(looksBinary(Buffer.from('\ufeffhello', 'utf16le'))).toBe(false);
  });
});

describe('readTextFile', () => {
  it('reads UTF-8 files', async () => {
    const path = await write('a.json5', '{ a: 1, /* c */ }\n');
    await expect(readTextFile(path)).resolves.toEqual({
      content: '{ a: 1, /* c */ }\n',
    });
  });

  it('strips a UTF-8 BOM', async () => {
    const path = await write(
      'bom.txt',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello')])
    );
    const result = await readTextFile(path);
    expect(result.content).toBe('hello');
  });

  it('decodes UTF-16 LE and BE', async () => {
    const le = await write('le.txt', Buffer.from('\ufeffhi there', 'utf16le'));
    expect((await readTextFile(le)).content).toBe('hi there');

    const beBody = Buffer.from('\ufeffhi there', 'utf16le');
    beBody.swap16();
    const be = await write('be.txt', beBody);
    expect((await readTextFile(be)).content).toBe('hi there');
  });

  it('refuses binary files with a friendly message', async () => {
    const path = await write(
      'image.png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
    );
    const result = await readTextFile(path);
    expect(result.content).toBeUndefined();
    expect(result.error).toMatch(/binary/i);
  });

  it('refuses directories', async () => {
    const result = await readTextFile(dir);
    expect(result.error).toMatch(/folder/i);
  });
});
