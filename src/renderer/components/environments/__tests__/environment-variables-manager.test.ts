/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('../../../utils/icons', () => ({
  iconHtml: () => '<svg></svg>',
}));

import { EnvironmentVariablesManager } from '../EnvironmentVariablesManager';

interface TableRecords {
  variables: Record<string, string>;
  descriptions: Record<string, string>;
  secrets: Record<string, boolean>;
}

function mount(records: TableRecords, onChange?: () => void): HTMLElement {
  const section = EnvironmentVariablesManager.renderVariableTable({
    title: 'Variables',
    ...records,
    onChange,
  });
  document.body.appendChild(section);
  return section;
}

const keyInputs = (root: HTMLElement): HTMLInputElement[] =>
  Array.from(root.querySelectorAll('input')).filter(
    (i) => i.placeholder === 'Key'
  );

const valueInputs = (root: HTMLElement): HTMLInputElement[] =>
  Array.from(root.querySelectorAll('input')).filter(
    (i) => i.placeholder === 'Value'
  );

const addVariable = (root: HTMLElement): void => {
  const addBtn = Array.from(root.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Add Variable')
  );
  addBtn?.click();
};

describe('EnvironmentVariablesManager — variable table', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the value input alive when focus moves from key to value', () => {
    const records: TableRecords = {
      variables: {},
      descriptions: {},
      secrets: {},
    };
    const section = mount(records);

    addVariable(section);
    const keyInput = keyInputs(section).at(-1)!;
    const valueInput = valueInputs(section).at(-1)!;

    keyInput.value = 'newVar';
    keyInput.dispatchEvent(new Event('input', { bubbles: true }));
    keyInput.dispatchEvent(new Event('blur'));

    expect(valueInput.isConnected).toBe(true);

    valueInput.value = 'typed-after-click';
    valueInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(records.variables.newVar).toBe('typed-after-click');
  });

  it('preserves row order when a key is renamed', () => {
    const records: TableRecords = {
      variables: { host: 'a.example.com', token: 'abc', region: 'eu' },
      descriptions: {},
      secrets: {},
    };
    const section = mount(records);

    const tokenKey = keyInputs(section).find((i) => i.value === 'token')!;
    tokenKey.value = 'accessToken';
    tokenKey.dispatchEvent(new Event('blur'));

    expect(Object.keys(records.variables)).toEqual([
      'host',
      'accessToken',
      'region',
    ]);
    expect(records.variables.accessToken).toBe('abc');
  });

  it('carries description and secret flag across a rename', () => {
    const records: TableRecords = {
      variables: { token: 'abc' },
      descriptions: { token: 'the token' },
      secrets: { token: true },
    };
    const section = mount(records);

    const keyInput = keyInputs(section)[0];
    keyInput.value = 'accessToken';
    keyInput.dispatchEvent(new Event('blur'));

    expect(records.variables).toEqual({ accessToken: 'abc' });
    expect(records.descriptions).toEqual({ accessToken: 'the token' });
    expect(records.secrets).toEqual({ accessToken: true });
  });

  it('refuses a rename that would overwrite another variable', () => {
    const records: TableRecords = {
      variables: { host: 'a', token: 'b' },
      descriptions: {},
      secrets: {},
    };
    const section = mount(records);

    const tokenKey = keyInputs(section).find((i) => i.value === 'token')!;
    tokenKey.value = 'host';
    tokenKey.dispatchEvent(new Event('blur'));

    expect(records.variables).toEqual({ host: 'a', token: 'b' });
    expect(tokenKey.value).toBe('token');
  });

  it('deletes a variable when its key is cleared', () => {
    const records: TableRecords = {
      variables: { host: 'a', token: 'b' },
      descriptions: {},
      secrets: {},
    };
    const section = mount(records);

    const tokenKey = keyInputs(section).find((i) => i.value === 'token')!;
    tokenKey.value = '';
    tokenKey.dispatchEvent(new Event('blur'));

    expect(records.variables).toEqual({ host: 'a' });
  });

  it('keeps an unnamed draft row instead of deleting it on blur', () => {
    const records: TableRecords = {
      variables: {},
      descriptions: {},
      secrets: {},
    };
    const section = mount(records);

    addVariable(section);
    const keyInput = keyInputs(section).at(-1)!;
    const valueInput = valueInputs(section).at(-1)!;
    keyInput.dispatchEvent(new Event('blur'));

    expect(valueInput.isConnected).toBe(true);
    expect(Object.keys(records.variables)).toHaveLength(1);
    expect(Object.keys(records.variables)[0]).toContain('__restbro_draft__');
  });

  it('lets a value be typed before the key is named', () => {
    const records: TableRecords = {
      variables: {},
      descriptions: {},
      secrets: {},
    };
    const section = mount(records);

    addVariable(section);
    const keyInput = keyInputs(section).at(-1)!;
    const valueInput = valueInputs(section).at(-1)!;

    valueInput.value = 'secret-value';
    valueInput.dispatchEvent(new Event('input', { bubbles: true }));

    keyInput.value = 'apiKey';
    keyInput.dispatchEvent(new Event('blur'));

    expect(records.variables.apiKey).toBe('secret-value');
  });

  it('reports edits so they can be autosaved', () => {
    const records: TableRecords = {
      variables: { host: 'a' },
      descriptions: {},
      secrets: {},
    };
    const onChange = vi.fn();
    const section = mount(records, onChange);

    const valueInput = valueInputs(section)[0];
    valueInput.value = 'b.example.com';
    valueInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);

    const keyInput = keyInputs(section)[0];
    keyInput.value = 'hostname';
    keyInput.dispatchEvent(new Event('blur'));
    expect(onChange).toHaveBeenCalledTimes(2);

    keyInput.value = '';
    keyInput.dispatchEvent(new Event('blur'));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(records.variables).toEqual({});
  });
});
