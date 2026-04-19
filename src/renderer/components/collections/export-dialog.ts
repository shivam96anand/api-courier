import { Collection, Environment, Globals } from '../../../shared/types';
import { createIconElement } from '../../utils/icons';

export interface ExportSelection {
  collectionIds: string[];
  environmentIds: string[];
  includeGlobals: boolean;
}

/**
 * Returns the minimal set of checked collection IDs that have no checked ancestor.
 * Each represents a root of a subtree to export (folder + all descendants, or single request).
 */
export function getExportRootIds(
  collections: Collection[],
  checkedIds: Set<string>
): string[] {
  const roots: string[] = [];
  const hasCheckedAncestor = (id: string): boolean => {
    const c = collections.find((x) => x.id === id);
    if (!c?.parentId) return false;
    if (checkedIds.has(c.parentId)) return true;
    return hasCheckedAncestor(c.parentId);
  };
  checkedIds.forEach((id) => {
    if (!hasCheckedAncestor(id)) roots.push(id);
  });
  return roots;
}

export interface ExportDialogOptions {
  collections: Collection[];
  environments: Environment[];
  globals: Globals | undefined;
}

/**
 * Shows a modal for the user to choose which collections, environments, and globals to export.
 * Collections: tree with checkboxes (checking a folder includes it and all descendants).
 * Environments: list with checkboxes (all checked by default).
 * Globals: single checkbox (checked by default).
 */
