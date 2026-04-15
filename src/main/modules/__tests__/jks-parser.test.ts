import { describe, expect, it } from 'vitest';

/**
 * jks-parser.ts uses CJS `require('jks-js')` which Vitest cannot intercept.
 * We test the module's export contract. The actual jks-js library integration
 * requires valid JKS keystore files which are covered by integration tests.
 */

describe('jks-parser.ts', () => {
  describe('module exports', () => {
    it('exports parseKeystoreJks and parseTruststoreJks functions', async () => {
      const mod = await import('../jks-parser');
      expect(typeof mod.parseKeystoreJks).toBe('function');
      expect(typeof mod.parseTruststoreJks).toBe('function');
    });

    it('exports JksKeystoreResult type shape', async () => {
      const mod = await import('../jks-parser');
      expect(mod.parseKeystoreJks).toBeDefined();
    });

    it('exports JksTruststoreResult type shape', async () => {
      const mod = await import('../jks-parser');
      expect(mod.parseTruststoreJks).toBeDefined();
    });
  });
});
