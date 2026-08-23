import { Environment } from '../../../shared/types';
import { EnvironmentDialogs } from './environment-dialogs';
import { EnvironmentDialogResult } from './environment-drafts';

import { iconHtml } from '../../utils/icons';
import { attachThemedSelect } from '../../utils/themed-select';

export class EnvironmentManager {
  private environments: Environment[] = [];
  private activeEnvironmentId?: string;
  private dialogs: EnvironmentDialogs;
  private switcherElement: HTMLElement | null = null;

  constructor() {
    this.dialogs = new EnvironmentDialogs(this.showError.bind(this));
  }

  initialize(): void {
    this.createEnvironmentSwitcher();
  }

  private createEnvironmentSwitcher(): void {
    // Find the header-left section
    const headerLeft = document.querySelector('.header-left');
    if (!headerLeft) {
      console.warn('Header left section not found for environment switcher');
      return;
    }

    // Check if already exists
    if (headerLeft.querySelector('.environment-switcher')) {
      console.log('Environment switcher already exists');
      return;
    }

    // Create environment switcher container
    const container = document.createElement('div');
    container.className = 'environment-switcher';
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    // Create label
    const label = document.createElement('span');
    label.textContent = 'Environment:';
    label.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 500;
    `;

    // Create dropdown
    const select = document.createElement('select');
    select.id = 'environment-dropdown';
    select.style.cssText = `
      height: 26px;
      padding: 0 8px;
      background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.08) 0%, var(--bg-tertiary) 100%);
      border: 1px solid rgba(var(--primary-color-rgb), 0.25);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
      min-width: 140px;
      transition: all 0.2s ease;
      font-weight: 500;
    `;

    // Add hover effect
    select.addEventListener('mouseenter', () => {
      select.style.borderColor = 'var(--primary-color)';
      select.style.boxShadow = '0 0 0 2px rgba(var(--primary-color-rgb), 0.1)';
    });
    select.addEventListener('mouseleave', () => {
      select.style.borderColor = 'var(--border-color)';
      select.style.boxShadow = 'none';
    });

    // Create manage button
    const manageBtn = document.createElement('button');
    manageBtn.innerHTML = iconHtml('sliders');
    manageBtn.title = 'Manage Environments';
    manageBtn.style.cssText = `
      width: 26px;
      height: 26px;
      padding: 0;
      background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.1) 0%, var(--bg-tertiary) 100%);
      border: 1px solid rgba(var(--primary-color-rgb), 0.25);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 14px;
      cursor: pointer;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;

    // Add hover effect for manage button
    manageBtn.addEventListener('mouseenter', () => {
      manageBtn.style.background = 'var(--primary-color)';
      manageBtn.style.borderColor = 'var(--primary-color)';
      manageBtn.style.transform = 'translateY(-1px) rotate(15deg)';
      manageBtn.style.boxShadow =
        '0 2px 8px rgba(var(--primary-color-rgb), 0.25)';
    });
    manageBtn.addEventListener('mouseleave', () => {
      manageBtn.style.background = 'var(--bg-tertiary)';
      manageBtn.style.borderColor = 'var(--border-color)';
      manageBtn.style.transform = 'none';
      manageBtn.style.boxShadow = 'none';
    });

    manageBtn.addEventListener('click', () => {
      this.dialogs
        .showManageDialog(
          this.environments,
          this.activeEnvironmentId,
          (ids) => this.removeEnvironments(ids),
          (result) => this.applyDialogResult(result)
        )
        .then(async (result) => {
          // Non-null only when the last edits had not been autosaved yet.
          if (result) {
            await this.applyDialogResult(result);
          }
        });
    });

    manageBtn.addEventListener('mouseover', () => {
      manageBtn.style.background = 'var(--hover-color)';
    });

    manageBtn.addEventListener('mouseout', () => {
      manageBtn.style.background = 'var(--bg-tertiary)';
    });

    select.addEventListener('change', async () => {
      const selectedId = select.value === '' ? undefined : select.value;
      this.setActiveEnvironment(selectedId);
      await this.saveState();
      // Notify other components that the environment changed (after save completes)
      document.dispatchEvent(new CustomEvent('environment-changed'));
    });

    container.appendChild(label);
    container.appendChild(select);
    container.appendChild(manageBtn);

    // Replace the native (OS-themed) option popup with a themed dropdown.
    attachThemedSelect(select);

    // Append to header-left section
    headerLeft.appendChild(container);

    this.switcherElement = container;

    this.renderSwitcher();
  }

  private renderSwitcher(): void {
    const select = document.getElementById(
      'environment-dropdown'
    ) as HTMLSelectElement;
    if (!select) return;

    // Save current selection
    const currentValue = select.value;

    // Clear options
    select.innerHTML = '';

    // Add "No Environment" option
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'No Environment';
    select.appendChild(noneOption);

    // Add environment options
    this.environments.forEach((env) => {
      const option = document.createElement('option');
      option.value = env.id;
      option.textContent = env.name;
      select.appendChild(option);
    });

    // Restore selection
    if (this.activeEnvironmentId) {
      select.value = this.activeEnvironmentId;
    } else if (currentValue) {
      select.value = currentValue;
    } else {
      select.value = '';
    }
  }

  setEnvironments(environments: Environment[]): void {
    this.environments = environments;
    this.renderSwitcher();
  }

  getEnvironments(): Environment[] {
    return this.environments;
  }

  setActiveEnvironment(environmentId?: string): void {
    this.activeEnvironmentId = environmentId;
    this.renderSwitcher();
  }

  getActiveEnvironment(): Environment | undefined {
    if (!this.activeEnvironmentId) return undefined;
    return this.environments.find((e) => e.id === this.activeEnvironmentId);
  }

  getActiveEnvironmentId(): string | undefined {
    return this.activeEnvironmentId;
  }

  async createEnvironment(name?: string): Promise<Environment | null> {
    const envName = name || (await this.dialogs.promptEnvironmentName());
    if (!envName) return null;

    const newEnv: Environment = {
      id: crypto.randomUUID(),
      name: envName,
      variables: {},
    };

    this.environments.push(newEnv);
    this.renderSwitcher();
    this.saveState();

    return newEnv;
  }

  async updateEnvironment(
    id: string,
    updates: Partial<Environment>
  ): Promise<void> {
    const index = this.environments.findIndex((e) => e.id === id);
    if (index === -1) return;

    this.environments[index] = { ...this.environments[index], ...updates };
    this.renderSwitcher();
    this.saveState();
  }

  async deleteEnvironment(id: string): Promise<void> {
    await this.removeEnvironments([id]);
  }

  /**
   * Applies and persists a deletion immediately — the Manage Environments
   * dialog can be dismissed without pressing Save, and a confirmed delete
   * must not be silently reverted.
   */
  private async removeEnvironments(ids: string[]): Promise<void> {
    const removed = new Set(ids);
    this.environments = this.environments.filter((e) => !removed.has(e.id));

    if (this.activeEnvironmentId && removed.has(this.activeEnvironmentId)) {
      this.activeEnvironmentId = undefined;
    }

    this.renderSwitcher();
    await this.saveState();
    document.dispatchEvent(new CustomEvent('environment-changed'));
  }

  /** Persists a snapshot coming from the Manage Environments dialog. */
  private async applyDialogResult(
    result: EnvironmentDialogResult
  ): Promise<void> {
    this.setEnvironments(result.environments);
    this.setActiveEnvironment(result.activeEnvironmentId);
    await this.saveState(result.globals);
    // Notify other components that environments/variables changed
    // This refreshes variable context for autocomplete and highlighting
    document.dispatchEvent(new CustomEvent('environment-changed'));
  }

  private async saveState(globals?: {
    variables: Record<string, string>;
  }): Promise<void> {
    try {
      const updates: Record<string, any> = {
        environments: this.environments,
        activeEnvironmentId: this.activeEnvironmentId,
      };
      if (globals) {
        updates.globals = globals;
        // Dispatch event to notify other components that globals changed
        document.dispatchEvent(new CustomEvent('globals-updated'));
      }
      await window.restbro.store.set(updates);
    } catch (error) {
      console.error('Failed to save environments:', error);
    }
  }

  private showError(message: string): void {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--error-color);
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 3000);
  }

  showSuccess(message: string): void {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--success-color, #4caf50);
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 3000);
  }
}
