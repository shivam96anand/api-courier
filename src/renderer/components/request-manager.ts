import { ApiRequest } from '../../shared/types';
import { RequestFormHandler } from './request/request-form-handler';
import { RequestEditorsManager } from './request/request-editors-manager';
import { RequestDataManager } from './request/request-data-manager';

export class RequestManager {
  private formHandler: RequestFormHandler;
  private editorsManager: RequestEditorsManager;
  private dataManager: RequestDataManager;

  constructor() {
    this.formHandler = new RequestFormHandler(
      (updates) => this.updateRequest(updates)
    );

    this.editorsManager = new RequestEditorsManager(
      (updates) => this.updateRequest(updates)
    );

    this.dataManager = new RequestDataManager(
      (message) => this.formHandler.showError(message),
      this.editorsManager
    );
  }

  private updateRequest(updates: Partial<ApiRequest>): void {
    this.dataManager.updateCurrentRequest(updates);
  }

  initialize(): void {
    this.formHandler.setupRequestForm();
    this.formHandler.setupRequestTabs();
    this.dataManager.setupSendButton();
    this.dataManager.setupTabChangeListener();

    this.editorsManager.setupParamsEditor();
    this.editorsManager.setupHeadersEditor();
    this.editorsManager.setupBodyEditor();
    this.editorsManager.setupAuthEditor();

    this.formHandler.showEmptyState();

    document.addEventListener('tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = customEvent.detail.activeTab;
      this.loadRequest(activeTab ? activeTab.request : null);
    });
  }

  private loadRequest(request: ApiRequest | null): void {
    this.dataManager.setCurrentRequest(request);

    if (!request) {
      this.clearForm();
      this.formHandler.showEmptyState();
      return;
    }

    this.formHandler.showRequestForm();
    this.formHandler.loadBasicRequestData(request);
    this.editorsManager.loadParams(request.params || {});
    this.editorsManager.loadHeaders(request.headers);

    if (request.body) {
      this.editorsManager.loadBody(request.body);
    }

    if (request.auth) {
      this.editorsManager.loadAuth(request.auth);
    }
  }

  private clearForm(): void {
    this.formHandler.clearBasicForm();
    this.editorsManager.clearEditors();
  }
}