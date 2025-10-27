import { Environment } from '../../../shared/types';
import { modal } from '../../utils/modal';

export class EnvironmentDialogs {
  private onShowError: (message: string) => void;

  constructor(onShowError: (message: string) => void) {
    this.onShowError = onShowError;
  }

  async promptEnvironmentName(defaultValue: string = ''): Promise<string | null> {
    return modal.show('Environment Name', defaultValue || 'Enter environment name');
  }

  async showManageDialog(
    environments: Environment[],
    activeEnvironmentId?: string
  ): Promise<{ environments: Environment[]; activeEnvironmentId?: string } | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        width: 700px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
      `;

      // Header
      const header = document.createElement('div');
      header.style.cssText = `
        padding: 20px 24px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const title = document.createElement('h2');
      title.textContent = 'Manage Environments';
      title.style.cssText = `
        margin: 0;
        color: var(--text-primary);
        font-size: 18px;
        font-weight: 600;
      `;

      const buttonsContainer = document.createElement('div');
      buttonsContainer.style.cssText = `
        display: flex;
        gap: 8px;
      `;

      const deleteAllBtn = document.createElement('button');
      deleteAllBtn.textContent = 'Delete All';
      deleteAllBtn.style.cssText = `
        padding: 6px 12px;
        background: var(--error-color);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 13px;
      `;

      const addBtn = document.createElement('button');
      addBtn.textContent = '+ New Environment';
      addBtn.style.cssText = `
        padding: 6px 12px;
        background: var(--primary-color);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 13px;
      `;

      buttonsContainer.appendChild(deleteAllBtn);
      buttonsContainer.appendChild(addBtn);

      header.appendChild(title);
      header.appendChild(buttonsContainer);

      // Body
      const body = document.createElement('div');
      body.style.cssText = `
        padding: 20px 24px;
        overflow-y: auto;
        flex: 1;
      `;

      // Working copy of environments
      let workingEnvs = [...environments.map(e => ({ ...e, variables: { ...e.variables } }))];
      let workingActiveId = activeEnvironmentId;
      let selectedEnvId: string | null = workingEnvs[0]?.id || null;

