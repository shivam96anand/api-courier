import { Environment, Globals } from '../../../shared/types';
import { modal } from '../../utils/modal';
import {
  buildDialogResult,
  EnvironmentDialogResult,
} from './environment-drafts';
import { EnvironmentDialogStyles } from './EnvironmentDialogStyles';
import {
  EnvironmentDialogUI,
  EnvironmentDialogState,
  DialogTab,
} from './EnvironmentDialogUI';

/** Debounce for autosave, so typing a value is not one store write per keystroke. */
const AUTO_SAVE_DELAY_MS = 400;

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
   * is not lost when the dialog is dismissed.
   * @param onAutoSave Persists edits while the dialog stays open (debounced).
   * @returns The final state when it has not been autosaved yet, otherwise null.
   */
  async showManageDialog(
    environments: Environment[],
    activeEnvironmentId?: string,
    onEnvironmentsDeleted?: (deletedIds: string[]) => void | Promise<void>,
    onAutoSave?: (result: EnvironmentDialogResult) => void | Promise<void>
  ): Promise<EnvironmentDialogResult | null> {
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

      let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (autoSaveTimer !== null) {
          clearTimeout(autoSaveTimer);
        }
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      };

      const snapshot = (): EnvironmentDialogResult =>
        buildDialogResult(
          state.workingEnvs,
          state.workingActiveId,
          state.workingGlobals
        );

      const scheduleAutoSave = () => {
        if (autoSaveTimer !== null) {
          clearTimeout(autoSaveTimer);
        }
        autoSaveTimer = setTimeout(() => {
          autoSaveTimer = null;
          void onAutoSave?.(snapshot());
        }, AUTO_SAVE_DELAY_MS);
      };

      const handleClose = () => {
        // A pending timer means the latest edits are not persisted yet; hand
        // them back so the caller saves them one final time.
        const pending = autoSaveTimer !== null;
        cleanup();
        resolve(pending ? snapshot() : null);
      };

      // Render function
      const renderBody = () => {
        body.innerHTML = '';

        // Delete handler for the selected environment. It is rendered in the
        // tabs row before Close, and only when an environment is selected.
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

        // Tabs row (pills on the left, Delete/Close on the right)
        const tabsRow = EnvironmentDialogUI.createTabsRow(
          state.activeTab,
          (tab: DialogTab) => {
            state.activeTab = tab;
            renderBody();
          },
          handleClose,
          onDeleteEnv
        );
        body.appendChild(tabsRow);

        if (state.activeTab === 'globals') {
          // Render globals panel
          const globalsPanel = EnvironmentDialogUI.createGlobalsPanel(
            state.workingGlobals,
            scheduleAutoSave
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
            scheduleAutoSave();
          },
          (newName) => {
            const selectedEnv = state.workingEnvs.find(
              (e) => e.id === state.selectedEnvId
            );
            if (selectedEnv) {
              selectedEnv.name = newName;
              scheduleAutoSave();
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
            scheduleAutoSave();
          },
          scheduleAutoSave
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
            scheduleAutoSave();
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
          handleClose();
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
