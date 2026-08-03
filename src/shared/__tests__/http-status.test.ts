import { describe, it, expect } from 'vitest';
import { resolveStatusText, formatStatusLine } from '../http-status';

describe('resolveStatusText', () => {
  it('prefers the reason phrase sent by the server', () => {
    expect(resolveStatusText(400, 'Totally Bogus Request')).toBe(
      'Totally Bogus Request'
    );
  });

  it('falls back to the canonical phrase when the server omits it', () => {
    // Tomcat 9+/Spring Boot 3 send "HTTP/1.1 400" with no reason phrase.
    expect(resolveStatusText(400, '')).toBe('Bad Request');
    expect(resolveStatusText(404, undefined)).toBe('Not Found');
    expect(resolveStatusText(500, null)).toBe('Internal Server Error');
    expect(resolveStatusText(204, '   ')).toBe('No Content');
  });

  it('falls back to a class label for non-standard codes', () => {
    expect(resolveStatusText(499, '')).toBe('Client Error');
    expect(resolveStatusText(599, '')).toBe('Server Error');
    expect(resolveStatusText(299, '')).toBe('Success');
  });

  it('returns empty string when there is no status', () => {
    expect(resolveStatusText(0, '')).toBe('');
    expect(resolveStatusText(undefined, '')).toBe('');
  });
});

describe('formatStatusLine', () => {
  it('joins code and phrase', () => {
    expect(formatStatusLine(400, '')).toBe('400 Bad Request');
    expect(formatStatusLine(200, 'OK')).toBe('200 OK');
  });

  it('omits the trailing space when no phrase can be resolved', () => {
    expect(formatStatusLine(0, '')).toBe('0');
  });
});
