// Ask AI Render Functions - Context Panel and Chat Messages

import { AiSession, AiContext, AiMessage, AskAiState } from './types';
import { iconHtml } from '../../utils/icons';
import {
  escapeHtml,
  formatBytes,
  formatKeyValuePairs,
  formatMessageContent,
} from './utils';
import { formatStatusLine } from '../../../shared/http-status';

/**
 * Render the context panel showing request/response context
 */
export function renderContextPanel(
  session: AiSession,
  state: AskAiState
): string {
  if (
    !session.context ||
    (!session.context.request && !session.context.fileContent)
  ) {
    return '';
  }

  const ctx = session.context;
  const req = ctx.request;

  return `
    <div class="context-panel ${state.showContextPanel ? 'expanded' : 'collapsed'}">
      <div class="context-header">
        <h4>${iconHtml('clipboard', 'ui-icon--sm')} Request Context</h4>
        <button class="btn-toggle-context">
          ${state.showContextPanel ? '▼ Hide' : '▶ Show'}
        </button>
      </div>
      ${
        state.showContextPanel
          ? `
        <div class="context-content">
          ${
            req
              ? `
            <div class="request-line">
              <span class="method-badge method-${req.method.toLowerCase()}">${req.method}</span>
              <span class="request-url">${escapeHtml(req.url)}</span>
            </div>
            ${
              req.body?.content
                ? `
              <div class="context-section">
                <h5>Request Body</h5>
                <div class="details-content">
                  <pre>${escapeHtml(req.body.content.slice(0, 500))}${req.body.content.length > 500 ? '...' : ''}</pre>
                </div>
              </div>
            `
                : ''
            }
          `
              : ''
          }
          ${
            ctx.fileContent
              ? `
            <div class="context-section">
              <h5>${iconHtml('file', 'ui-icon--sm')} Uploaded File: ${escapeHtml(ctx.fileName || 'file')}</h5>
              <div class="details-content">
                <pre>${escapeHtml(ctx.fileContent.slice(0, 500))}${ctx.fileContent.length > 500 ? '...' : ''}</pre>
              </div>
            </div>
          `
              : ''
          }
        </div>
      `
          : ''
      }
    </div>
  `;
}

/**
 * Render context tab content (params, headers, body, auth, response)
 */
export function renderContextTabContent(
  ctx: AiContext,
  activeTab: AskAiState['activeContextTab']
): string {
  const req = ctx.request;
  const res = ctx.response;

  if (activeTab === 'params' && req) {
    const params = formatKeyValuePairs(req.params);
    return `<div class="tab-content"><pre>${params || '<span class="empty-content">No params</span>'}</pre></div>`;
  }
  if (activeTab === 'headers' && req) {
    const headers = formatKeyValuePairs(req.headers);
    return `<div class="tab-content"><pre>${headers || '<span class="empty-content">No headers</span>'}</pre></div>`;
  }
  if (activeTab === 'body' && req) {
    const body = req.body?.content;
    return `<div class="tab-content"><pre>${body ? escapeHtml(body) : '<span class="empty-content">No body</span>'}</pre></div>`;
  }
  if (activeTab === 'auth' && req) {
    const auth = req.auth;
    if (!auth || auth.type === 'none') {
      return `<div class="tab-content"><div class="empty-content">No auth</div></div>`;
    }
    return `<div class="tab-content"><pre>Type: ${auth.type}\n${JSON.stringify(auth.config, null, 2)}</pre></div>`;
  }
  if (activeTab === 'response' && res) {
    return `
      <div class="tab-content">
        <div class="summary-line">
          <span class="status-badge status-${res.status < 400 ? 'success' : 'error'}">${escapeHtml(formatStatusLine(res.status, res.statusText))}</span>
          <span>${res.time}ms</span>
          <span>${formatBytes(res.size)}</span>
        </div>
        <pre>${escapeHtml(res.body?.slice(0, 1000) || '')}${(res.body?.length || 0) > 1000 ? '\n...(truncated)' : ''}</pre>
      </div>
    `;
  }
  return '<div class="tab-content"><div class="empty-content">No data</div></div>';
}

/**
 * Render chat messages for a session
 */
export function renderChatMessages(
  session: AiSession,
  state: AskAiState
): string {
  if (session.messages.length === 0) {
    return renderEmptyChat();
  }

  const messagesHtml = session.messages
    .map((msg) => renderMessage(msg))
    .join('');
  const streamingHtml =
    state.isSending && state.streamingContent
      ? renderStreamingMessage(state.streamingContent)
      : '';
  const typingHtml =
    state.isSending && !state.streamingContent ? renderTypingIndicator() : '';

  return `<div class="chat-messages">${messagesHtml}${streamingHtml}${typingHtml}</div>`;
}

/**
 * Render empty chat placeholder
 */
function renderEmptyChat(): string {
  return `
    <div class="welcome-message">
      <div class="welcome-icon">${iconHtml('chat', 'ui-icon--xl')}</div>
      <h3>Start the Conversation</h3>
      <p>Ask questions about your API request or response. The AI has access to the full context shown above.</p>
    </div>
  `;
}

/**
 * Render a single message
 */
function renderMessage(msg: AiMessage): string {
  const formattedContent = formatMessageContent(msg.content);
  return `
    <div class="message ${msg.role}">
      <div class="message-content">
        <div class="message-text">${formattedContent}</div>
      </div>
      <div class="message-actions">
        <button class="copy-message" data-content="${msg.content.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" title="Copy to clipboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Render streaming message with cursor
 */
export function renderStreamingMessage(content: string): string {
  const formattedContent = formatMessageContent(content);
  return `
    <div class="message assistant streaming">
      <div class="message-content">
        <div class="message-text">${formattedContent}<span class="streaming-cursor">▋</span></div>
      </div>
    </div>
  `;
}

/**
 * Render typing indicator
 */
function renderTypingIndicator(): string {
  return `
    <div class="typing-indicator">
      <div class="message-content">
        <span class="typing-text">AI is thinking</span>
        <div class="typing-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    </div>
  `;
}
