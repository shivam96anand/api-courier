import { AiSession, ChatMessage, SessionSummary } from '../../types/ai-types';
import { EngineStatus } from '../../../ai/engineGuard';
import { AI_PROMPTS } from '../../../ai/prompts';

export interface UiRendererConfig {
  onSessionSelect?: (sessionId: string) => void;
  onSessionDelete?: (sessionId: string) => void;
  onClearSessions?: () => void;
  onEngineCheck?: () => void;
  onToggleContext?: () => void;
}

export class AiUiRenderer {
  private config: UiRendererConfig;

  constructor(config: UiRendererConfig = {}) {
    this.config = config;
  }

  public renderInitialContent(): string {
    return `
      <div class="ask-ai-layout">
        <!-- Engine Status Banner -->
        <div class="engine-status-banner" id="engine-status-banner" style="display: block;">
          <div class="status-content">
            <div class="status-icon">🤖</div>
            <div class="status-text">
              <div class="status-title">AI Engine Status</div>
              <div class="status-subtitle" id="engine-status-text">Checking...</div>
            </div>
          </div>
          <div class="status-actions">
            <button class="btn-check-engine">Check Engine</button>
          </div>
        </div>

        <!-- Sidebar -->
        <aside class="ask-ai-sidebar">
          <div class="sidebar-header">
            <h3>AI Sessions</h3>
            <button class="btn-clear-sessions" title="Clear all sessions">🗑️</button>
          </div>
          <div class="sessions-search">
            <input type="text" id="sessions-search" placeholder="Search sessions..." />
          </div>
          <div class="sessions-list" id="sessions-list">
            <div class="empty-sessions">
              <p>No AI sessions yet.</p>
              <p>Click "Ask AI" on any response to start.</p>
            </div>
          </div>
        </aside>

        <!-- Main Panel -->
        <main class="ask-ai-main">
          <!-- Context Panel -->
          <div class="context-panel" id="context-panel" style="display: none;">
            <div class="context-header">
              <h4>Request Context</h4>
              <button class="btn-toggle-context" id="toggle-context">Show Context</button>
            </div>
            <div class="context-content" id="context-body">
              <!-- Context content will be inserted here -->
            </div>
          </div>

          <!-- Chat Area -->
          <div class="chat-area">
            <div id="welcome-message" class="welcome-message">
              <div class="welcome-icon">💬</div>
              <h3>Welcome to AI Assistant</h3>
              <p>Select a session from the sidebar or create a new one by clicking "Ask AI" on any API response.</p>
            </div>
            
            <div id="session-content" style="display: none;">
              <!-- Chat Messages -->
              <div class="chat-messages" id="chat-messages">
                <!-- Messages will be inserted here -->
              </div>

              <!-- Quick Suggestions -->
              <div class="quick-suggestions" id="quick-suggestions" style="display: none;">
                <div class="suggestions-header">
                  <span>Quick questions:</span>
                </div>
                <div class="suggestions-buttons" id="suggestions-buttons">
                  <!-- Suggestion buttons will be inserted here -->
                </div>
              </div>
            </div>
          </div>

          <!-- Input Area -->
          <div class="input-area">
            <div class="input-container">
              <textarea id="message-input" placeholder="Ask about this API call..." rows="3"></textarea>
              <div class="input-actions">
                <button id="btn-send" class="btn-send" disabled>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M15.854 0.146a.5.5 0 0 1 .11.54L13.026 8.74a.5.5 0 0 1-.89.11L8.886 6.46l-1.39 1.39a.5.5 0 0 1-.765-.64L8.421 5.52 6.031 2.27a.5.5 0 0 1 .11-.89L14.185.042a.5.5 0 0 1 .669.104z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="input-help">
              <span><kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for new line</span>
            </div>
          </div>
        </main>
      </div>
    `;
  }

