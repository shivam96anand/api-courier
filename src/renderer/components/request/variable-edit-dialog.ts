/**
 * Inline Variable Edit Dialog
 * Allows users to quickly edit a variable value from the request view
 */

import { Environment, Collection } from '../../../shared/types';
import { iconHtml } from '../../utils/icons';

export interface VariableEditResult {
  variableName: string;
  newValue: string;
  source: 'environment' | 'globals' | 'folder';
  environmentId?: string;
  folderId?: string;
}

export class VariableEditDialog {
  /**
   * Shows a compact dialog for editing a variable value
   */
  static async show(
    variableName: string,
    currentValue: string | undefined,
    source: string,
    environments: Environment[],
    activeEnvironmentId: string | undefined,
    globals: { variables: Record<string, string> },
    collectionId: string | undefined,
    collections: Collection[]
  ): Promise<VariableEditResult | null> {
    return new Promise((resolve) => {
      // Determine where the variable is defined
      const isGlobal = source.toLowerCase().includes('global');
      const isEnvironment = source.toLowerCase().includes('environment');
      const isFolder = source.toLowerCase().includes('folder');
      const isUndefined = source.toLowerCase().includes('not defined');

      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'var-edit-dialog-overlay';

      // Create dialog
      const dialog = document.createElement('div');
      dialog.className = 'var-edit-dialog';

      // Header
      const header = document.createElement('div');
      header.className = 'var-edit-dialog-header';

      const title = document.createElement('h3');
      title.className = 'var-edit-dialog-title';
      title.innerHTML = `<span class="var-edit-icon">${iconHtml('edit')}</span> Edit Variable`;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'var-edit-close-btn';
      closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>`;
      closeBtn.title = 'Close';

      header.appendChild(title);
      header.appendChild(closeBtn);

      // Body
      const body = document.createElement('div');
      body.className = 'var-edit-dialog-body';

      // Variable name (read-only)
      const nameGroup = document.createElement('div');
      nameGroup.className = 'var-edit-form-group';

      const nameLabel = document.createElement('label');
      nameLabel.className = 'var-edit-label';
      nameLabel.textContent = 'Variable Name';

      const nameValue = document.createElement('div');
      nameValue.className = 'var-edit-name-value';
      const openBrace = document.createElement('span');
      openBrace.className = 'var-edit-braces';
      openBrace.textContent = '{{';
      const closeBrace = document.createElement('span');
      closeBrace.className = 'var-edit-braces';
      closeBrace.textContent = '}}';
      nameValue.appendChild(openBrace);
      nameValue.appendChild(document.createTextNode(variableName));
      nameValue.appendChild(closeBrace);

      nameGroup.appendChild(nameLabel);
      nameGroup.appendChild(nameValue);

      // Current source info
      const sourceInfo = document.createElement('div');
      sourceInfo.className = 'var-edit-source-info';
      const sourceIcon = document.createElement('span');
      sourceIcon.className = 'var-edit-source-icon';
      sourceIcon.innerHTML = iconHtml('pin');
      sourceInfo.appendChild(sourceIcon);
      sourceInfo.appendChild(document.createTextNode(` ${source}`));

      // Value input
      const valueGroup = document.createElement('div');
      valueGroup.className = 'var-edit-form-group';

      const valueLabel = document.createElement('label');
      valueLabel.className = 'var-edit-label';
      valueLabel.textContent = 'Value';

      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.className = 'var-edit-input';
      valueInput.value = currentValue || '';
      valueInput.placeholder = 'Enter variable value...';
      valueInput.spellcheck = false;

      valueGroup.appendChild(valueLabel);
      valueGroup.appendChild(valueInput);

      body.appendChild(nameGroup);
      body.appendChild(sourceInfo);
      body.appendChild(valueGroup);

      // Save location selector (if undefined or user wants to change)
      let selectedTarget: 'environment' | 'globals' | 'folder' = 'environment';
      let selectedEnvironmentId = activeEnvironmentId;
      let selectedFolderId: string | undefined;

      if (isUndefined) {
        const targetGroup = document.createElement('div');
        targetGroup.className = 'var-edit-form-group';

        const targetLabel = document.createElement('label');
        targetLabel.className = 'var-edit-label';
        targetLabel.textContent = 'Save To';

        const targetSelect = document.createElement('select');
        targetSelect.className = 'var-edit-select';

        // Add environment options
        if (environments.length > 0) {
          const envOptGroup = document.createElement('optgroup');
          envOptGroup.label = 'Environments';
          environments.forEach((env) => {
            const option = document.createElement('option');
            option.value = `env:${env.id}`;
            option.textContent = env.name;
            if (env.id === activeEnvironmentId) {
              option.selected = true;
              option.textContent += ' (active)';
            }
            envOptGroup.appendChild(option);
          });
          targetSelect.appendChild(envOptGroup);
        }

        // Add globals option
        const globalsOption = document.createElement('option');
        globalsOption.value = 'globals';
        globalsOption.textContent = 'Global Variables';
        targetSelect.appendChild(globalsOption);

        // Add folder options if we have a collection context
        if (collectionId) {
          const folderChain = this.getFolderChain(collectionId, collections);
          if (folderChain.length > 0) {
            const folderOptGroup = document.createElement('optgroup');
            folderOptGroup.label = 'Folder Variables';
            folderChain.forEach((folder) => {
              const option = document.createElement('option');
              option.value = `folder:${folder.id}`;
              option.textContent = folder.name;
              folderOptGroup.appendChild(option);
            });
            targetSelect.appendChild(folderOptGroup);
          }
        }

        targetSelect.addEventListener('change', () => {
          const value = targetSelect.value;
          if (value === 'globals') {
            selectedTarget = 'globals';
            selectedEnvironmentId = undefined;
            selectedFolderId = undefined;
          } else if (value.startsWith('env:')) {
            selectedTarget = 'environment';
            selectedEnvironmentId = value.replace('env:', '');
            selectedFolderId = undefined;
          } else if (value.startsWith('folder:')) {
            selectedTarget = 'folder';
            selectedFolderId = value.replace('folder:', '');
            selectedEnvironmentId = undefined;
          }
        });

        targetGroup.appendChild(targetLabel);
        targetGroup.appendChild(targetSelect);
        body.appendChild(targetGroup);
      } else {
        // Set the target based on current source
        if (isGlobal) {
          selectedTarget = 'globals';
        } else if (isEnvironment) {
          selectedTarget = 'environment';
          selectedEnvironmentId = activeEnvironmentId;
        } else if (isFolder) {
          selectedTarget = 'folder';
          // Find the folder ID from the collection chain
          if (collectionId) {
            const folderChain = this.getFolderChain(collectionId, collections);
            // Find the folder that has this variable
            for (const folder of folderChain) {
              if (
                folder.variables &&
                folder.variables[variableName] !== undefined
              ) {
                selectedFolderId = folder.id;
                break;
              }
            }
          }
        }
      }

      // Footer
      const footer = document.createElement('div');
      footer.className = 'var-edit-dialog-footer';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'var-edit-cancel-btn';
      cancelBtn.textContent = 'Cancel';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'var-edit-save-btn';
      saveBtn.textContent = 'Save';

      footer.appendChild(cancelBtn);
      footer.appendChild(saveBtn);

      // Assemble dialog
      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      overlay.appendChild(dialog);

      const cleanup = () => {
        overlay.classList.add('closing');
        dialog.classList.add('closing');
        setTimeout(() => {
          if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }
        }, 150);
      };

      // Event handlers
      closeBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      saveBtn.addEventListener('click', () => {
        cleanup();
        resolve({
          variableName,
          newValue: valueInput.value,
          source: selectedTarget,
          environmentId:
            selectedTarget === 'environment'
              ? selectedEnvironmentId
              : undefined,
          folderId: selectedTarget === 'folder' ? selectedFolderId : undefined,
        });
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });

      // Handle escape key
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(null);
          document.removeEventListener('keydown', handleKeydown);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          cleanup();
          resolve({
            variableName,
            newValue: valueInput.value,
            source: selectedTarget,
            environmentId:
              selectedTarget === 'environment'
                ? selectedEnvironmentId
                : undefined,
            folderId:
              selectedTarget === 'folder' ? selectedFolderId : undefined,
          });
          document.removeEventListener('keydown', handleKeydown);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      // Add to DOM
      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add('visible');
        dialog.classList.add('visible');
        valueInput.focus();
        valueInput.select();
      });
    });
  }

  /**
   * Gets the chain of folder ancestors for a collection
   */
  private static getFolderChain(
    collectionId: string,
    collections: Collection[]
  ): Collection[] {
    const chain: Collection[] = [];
    let currentId: string | undefined = collectionId;

    // `seen` guards against a corrupt or imported tree where parentId forms
    // a cycle, which would otherwise loop forever.
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const collection = collections.find((c) => c.id === currentId);
      if (!collection) break;

      if (collection.type === 'folder') {
        chain.push(collection);
      }
      currentId = collection.parentId;
    }

    return chain;
  }
}
