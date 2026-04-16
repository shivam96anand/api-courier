import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', async () => import('../../../../__mocks__/electron'));

vi.mock('../../store-manager', () => ({
  storeManager: {
    getState: vi.fn().mockReturnValue({}),
    setState: vi.fn(),
  },
}));

import {
  getMockServersState,
  saveMockServersState,
} from '../mock-server-store';
import { storeManager } from '../../store-manager';

describe('mock-server-store.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMockServersState returns default when no state exists', () => {
    vi.mocked(storeManager.getState).mockReturnValue({} as any);
    const result = getMockServersState();
    expect(result).toEqual({ servers: [] });
  });

  it('getMockServersState returns stored state', () => {
    vi.mocked(storeManager.getState).mockReturnValue({
      mockServers: { servers: [{ id: 's1' }] },
    } as any);
    const result = getMockServersState();
    expect(result.servers).toHaveLength(1);
  });

  it('saveMockServersState delegates to storeManager', () => {
    const state = { servers: [] };
    saveMockServersState(state);
    expect(storeManager.setState).toHaveBeenCalledWith({ mockServers: state });
  });
});
