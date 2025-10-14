import { AiSession, SessionSummary, SessionManager } from '../../types/ai-types';

export class AiSessionManager implements SessionManager {
  private sessions: Map<string, AiSession> = new Map();
  private activeSessionId: string | null = null;

  public createSession(requestCtx: any, responseCtx: any): AiSession {
    const session: AiSession = {
      id: this.generateSessionId(),
      title: this.generateSessionTitle(requestCtx),
      messages: [],
      requestCtx,
      responseCtx,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;

    return session;
  }

  public getSession(id: string): AiSession | null {
    return this.sessions.get(id) || null;
  }

  public getActiveSession(): AiSession | null {
    return this.activeSessionId ? this.getSession(this.activeSessionId) : null;
  }

  public setActiveSession(id: string): void {
    if (this.sessions.has(id)) {
      this.activeSessionId = id;
    }
  }

  public getAllSessions(): AiSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  public getSessionSummaries(): SessionSummary[] {
    return this.getAllSessions().map(session => ({
      id: session.id,
      title: session.title,
      messageCount: session.messages.length,
      updatedAt: session.updatedAt
    }));
  }

  public deleteSession(id: string): void {
    this.sessions.delete(id);
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
  }

  public clearAllSessions(): void {
    this.sessions.clear();
    this.activeSessionId = null;
  }

  public searchSessions(query: string): SessionSummary[] {
    const lowerQuery = query.toLowerCase();
    return this.getSessionSummaries().filter(summary =>
      summary.title.toLowerCase().includes(lowerQuery) ||
      this.getSession(summary.id)?.messages.some(msg =>
        msg.content.toLowerCase().includes(lowerQuery)
      )
    );
  }

  public updateSession(id: string, updates: Partial<AiSession>): void {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, updates, { updatedAt: new Date() });
    }
  }

  public addMessageToSession(sessionId: string, message: any): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.updatedAt = new Date();
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionTitle(requestCtx: any): string {
    if (!requestCtx) {
      return 'New AI Session';
    }

    const method = requestCtx.method || 'GET';
    let url = requestCtx.url || '';

    // Extract meaningful parts from URL
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Get last segment of path or first segment after domain
      const segments = path.split('/').filter(s => s.length > 0);
      const lastSegment = segments[segments.length - 1] || segments[0] || urlObj.hostname;

      return `${method} ${lastSegment}`;
    } catch {
      // Fallback for invalid URLs
      const shortUrl = url.length > 30 ? url.substring(0, 30) + '...' : url;
      return `${method} ${shortUrl}`;
    }
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  public createFromContext(requestCtx: any, responseCtx: any): AiSession {
    return this.createSession(requestCtx, responseCtx);
  }

  public appendMessage(sessionId: string, role: string, content: string): void {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now()
    };
    this.addMessageToSession(sessionId, message);
  }
}