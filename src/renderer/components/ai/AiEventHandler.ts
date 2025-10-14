export interface EventHandlerConfig {
  onMessageSend?: (message: string) => void;
  onClearSessions?: () => void;
  onEngineCheck?: () => void;
  onToggleContext?: () => void;
  onSessionSelect?: (sessionId: string) => void;
  onSessionDelete?: (sessionId: string) => void;
  onSessionSearch?: (query: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
}

export class AiEventHandler {
  private config: EventHandlerConfig;
  private isMessageInProgress = false;

  constructor(config: EventHandlerConfig) {
    this.config = config;
  }

  public setupGlobalListeners(): void {
    // Listen for tab activation
    document.addEventListener('tab-switched', (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.tabName === 'ask-ai') {
        this.onTabActivated();
      }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target as Element).closest('#ask-ai-tab')) {
        this.handleKeydown(e);
      }
    });
  }

  public setupComponentListeners(): void {
    // Sessions search
    const searchInput = document.getElementById('sessions-search') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.config.onSessionSearch?.(searchInput.value);
    });

    // Clear sessions
    const clearBtn = document.querySelector('.btn-clear-sessions');
    clearBtn?.addEventListener('click', () => {
      if (confirm('Clear all AI sessions? This cannot be undone.')) {
        this.config.onClearSessions?.();
      }
    });

    // Engine check
    const checkEngineBtn = document.querySelector('.btn-check-engine');
    checkEngineBtn?.addEventListener('click', () => {
      this.config.onEngineCheck?.();
    });

    // Context toggle
    const toggleContextBtn = document.getElementById('toggle-context');
    toggleContextBtn?.addEventListener('click', () => {
      this.config.onToggleContext?.();
    });

    // Message input
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const sendBtn = document.getElementById('btn-send');

    messageInput?.addEventListener('input', () => {
      this.updateSendButton();
    });

    messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    // Context panel toggle
    const contextToggle = document.getElementById('toggle-context');
    contextToggle?.addEventListener('click', () => {
      this.config.onToggleContext?.();
    });
  }

  public setupSessionListeners(container: HTMLElement): void {
    // Session selection
    container.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as Element).classList.contains('session-delete')) return;
        const sessionId = (item as HTMLElement).dataset.sessionId;
        if (sessionId) {
          this.config.onSessionSelect?.(sessionId);
        }
      });
    });

    // Session deletion
    container.querySelectorAll('.session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sessionId = (btn as HTMLElement).dataset.sessionId;
        if (sessionId && confirm('Delete this session?')) {
          this.config.onSessionDelete?.(sessionId);
        }
      });
    });
  }

  public setupSuggestionListeners(container: HTMLElement): void {
    container.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const question = (btn as HTMLElement).dataset.question;
        if (question) {
          this.config.onSuggestionClick?.(question);
        }
      });
    });
  }

  public setMessageInProgress(inProgress: boolean): void {
    this.isMessageInProgress = inProgress;
    this.updateSendButton();
    
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    if (messageInput) {
      messageInput.disabled = inProgress;
    }
  }

  public populateInput(text: string): void {
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (input) {
      input.value = text;
      input.focus();
      // Trigger input event to enable send button
      input.dispatchEvent(new Event('input'));
    }
  }

  public clearInput(): void {
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
  }

  public toggleContextPanel(): void {
    const contextPanel = document.getElementById('context-panel');
    const toggleBtn = document.getElementById('toggle-context');
    
    if (contextPanel && toggleBtn) {
      const isVisible = contextPanel.style.display !== 'none';
      contextPanel.style.display = isVisible ? 'none' : 'block';
      toggleBtn.textContent = isVisible ? 'Show Context' : 'Hide Context';
    }
  }

  private hideContextPanel(): void {
    const contextPanel = document.getElementById('context-panel');
    const toggleBtn = document.getElementById('toggle-context');
    
    if (contextPanel && toggleBtn) {
      contextPanel.style.display = 'none';
      toggleBtn.textContent = 'Show Context';
    }
  }

  private onTabActivated(): void {
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    if (messageInput) {
      // Small delay to ensure the tab is fully loaded
      setTimeout(() => messageInput.focus(), 100);
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Ctrl/Cmd + K to focus input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
      messageInput?.focus();
    }
  }

  private sendMessage(): void {
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (!input || !input.value.trim() || this.isMessageInProgress) {
      return;
    }

    const message = input.value.trim();
    this.config.onMessageSend?.(message);
  }

  private updateSendButton(): void {
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const sendBtn = document.getElementById('btn-send') as HTMLButtonElement;
    
    if (messageInput && sendBtn) {
      sendBtn.disabled = !messageInput.value.trim() || this.isMessageInProgress;
    }
  }
}