/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EnvironmentManager } from '../environment-manager';
import { Environment } from '../../../../shared/types';

const showManageDialog = vi.fn();

vi.mock('../environment-dialogs', () => ({
  EnvironmentDialogs: vi.fn().mockImplementation(() => ({
    showManageDialog: (...args: unknown[]) => showManageDialog(...args),
    promptEnvironmentName: vi.fn(),
  })),
}));

const envs = (): Environment[] => [
  { id: 'env-a', name: 'Alpha', variables: {} },
  { id: 'env-b', name: 'Beta', variables: {} },
];

describe('EnvironmentManager — Manage Environments dialog', () => {
  let manager: EnvironmentManager;
  let storeSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '<div class="header-left"></div>';
    storeSet = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { restbro: unknown }).restbro = {
      store: { set: storeSet, get: vi.fn().mockResolvedValue({}) },
    };
    showManageDialog.mockReset();

    manager = new EnvironmentManager();
    manager.initialize();
    manager.setEnvironments(envs());
    manager.setActiveEnvironment('env-b');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const clickManage = () =>
    (
      document.querySelector('.environment-switcher button') as HTMLElement
    ).click();

  it('persists a deletion made in the dialog even when the dialog is dismissed', async () => {
    showManageDialog.mockImplementation(async (_e, _a, onDeleted) => {
      await onDeleted(['env-b']);
      return null; // dismissed / cancelled
    });

    clickManage();
    await vi.waitFor(() => expect(storeSet).toHaveBeenCalled());

    expect(manager.getEnvironments().map((e) => e.id)).toEqual(['env-a']);
    expect(storeSet).toHaveBeenCalledWith({
      environments: [expect.objectContaining({ id: 'env-a' })],
      activeEnvironmentId: undefined,
    });
  });

  it('clears the active environment when it is deleted and then saved', async () => {
    showManageDialog.mockResolvedValue({
      environments: [envs()[0]],
      activeEnvironmentId: undefined,
    });

    clickManage();
    await vi.waitFor(() => expect(storeSet).toHaveBeenCalled());

    expect(manager.getActiveEnvironmentId()).toBeUndefined();
    expect(storeSet).toHaveBeenCalledWith(
      expect.objectContaining({ activeEnvironmentId: undefined })
    );
  });

  it('persists edits autosaved while the dialog is still open', async () => {
    showManageDialog.mockImplementation(async (_e, _a, _d, onAutoSave) => {
      await onAutoSave({
        environments: [
          { id: 'env-a', name: 'Alpha', variables: { host: 'a.example.com' } },
          envs()[1],
        ],
        activeEnvironmentId: 'env-b',
        globals: { variables: { token: 'abc' } },
      });
      return null; // nothing left to save when the dialog closes
    });

    clickManage();
    await vi.waitFor(() => expect(storeSet).toHaveBeenCalled());

    expect(manager.getEnvironments()[0].variables).toEqual({
      host: 'a.example.com',
    });
    expect(storeSet).toHaveBeenCalledWith(
      expect.objectContaining({
        activeEnvironmentId: 'env-b',
        globals: { variables: { token: 'abc' } },
      })
    );
  });
});
