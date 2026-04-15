import { describe, expect, it } from 'vitest';
import { AI_SYSTEM_PROMPT } from '../ai-system-prompt';

describe('ai-system-prompt.ts', () => {
  it('exports AI_SYSTEM_PROMPT as a non-empty string', () => {
    expect(typeof AI_SYSTEM_PROMPT).toBe('string');
    expect(AI_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains API assistant instructions', () => {
    expect(AI_SYSTEM_PROMPT).toContain('API assistant');
  });
});
