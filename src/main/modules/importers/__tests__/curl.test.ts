import { describe, expect, it } from 'vitest';
import { isCurlCommand, mapCurlCommand } from '../curl';

describe('curl importer', () => {
  describe('isCurlCommand', () => {
    it('detects a curl command', () => {
      expect(isCurlCommand('curl https://x')).toBe(true);
      expect(isCurlCommand('  CURL  -X POST https://x')).toBe(true);
    });
    it('rejects non-curl text', () => {
      expect(isCurlCommand('GET https://x')).toBe(false);
      expect(isCurlCommand('')).toBe(false);
    });
  });

  it('maps a typical curl command to a single-request collection', () => {
    const { rootFolder } = mapCurlCommand(
      `curl -X POST 'https://api.example.com/users' \\
   -H 'Accept: application/json' \\
   -H 'Content-Type: application/json' \\
   -d '{"name":"alice"}'`
    );
    expect(rootFolder.children).toHaveLength(1);
    const req = rootFolder.children![0].request!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.example.com/users');
    expect((req.headers as Record<string, string>).Accept).toBe(
      'application/json'
    );
    expect(req.body).toEqual({
      type: 'json',
      content: '{"name":"alice"}',
    });
  });
});
