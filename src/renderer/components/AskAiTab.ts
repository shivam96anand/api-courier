import { AiSession, askAiStore } from '../../ai/askAiStore';
import { engineGuard, EngineStatus } from '../../ai/engineGuard';
import { chat, buildFirstTurn, ChatMessage, AI_CONFIG } from '../../ai/askAiService';
import { AI_PROMPTS, getContextualSuggestions } from '../../ai/prompts';

export class AskAiTab {
  private isInitialized = false;
  private currentSessionId: string | null = null;
  private isMessageInProgress = false;
  private storeUnsubscribe: (() => void) | null = null;
  private engineUnsubscribe: (() => void) | null = null;

  initialize(): void {
    if (this.isInitialized) return;

    this.setupEventListeners();
    this.renderInitialContent();
    this.subscribeToStores();
    this.isInitialized = true;
  }

  private setupEventListeners(): void {
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

  private subscribeToStores(): void {
    // Subscribe to store changes
    this.storeUnsubscribe = askAiStore.subscribe(() => {
      this.renderSessionsList();
      this.renderActiveSession();
    });

    // Subscribe to engine status changes
    this.engineUnsubscribe = engineGuard.subscribe((status) => {
      this.renderEngineStatus(status);
    });
  }

  private onTabActivated(): void {
    // Refresh engine status when tab is activated
    engineGuard.refreshStatus();
  }

  private renderInitialContent(): void {
    const container = document.getElementById('ask-ai-tab');
    if (!container) return;

    container.innerHTML = `
      <div class="ask-ai-layout">
        <!-- Left Sidebar: Sessions -->
        <div class="ask-ai-sidebar">
          <div class="sidebar-header">
            <h3>Ask AI Sessions</h3>
            <button class="btn-clear-sessions" title="Clear all sessions">
              <span>🗑️</span>
            </button>
          </div>

          <div class="sessions-search">
            <input type="text" placeholder="Search sessions..." id="sessions-search-input">
          </div>

          <div class="sessions-list" id="sessions-list">
            <div class="empty-sessions">
              <p>No AI sessions yet.</p>
              <p>Click "Ask AI" on any response to start.</p>
            </div>
          </div>
        </div>

        <!-- Main Panel -->
        <div class="ask-ai-main">
          <!-- Engine Status Banner -->
          <div class="engine-status-banner" id="engine-status-banner" style="display: none;">
            <div class="status-content">
              <span class="status-icon">⚠️</span>
              <div class="status-text">
                <div class="status-title">Local AI engine not detected</div>
                <div class="status-subtitle">Start llama-server or click 'Check Again'</div>
              </div>
              <div class="status-actions">
                <button class="btn-check-engine">Check Again</button>
              </div>
            </div>
          </div>

          <!-- Context Panel -->
          <div class="context-panel" id="context-panel" style="display: none;">
            <div class="context-header">
              <h4>Request Context</h4>
              <button class="btn-toggle-context" id="toggle-context">
                <span class="icon">📋</span>
                <span class="label">Hide Context</span>
              </button>
            </div>

            <div class="context-content" id="context-content">
              <div class="request-summary" id="request-summary"></div>
            </div>
          </div>

          <!-- Chat Area -->
          <div class="chat-area" id="chat-area">
            <div class="welcome-message">
              <div class="welcome-icon">🤖</div>
              <h3>Welcome to Ask AI</h3>
              <p>Select a session from the sidebar or create one by clicking "Ask AI" on any API response.</p>
            </div>
          </div>

          <!-- Quick Question Suggestions -->
          <div class="quick-suggestions" id="quick-suggestions" style="display: none;">
            <div class="suggestions-header">Quick questions:</div>
            <div class="suggestions-buttons" id="suggestions-buttons">
              <!-- Buttons will be added dynamically -->
            </div>
          </div>

          <!-- Input Area -->
          <div class="input-area" id="input-area" style="display: none;">
            <div class="input-container">
              <textarea
                id="message-input"
                placeholder="Ask about this response..."
                rows="3"
              ></textarea>
              <div class="input-actions">
                <button class="btn-send" id="btn-send" disabled>
                  <span class="icon">✈️</span>
                  <span class="label">Send</span>
                </button>
              </div>
            </div>

            <div class="input-help">
              <kbd>Enter</kbd> to send • <kbd>Shift+Enter</kbd> for new line • <kbd>Ctrl+K</kbd> to focus
            </div>
          </div>

        </div>
      </div>
    `;

    this.setupComponentEventListeners();
    this.renderSessionsList();
    this.renderEngineStatus(engineGuard.getStatus());
  }

  private setupComponentEventListeners(): void {
    // Search sessions
    const searchInput = document.getElementById('sessions-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.renderSessionsList(query);
    });

    // Clear sessions
    const clearBtn = document.querySelector('.btn-clear-sessions');
    clearBtn?.addEventListener('click', () => {
      if (confirm('Clear all AI sessions? This cannot be undone.')) {
        askAiStore.clearAllSessions();
      }
    });

    // Engine check
    const checkEngineBtn = document.querySelector('.btn-check-engine');
    checkEngineBtn?.addEventListener('click', () => {
      engineGuard.refreshStatus();
    });

    // Context toggle
    const toggleContextBtn = document.getElementById('toggle-context');
    toggleContextBtn?.addEventListener('click', () => {
      this.toggleContextPanel();
    });

    // Message input
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const sendBtn = document.getElementById('btn-send');

    messageInput?.addEventListener('input', () => {
      if (sendBtn) {
        (sendBtn as HTMLButtonElement).disabled = !messageInput.value.trim() || this.isMessageInProgress;
      }
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
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Ctrl/Cmd + K to focus input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
      messageInput?.focus();
    }
  }

  private renderSessionsList(searchQuery?: string): void {
    const container = document.getElementById('sessions-list');
    if (!container) return;

    const sessions = searchQuery ?
      askAiStore.searchSessions(searchQuery) :
      askAiStore.getSessionSummaries();

    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-sessions">
          <p>${searchQuery ? 'No sessions match your search.' : 'No AI sessions yet.'}</p>
          ${!searchQuery ? '<p>Click "Ask AI" on any response to start.</p>' : ''}
        </div>
      `;
      return;
    }

    const activeId = askAiStore.getActiveSessionId();

    container.innerHTML = sessions.map(session => `
      <div class="session-item ${session.id === activeId ? 'active' : ''}" data-session-id="${session.id}">
        <div class="session-main">
          <div class="session-title">${this.escapeHtml(session.title)}</div>
          <div class="session-meta">
            <span class="session-time">${this.formatRelativeTime(session.updatedAt)}</span>
            <span class="session-count">${session.messageCount} messages</span>
          </div>
        </div>
        <button class="session-delete" data-session-id="${session.id}" title="Delete session">×</button>
      </div>
    `).join('');

    // Add event listeners
    container.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as Element).classList.contains('session-delete')) return;
        const sessionId = (item as HTMLElement).dataset.sessionId;
        if (sessionId) {
          this.selectSession(sessionId);
        }
      });
    });

    container.querySelectorAll('.session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sessionId = (btn as HTMLElement).dataset.sessionId;
        if (sessionId && confirm('Delete this session?')) {
          askAiStore.deleteSession(sessionId);
        }
      });
    });
  }

  private renderEngineStatus(status: EngineStatus): void {
    const banner = document.getElementById('engine-status-banner');
    if (!banner) return;

    if (status.isRunning) {
      banner.style.display = 'none';
    } else {
      banner.style.display = 'block';

      const title = banner.querySelector('.status-title');
      const subtitle = banner.querySelector('.status-subtitle');

      if (title) {
        title.textContent = engineGuard.getStatusText();
      }

      if (subtitle) {
        subtitle.textContent = engineGuard.getSuggestedAction() || 'Check engine configuration';
      }
    }
  }

  private selectSession(sessionId: string): void {
    askAiStore.setActiveSession(sessionId);
    this.currentSessionId = sessionId;
    this.renderActiveSession();
  }

  private renderActiveSession(): void {
    const session = askAiStore.getActiveSession();

    if (!session) {
      this.showWelcomeMessage();
      return;
    }

    this.showSessionContent(session);
  }

  private showWelcomeMessage(): void {
    const chatArea = document.getElementById('chat-area');
    const contextPanel = document.getElementById('context-panel');
    const inputArea = document.getElementById('input-area');

    if (chatArea) {
      chatArea.innerHTML = `
        <div class="welcome-message">
          <div class="welcome-icon">🤖</div>
          <h3>Welcome to Ask AI</h3>
          <p>Select a session from the sidebar or create one by clicking "Ask AI" on any API response.</p>
        </div>
      `;
    }

    if (contextPanel) contextPanel.style.display = 'none';
    if (inputArea) inputArea.style.display = 'none';
  }

  private showSessionContent(session: AiSession): void {
    this.renderContextPanel(session);
    this.renderChatMessages(session);
    this.showInputArea();

    // If this is a new session with no messages, set up context
    if (session.messages.length === 0) {
      this.setupContextForSession(session);
    }
  }

  private renderContextPanel(session: AiSession): void {
    const panel = document.getElementById('context-panel');
    const requestSummary = document.getElementById('request-summary');

    if (!panel || !requestSummary) return;

    // Request summary with HTTP method and URL
    requestSummary.innerHTML = `
      <div class="request-line">
        <span class="method-badge method-${session.requestCtx.method.toLowerCase()}">${session.requestCtx.method}</span>
        <span class="request-url">${this.escapeHtml(session.requestCtx.url)}</span>
      </div>

      <div class="request-tabs">
        <div class="tab-group">
          <button class="tab-button" data-target="params-content" data-tab="params">
            Params ${session.requestCtx.params ? `(${Object.keys(session.requestCtx.params).length})` : '(0)'}
          </button>
          <button class="tab-button" data-target="headers-content" data-tab="headers">
            Headers (${Object.keys(session.requestCtx.headers).length})
          </button>
          <button class="tab-button" data-target="body-content" data-tab="body">
            Body ${session.requestCtx.body ? `(${session.requestCtx.bodyType})` : '(empty)'}
          </button>
        </div>

        <div class="tab-contents">
          <div class="tab-content" id="params-content" style="display: none;">
            ${session.requestCtx.params && Object.keys(session.requestCtx.params).length > 0 ?
              `<pre>${JSON.stringify(session.requestCtx.params, null, 2)}</pre>` :
              '<div class="empty-content">No parameters</div>'}
          </div>

          <div class="tab-content" id="headers-content" style="display: none;">
            <pre>${JSON.stringify(session.requestCtx.headers, null, 2)}</pre>
          </div>

          <div class="tab-content" id="body-content" style="display: none;">
            ${session.requestCtx.body ?
              `<pre>${this.escapeHtml(session.requestCtx.body)}</pre>` :
              '<div class="empty-content">No body content</div>'}
          </div>
        </div>
      </div>
    `;

    // Add tab functionality
    panel.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = (btn as HTMLElement).dataset.target;
        const tabName = (btn as HTMLElement).dataset.tab;

        // Hide all tab contents
        panel.querySelectorAll('.tab-content').forEach(content => {
          (content as HTMLElement).style.display = 'none';
        });

        // Remove active class from all buttons
        panel.querySelectorAll('.tab-button').forEach(button => {
          button.classList.remove('active');
        });

        // Show selected content and activate button
        const targetContent = document.getElementById(target!) as HTMLElement;
        if (targetContent) {
          if (targetContent.style.display === 'block') {
            // If already open, close it
            targetContent.style.display = 'none';
          } else {
            // Open this tab
            targetContent.style.display = 'block';
            btn.classList.add('active');
          }
        }
      });
    });

    panel.style.display = 'block';
  }

  private renderChatMessages(session: AiSession): void {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    chatArea.innerHTML = `
      <div class="chat-messages" id="chat-messages">
        ${session.messages.map(message => this.renderMessage(message)).join('')}
      </div>
    `;

    // Scroll to bottom with a small delay to ensure content is rendered
    setTimeout(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    }, 10);
  }

  private renderMessage(message: ChatMessage): string {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';

    return `
      <div class="message ${message.role}">
        <div class="message-content">
          ${isSystem ? `
            <div class="system-badge">System Prompt</div>
            <div class="system-content" style="display: none;">
              <pre>${this.escapeHtml(message.content)}</pre>
            </div>
          ` : `
            <div class="message-text">${this.formatMessageContent(message.content)}</div>
          `}
        </div>
      </div>
    `;
  }

  private formatMessageContent(content: string): string {
    // Basic markdown-like formatting
    let formatted = this.escapeHtml(content);

    // Code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g,
      '<pre class="code-block"><code>$2</code></pre>');

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  private showInputArea(): void {
    const inputArea = document.getElementById('input-area');
    if (inputArea) {
      inputArea.style.display = 'block';
    }
  }

  private setupContextForSession(session: AiSession): void {
    const { system, user } = buildFirstTurn(session.requestCtx, session.responseCtx);

    // Store the context messages in the session but don't display them in chat
    // These will be used when sending subsequent messages to the AI
    session.systemPrompt = system;
    session.contextMessage = user;

    // Add a welcome message visible to the user
    askAiStore.appendMessage(session.id, 'assistant', AI_PROMPTS.WELCOME_MESSAGE);

    // Show quick suggestion buttons
    this.showQuickSuggestions(session);
  }

  private showQuickSuggestions(session: AiSession): void {
    const suggestionsContainer = document.getElementById('quick-suggestions');
    const buttonsContainer = document.getElementById('suggestions-buttons');

    if (!suggestionsContainer || !buttonsContainer) return;

    // Get contextual suggestions based on response characteristics
    const suggestions = getContextualSuggestions(
      session.responseCtx.status,
      session.responseCtx.size,
      session.responseCtx.time
    );

    // Create suggestion buttons
    buttonsContainer.innerHTML = suggestions.map(suggestion =>
      `<button class="suggestion-btn" data-question="${this.escapeHtml(suggestion)}">
        ${this.escapeHtml(suggestion)}
      </button>`
    ).join('');

    // Add click handlers
    buttonsContainer.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const question = (btn as HTMLElement).dataset.question;
        if (question) {
          this.populateInputWithQuestion(question);
        }
      });
    });

    // Show suggestions
    suggestionsContainer.style.display = 'block';

    // Hide suggestions after first user message
    const hideAfterFirstMessage = () => {
      const userMessageCount = session.messages.filter(m => m.role === 'user').length;
      if (userMessageCount > 0) {
        suggestionsContainer.style.display = 'none';
      }
    };

    // Check immediately and setup listener
    hideAfterFirstMessage();
    const unsubscribe = askAiStore.subscribe(() => {
      const currentSession = askAiStore.getActiveSession();
      if (currentSession?.id === session.id) {
        hideAfterFirstMessage();
        const userMessages = currentSession.messages.filter(m => m.role === 'user');
        if (userMessages.length > 0) {
          unsubscribe();
        }
      }
    });
  }

  private populateInputWithQuestion(question: string): void {
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (input) {
      input.value = question;
      input.focus();
      // Trigger input event to enable send button
      input.dispatchEvent(new Event('input'));
    }
  }

  private async sendMessage(): Promise<void> {
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    const session = askAiStore.getActiveSession();

    if (!input || !session || !input.value.trim() || this.isMessageInProgress) {
      return;
    }

    const message = input.value.trim();
    input.value = '';
    input.disabled = true;

    // Check if this is the first user message BEFORE adding it
    const userMessages = session.messages.filter(m => m.role === 'user');
    const isFirstUserMessage = userMessages.length === 0;

    // Add user message to store
    askAiStore.appendMessage(session.id, 'user', message);

    // Build messages for AI including hidden context
    const messagesToSend: ChatMessage[] = [];

    // Add system prompt
    if (session.systemPrompt) {
      messagesToSend.push({ role: 'system', content: session.systemPrompt });
    }

    // Add context message, but manage token usage carefully
    if (session.contextMessage) {
      messagesToSend.push({ role: 'user', content: session.contextMessage });
      // Only add the acknowledgment response for the first message to avoid repetition
      if (isFirstUserMessage) {
        messagesToSend.push({ role: 'assistant', content: 'I have received the API request and response context. What would you like to know about this API call?' });
      }
    }

    // Add conversation history (only visible messages, excluding welcome message)
    // Limit history to prevent context overflow
    const conversationHistory = session.messages.filter(m =>
      m.role !== 'system' && m.content !== AI_PROMPTS.WELCOME_MESSAGE
    );

    // For follow-up questions, limit conversation history to last 4 messages to save tokens
    const limitedHistory = isFirstUserMessage ?
      conversationHistory :
      conversationHistory.slice(-4);

    messagesToSend.push(...limitedHistory);

    // Add current user message
    messagesToSend.push({ role: 'user', content: message });

    // Send to AI
    await this.sendToAI(session.id, messagesToSend);

    input.disabled = false;
    input.focus();
  }

  private async sendToAI(sessionId: string, messages: ChatMessage[]): Promise<void> {
    this.isMessageInProgress = true;
    this.updateSendButton();
    this.showTypingIndicator();

    // Check engine status first
    const engineStatus = await engineGuard.ensureEngine();
    if (!engineStatus.success) {
      this.hideTypingIndicator();
      this.showErrorMessage('AI engine is not available. Please check the engine status.');
      this.isMessageInProgress = false;
      this.updateSendButton();
      return;
    }

    // Use hardcoded settings
    const temperature = AI_CONFIG.DEFAULT_TEMPERATURE;
    const maxTokens = AI_CONFIG.DEFAULT_MAX_TOKENS;

    try {
      const result = await chat(messages, { temperature, max_tokens: maxTokens });

      this.hideTypingIndicator();

      if (result.success && result.content) {
        askAiStore.appendMessage(sessionId, 'assistant', result.content);
      } else {
        this.showErrorMessage(result.error || 'Failed to get AI response');
      }
    } catch (error) {
      this.hideTypingIndicator();
      this.showErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      this.isMessageInProgress = false;
      this.updateSendButton();
    }
  }

  private showTypingIndicator(): void {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      const typingDiv = document.createElement('div');
      typingDiv.id = 'typing-indicator';
      typingDiv.className = 'typing-indicator';
      typingDiv.innerHTML = `
        <div class="message-content">
          <span class="typing-text">AI is thinking</span>
          <div class="typing-dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
        </div>
      `;
      chatMessages.appendChild(typingDiv);

      // Scroll to bottom
      const chatArea = document.getElementById('chat-area');
      if (chatArea) {
        chatArea.scrollTop = chatArea.scrollHeight;
      }
    }
  }

  private hideTypingIndicator(): void {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  private showErrorMessage(error: string): void {
    // Show error in chat
    const chatArea = document.getElementById('chat-area');
    if (chatArea) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.innerHTML = `
        <div class="error-content">
          <span class="error-icon">⚠️</span>
          <span class="error-text">${this.escapeHtml(error)}</span>
        </div>
      `;
      chatArea.appendChild(errorDiv);
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  }

  private updateSendButton(): void {
    const sendBtn = document.getElementById('btn-send') as HTMLButtonElement;
    const input = document.getElementById('message-input') as HTMLTextAreaElement;

    if (sendBtn) {
      sendBtn.disabled = this.isMessageInProgress || !input?.value.trim();

      const label = sendBtn.querySelector('.label');
      if (label) {
        label.textContent = this.isMessageInProgress ? 'Sending...' : 'Send';
      }
    }
  }

  private toggleContextPanel(): void {
    const panel = document.getElementById('context-panel');
    const content = document.getElementById('context-content');
    const button = document.getElementById('toggle-context');

    if (!panel || !content || !button) return;

    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';

    const label = button.querySelector('.label');
    if (label) {
      label.textContent = isHidden ? 'Hide Context' : 'Show Context';
    }
  }

  // Utility methods
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 400) return 'error';
    if (status >= 300) return 'warning';
    return '';
  }

  // Public API for external components
  openWithContext(requestCtx: any, responseCtx: any): void {
    const session = askAiStore.createFromContext(requestCtx, responseCtx);
    this.selectSession(session.id);

    // Switch to ask-ai tab
    const event = new CustomEvent('switch-to-tab', {
      detail: { tabName: 'ask-ai' }
    });
    document.dispatchEvent(event);
  }

  destroy(): void {
    this.storeUnsubscribe?.();
    this.engineUnsubscribe?.();
    this.isInitialized = false;
  }
}