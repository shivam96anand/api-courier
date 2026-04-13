// Ask AI Tab - Main Class (Orchestrates AI chat functionality)

import {
  AiSession,
  AiContext,
  AskAiState,
  ApiRequest,
  ApiResponse,
  createInitialState,
} from './ask-ai/types';
import { AI_MAX_CONTEXT_CHARS } from '../../shared/types';
import { iconHtml } from '../utils/icons';
import {
  escapeHtml,
  calculateContextSize,
  showSizeWarning,
} from './ask-ai/utils';
import {
  renderSessionsList,
  renderEngineStatusBanner,
  renderWelcome,
  renderQuickSuggestions,
  renderInputArea,
} from './ask-ai/render-sidebar';
import { renderContextPanel, renderChatMessages } from './ask-ai/render-chat';
import {
  setupEventListeners,
  updateStreamingMessage,
  showError,
  updateEngineStatusBanner,
} from './ask-ai/event-handlers';
import { sendMessageToAI } from './ask-ai/messaging';

declare const apiCourier: {
  ai: {
    getSessions: () => Promise<{ sessions: AiSession[] }>;
    createSession: (context?: AiContext) => Promise<AiSession>;
    deleteSession: (sessionId: string) => Promise<boolean>;
    updateSession: (
      sessionId: string,
      updates: { title?: string; context?: AiContext }
    ) => Promise<AiSession | null>;
    onMessageStream: (
      callback: (data: { requestId: string; chunk: string }) => void
    ) => () => void;
    checkEngine: () => Promise<{ available: boolean; error?: string }>;
  };
};

export class AskAiTab {
  private container: HTMLElement;
  private isInitialized = false;
  private eventListenersAttached = false;
  private streamCleanup: (() => void) | null = null;
  private state: AskAiState = createInitialState();

  constructor(container: HTMLElement) {
    this.container = container;
    this.initializeComponents();
  }

  private async initializeComponents(): Promise<void> {
    this.render();
    await this.loadSessions();
    await this.checkEngineStatus();
    if (!this.eventListenersAttached) {
      this.attachEventListeners();
      this.setupStreamListener();
      this.eventListenersAttached = true;
    }
    this.isInitialized = true;
  }

  private attachEventListeners(): void {
    setupEventListeners({
      container: this.container,
      state: this.state,
      render: () => this.render(),
      getActiveSession: () => this.getActiveSession(),
      scrollToBottom: () => this.scrollToBottom(),
      checkEngineStatus: () => this.checkEngineStatus(),
      createNewSession: () => this.createNewSession(),
      selectSession: (id) => this.selectSession(id),
      deleteSession: (id) => this.deleteSession(id),
      startRenameSession: (id) => this.startRenameSession(id),
      finishRenameSession: (id, title) => this.finishRenameSession(id, title),
      cancelRenameSession: () => this.cancelRenameSession(),
      handleFileUpload: (file) => this.handleFileUpload(file),
      sendMessage: () => this.sendMessage(),
      renderSessionsList: () => renderSessionsList(this.state),
    });
  }

  private setupStreamListener(): void {
    this.streamCleanup = apiCourier.ai.onMessageStream((data) => {
      if (this.state.isSending) {
        if (!this.state.currentRequestId && data.requestId) {
          this.state.currentRequestId = data.requestId;
        }
        if (data.requestId === this.state.currentRequestId) {
          this.state.streamingContent += data.chunk;
          updateStreamingMessage(
            this.container,
            this.state.streamingContent,
            () => this.scrollToBottom()
          );
        }
      }
    });
  }

  initialize(): void {
    if (!this.isInitialized) {
      this.initializeComponents();
    }
  }

  async openWithContext(
    request?: ApiRequest,
    response?: ApiResponse
  ): Promise<void> {
    const context: AiContext = {};
    if (request) context.request = request;
    if (response) context.response = response;

    const size = calculateContextSize(context);
    if (size > AI_MAX_CONTEXT_CHARS) {
      showSizeWarning(size, AI_MAX_CONTEXT_CHARS);
      return;
    }

    try {
      const session = await apiCourier.ai.createSession(context);
      this.state.sessions.unshift(session);
      this.state.activeSessionId = session.id;
      this.state.showContextPanel = false;
      this.render();
      this.scrollToBottom();
    } catch (error) {
      console.error('Failed to create session with context:', error);
    }

    document.dispatchEvent(
      new CustomEvent('switch-to-tab', { detail: { tabName: 'ask-ai' } })
    );
  }

