import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', async () => import('../../../__mocks__/electron'));
vi.mock('../store-manager', () => ({
  storeManager: { getState: vi.fn().mockReturnValue({}), setState: vi.fn() },
}));
vi.mock('../mock-server/mock-server-manager', () => ({
  mockServerManager: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));

describe('mock-server-manager.ts (re-export)', () => {
  it('re-exports mockServerManager from ./mock-server', async () => {
    const mod = await import('../mock-server-manager');
    expect(mod.mockServerManager).toBeDefined();
  });
});
