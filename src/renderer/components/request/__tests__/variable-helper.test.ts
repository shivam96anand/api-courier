import { describe, expect, it } from 'vitest';
import {
  buildFolderVars,
  detectVariables,
  resolveVariable,
} from '../variable-helper';

describe('variable-helper.ts', () => {
  it('re-exports buildFolderVars', () => {
    expect(typeof buildFolderVars).toBe('function');
  });

  it('re-exports detectVariables', () => {
    expect(typeof detectVariables).toBe('function');
  });

  it('re-exports resolveVariable', () => {
    expect(typeof resolveVariable).toBe('function');
  });
});