  private async loadSessions(): Promise<void> {
    try {
      const result = await apiCourier.ai.getSessions();
      this.state.sessions = result.sessions;
      this.state.isLoading = false;
      this.render();
    } catch (error) {
      console.error('Failed to load AI sessions:', error);
      this.state.isLoading = false;
      this.render();
    }
  }

  private async checkEngineStatus(): Promise<void> {
    try {
      const result = await apiCourier.ai.checkEngine();
      this.state.engineStatus = result.available ? 'available' : 'unavailable';
      this.state.engineError = result.error;
      updateEngineStatusBanner(this.container, this.state, () =>
        renderEngineStatusBanner(this.state)
      );
    } catch (error) {
      this.state.engineStatus = 'unavailable';
      this.state.engineError =
        error instanceof Error ? error.message : 'Unknown error';
      updateEngineStatusBanner(this.container, this.state, () =>
        renderEngineStatusBanner(this.state)
      );
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="coming-soon">
        <div class="coming-soon__icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10"/>
            <path d="M12 6v6l4 2"/>
            <path d="M18 2v4h4"/>
          </svg>
        </div>
        <h2 class="coming-soon__title">AI Assistant</h2>
        <p class="coming-soon__subtitle">Coming soon</p>
        <p class="coming-soon__desc">Analyse requests, debug responses, and get context-aware suggestions — all without leaving the app.</p>
      </div>
    `;
  }

  private startRenameSession(sessionId: string): void {
    this.state.renamingSessionId = sessionId;
    this.render();
    setTimeout(() => {
      const input = this.container.querySelector(
        '.session-title-input'
      ) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  private async finishRenameSession(
    sessionId: string,
    newTitle: string
  ): Promise<void> {
    if (!newTitle) {
      this.cancelRenameSession();
      return;
    }
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (session && session.title !== newTitle) {
      try {
        const updated = await apiCourier.ai.updateSession(sessionId, {
          title: newTitle,
        });
        if (updated) session.title = updated.title;
      } catch (error) {
        console.error('Failed to rename session:', error);
      }
    }
    this.state.renamingSessionId = null;
    this.render();
  }

  private cancelRenameSession(): void {
    this.state.renamingSessionId = null;
    this.render();
  }

  private async handleFileUpload(file: File): Promise<void> {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File too large. Maximum size is 10MB.');
      return;
    }

    try {
      const content = await file.text();
      if (content.length > AI_MAX_CONTEXT_CHARS) {
        showSizeWarning(content.length, AI_MAX_CONTEXT_CHARS);
        return;
      }

      const context: AiContext = { fileContent: content, fileName: file.name };
      if (this.state.activeSessionId) {
        await apiCourier.ai.updateSession(this.state.activeSessionId, {
          context,
        });
        const session = this.getActiveSession();
        if (session) session.context = context;
      } else {
        const session = await apiCourier.ai.createSession(context);
        this.state.sessions.unshift(session);
        this.state.activeSessionId = session.id;
      }
      this.state.showContextPanel = true;
      this.render();
    } catch (error) {
      console.error('Failed to read file:', error);
      alert('Failed to read file');
    }
  }

  private async createNewSession(): Promise<void> {
    try {
      const session = await apiCourier.ai.createSession();
      this.state.sessions.unshift(session);
      this.state.activeSessionId = session.id;
      this.state.showContextPanel = false;
      this.render();
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }

  private selectSession(sessionId: string): void {
    this.state.activeSessionId = sessionId;
    this.state.showContextPanel = false;
    this.render();
    this.scrollToBottom();
  }

  private async deleteSession(sessionId: string): Promise<void> {
    if (!confirm('Delete this conversation?')) return;
    try {
      await apiCourier.ai.deleteSession(sessionId);
      this.state.sessions = this.state.sessions.filter(
        (s) => s.id !== sessionId
      );
      if (this.state.activeSessionId === sessionId) {
        this.state.activeSessionId = this.state.sessions[0]?.id || null;
      }
      this.render();
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }

  private async sendMessage(): Promise<void> {
    await sendMessageToAI(
      this.container,
      this.state,
      () => this.getActiveSession(),
      () => this.createNewSession(),
      () => this.render(),
      () => this.scrollToBottom()
    );
  }

  private getActiveSession(): AiSession | undefined {
    return this.state.sessions.find((s) => s.id === this.state.activeSessionId);
  }

  private scrollToBottom(): void {
    const chatArea = this.container.querySelector('.chat-messages');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
  }

  destroy(): void {
    if (this.streamCleanup) {
      this.streamCleanup();
      this.streamCleanup = null;
    }
    this.isInitialized = false;
  }
}