export function showExportDialog(
  options: ExportDialogOptions
): Promise<ExportSelection | null> {
  const { collections, environments, globals } = options;
  const rootItems = collections
    .filter((c) => !c.parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const checkedCollectionIds = new Set<string>(collections.map((c) => c.id));
  const checkedEnvironmentIds = new Set<string>(environments.map((e) => e.id));
  const expandedFolderIds = new Set<string>(); // collapsed by default
  let includeGlobals = true;

  const hasAnyGlobals =
    globals?.variables && Object.keys(globals.variables).length > 0;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'export-collections-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'export-collections-dialog';

    const header = document.createElement('div');
    header.className = 'export-collections-dialog__header';
    const title = document.createElement('h2');
    title.textContent = 'Export';
    title.className = 'export-collections-dialog__title';
    const subtitle = document.createElement('div');
    subtitle.textContent =
      'Choose collections, environments, and globals to include in the export file.';
    subtitle.className = 'export-collections-dialog__subtitle';
    header.appendChild(title);
    header.appendChild(subtitle);

    const body = document.createElement('div');
    body.className = 'export-collections-dialog__body';

    // --- Collections section ---
    const collSection = document.createElement('div');
    collSection.className = 'export-collections-dialog__section';
    const collLabel = document.createElement('div');
    collLabel.textContent = 'Collections';
    collLabel.className = 'export-collections-dialog__section-label';
    const selectAllColl = document.createElement('button');
    selectAllColl.textContent = 'Select all';
    selectAllColl.type = 'button';
    selectAllColl.className = 'export-collections-dialog__link-btn';
    const deselectAllColl = document.createElement('button');
    deselectAllColl.textContent = 'Deselect all';
    deselectAllColl.type = 'button';
    deselectAllColl.className = 'export-collections-dialog__link-btn';
    collLabel.appendChild(selectAllColl);
    collLabel.appendChild(document.createTextNode(' \u00B7 '));
    collLabel.appendChild(deselectAllColl);

    const collTree = document.createElement('div');
    collTree.className = 'export-collections-dialog__tree';

    function setCollectionChecked(id: string, checked: boolean): void {
      if (checked) {
        checkedCollectionIds.add(id);
        const c = collections.find((x) => x.id === id);
        if (c?.type === 'folder') {
          collections
            .filter((x) => x.parentId === id)
            .forEach((child) => setCollectionChecked(child.id, true));
        }
      } else {
        checkedCollectionIds.delete(id);
        const c = collections.find((x) => x.id === id);
        if (c?.type === 'folder') {
          collections
            .filter((x) => x.parentId === id)
            .forEach((child) => setCollectionChecked(child.id, false));
        }
      }
    }

    function syncCheckboxesFromSet(): void {
      collTree
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-id]')
        .forEach((input) => {
          const id = input.dataset.id;
          if (id) input.checked = checkedCollectionIds.has(id);
        });
    }

    function renderCollectionTree(): void {
      collTree.innerHTML = '';
      rootItems.forEach((c) => renderCollectionItem(c, 0));
    }

    function renderCollectionItem(c: Collection, level: number): void {
      const row = document.createElement('div');
      row.className = 'export-collections-dialog__row';
      row.style.paddingLeft = `${level * 16 + 6}px`;

      if (c.type === 'folder') {
        const expanded = expandedFolderIds.has(c.id);
        const children = collections
          .filter((x) => x.parentId === c.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const hasChildren = children.length > 0;

        const caretBtn = document.createElement('button');
        caretBtn.type = 'button';
        caretBtn.setAttribute(
          'aria-label',
          expanded ? 'Collapse folder' : 'Expand folder'
        );
        caretBtn.className = 'export-collections-dialog__caret';
        caretBtn.textContent = expanded ? '\u25BC' : '\u25B6';
        if (hasChildren) {
          caretBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (expandedFolderIds.has(c.id)) expandedFolderIds.delete(c.id);
            else expandedFolderIds.add(c.id);
            renderCollectionTree();
          });
        } else {
          caretBtn.style.visibility = 'hidden';
          caretBtn.setAttribute('aria-hidden', 'true');
        }

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checkedCollectionIds.has(c.id);
        cb.dataset.id = c.id;
        cb.addEventListener('change', () => {
          setCollectionChecked(c.id, cb.checked);
          syncCheckboxesFromSet();
        });
        const icon = createIconElement('folder', {
          style: { width: '14px', height: '14px' },
        });
        const name = document.createElement('span');
        name.textContent = c.name;
        name.className = 'export-collections-dialog__name is-folder';
        name.addEventListener('click', () => {
          if (hasChildren) {
            if (expandedFolderIds.has(c.id)) expandedFolderIds.delete(c.id);
            else expandedFolderIds.add(c.id);
            renderCollectionTree();
          }
        });

        row.appendChild(caretBtn);
        row.appendChild(cb);
        row.appendChild(icon);
        row.appendChild(name);
        collTree.appendChild(row);

        if (expanded && hasChildren) {
          children.forEach((child) => renderCollectionItem(child, level + 1));
        }
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'export-collections-dialog__spacer';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checkedCollectionIds.has(c.id);
        cb.dataset.id = c.id;
        cb.addEventListener('change', () => {
          setCollectionChecked(c.id, cb.checked);
          syncCheckboxesFromSet();
        });
        const icon = createIconElement('file', {
          style: { width: '14px', height: '14px' },
        });
        const name = document.createElement('span');
        name.textContent = c.request
          ? `${c.request.method ?? 'GET'} ${c.name}`
          : c.name;
        name.className = 'export-collections-dialog__name';
        row.appendChild(spacer);
        row.appendChild(cb);
        row.appendChild(icon);
        row.appendChild(name);
        collTree.appendChild(row);
      }
    }

    renderCollectionTree();

    selectAllColl.addEventListener('click', () => {
      collections.forEach((c) => checkedCollectionIds.add(c.id));
      syncCheckboxesFromSet();
    });
    deselectAllColl.addEventListener('click', () => {
      checkedCollectionIds.clear();
      syncCheckboxesFromSet();
    });

    collSection.appendChild(collLabel);
    collSection.appendChild(collTree);
    body.appendChild(collSection);

    // --- Environments section ---
    const envSection = document.createElement('div');
    envSection.className = 'export-collections-dialog__section';
    const envLabel = document.createElement('div');
    envLabel.textContent = 'Environments';
    envLabel.className = 'export-collections-dialog__section-label';
    const envList = document.createElement('div');
    envList.className = 'export-collections-dialog__list';
    environments.forEach((env) => {
      const label = document.createElement('label');
      label.className = 'export-collections-dialog__check-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.envId = env.id;
      cb.addEventListener('change', () => {
        if (cb.checked) checkedEnvironmentIds.add(env.id);
        else checkedEnvironmentIds.delete(env.id);
      });
      const icon = createIconElement('globe', {
        style: { width: '14px', height: '14px' },
      });
      const name = document.createElement('span');
      name.textContent = env.name;
      name.className = 'export-collections-dialog__name';
      label.appendChild(cb);
      label.appendChild(icon);
      label.appendChild(name);
      envList.appendChild(label);
    });
    envSection.appendChild(envLabel);
    envSection.appendChild(envList);
    body.appendChild(envSection);

    // --- Globals ---
    if (hasAnyGlobals) {
      const globSection = document.createElement('div');
      globSection.className = 'export-collections-dialog__section';
      const globLabel = document.createElement('label');
      globLabel.className = 'export-collections-dialog__check-row';
      const globCb = document.createElement('input');
      globCb.type = 'checkbox';
      globCb.checked = true;
      globCb.addEventListener('change', () => {
        includeGlobals = globCb.checked;
      });
      const globText = document.createElement('span');
      globText.textContent = `Include globals (${Object.keys(globals?.variables ?? {}).length} variables)`;
      globText.className = 'export-collections-dialog__name';
      globLabel.appendChild(globCb);
      globLabel.appendChild(globText);
      globSection.appendChild(globLabel);
      body.appendChild(globSection);
    }

    const footer = document.createElement('div');
    footer.className = 'export-collections-dialog__footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.type = 'button';
    cancelBtn.className = 'export-collections-dialog__btn-secondary';
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.type = 'button';
    exportBtn.className = 'export-collections-dialog__btn-primary';

    function cleanup(): void {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    }

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    exportBtn.addEventListener('click', () => {
      const rootIds = getExportRootIds(collections, checkedCollectionIds);
      cleanup();
      resolve({
        collectionIds: rootIds,
        environmentIds: Array.from(checkedEnvironmentIds),
        includeGlobals,
      });
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(exportBtn);
    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}
