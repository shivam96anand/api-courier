import { describe, expect, it } from 'vitest';
import { parseCurlCommand } from '../curl-executor';

describe('curl-executor.ts — parseCurlCommand', () => {
  it('parses a simple GET request', () => {
    const result = parseCurlCommand('curl https://api.example.com/users');
    expect(result.method).toBe('GET');
    expect(result.url).toBe('https://api.example.com/users');
    expect(result.headers).toEqual({});
    expect(result.body).toBeUndefined();
  });

  it('parses method with -X flag', () => {
    const result = parseCurlCommand(
      'curl -X POST https://api.example.com/users'
    );
    expect(result.method).toBe('POST');
  });

  it('parses method with --request flag', () => {
    const result = parseCurlCommand(
      'curl --request PUT https://api.example.com/users/1'
    );
    expect(result.method).toBe('PUT');
  });

  it('parses headers with -H flag', () => {
    const result = parseCurlCommand(
      "curl -H 'Content-Type: application/json' -H 'Accept: text/html' https://api.example.com"
    );
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.headers['Accept']).toBe('text/html');
  });

  it('parses headers with --header flag', () => {
    const result = parseCurlCommand(
      'curl --header "Authorization: Bearer abc123" https://api.example.com'
    );
    expect(result.headers['Authorization']).toBe('Bearer abc123');
  });

  it('parses body with -d flag and sets POST method', () => {
    const result = parseCurlCommand(
      'curl -d \'{"name":"John"}\' https://api.example.com/users'
    );
    expect(result.method).toBe('POST');
    expect(result.body).toBe('{"name":"John"}');
  });

  it('parses body with --data flag', () => {
    const result = parseCurlCommand(
      'curl --data "key=value" https://api.example.com'
    );
    expect(result.method).toBe('POST');
    expect(result.body).toBe('key=value');
  });

  it('concatenates multiple -d flags', () => {
    const result = parseCurlCommand(
      'curl -d "a=1" -d "b=2" https://api.example.com'
    );
    expect(result.body).toBe('a=1&b=2');
  });

  it('parses --data-raw flag', () => {
    const result = parseCurlCommand(
      'curl --data-raw "raw-body" https://api.example.com'
    );
    expect(result.body).toBe('raw-body');
  });

  it('parses --data-urlencode and sets Content-Type', () => {
    const result = parseCurlCommand(
      'curl --data-urlencode "name=John Doe" https://api.example.com'
    );
    expect(result.body).toBe('name=John Doe');
    expect(result.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
  });

  it('parses basic auth with -u flag', () => {
    const result = parseCurlCommand(
      'curl -u user:pass https://api.example.com'
    );
    expect(result.headers['Authorization']).toBe(
      `Basic ${Buffer.from('user:pass').toString('base64')}`
    );
  });

  it('parses user agent with -A flag', () => {
    const result = parseCurlCommand(
      "curl -A 'MyAgent/1.0' https://api.example.com"
    );
    expect(result.headers['User-Agent']).toBe('MyAgent/1.0');
  });

  it('parses cookie with -b flag', () => {
    const result = parseCurlCommand(
      "curl -b 'session=abc123' https://api.example.com"
    );
    expect(result.headers['Cookie']).toBe('session=abc123');
  });

  it('parses referer with -e flag', () => {
    const result = parseCurlCommand(
      "curl -e 'https://origin.com' https://api.example.com"
    );
    expect(result.headers['Referer']).toBe('https://origin.com');
  });

  it('collects boolean flags like -k, -L, -v, -s', () => {
    const result = parseCurlCommand('curl -k -L -v -s https://api.example.com');
    expect(result.flags).toContain('-k');
    expect(result.flags).toContain('-L');
    expect(result.flags).toContain('-v');
    expect(result.flags).toContain('-s');
  });

  it('handles --insecure and --location long flags', () => {
    const result = parseCurlCommand(
      'curl --insecure --location https://api.example.com'
    );
    expect(result.flags).toContain('--insecure');
    expect(result.flags).toContain('--location');
  });

  it('handles --connect-timeout and --max-time', () => {
    const result = parseCurlCommand(
      'curl --connect-timeout 10 --max-time 30 https://api.example.com'
    );
    expect(result.flags).toContain('--connect-timeout 10');
    expect(result.flags).toContain('--max-time 30');
  });

  it('prepends https:// when URL has no protocol', () => {
    const result = parseCurlCommand('curl api.example.com/users');
    expect(result.url).toBe('https://api.example.com/users');
  });

  it('preserves http:// protocol', () => {
    const result = parseCurlCommand('curl http://localhost:3000/api');
    expect(result.url).toBe('http://localhost:3000/api');
  });

  it('handles line continuations (backslash newline)', () => {
    const result = parseCurlCommand(
      "curl \\\n  -X POST \\\n  -H 'Content-Type: application/json' \\\n  https://api.example.com"
    );
    expect(result.method).toBe('POST');
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.url).toBe('https://api.example.com');
  });

  it('handles double-quoted strings with escaped characters', () => {
    const result = parseCurlCommand(
      'curl -H "X-Custom: he\\"llo" https://api.example.com'
    );
    expect(result.headers['X-Custom']).toBe('he"llo');
  });

  it("handles $'...' ANSI-C quoting", () => {
    const result = parseCurlCommand(
      "curl -d $'line1\\nline2' https://api.example.com"
    );
    // The tokenizer treats \n as literal 'n' after backslash escape
    expect(result.body).toBe('line1nline2');
  });

  it('defaults to GET when no method specified and no data', () => {
    const result = parseCurlCommand('curl https://api.example.com');
    expect(result.method).toBe('GET');
  });

  it('handles a complex real-world curl command', () => {
    const result = parseCurlCommand(
      "curl -X POST 'https://api.example.com/data' " +
        "-H 'Authorization: Bearer token123' " +
        "-H 'Content-Type: application/json' " +
        '-d \'{"key":"value"}\' ' +
        '-k -L'
    );

    expect(result.method).toBe('POST');
    expect(result.url).toBe('https://api.example.com/data');
    expect(result.headers['Authorization']).toBe('Bearer token123');
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.body).toBe('{"key":"value"}');
    expect(result.flags).toContain('-k');
    expect(result.flags).toContain('-L');
  });

  it('handles command without "curl" prefix', () => {
    const result = parseCurlCommand(
      '-X DELETE https://api.example.com/users/1'
    );
    expect(result.method).toBe('DELETE');
    expect(result.url).toBe('https://api.example.com/users/1');
  });

  it('uses POST when -d is provided before -X', () => {
    // -d sets method to POST only when current method is GET
    // -X GET after -d resets it to GET
    const result = parseCurlCommand(
      "curl -X POST -d 'data' https://api.example.com"
    );
    expect(result.method).toBe('POST');
  });

  it('strips trailing shell pipelines (| jq …)', () => {
    const result = parseCurlCommand(
      "curl -s https://api.example.com/repos | jq '.[].assets[] | {name}'"
    );
    expect(result.url).toBe('https://api.example.com/repos');
    // jq tokens must not leak into flags
    expect(result.flags.some((f) => f.includes('jq'))).toBe(false);
    expect(result.flags.some((f) => f.includes('|'))).toBe(false);
  });

  it('strips shell redirects and command separators', () => {
    const result = parseCurlCommand(
      'curl https://api.example.com > out.json && echo done'
    );
    expect(result.url).toBe('https://api.example.com');
    expect(result.flags.some((f) => f.includes('echo'))).toBe(false);
  });

  it('does not strip pipes inside quoted arguments', () => {
    const result = parseCurlCommand(
      "curl -H 'X-Filter: a|b' https://api.example.com"
    );
    expect(result.url).toBe('https://api.example.com');
    expect(result.headers['X-Filter']).toBe('a|b');
  });
});
