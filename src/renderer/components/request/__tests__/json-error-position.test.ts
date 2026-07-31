import { describe, expect, it } from 'vitest';
import { parseJsonErrorOffset, validateJsonText } from '../json-error-position';

describe('json-error-position.ts — parseJsonErrorOffset', () => {
  it('extracts the offset from a positional parse error', () => {
    try {
      JSON.parse('{"a": 1,}');
    } catch (err) {
      const offset = parseJsonErrorOffset((err as Error).message);
      expect(offset).not.toBeNull();
      expect(offset).toBeGreaterThan(0);
    }
  });

  it('parses the classic V8 wording', () => {
    expect(
      parseJsonErrorOffset('Unexpected token } in JSON at position 8')
    ).toBe(8);
  });

  it('parses the newer wording that adds line and column', () => {
    expect(
      parseJsonErrorOffset(
        `Expected property name or '}' in JSON at position 12 (line 2 column 3)`
      )
    ).toBe(12);
  });

  it('returns null when the message carries no offset', () => {
    expect(parseJsonErrorOffset('Unexpected end of JSON input')).toBeNull();
  });
});

describe('json-error-position.ts — validateJsonText', () => {
  it('treats empty and whitespace-only content as valid', () => {
    expect(validateJsonText('')).toEqual({ valid: true });
    expect(validateJsonText('   \n\t ')).toEqual({ valid: true });
  });

  it('accepts valid JSON', () => {
    expect(validateJsonText('{"a": [1, 2]}')).toEqual({ valid: true });
  });

  it('reports invalid JSON with a message', () => {
    const result = validateJsonText('{"a": ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('reports invalid JSON that has no position in its message', () => {
    const result = validateJsonText('{');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
