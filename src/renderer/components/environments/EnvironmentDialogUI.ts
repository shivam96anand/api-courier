/**
 * UI builders for environment management dialog
 */

import { Environment, Globals } from '../../../shared/types';
import { EnvironmentDialogStyles } from './EnvironmentDialogStyles';
import { EnvironmentVariablesManager } from './EnvironmentVariablesManager';

export type DialogTab = 'environments' | 'globals';

export interface EnvironmentDialogState {
  workingEnvs: Environment[];
  workingActiveId?: string;
  selectedEnvId: string | null;
  workingGlobals: Globals;
  activeTab: DialogTab;
}

export class EnvironmentDialogUI {
  /**
   * Creates the environment list (left panel)
   */
  static createEnvironmentList(
    state: EnvironmentDialogState,
    onSelectEnv: (envId: string) => void
  ): HTMLDivElement {
    const envList = document.createElement('div');
    envList.style.cssText = EnvironmentDialogStyles.envList;

    const envListHeader = document.createElement('div');
    envListHeader.style.cssText = EnvironmentDialogStyles.envListHeader;

    const envListTitle = document.createElement('div');
    envListTitle.textContent = 'Environments';
    envListTitle.style.cssText = EnvironmentDialogStyles.envListTitle;

    const envListCount = document.createElement('div');
    envListCount.textContent = `${state.workingEnvs.length}`;
    envListCount.style.cssText = EnvironmentDialogStyles.envListCount;

    envListHeader.appendChild(envListTitle);
    envListHeader.appendChild(envListCount);
    envList.appendChild(envListHeader);

    const envListBody = document.createElement('div');
    envListBody.style.cssText = EnvironmentDialogStyles.envListBody;

    state.workingEnvs.forEach((env) => {
      const envItem = document.createElement('div');
      envItem.style.cssText = EnvironmentDialogStyles.getEnvItemStyle(
        state.selectedEnvId === env.id
      );

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'selected-env';
      radio.checked = state.selectedEnvId === env.id;
      radio.title = 'Selected environment';
      radio.style.cursor = 'pointer';
      radio.style.accentColor = 'var(--primary-color)';

      radio.addEventListener('change', () => {
        if (radio.checked) {
          onSelectEnv(env.id);
        }
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = env.name;
      nameSpan.style.cssText = EnvironmentDialogStyles.envNameSpan;

      const meta = document.createElement('div');
      meta.style.cssText = EnvironmentDialogStyles.envMeta;

      if (state.workingActiveId === env.id) {
        const activeBadge = document.createElement('span');
        activeBadge.textContent = 'Active';
        activeBadge.style.cssText = EnvironmentDialogStyles.activeBadge;
        meta.appendChild(activeBadge);
      }

      envItem.addEventListener('click', (e) => {
        if (e.target !== radio) {
          onSelectEnv(env.id);
        }
      });

      envItem.appendChild(radio);
      envItem.appendChild(nameSpan);
      envItem.appendChild(meta);
      envListBody.appendChild(envItem);
    });

    envList.appendChild(envListBody);

    return envList;
  }

  /**
   * Creates the environment details panel (right panel)
   */
  static createEnvironmentDetails(
    selectedEnv: Environment,
    isActive: boolean,
    onNameChange: (newName: string) => void,
    onSetActive: () => void,
    onDuplicate?: () => void,
    onChange?: () => void
  ): HTMLDivElement {
    const envDetails = document.createElement('div');
    envDetails.style.cssText = EnvironmentDialogStyles.envDetails;

    // Name field: label on top, then [input | Set Active | Duplicate] on one row
    const nameField = document.createElement('div');
    nameField.style.cssText = EnvironmentDialogStyles.nameField;

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    nameLabel.style.cssText = EnvironmentDialogStyles.label;

    const nameRow = document.createElement('div');
    nameRow.style.cssText = EnvironmentDialogStyles.nameRow;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = selectedEnv.name;
    nameInput.placeholder = 'Environment name';
    nameInput.style.cssText = EnvironmentDialogStyles.nameInput;

    nameInput.addEventListener('focus', () => {
      nameInput.style.borderColor = 'var(--primary-color)';
      nameInput.style.boxShadow =
        '0 0 0 2px rgba(var(--primary-color-rgb), 0.15)';
    });
    nameInput.addEventListener('blur', () => {
      nameInput.style.borderColor = 'rgba(255, 255, 255, 0.08)';
      nameInput.style.boxShadow = 'none';
    });
    nameInput.addEventListener('input', () => {
      onNameChange(nameInput.value);
    });

    nameRow.appendChild(nameInput);

    if (isActive) {
      const activeBadge = document.createElement('span');
      activeBadge.textContent = 'Active';
      activeBadge.style.cssText = EnvironmentDialogStyles.activeBadge;
      nameRow.appendChild(activeBadge);
    } else {
      const setActiveBtn = document.createElement('button');
      setActiveBtn.textContent = 'Set Active';
      setActiveBtn.style.cssText = EnvironmentDialogStyles.setActiveButton;
      setActiveBtn.addEventListener('click', onSetActive);
      nameRow.appendChild(setActiveBtn);
    }

    if (onDuplicate) {
      const duplicateBtn = document.createElement('button');
      duplicateBtn.textContent = 'Duplicate';
      duplicateBtn.style.cssText = EnvironmentDialogStyles.setActiveButton;
      duplicateBtn.addEventListener('click', onDuplicate);
      nameRow.appendChild(duplicateBtn);
    }

    nameField.appendChild(nameLabel);
    nameField.appendChild(nameRow);

    // Variables section (fills the remaining height)
    const varsSection = EnvironmentVariablesManager.renderVariablesSection(
      selectedEnv,
      onChange
    );

    envDetails.appendChild(nameField);
    envDetails.appendChild(varsSection);

    return envDetails;
  }

  /**
   * Creates the empty state message
   */
  static createEmptyState(): HTMLDivElement {
    const emptyState = document.createElement('div');
    emptyState.textContent =
      'No environments. Click "+ New Environment" to create one.';
    emptyState.style.cssText = EnvironmentDialogStyles.emptyState;
    return emptyState;
  }

  /**
   * Creates the two-column layout
   */
  static createLayout(
    state: EnvironmentDialogState,
    onSelectEnv: (envId: string) => void,
    onSetActive: (envId: string) => void,
    onNameChange: (newName: string) => void,
    onDuplicate?: (envId: string) => void,
    onChange?: () => void
  ): HTMLDivElement {
    const layout = document.createElement('div');
    layout.style.cssText = EnvironmentDialogStyles.layout;

    const envList = this.createEnvironmentList(state, onSelectEnv);
    layout.appendChild(envList);

    const selectedEnv = state.workingEnvs.find(
      (e) => e.id === state.selectedEnvId
    );
    if (selectedEnv) {
      const envDetails = this.createEnvironmentDetails(
        selectedEnv,
        state.workingActiveId === selectedEnv.id,
        onNameChange,
        () => onSetActive(selectedEnv.id),
        onDuplicate ? () => onDuplicate(selectedEnv.id) : undefined,
        onChange
      );
      layout.appendChild(envDetails);
    }

    return layout;
  }

  /**
   * Creates the dialog header
   */
  static createHeader(
    onAddEnvironment: () => void,
    onDeleteAll: () => void
  ): HTMLDivElement {
    const header = document.createElement('div');
    header.style.cssText = EnvironmentDialogStyles.header;

    const title = document.createElement('h2');
    title.textContent = 'Manage Environments';
    title.style.cssText = EnvironmentDialogStyles.title;

    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = EnvironmentDialogStyles.buttonsContainer;

    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.textContent = 'Delete All';
    deleteAllBtn.style.cssText = EnvironmentDialogStyles.deleteAllButton;
    deleteAllBtn.addEventListener('click', onDeleteAll);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ New Environment';
    addBtn.style.cssText = EnvironmentDialogStyles.addButton;
    addBtn.addEventListener('click', onAddEnvironment);

    buttonsContainer.appendChild(deleteAllBtn);
    buttonsContainer.appendChild(addBtn);

    header.appendChild(title);
    header.appendChild(buttonsContainer);

    return header;
  }

  /**
   * Creates the tabs row: tab pills on the left, Delete/Close actions on the
   * right. Edits are saved automatically, so there is no Save button.
   */
  static createTabsRow(
    activeTab: DialogTab,
    onTabChange: (tab: DialogTab) => void,
    onClose: () => void,
    onDeleteEnv?: () => void
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = EnvironmentDialogStyles.tabsRow;

    row.appendChild(this.createTabs(activeTab, onTabChange));

    const actions = document.createElement('div');
    actions.style.cssText = EnvironmentDialogStyles.headerActions;

    const autoSaveHint = document.createElement('span');
    autoSaveHint.textContent = 'Changes are saved automatically';
    autoSaveHint.style.cssText = EnvironmentDialogStyles.autoSaveHint;
    actions.appendChild(autoSaveHint);

    if (onDeleteEnv) {
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete Environment';
      deleteBtn.style.cssText = EnvironmentDialogStyles.deleteAllButton;
      deleteBtn.addEventListener('mouseenter', () => {
        deleteBtn.style.background = 'rgba(var(--error-color-rgb), 0.2)';
      });
      deleteBtn.addEventListener('mouseleave', () => {
        deleteBtn.style.background = 'rgba(var(--error-color-rgb), 0.1)';
      });
      deleteBtn.addEventListener('click', onDeleteEnv);
      actions.appendChild(deleteBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = EnvironmentDialogStyles.saveButton;
    closeBtn.addEventListener('click', onClose);

    actions.appendChild(closeBtn);
    row.appendChild(actions);

    return row;
  }

  /**
   * Creates the tabs for switching between Environments and Globals
   */
  static createTabs(
    activeTab: DialogTab,
    onTabChange: (tab: DialogTab) => void
  ): HTMLDivElement {
    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = EnvironmentDialogStyles.tabsContainer;

    const envTab = document.createElement('button');
    envTab.textContent = 'Environments';
    envTab.style.cssText = EnvironmentDialogStyles.getTabStyle(
      activeTab === 'environments'
    );
    envTab.addEventListener('click', () => onTabChange('environments'));

    const globalsTab = document.createElement('button');
    globalsTab.textContent = 'Globals';
    globalsTab.style.cssText = EnvironmentDialogStyles.getTabStyle(
      activeTab === 'globals'
    );
    globalsTab.addEventListener('click', () => onTabChange('globals'));

    tabsContainer.appendChild(envTab);
    tabsContainer.appendChild(globalsTab);

    return tabsContainer;
  }

  /**
   * Creates the globals panel for editing global variables
   */
  static createGlobalsPanel(
    globals: Globals,
    onChange?: () => void
  ): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = EnvironmentDialogStyles.globalsPanel;

    // Description
    const description = document.createElement('div');
    description.style.cssText = EnvironmentDialogStyles.globalsDescription;
    description.textContent =
      'Global variables are available in all requests, regardless of the selected environment. They have the lowest priority and will be overridden by environment or folder variables with the same name.';
    panel.appendChild(description);

    // Shared variables table (sticky header, pinned add button)
    globals.variableDescriptions ??= {};
    globals.variableSecrets ??= {};
    const table = EnvironmentVariablesManager.renderVariableTable({
      title: 'Global Variables',
      variables: globals.variables,
      descriptions: globals.variableDescriptions,
      secrets: globals.variableSecrets,
      onChange,
    });
    panel.appendChild(table);

    return panel;
  }
}
