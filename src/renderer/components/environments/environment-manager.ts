import { Environment } from '../../../shared/types';
import { EnvironmentDialogs } from './environment-dialogs';

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
      gap: 8px;
    `;

    // Create label
    const label = document.createElement('span');
    label.textContent = 'Environment:';
    label.style.cssText = `
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
    `;

    // Create dropdown
    const select = document.createElement('select');
    select.id = 'environment-dropdown';
    select.style.cssText = `
      padding: 4px 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
      min-width: 150px;
    `;

    // Create manage button
    const manageBtn = document.createElement('button');
    manageBtn.textContent = '⚙️';
    manageBtn.title = 'Manage Environments';
    manageBtn.style.cssText = `
      padding: 4px 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 14px;
      cursor: pointer;
      line-height: 1;
      transition: background 0.2s;
    `;

    manageBtn.addEventListener('click', () => {
      this.dialogs.showManageDialog(this.environments, this.activeEnvironmentId).then(result => {
        if (result) {
          this.setEnvironments(result.environments);
          if (result.activeEnvironmentId !== undefined) {
            this.setActiveEnvironment(result.activeEnvironmentId);
          }
          this.saveState();
        }
      });
    });

    manageBtn.addEventListener('mouseover', () => {
      manageBtn.style.background = 'var(--hover-color)';
    });

    manageBtn.addEventListener('mouseout', () => {
      manageBtn.style.background = 'var(--bg-tertiary)';
    });

    select.addEventListener('change', () => {
      const selectedId = select.value === '' ? undefined : select.value;
      this.setActiveEnvironment(selectedId);
      this.saveState();
    });

    container.appendChild(label);
    container.appendChild(select);
    container.appendChild(manageBtn);

    // Append to header-left section
    headerLeft.appendChild(container);

    this.switcherElement = container;

    this.renderSwitcher();
  }

  private renderSwitcher(): void {
    const select = document.getElementById('environment-dropdown') as HTMLSelectElement;
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
    this.environments.forEach(env => {
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
    return this.environments.find(e => e.id === this.activeEnvironmentId);
  }

  getActiveEnvironmentId(): string | undefined {
    return this.activeEnvironmentId;
  }

  async createEnvironment(name?: string): Promise<Environment | null> {
    const envName = name || await this.dialogs.promptEnvironmentName();
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

  async updateEnvironment(id: string, updates: Partial<Environment>): Promise<void> {
    const index = this.environments.findIndex(e => e.id === id);
    if (index === -1) return;

    this.environments[index] = { ...this.environments[index], ...updates };
    this.renderSwitcher();
    this.saveState();
  }

  async deleteEnvironment(id: string): Promise<void> {
    this.environments = this.environments.filter(e => e.id !== id);

    // If the deleted environment was active, clear active
    if (this.activeEnvironmentId === id) {
      this.activeEnvironmentId = undefined;
    }

    this.renderSwitcher();
    this.saveState();
  }

  private async saveState(): Promise<void> {
    try {
      await window.apiCourier.store.set({
        environments: this.environments,
        activeEnvironmentId: this.activeEnvironmentId,
      });
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
