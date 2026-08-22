import { describe, expect, it } from 'vitest';
import { buildDialogResult, DRAFT_PREFIX } from '../environment-drafts';
import { Environment, Globals } from '../../../../shared/types';

describe('buildDialogResult', () => {
  it('strips unnamed draft rows from environments and globals', () => {
    const envs: Environment[] = [
      {
        id: 'env-a',
        name: 'Alpha',
        variables: { host: 'a.example.com', [`${DRAFT_PREFIX}1`]: 'typed' },
        variableDescriptions: { host: 'api host' },
        variableSecrets: { host: true },
      },
    ];
    const globals: Globals = {
      variables: { token: 'abc', [`${DRAFT_PREFIX}2`]: '' },
    };

    const result = buildDialogResult(envs, 'env-a', globals);

    expect(result.environments[0].variables).toEqual({
      host: 'a.example.com',
    });
    expect(result.environments[0].variableDescriptions).toEqual({
      host: 'api host',
    });
    expect(result.environments[0].variableSecrets).toEqual({ host: true });
    expect(result.globals?.variables).toEqual({ token: 'abc' });
    expect(result.activeEnvironmentId).toBe('env-a');
  });

  it('copies records so later edits do not mutate the saved snapshot', () => {
    const envs: Environment[] = [
      { id: 'env-a', name: 'Alpha', variables: { host: 'a' } },
    ];

    const result = buildDialogResult(envs, undefined, { variables: {} });
    envs[0].variables.host = 'changed';
    envs[0].name = 'Renamed';

    expect(result.environments[0].variables).toEqual({ host: 'a' });
    expect(result.environments[0].name).toBe('Alpha');
  });
});
