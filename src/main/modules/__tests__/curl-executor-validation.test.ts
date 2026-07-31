import { describe, expect, it } from 'vitest';
import { validateCurlCommand } from '../curl-executor';

describe('curl-executor.ts — validateCurlCommand', () => {
  describe('rejects shell control operators', () => {
    const blocked: Array<[string, string]> = [
      ['semicolon', 'curl https://api.example.com ; touch /tmp/pwned'],
      ['pipe', 'curl https://api.example.com | jq .'],
      ['logical AND', 'curl https://api.example.com && rm -rf /tmp/x'],
      ['logical OR', 'curl https://api.example.com || echo failed'],
      ['output redirect', 'curl https://api.example.com > /tmp/out.json'],
      ['input redirect', 'curl -d @- https://api.example.com < /etc/passwd'],
      ['backtick substitution', 'curl https://api.example.com/`whoami`'],
      ['dollar substitution', 'curl https://api.example.com/$(whoami)'],
      [
        'chained curls',
        'curl https://a.example.com ; curl https://b.example.com',
      ],
    ];

    it.each(blocked)('blocks %s', (_label, command) => {
      const result = validateCurlCommand(command);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });

    it('mentions jq is unnecessary when a pipe is used', () => {
      const result = validateCurlCommand('curl https://api.example.com | jq');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/jq/i);
      }
    });
  });

  describe('accepts legitimate commands', () => {
    const allowed: Array<[string, string]> = [
      ['plain GET', 'curl https://api.example.com/users'],
      [
        'pipe inside a single-quoted body',
        `curl -X POST -d '{"expr":"a|b"}' https://api.example.com`,
      ],
      [
        'semicolon inside a double-quoted header',
        'curl -H "X-List: a;b;c" https://api.example.com',
      ],
      [
        'ampersands in an unquoted query string',
        'curl https://api.example.com/search?a=1&b=2',
      ],
      [
        'redirect characters inside a quoted body',
        `curl -d '{"cmp":"a>b<c"}' https://api.example.com`,
      ],
      [
        'backslash line continuations',
        "curl \\\n  -X POST \\\n  -H 'Content-Type: application/json' \\\n  https://api.example.com",
      ],
      [
        'real newlines inside a quoted JSON body',
        `curl -d '{\n  "a": 1\n}' https://api.example.com`,
      ],
      ['uppercase CURL', 'CURL https://api.example.com'],
      ['copied shell prompt prefix', '$ curl https://api.example.com'],
      [
        'ANSI-C quoted data',
        "curl -d $'line1\\nline2' https://api.example.com",
      ],
    ];

    it.each(allowed)('allows %s', (_label, command) => {
      expect(validateCurlCommand(command)).toEqual({ ok: true });
    });
  });

  describe('requires a curl command', () => {
    it('rejects a non-curl program', () => {
      const result = validateCurlCommand('wget https://api.example.com');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/curl/i);
      }
    });

    it('rejects a bare URL', () => {
      expect(validateCurlCommand('https://api.example.com').ok).toBe(false);
    });

    it('rejects an empty command', () => {
      expect(validateCurlCommand('   ').ok).toBe(false);
    });
  });
});