      const renderBody = () => {
        body.innerHTML = '';

        if (workingEnvs.length === 0) {
          const emptyState = document.createElement('div');
          emptyState.textContent = 'No environments. Click "+ New Environment" to create one.';
          emptyState.style.cssText = `
            color: var(--text-secondary);
            text-align: center;
            padding: 40px 20px;
          `;
          body.appendChild(emptyState);
          return;
        }

        // Two-column layout
        const layout = document.createElement('div');
        layout.style.cssText = `
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 20px;
          height: 100%;
        `;

        // Left: Environment list
        const envList = document.createElement('div');
        envList.style.cssText = `
          border: 1px solid var(--border-color);
          border-radius: 4px;
          overflow-y: auto;
          max-height: 400px;
        `;

        workingEnvs.forEach(env => {
          const envItem = document.createElement('div');
          envItem.style.cssText = `
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            background: ${selectedEnvId === env.id ? 'var(--bg-tertiary)' : 'transparent'};
          `;

          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'active-env';
          radio.checked = workingActiveId === env.id;
          radio.title = 'Set as active';
          radio.style.cursor = 'pointer';

          radio.addEventListener('change', () => {
            if (radio.checked) {
              workingActiveId = env.id;
              renderBody();
            }
          });

          const nameSpan = document.createElement('span');
          nameSpan.textContent = env.name;
          nameSpan.style.cssText = `
            flex: 1;
            color: var(--text-primary);
            font-size: 14px;
          `;

          envItem.addEventListener('click', (e) => {
            if (e.target !== radio) {
              selectedEnvId = env.id;
              renderBody();
            }
          });

          envItem.appendChild(radio);
          envItem.appendChild(nameSpan);
          envList.appendChild(envItem);
        });

        // Right: Selected environment details
        const envDetails = document.createElement('div');
        envDetails.style.cssText = `
          border: 1px solid var(--border-color);
          border-radius: 4px;
          padding: 16px;
          overflow-y: auto;
          max-height: 400px;
        `;

        const selectedEnv = workingEnvs.find(e => e.id === selectedEnvId);
        if (selectedEnv) {
          // Name input
          const nameLabel = document.createElement('label');
          nameLabel.textContent = 'Name:';
          nameLabel.style.cssText = `
            display: block;
            color: var(--text-secondary);
            font-size: 12px;
            margin-bottom: 4px;
          `;

          const nameInput = document.createElement('input');
          nameInput.type = 'text';
          nameInput.value = selectedEnv.name;
          nameInput.style.cssText = `
            width: 100%;
            padding: 8px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--text-primary);
            font-size: 14px;
            margin-bottom: 16px;
          `;

          nameInput.addEventListener('input', () => {
            selectedEnv.name = nameInput.value;
          });

          // Variables section
          const varsLabel = document.createElement('div');
          varsLabel.textContent = 'Variables:';
          varsLabel.style.cssText = `
            color: var(--text-secondary);
            font-size: 12px;
            margin-bottom: 8px;
          `;

          const varsContainer = document.createElement('div');
          varsContainer.style.cssText = `
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 8px;
            margin-bottom: 12px;
          `;

          const renderVars = () => {
            varsContainer.innerHTML = '';

            Object.entries(selectedEnv.variables).forEach(([key, value]) => {
              const varRow = document.createElement('div');
              varRow.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 1fr auto;
                gap: 8px;
                margin-bottom: 8px;
              `;

              const keyInput = document.createElement('input');
              keyInput.type = 'text';
              keyInput.value = key;
              keyInput.placeholder = 'Key';
              keyInput.style.cssText = `
                padding: 6px;
                background: var(--bg-primary);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--text-primary);
                font-size: 13px;
              `;

              const valueInput = document.createElement('input');
              valueInput.type = 'text';
              valueInput.value = value;
              valueInput.placeholder = 'Value';
              valueInput.style.cssText = `
                padding: 6px;
                background: var(--bg-primary);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--text-primary);
                font-size: 13px;
              `;

              const deleteBtn = document.createElement('button');
              deleteBtn.textContent = '✕';
              deleteBtn.style.cssText = `
                padding: 6px 10px;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--error-color);
                cursor: pointer;
                font-size: 14px;
              `;

              deleteBtn.addEventListener('click', () => {
                delete selectedEnv.variables[key];
                renderVars();
              });

              // Update on change
              keyInput.addEventListener('blur', () => {
                if (keyInput.value && keyInput.value !== key) {
                  delete selectedEnv.variables[key];
                  selectedEnv.variables[keyInput.value] = valueInput.value;
                  renderVars();
                }
              });

              valueInput.addEventListener('input', () => {
                selectedEnv.variables[key] = valueInput.value;
              });

              varRow.appendChild(keyInput);
              varRow.appendChild(valueInput);
              varRow.appendChild(deleteBtn);
              varsContainer.appendChild(varRow);
            });

            // Add variable button
            const addVarBtn = document.createElement('button');
            addVarBtn.textContent = '+ Add Variable';
            addVarBtn.style.cssText = `
              padding: 6px 12px;
              background: var(--bg-tertiary);
              border: 1px solid var(--border-color);
              border-radius: 4px;
              color: var(--text-primary);
              cursor: pointer;
              font-size: 13px;
              width: 100%;
            `;

            addVarBtn.addEventListener('click', () => {
              const newKey = `var${Object.keys(selectedEnv.variables).length + 1}`;
              selectedEnv.variables[newKey] = '';
              renderVars();
            });

            varsContainer.appendChild(addVarBtn);
          };

          renderVars();

          // Delete environment button
          const deleteEnvBtn = document.createElement('button');
          deleteEnvBtn.textContent = 'Delete Environment';
          deleteEnvBtn.style.cssText = `
            padding: 8px 16px;
            background: var(--bg-tertiary);
            border: 1px solid var(--error-color);
            border-radius: 4px;
            color: var(--error-color);
            cursor: pointer;
            font-size: 13px;
            width: 100%;
          `;

          deleteEnvBtn.addEventListener('click', async () => {
            const confirmed = confirm(`Delete environment "${selectedEnv.name}"?`);
            if (confirmed) {
              workingEnvs = workingEnvs.filter(e => e.id !== selectedEnv.id);
              if (workingActiveId === selectedEnv.id) {
                workingActiveId = undefined;
              }
              selectedEnvId = workingEnvs[0]?.id || null;
              renderBody();
            }
          });

          envDetails.appendChild(nameLabel);
          envDetails.appendChild(nameInput);
          envDetails.appendChild(varsLabel);
          envDetails.appendChild(varsContainer);
          envDetails.appendChild(deleteEnvBtn);
        }

        layout.appendChild(envList);
        layout.appendChild(envDetails);
        body.appendChild(layout);
      };

      renderBody();

      // Add new environment handler
      deleteAllBtn.addEventListener('click', async () => {
        if (workingEnvs.length === 0) return;

        const confirmed = confirm(`Delete all ${workingEnvs.length} environment(s)? This cannot be undone.`);
        if (confirmed) {
          workingEnvs = [];
          selectedEnvId = null;
          workingActiveId = undefined;
          renderBody();
        }
      });

      addBtn.addEventListener('click', async () => {
        const name = await this.promptEnvironmentName();
        if (name) {
          const newEnv: Environment = {
            id: crypto.randomUUID(),
            name,
            variables: {},
          };
          workingEnvs.push(newEnv);
          selectedEnvId = newEnv.id;
          renderBody();
        }
      });

      // Footer
      const footer = document.createElement('div');
      footer.style.cssText = `
        padding: 16px 24px;
        border-top: 1px solid var(--border-color);
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        padding: 8px 16px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        color: var(--text-primary);
        cursor: pointer;
        font-size: 14px;
      `;

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = `
        padding: 8px 16px;
        background: var(--primary-color);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 14px;
      `;

      const cleanup = () => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      };

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      saveBtn.addEventListener('click', () => {
        cleanup();
        resolve({
          environments: workingEnvs,
          activeEnvironmentId: workingActiveId,
        });
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });

      footer.appendChild(cancelBtn);
      footer.appendChild(saveBtn);

      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }
}
