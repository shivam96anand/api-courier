import { Collection } from '../../../shared/types';

export class ImportDialog {
  private onImport: (preview: any) => Promise<boolean>;

  constructor(onImport: (preview: any) => Promise<boolean>) {
    this.onImport = onImport;
  }

  async show(preview: any): Promise<void> {
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
        width: 650px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
      `;

      // Header
      const header = document.createElement('div');
      header.style.cssText = `
        padding: 20px 24px;
        border-bottom: 1px solid var(--border-color);
      `;

      const title = document.createElement('h2');
      title.textContent = 'Import Preview';
      title.style.cssText = `
        margin: 0 0 8px 0;
        color: var(--text-primary);
        font-size: 18px;
        font-weight: 600;
      `;

      const subtitle = document.createElement('div');
      subtitle.textContent = preview.name;
      subtitle.style.cssText = `
        color: var(--text-secondary);
        font-size: 14px;
      `;

      header.appendChild(title);
      header.appendChild(subtitle);

      // Body
      const body = document.createElement('div');
      body.style.cssText = `
        padding: 20px 24px;
        overflow-y: auto;
        flex: 1;
      `;

      // Summary section
      const summarySection = document.createElement('div');
      summarySection.style.cssText = `
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 20px;
      `;

      const summaryTitle = document.createElement('h3');
      summaryTitle.textContent = 'Summary';
      summaryTitle.style.cssText = `
        margin: 0 0 12px 0;
        color: var(--text-primary);
        font-size: 15px;
        font-weight: 600;
      `;

      const summaryStats = document.createElement('div');
      summaryStats.style.cssText = `
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      `;

      const createStat = (label: string, value: number, icon: string) => {
        const stat = document.createElement('div');
        stat.style.cssText = `
          text-align: center;
          padding: 12px;
          background: var(--bg-primary);
          border-radius: 4px;
        `;

        const iconEl = document.createElement('div');
        iconEl.textContent = icon;
        iconEl.style.cssText = `
          font-size: 24px;
          margin-bottom: 4px;
        `;

        const valueEl = document.createElement('div');
        valueEl.textContent = String(value);
        valueEl.style.cssText = `
          color: var(--text-primary);
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 2px;
        `;

        const labelEl = document.createElement('div');
        labelEl.textContent = label;
        labelEl.style.cssText = `
          color: var(--text-secondary);
          font-size: 12px;
        `;

        stat.appendChild(iconEl);
        stat.appendChild(valueEl);
        stat.appendChild(labelEl);
        return stat;
      };

      summaryStats.appendChild(createStat('Folders', preview.summary.folders, '📁'));
      summaryStats.appendChild(createStat('Requests', preview.summary.requests, '🌐'));
      summaryStats.appendChild(createStat('Environments', preview.summary.environments, '🌍'));

      summarySection.appendChild(summaryTitle);
      summarySection.appendChild(summaryStats);
      body.appendChild(summarySection);

      // Collection tree section
      if (preview.rootFolder) {
        const treeSection = document.createElement('div');
        treeSection.style.cssText = `
          margin-bottom: 20px;
        `;

        const treeTitle = document.createElement('h3');
        treeTitle.textContent = 'Collection Structure';
        treeTitle.style.cssText = `
          margin: 0 0 12px 0;
          color: var(--text-primary);
          font-size: 15px;
          font-weight: 600;
        `;

        const treeContainer = document.createElement('div');
        treeContainer.style.cssText = `
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 12px;
          background: var(--bg-tertiary);
          max-height: 200px;
          overflow-y: auto;
        `;

        const renderTree = (item: Collection, level: number = 0) => {
          const itemEl = document.createElement('div');
          itemEl.style.cssText = `
            padding: 4px 8px;
            padding-left: ${level * 20 + 8}px;
            color: var(--text-primary);
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
          `;

          const icon = document.createElement('span');
          icon.textContent = item.type === 'folder' ? '📁' : '🌐';
          icon.style.fontSize = '14px';

          const name = document.createElement('span');
          name.textContent = item.name;

          if (item.type === 'request') {
            const method = document.createElement('span');
            method.textContent = item.request?.method || 'GET';
            method.style.cssText = `
              font-size: 11px;
              padding: 2px 6px;
              border-radius: 3px;
              background: var(--primary-color);
              color: white;
              margin-left: 6px;
            `;
            name.appendChild(method);
          }

          itemEl.appendChild(icon);
          itemEl.appendChild(name);
          treeContainer.appendChild(itemEl);

          if (item.type === 'folder' && item.children) {
            item.children.forEach(child => renderTree(child, level + 1));
          }
        };

        renderTree(preview.rootFolder);

        treeSection.appendChild(treeTitle);
        treeSection.appendChild(treeContainer);
        body.appendChild(treeSection);
      }

      // Environments section
      if (preview.environments && preview.environments.length > 0) {
        const envsSection = document.createElement('div');
        envsSection.style.cssText = `
          margin-bottom: 20px;
        `;

        const envsTitle = document.createElement('h3');
        envsTitle.textContent = 'Environments';
        envsTitle.style.cssText = `
          margin: 0 0 12px 0;
          color: var(--text-primary);
          font-size: 15px;
          font-weight: 600;
        `;

        const envsContainer = document.createElement('div');
        envsContainer.style.cssText = `
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 12px;
          background: var(--bg-tertiary);
        `;

        preview.environments.forEach((env: any) => {
          const envItem = document.createElement('div');
          envItem.style.cssText = `
            padding: 8px;
            margin-bottom: 8px;
            background: var(--bg-primary);
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
          `;

          const envIcon = document.createElement('span');
          envIcon.textContent = '🌍';
          envIcon.style.fontSize = '16px';

          const envName = document.createElement('span');
          envName.textContent = env.name;
          envName.style.cssText = `
            flex: 1;
            color: var(--text-primary);
            font-size: 13px;
          `;

          const varCount = document.createElement('span');
          varCount.textContent = `${Object.keys(env.variables || {}).length} variables`;
          varCount.style.cssText = `
            color: var(--text-secondary);
            font-size: 12px;
          `;

          envItem.appendChild(envIcon);
          envItem.appendChild(envName);
          envItem.appendChild(varCount);
          envsContainer.appendChild(envItem);
        });

        envsSection.appendChild(envsTitle);
        envsSection.appendChild(envsContainer);
        body.appendChild(envsSection);
      }

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

      const importBtn = document.createElement('button');
      importBtn.textContent = 'Import';
      importBtn.style.cssText = `
        padding: 8px 24px;
        background: var(--primary-color);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      `;

      const cleanup = () => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      };

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve();
      });

      importBtn.addEventListener('click', async () => {
        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';

        const success = await this.onImport(preview);

        if (success) {
          cleanup();
          resolve();
        } else {
          importBtn.disabled = false;
          importBtn.textContent = 'Import';
        }
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve();
        }
      });

      footer.appendChild(cancelBtn);
      footer.appendChild(importBtn);

      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }
}
