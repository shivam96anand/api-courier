import { Environment, Globals } from '../../../shared/types';
import { modal } from '../../utils/modal';
import { EnvironmentDialogStyles } from './EnvironmentDialogStyles';
import {
  EnvironmentDialogUI,
  EnvironmentDialogState,
  DialogTab,
} from './EnvironmentDialogUI';

export class EnvironmentDialogs {
  private onShowError: (message: string) => void;

  constructor(onShowError: (message: string) => void) {
    this.onShowError = onShowError;
  }

  async promptEnvironmentName(
    defaultValue: string = ''
  ): Promise<string | null> {
    return modal.show(
      'Environment Name',
      'Enter environment name',
      defaultValue
    );
  }

  /**
   * @param onEnvironmentsDeleted Commits a confirmed deletion right away, so it
   * is not lost when the dialog is dismissed without pressing Save.
   */
  async showManageDialog(
    environments: Environment[],
    activeEnvironmentId?: string,
    onEnvironmentsDeleted?: (deletedIds: string[]) => void | Promise<void>
  ): Promise<{
    environments: Environment[];
    activeEnvironmentId?: string;
    globals?: Globals;
  } | null> {
    // Load globals from store
    let loadedGlobals: Globals = { variables: {}, variableDescriptions: {} };
    try {
      const storeState = await window.restbro.store.get();
      loadedGlobals = storeState.globals || {
        variables: {},
        variableDescriptions: {},
      };
    } catch (error) {
      console.error('Failed to load globals:', error);
    }

    return new Promise((resolve) => {
      // Create overlay and dialog containers
      const { overlay, dialog, body } = this.createDialogStructure();

      // Initialize state
      const state: EnvironmentDialogState = {
        workingEnvs: [
          ...environments.map((e) => ({
            ...e,
            variables: { ...e.variables },
            variableDescriptions: { ...(e.variableDescriptions || {}) },
            variableSecrets: { ...(e.variableSecrets || {}) },
          })),
        ],
        workingActiveId: activeEnvironmentId,
        selectedEnvId: environments[0]?.id || null,
        workingGlobals: {
          variables: { ...loadedGlobals.variables },
          variableDescriptions: {
            ...(loadedGlobals.variableDescriptions || {}),
          },
          variableSecrets: { ...(loadedGlobals.variableSecrets || {}) },
        },
        activeTab: 'environments',
      };

      const cleanup = () => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      };

      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      const handleSave = () => {
        const DRAFT_PREFIX = '__restbro_draft__';
        state.workingEnvs.forEach((env) => {
          const descriptions = env.variableDescriptions || {};
          const envSecrets = env.variableSecrets || {};
          Object.keys(env.variables).forEach((key) => {
            if (!key || key.startsWith(DRAFT_PREFIX)) {
              delete env.variables[key];
              delete descriptions[key];
              delete envSecrets[key];
            }
          });
          env.variableDescriptions = descriptions;
          env.variableSecrets = envSecrets;
        });

        const globalDescriptions =
          state.workingGlobals.variableDescriptions || {};
        const globalSecrets = state.workingGlobals.variableSecrets || {};
        Object.keys(state.workingGlobals.variables).forEach((key) => {
          if (!key || key.startsWith(DRAFT_PREFIX)) {
            delete state.workingGlobals.variables[key];
            delete globalDescriptions[key];
            delete globalSecrets[key];
          }
        });
        state.workingGlobals.variableDescriptions = globalDescriptions;
        state.workingGlobals.variableSecrets = globalSecrets;

        cleanup();
        resolve({
          environments: state.workingEnvs,
          activeEnvironmentId: state.workingActiveId,
          globals: state.workingGlobals,
        });
      };

      // Render function
      const renderBody = () => {
        body.innerHTML = '';

        // Delete handler for the selected environment. It is rendered in the
        // tabs row before Cancel/Save, and only when an environment is selected.
        const selectedForDelete = state.workingEnvs.find(
          (e) => e.id === state.selectedEnvId
        );
        const onDeleteEnv =
          state.activeTab === 'environments' && selectedForDelete
            ? () => {
                const confirmed = confirm(
                  `Delete environment "${selectedForDelete.name}"?`
                );
                if (!confirmed) return;
                const deletedId = selectedForDelete.id;
                state.workingEnvs = state.workingEnvs.filter(
                  (e) => e.id !== deletedId
                );
                if (state.workingActiveId === deletedId) {
                  state.workingActiveId = undefined;
                }
                state.selectedEnvId = state.workingEnvs[0]?.id || null;
                renderBody();
                void onEnvironmentsDeleted?.([deletedId]);
              }
            : undefined;

        // Tabs row (pills on the left, Delete/Cancel/Save on the right)
        const tabsRow = EnvironmentDialogUI.createTabsRow(
          state.activeTab,
          (tab: DialogTab) => {
            state.activeTab = tab;
            renderBody();
          },
          handleCancel,
          handleSave,
          onDeleteEnv
        );
        body.appendChild(tabsRow);

        if (state.activeTab === 'globals') {
          // Render globals panel
          const globalsPanel = EnvironmentDialogUI.createGlobalsPanel(
            state.workingGlobals
          );
          body.appendChild(globalsPanel);
          return;
        }

        // Render environments tab
        if (state.workingEnvs.length === 0) {
          body.appendChild(EnvironmentDialogUI.createEmptyState());
          return;
        }

        const layout = EnvironmentDialogUI.createLayout(
          state,
          (envId) => {
            state.selectedEnvId = envId;
            renderBody();
          },
          (envId) => {
            state.workingActiveId = envId;
            renderBody();
          },
          (newName) => {
            const selectedEnv = state.workingEnvs.find(
              (e) => e.id === state.selectedEnvId
            );
            if (selectedEnv) {
              selectedEnv.name = newName;
            }
          },
          (envId) => {
            const envToDuplicate = state.workingEnvs.find(
              (e) => e.id === envId
            );
            if (!envToDuplicate) return;
            const duplicated: Environment = {
              id: crypto.randomUUID(),
              name: `${envToDuplicate.name} Copy`,
              variables: { ...envToDuplicate.variables },
              variableDescriptions: {
                ...(envToDuplicate.variableDescriptions || {}),
              },
              variableSecrets: {
                ...(envToDuplicate.variableSecrets || {}),
              },
            };
            state.workingEnvs.push(duplicated);
            state.selectedEnvId = duplicated.id;
            renderBody();
          }
        );

        body.appendChild(layout);
      };

      // Create header with handlers
      const header = EnvironmentDialogUI.createHeader(
        async () => {
          const name = await this.promptEnvironmentName();
          if (name) {
            const newEnv: Environment = {
              id: crypto.randomUUID(),
              name,
              variables: {},
            };
            state.workingEnvs.push(newEnv);
            state.selectedEnvId = newEnv.id;
            renderBody();
          }
        },
        async () => {
          if (state.workingEnvs.length === 0) return;

          const confirmed = confirm(
            `Delete all ${state.workingEnvs.length} environment(s)? This cannot be undone.`
          );
          if (confirmed) {
            const deletedIds = state.workingEnvs.map((e) => e.id);
            state.workingEnvs = [];
            state.selectedEnvId = null;
            state.workingActiveId = undefined;
            renderBody();
            void onEnvironmentsDeleted?.(deletedIds);
          }
        }
      );

      // Handle overlay click to close
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });

      // Bound to the overlay rather than the document so a nested prompt
      // ("Environment Name") swallows its own Escape instead of closing both.
      overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        handleCancel();
      });

      // Assemble dialog
      dialog.appendChild(header);
      dialog.appendChild(body);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      dialog.focus({ preventScroll: true });

      // Initial render
      renderBody();
    });
  }

  /**
   * Creates the basic dialog structure (overlay, dialog, body)
   */
  private createDialogStructure(): {
    overlay: HTMLDivElement;
    dialog: HTMLDivElement;
    body: HTMLDivElement;
  } {
    EnvironmentDialogStyles.ensureAnimations();

    const overlay = document.createElement('div');
    overlay.style.cssText = EnvironmentDialogStyles.overlay;

    const dialog = document.createElement('div');
    dialog.style.cssText = EnvironmentDialogStyles.dialog;
    // Focusable so Escape reaches the overlay listener even before the user
    // interacts with any field inside the dialog.
    dialog.tabIndex = -1;

    const body = document.createElement('div');
    body.style.cssText = EnvironmentDialogStyles.body;

    return { overlay, dialog, body };
  }
}