  public renderSessionsList(sessions: SessionSummary[], activeId: string | null, searchQuery?: string): string {
    if (sessions.length === 0) {
      return `
        <div class="empty-sessions">
          <p>${searchQuery ? 'No sessions match your search.' : 'No AI sessions yet.'}</p>
          ${!searchQuery ? '<p>Click "Ask AI" on any response to start.</p>' : ''}
        </div>
      `;
    }

    return sessions.map(session => `
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
  }

  public renderEngineStatus(status: EngineStatus): void {
    const statusText = document.getElementById('engine-status-text');
    const statusBanner = document.getElementById('engine-status-banner');
    
    if (!statusText || !statusBanner) return;

    if (status.isRunning) {
      statusText.textContent = 'Engine Ready';
      statusBanner.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.1), rgba(139, 195, 74, 0.1))';
      statusBanner.style.borderColor = 'rgba(76, 175, 80, 0.3)';
    } else {
      statusText.textContent = 'Engine Unavailable';
      statusBanner.style.background = 'linear-gradient(135deg, rgba(244, 67, 54, 0.1), rgba(255, 152, 0, 0.1))';
      statusBanner.style.borderColor = 'rgba(244, 67, 54, 0.3)';
    }

    // Update title with detailed info
    statusBanner.title = status.error || (status.isRunning ? 'AI engine is available' : 'AI engine is not available');
  }

  public renderActiveSession(session: AiSession | null): void {
    const welcomeMessage = document.getElementById('welcome-message');
    const sessionContent = document.getElementById('session-content');

    if (!session) {
      this.showWelcomeMessage();
      return;
    }

    if (welcomeMessage) welcomeMessage.style.display = 'none';
    if (sessionContent) sessionContent.style.display = 'block';

    this.showSessionContent(session);
  }

  public renderContextPanel(session: AiSession): void {
    const contextBody = document.getElementById('context-body');
    if (!contextBody) return;

    const { requestCtx, responseCtx } = session;
    const method = requestCtx?.method || 'GET';
    const url = requestCtx?.url || 'Unknown URL';
    const status = responseCtx?.status || 'Unknown';
    const statusClass = this.getStatusClass(responseCtx?.status || 0);

    contextBody.innerHTML = `
      <div class="request-line">
        <span class="method-badge method-${method.toLowerCase()}">${method}</span>
        <span class="request-url">${this.escapeHtml(url)}</span>
      </div>
      
      <div class="summary-line">
        <strong>Response:</strong>
        <span class="status-badge status-${statusClass}">${status}</span>
        ${responseCtx?.time ? `<span>${responseCtx.time}ms</span>` : ''}
        ${responseCtx?.size ? `<span>${this.formatBytes(responseCtx.size)}</span>` : ''}
      </div>

      <div class="context-section">
        <h5>Request Details</h5>
        <div class="summary-details">
          <button class="toggle-details" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
            Show request details
          </button>
          <div class="details-content" style="display: none;">
            <pre>${JSON.stringify(requestCtx, null, 2)}</pre>
          </div>
        </div>
      </div>

      <div class="context-section">
        <h5>Response Details</h5>
        <div class="summary-details">
          <button class="toggle-details" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
            Show response details
          </button>
          <div class="details-content" style="display: none;">
            <pre>${JSON.stringify(responseCtx, null, 2)}</pre>
          </div>
        </div>
      </div>
    `;
  }

  public renderChatMessages(session: AiSession): void {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    // Filter out the welcome message and system messages for display
    const displayMessages = session.messages.filter(m => 
      m.content !== AI_PROMPTS.WELCOME_MESSAGE && m.role !== 'system'
    );

    if (displayMessages.length === 0) {
      chatMessages.innerHTML = `
        <div class="chat-empty">
          <p>Start a conversation by typing a message below.</p>
        </div>
      `;
      return;
    }

    chatMessages.innerHTML = displayMessages.map(message => this.renderMessage(message)).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  public renderMessage(message: ChatMessage | any): string {
    const isUser = message.role === 'user';
    const isError = message.role === 'error';
    
    return `
      <div class="message ${isUser ? 'user' : isError ? 'error' : 'assistant'}">
        <div class="message-content">
          <div class="message-text">${this.formatMessageContent(message.content)}</div>
        </div>
        ${message.timestamp ? `<div class="message-time">${this.formatTime(message.timestamp)}</div>` : ''}
      </div>
    `;
  }

  public showWelcomeMessage(): void {
    const welcomeMessage = document.getElementById('welcome-message');
    const sessionContent = document.getElementById('session-content');

    if (welcomeMessage) welcomeMessage.style.display = 'block';
    if (sessionContent) sessionContent.style.display = 'none';
  }

  public showSessionContent(session: AiSession): void {
    this.renderChatMessages(session);
    this.renderContextPanel(session);
  }

  public showTypingIndicator(): void {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      const typingDiv = document.createElement('div');
      typingDiv.id = 'typing-indicator';
      typingDiv.className = 'typing-indicator';
      typingDiv.innerHTML = `
        <div class="message-content">
          <span class="typing-text">AI is thinking</span>
          <div class="typing-dots">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        </div>
      `;
      chatMessages.appendChild(typingDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  public hideTypingIndicator(): void {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  private formatMessageContent(content: string): string {
    if (!content) return '';

    // Basic markdown-like formatting
    let formatted = this.escapeHtml(content);

    // Code blocks (```code```)
    formatted = formatted.replace(/```([^`]+)```/g, '<div class="code-block"><code>$1</code></div>');

    // Inline code (`code`)
    formatted = formatted.replace(/`([^`]+)`/g, '<span class="inline-code">$1</span>');

    // Bold (**text**)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
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

  private formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
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
}