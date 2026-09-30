import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';
import { markdownStyles } from './markdownStyles.js';
import { renderMarkdown, handleCodeCopyClick } from '../../utils/markdownRenderer.js';

export class HistoryView extends LitElement {
    static styles = [
        unifiedPageStyles,
        markdownStyles,
        css`
            .unified-page {
                overflow-y: hidden;
            }

            .unified-wrap {
                height: 100%;
            }

            .search-wrap {
                position: relative;
                max-width: 280px;
            }

            .search-icon {
                position: absolute;
                left: 10px;
                top: 50%;
                transform: translateY(-50%);
                width: 14px;
                height: 14px;
                color: var(--text-muted);
                pointer-events: none;
            }

            .search-wrap .control {
                padding-left: 30px;
            }

            .list-shell {
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                background: var(--bg-surface);
                overflow: hidden;
                flex: 1;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }

            .sessions-list {
                overflow-y: auto;
                flex: 1;
            }

            .session-card {
                width: 100%;
                border: none;
                border-bottom: 1px solid var(--border);
                background: transparent;
                text-align: left;
                padding: var(--space-sm) var(--space-md);
                cursor: pointer;
                transition: background var(--transition);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-sm);
            }

            .session-card:hover {
                background: var(--bg-hover);
            }

            .session-left {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .session-title-row {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .session-profile {
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
            }

            .session-edit-btn {
                background: transparent;
                border: none;
                color: var(--text-muted);
                padding: 2px;
                border-radius: var(--radius-sm);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                opacity: 0.5;
                transition: all var(--transition);
                flex-shrink: 0;
            }

            .session-card:hover .session-edit-btn,
            .detail-title-row:hover .session-edit-btn,
            .session-edit-btn:hover {
                opacity: 1;
                color: var(--text-primary);
            }

            .session-edit-btn:hover {
                background: var(--bg-elevated);
            }

            .title-inline-edit {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            .title-inline-input {
                background: var(--bg-surface);
                border: 1px solid var(--accent);
                border-radius: var(--radius-sm);
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                padding: 2px 8px;
                outline: none;
                min-width: 140px;
                max-width: 260px;
                box-shadow: 0 0 0 1px rgba(var(--accent-rgb, 255, 255, 255), 0.2);
            }

            .title-action-btn {
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                color: var(--text-muted);
                border-radius: var(--radius-sm);
                padding: 3px 5px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all var(--transition);
                flex-shrink: 0;
            }

            .title-action-btn svg {
                pointer-events: none;
            }

            .title-action-btn.save:hover {
                background: rgba(34, 197, 94, 0.2);
                border-color: #22c55e;
                color: #22c55e;
            }

            .title-action-btn.cancel:hover {
                background: rgba(239, 68, 68, 0.2);
                border-color: #ef4444;
                color: #ef4444;
            }

            .detail-title-row {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .session-date {
                color: var(--text-muted);
                font-size: var(--font-size-xs);
            }

            .session-badge {
                color: var(--text-secondary);
                font-size: var(--font-size-xs);
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 2px 8px;
                white-space: nowrap;
            }

            .session-card-right {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .session-delete-btn {
                background: rgba(239, 68, 68, 0.08);
                border: 1px solid rgba(239, 68, 68, 0.4);
                color: #ef4444;
                border-radius: var(--radius-sm);
                padding: 4px 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all var(--transition);
                flex-shrink: 0;
            }

            .session-delete-btn:hover {
                color: #ffffff;
                border-color: #ef4444;
                background: #ef4444;
                transform: scale(1.08);
                box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
            }

            .session-delete-btn svg {
                cursor: pointer;
                pointer-events: none;
            }

            .history-header-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-md);
                flex-wrap: wrap;
            }

            .clear-all-btn {
                background: transparent;
                border: 1px solid var(--border);
                color: var(--text-muted);
                border-radius: var(--radius-sm);
                padding: 5px 10px;
                font-size: var(--font-size-xs);
                cursor: pointer;
                transition: all var(--transition);
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }

            .clear-all-btn:hover {
                color: #ef4444;
                border-color: rgba(239, 68, 68, 0.4);
                background: rgba(239, 68, 68, 0.1);
            }

            .detail-header-actions {
                margin-left: auto;
                display: flex;
                align-items: center;
                gap: var(--space-xs);
            }

            .detail-delete-btn {
                background: rgba(239, 68, 68, 0.08);
                border: 1px solid rgba(239, 68, 68, 0.4);
                color: #ef4444;
                border-radius: var(--radius-sm);
                padding: 4px 10px;
                font-size: var(--font-size-xs);
                cursor: pointer;
                transition: all var(--transition);
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }

            .detail-delete-btn:hover {
                color: #ffffff;
                border-color: #ef4444;
                background: #ef4444;
                box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
            }

            .detail-delete-btn svg {
                cursor: pointer;
                pointer-events: none;
            }

            .detail-top {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
            }

            .back-btn {
                border: none;
                background: none;
                color: var(--text-muted);
                padding: 0;
                font-size: var(--font-size-sm);
                cursor: pointer;
                display: flex;
                align-items: center;
            }

            .back-btn svg {
                cursor: pointer;
            }

            .back-btn:hover {
                color: var(--text-primary);
            }

            .detail-info {
                color: var(--text-secondary);
                font-size: var(--font-size-sm);
            }

            .tab-row {
                display: flex;
                gap: 6px;
            }

            .tab-btn {
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: transparent;
                color: var(--text-muted);
                padding: 6px 10px;
                cursor: pointer;
                font-size: var(--font-size-xs);
            }

            .tab-btn:hover {
                color: var(--text-secondary);
            }

            .tab-btn.active {
                color: var(--text-primary);
                border-color: var(--text-secondary);
            }

            .details-scroll {
                overflow-y: auto;
                flex: 1;
                min-height: 0;
                display: flex;
                flex-direction: column;
                gap: var(--space-sm);
                padding: var(--space-sm) 0;
            }

            .message-row {
                display: flex;
            }

            .message-row.user {
                justify-content: flex-end;
            }

            .message-row.ai,
            .message-row.screen {
                justify-content: flex-start;
            }

            .details-scroll,
            .details-scroll *,
            .message,
            .message *,
            .context-row,
            .context-row * {
                user-select: text;
                cursor: text;
            }

            .history-screen-thumb-trigger,
            .history-screen-thumb-trigger *,
            .history-screen-badge,
            .history-screen-badge * {
                user-select: none;
                cursor: pointer;
            }

            .history-screen-badge {
                cursor: default;
            }

            .message {
                max-width: 75%;
                border-radius: 16px;
                padding: 8px 12px;
                word-break: break-word;
                font-size: var(--font-size-sm);
                line-height: 1.45;
            }

            .message-body {
                white-space: pre-wrap;
            }

            .message-body.markdown-body,
            .message-body .markdown-body {
                white-space: normal;
            }

            .message-meta {
                font-size: 10px;
                margin-top: 4px;
                opacity: 0.5;
            }

            .message-row.user .message {
                background: var(--accent);
                color: var(--bg-app);
                border-bottom-right-radius: 4px;
            }

            .history-dialog-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .history-dialog-turn {
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding: 4px 8px;
                border-radius: var(--radius-sm);
                background: rgba(255, 255, 255, 0.08);
            }

            .history-dialog-turn.speaker {
                border-left: 2px solid #60a5fa;
            }

            .history-dialog-turn.you {
                border-left: 2px solid #c084fc;
            }

            .history-dialog-header {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 10px;
                font-weight: var(--font-weight-semibold);
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            .history-dialog-turn.speaker .history-dialog-header {
                color: #93c5fd;
            }

            .history-dialog-turn.you .history-dialog-header {
                color: #e9d5ff;
            }

            .history-dialog-text {
                font-size: var(--font-size-sm);
                color: inherit;
                line-height: 1.4;
            }

            .message-row.user .message-meta {
                text-align: right;
            }

            .message-row.ai .message {
                background: var(--bg-elevated);
                color: var(--text-primary);
                border: 1px solid var(--border);
                border-bottom-left-radius: 4px;
            }

            .chat-event-row {
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 8px 0;
                width: 100%;
            }

            .chat-event-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                font-family: var(--font-mono);
                padding: 4px 12px;
                border-radius: 100px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid var(--border);
                color: var(--text-muted);
            }

            .chat-event-badge.muted {
                background: rgba(239, 68, 68, 0.08);
                border-color: rgba(239, 68, 68, 0.3);
                color: #f87171;
            }

            .chat-event-badge.unmuted {
                background: rgba(34, 197, 94, 0.08);
                border-color: rgba(34, 197, 94, 0.3);
                color: #4ade80;
            }

            .chat-event-time {
                opacity: 0.6;
                font-size: 10px;
                margin-left: 2px;
            }

            .message-row.screen .message {
                background: var(--bg-elevated);
                color: var(--text-primary);
                border: 1px solid var(--border);
                border-bottom-left-radius: 4px;
                max-width: 85%;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .history-screen-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-sm);
                padding-bottom: 6px;
                border-bottom: 1px solid var(--border);
            }

            .history-screen-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                font-weight: var(--font-weight-semibold);
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .history-screen-badge svg {
                width: 12px;
                height: 12px;
            }

            .history-screen-thumb-trigger {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 3px 8px;
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                cursor: pointer;
                transition: all var(--transition);
                color: var(--text-primary);
                font-size: 11px;
                font-weight: var(--font-weight-medium);
            }

            .history-screen-thumb-trigger:hover {
                background: var(--bg-hover);
                border-color: var(--accent);
                color: var(--accent);
            }

            .history-screen-thumb {
                width: 28px;
                height: 18px;
                object-fit: cover;
                border-radius: 2px;
                border: 1px solid var(--border);
            }

            .history-prompt-quote {
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                background: var(--bg-surface);
                border-left: 2px solid var(--border-strong);
                padding: 4px 8px;
                border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
                line-height: 1.4;
            }

            /* ── Image Modal Lightbox ── */
            .image-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(8px);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: var(--space-md);
                animation: fadeIn 0.15s ease-out;
            }

            .image-modal-dialog {
                background: var(--bg-surface);
                border: 1px solid var(--border-strong);
                border-radius: var(--radius-lg);
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
                max-width: 92vw;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                animation: scaleIn 0.15s ease-out;
            }

            .image-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--space-xs) var(--space-md);
                border-bottom: 1px solid var(--border);
                background: var(--bg-elevated);
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
            }

            .image-modal-close {
                background: none;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                padding: 4px;
                border-radius: var(--radius-sm);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .image-modal-close:hover {
                background: var(--bg-hover);
                color: var(--text-primary);
            }

            .image-modal-body {
                padding: var(--space-sm);
                overflow: auto;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #000;
            }

            .image-modal-body img {
                max-width: 100%;
                max-height: calc(90vh - 60px);
                object-fit: contain;
                border-radius: var(--radius-sm);
            }

            @keyframes fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            @keyframes scaleIn {
                from {
                    transform: scale(0.96);
                    opacity: 0;
                }
                to {
                    transform: scale(1);
                    opacity: 1;
                }
            }

            .context-row {
                display: flex;
                align-items: flex-start;
                gap: var(--space-sm);
                padding: var(--space-sm);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
            }

            .context-key {
                width: 84px;
                color: var(--text-muted);
                font-size: var(--font-size-xs);
                text-transform: uppercase;
                letter-spacing: 0.4px;
                flex-shrink: 0;
            }

            .context-value {
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                line-height: 1.45;
                white-space: pre-wrap;
                word-break: break-word;
                user-select: text;
                cursor: text;
            }

            .empty {
                color: var(--text-muted);
                font-size: var(--font-size-sm);
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 120px;
                border: 1px dashed var(--border);
                border-radius: var(--radius-sm);
            }
        `,
    ];

    static properties = {
        sessions: { type: Array },
        selectedSession: { type: Object },
        selectedSessionId: { type: String },
        loading: { type: Boolean },
        activeTab: { type: String },
        searchQuery: { type: String },
        previewImage: { type: String, state: true },
        editingSessionId: { type: String, state: true },
        editingTitle: { type: String, state: true },
    };

    constructor() {
        super();
        this.sessions = [];
        this.selectedSession = null;
        this.selectedSessionId = null;
        this.loading = true;
        this.activeTab = 'conversation';
        this.searchQuery = '';
        this.previewImage = null;
        this.editingSessionId = null;
        this.editingTitle = '';
        this.loadSessions();
    }

    updated(changedProperties) {
        if (changedProperties.has('editingSessionId') && this.editingSessionId) {
            const input = this.renderRoot?.querySelector('.title-inline-input');
            if (input) {
                input.focus();
                input.select();
            }
        }
    }

    async loadSessions() {
        try {
            this.loading = true;
            this.sessions = await preechakAi.storage.getAllSessions();
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.sessions = [];
        } finally {
            this.loading = false;
            this.requestUpdate();
        }
    }

    async openSession(sessionId) {
        if (this.editingSessionId) return;
        try {
            const session = await preechakAi.storage.getSession(sessionId);
            if (session) {
                this.selectedSession = session;
                this.selectedSessionId = sessionId;
                this.activeTab = 'conversation';
                this.requestUpdate();
            }
        } catch (error) {
            console.error('Error loading session:', error);
        }
    }

    closeSession() {
        this.selectedSession = null;
        this.selectedSessionId = null;
        this.activeTab = 'conversation';
    }

    startEditTitle(sessionId, currentTitle, e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        this.editingSessionId = sessionId;
        this.editingTitle = currentTitle || '';
        this.requestUpdate();
    }

    async saveEditTitle(sessionId, e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const trimmed = this.editingTitle.trim();
        try {
            await preechakAi.storage.updateSessionTitle(sessionId, trimmed);
            const session = this.sessions.find(s => s.sessionId === sessionId);
            if (session) {
                session.title = trimmed || null;
            }
            if (this.selectedSession && this.selectedSession.sessionId === sessionId) {
                this.selectedSession.title = trimmed || null;
            }
        } catch (error) {
            console.error('Error updating session title:', error);
        } finally {
            this.editingSessionId = null;
            this.editingTitle = '';
            this.requestUpdate();
        }
    }

    cancelEditTitle(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        this.editingSessionId = null;
        this.editingTitle = '';
        this.requestUpdate();
    }

    handleTitleKeyDown(sessionId, e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.saveEditTitle(sessionId, e);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelEditTitle(e);
        }
    }

    async deleteSession(sessionId, e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        if (!confirm('Are you sure you want to delete this session record and its screenshots from storage?')) {
            return;
        }
        try {
            await preechakAi.storage.deleteSession(sessionId);
            if (this.selectedSessionId === sessionId) {
                this.closeSession();
            }
            this.sessions = this.sessions.filter(s => s.sessionId !== sessionId);
            this.requestUpdate();
        } catch (error) {
            console.error('Error deleting session:', error);
        }
    }

    async clearAllSessions() {
        if (!confirm('Are you sure you want to delete all history records and screenshots? This will free up storage space.')) {
            return;
        }
        try {
            await preechakAi.storage.deleteAllSessions();
            this.sessions = [];
            this.closeSession();
            this.requestUpdate();
        } catch (error) {
            console.error('Error deleting all sessions:', error);
        }
    }

    handleSearchInput(e) {
        this.searchQuery = e.target.value;
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    getProfileNames() {
        return {
            interview: 'Job Interview',
            sales: 'Sales Call',
            meeting: 'Business Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam Assistant',
        };
    }

    _getProfileLabel(session) {
        if (session && session.profile) {
            const names = this.getProfileNames();
            return names[session.profile] || session.profile;
        }
        return 'Session';
    }

    _getSessionTitle(session) {
        if (!session) return 'Session';
        if (session.title && session.title.trim()) {
            return session.title.trim();
        }
        return this._getProfileLabel(session);
    }

    getSessionPreview(session) {
        const parts = [];
        if (session.messageCount > 0) parts.push(`${session.messageCount} messages`);
        if (session.screenAnalysisCount > 0) parts.push(`${session.screenAnalysisCount} screen`);
        if (session.profile) {
            const profileNames = this.getProfileNames();
            parts.push(profileNames[session.profile] || session.profile);
        }
        return parts.length > 0 ? parts.join(' · ') : 'Empty session';
    }

    getFilteredSessions() {
        if (!this.searchQuery.trim()) return this.sessions;
        const q = this.searchQuery.toLowerCase();
        return this.sessions.filter(session => {
            const title = this._getSessionTitle(session).toLowerCase();
            const preview = this.getSessionPreview(session).toLowerCase();
            const date = this.formatDate(session.createdAt).toLowerCase();
            return title.includes(q) || preview.includes(q) || date.includes(q);
        });
    }

    collectConversation(session) {
        const messages = [];
        const history = session.conversationHistory || [];
        history.forEach(turn => {
            if (turn.type === 'status_event') {
                messages.push({
                    type: 'status_event',
                    content: turn.text,
                    isMuted: turn.isMuted,
                    timestamp: turn.timestamp,
                });
            } else {
                if (turn.transcription || turn.prompt) {
                    messages.push({
                        type: 'user',
                        content: turn.transcription || turn.prompt,
                        timestamp: turn.timestamp,
                    });
                }
                if (turn.ai_response || turn.text) {
                    messages.push({
                        type: 'ai',
                        content: turn.ai_response || turn.text,
                        timestamp: turn.timestamp,
                    });
                }
            }
        });
        return messages;
    }

    renderFormattedUserMessage(content) {
        if (!content) return '';
        const speakerRegex = /\[(Speaker|Interviewer|You|Candidate|Me)\]:\s*([\s\S]*?)(?=(?:\[(?:Speaker|Interviewer|You|Candidate|Me)\]:|$))/gi;
        const matches = [...content.matchAll(speakerRegex)];

        if (matches.length > 0) {
            return html`
                <div class="history-dialog-group">
                    ${matches.map(m => {
                        const rawSpeaker = m[1];
                        const text = m[2].trim();
                        if (!text) return '';
                        const isYou = /^(You|Candidate|Me)$/i.test(rawSpeaker);
                        const speakerClass = isYou ? 'you' : 'speaker';
                        const speakerLabel = isYou ? 'You' : 'Speaker';
                        return html`
                            <div class="history-dialog-turn ${speakerClass}">
                                <div class="history-dialog-header">
                                    ${
                                        isYou
                                            ? html`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                                                  <circle cx="12" cy="7" r="4" />
                                              </svg>`
                                            : html`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                              </svg>`
                                    }
                                    <span>${speakerLabel}</span>
                                </div>
                                <div class="history-dialog-text">${text}</div>
                            </div>
                        `;
                    })}
                </div>
            `;
        }
        return html`${content}`;
    }

    renderTabContent() {
        if (!this.selectedSession) return html`<div class="empty">Select a session.</div>`;

        if (this.activeTab === 'conversation') {
            const messages = this.collectConversation(this.selectedSession);
            if (!messages.length) return html`<div class="empty">No conversation data.</div>`;
            return messages.map(msg => {
                if (msg.type === 'status_event') {
                    return html`
                        <div class="chat-event-row">
                            <div class="chat-event-badge ${msg.isMuted ? 'muted' : 'unmuted'}">
                                ${
                                    msg.isMuted
                                        ? html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                              <line x1="1" y1="1" x2="23" y2="23" />
                                              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                                              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                                          </svg>`
                                        : html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                          </svg>`
                                }
                                <span>${msg.content}</span>
                                <span class="chat-event-time">${this.formatTime(msg.timestamp)}</span>
                            </div>
                        </div>
                    `;
                }

                return html`
                    <div class="message-row ${msg.type}">
                        <div class="message">
                            ${
                                msg.type === 'user'
                                    ? html`<div class="message-body">${this.renderFormattedUserMessage(msg.content)}</div>`
                                    : html`<div class="message-body markdown-body" .innerHTML=${renderMarkdown(msg.content)}></div>`
                            }
                            <div class="message-meta">${this.formatTime(msg.timestamp)}</div>
                        </div>
                    </div>
                `;
            });
        }

        if (this.activeTab === 'screen') {
            const screen = this.selectedSession.screenAnalysisHistory || [];
            if (!screen.length) return html`<div class="empty">No screen analysis data.</div>`;
            return screen.map(
                entry => html`
                    <div class="message-row screen">
                        <div class="message">
                            <div class="history-screen-header">
                                <div class="history-screen-badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect width="18" height="18" x="3" y="3" rx="2" />
                                        <circle cx="9" cy="9" r="2" />
                                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                                    </svg>
                                    <span>Screen Analysis</span>
                                </div>
                                ${
                                    entry.image || entry.imagePath
                                        ? html`
                                              <button
                                                  class="history-screen-thumb-trigger"
                                                  type="button"
                                                  @click=${() => (this.previewImage = entry.image || entry.imagePath)}
                                                  title="View captured screenshot"
                                              >
                                                  <img src="${entry.image || entry.imagePath}" class="history-screen-thumb" alt="Thumb" />
                                                  <span>View Screen</span>
                                              </button>
                                          `
                                        : ''
                                }
                            </div>
                            ${entry.prompt ? html`<div class="history-prompt-quote">${entry.prompt}</div>` : ''}
                            <div class="message-body markdown-body" .innerHTML=${renderMarkdown(entry.response || '')}></div>
                            <div class="message-meta">${this.formatTime(entry.timestamp)}${entry.model ? ` · ${entry.model}` : ''}</div>
                        </div>
                    </div>
                `
            );
        }

        const profile = this.selectedSession.profile;
        const prompt = this.selectedSession.customPrompt;
        if (!profile && !prompt) return html`<div class="empty">No context saved for this session.</div>`;

        return html`
            ${
                profile
                    ? html`
                          <div class="context-row">
                              <span class="context-key">Profile</span>
                              <span class="context-value">${this.getProfileNames()[profile] || profile}</span>
                          </div>
                      `
                    : ''
            }
            ${
                prompt
                    ? html`
                          <div class="context-row">
                              <span class="context-key">Prompt</span>
                              <span class="context-value">${prompt}</span>
                          </div>
                      `
                    : ''
            }
        `;
    }

    renderListView() {
        const filteredSessions = this.getFilteredSessions();
        return html`
            <div class="history-header-row">
                <div class="page-title" style="margin-bottom: 0;">History</div>
                ${
                    this.sessions.length > 0
                        ? html`
                              <button class="clear-all-btn" @click=${this.clearAllSessions} title="Delete all history and screenshot files">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                  Clear All
                              </button>
                          `
                        : ''
                }
            </div>

            <div class="search-wrap">
                <svg
                    class="search-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input class="control" type="text" placeholder="Search sessions..." .value=${this.searchQuery} @input=${this.handleSearchInput} />
            </div>

            <section class="list-shell">
                <div class="sessions-list">
                    ${this.loading ? html`<div class="empty" style="margin:var(--space-md);">Loading sessions...</div>` : ''}
                    ${!this.loading && filteredSessions.length === 0 ? html`<div class="empty" style="margin:var(--space-md);">No matching sessions.</div>` : ''}
                    ${
                        !this.loading
                            ? filteredSessions.map(
                                  session => html`
                                      <div class="session-card" role="button" tabindex="0" @click=${() => this.openSession(session.sessionId)}>
                                          <div class="session-left">
                                              ${
                                                  this.editingSessionId === session.sessionId
                                                      ? html`
                                                            <div class="title-inline-edit" @click=${e => e.stopPropagation()}>
                                                                <input
                                                                    class="title-inline-input"
                                                                    type="text"
                                                                    .value=${this.editingTitle}
                                                                    @input=${e => (this.editingTitle = e.target.value)}
                                                                    @keydown=${e => this.handleTitleKeyDown(session.sessionId, e)}
                                                                    placeholder="Session name..."
                                                                />
                                                                <button
                                                                    class="title-action-btn save"
                                                                    type="button"
                                                                    @click=${e => this.saveEditTitle(session.sessionId, e)}
                                                                    title="Save title"
                                                                >
                                                                    <svg
                                                                        width="12"
                                                                        height="12"
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        stroke-width="2.5"
                                                                    >
                                                                        <polyline points="20 6 9 17 4 12"></polyline>
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    class="title-action-btn cancel"
                                                                    type="button"
                                                                    @click=${e => this.cancelEditTitle(e)}
                                                                    title="Cancel"
                                                                >
                                                                    <svg
                                                                        width="12"
                                                                        height="12"
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        stroke-width="2.5"
                                                                    >
                                                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        `
                                                      : html`
                                                            <div class="session-title-row">
                                                                <span class="session-profile">${this._getSessionTitle(session)}</span>
                                                                <button
                                                                    class="session-edit-btn"
                                                                    type="button"
                                                                    @click=${e => this.startEditTitle(session.sessionId, this._getSessionTitle(session), e)}
                                                                    title="Rename session"
                                                                >
                                                                    <svg
                                                                        width="12"
                                                                        height="12"
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        stroke-width="2"
                                                                        stroke-linecap="round"
                                                                        stroke-linejoin="round"
                                                                    >
                                                                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        `
                                              }
                                              <span class="session-date"
                                                  >${this.formatDate(session.createdAt)} · ${this.formatTime(session.createdAt)}</span
                                              >
                                          </div>
                                          <div class="session-card-right">
                                              ${session.messageCount > 0 ? html`<span class="session-badge">${session.messageCount}</span>` : ''}
                                              <button
                                                  class="session-delete-btn"
                                                  type="button"
                                                  @click=${e => this.deleteSession(session.sessionId, e)}
                                                  title="Delete this record and screenshots from storage"
                                              >
                                                  <svg
                                                      width="14"
                                                      height="14"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      stroke-width="2"
                                                      stroke-linecap="round"
                                                      stroke-linejoin="round"
                                                  >
                                                      <polyline points="3 6 5 6 21 6"></polyline>
                                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                      <line x1="10" y1="11" x2="10" y2="17"></line>
                                                      <line x1="14" y1="11" x2="14" y2="17"></line>
                                                  </svg>
                                              </button>
                                          </div>
                                      </div>
                                  `
                              )
                            : ''
                    }
                </div>
            </section>
        `;
    }

    renderDetailView() {
        const conversationCount = this.collectConversation(this.selectedSession).length;
        const screenCount = this.selectedSession?.screenAnalysisHistory?.length || 0;

        return html`
            <div class="page-title">Session Detail</div>
            <div class="detail-top">
                <button class="back-btn" @click=${this.closeSession}>
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                ${
                    this.editingSessionId === this.selectedSession.sessionId
                        ? html`
                              <div class="title-inline-edit" @click=${e => e.stopPropagation()}>
                                  <input
                                      class="title-inline-input"
                                      type="text"
                                      .value=${this.editingTitle}
                                      @input=${e => (this.editingTitle = e.target.value)}
                                      @keydown=${e => this.handleTitleKeyDown(this.selectedSession.sessionId, e)}
                                      placeholder="Session name..."
                                  />
                                  <button
                                      class="title-action-btn save"
                                      type="button"
                                      @click=${e => this.saveEditTitle(this.selectedSession.sessionId, e)}
                                      title="Save title"
                                  >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                          <polyline points="20 6 9 17 4 12"></polyline>
                                      </svg>
                                  </button>
                                  <button class="title-action-btn cancel" type="button" @click=${e => this.cancelEditTitle(e)} title="Cancel">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                          <line x1="18" y1="6" x2="6" y2="18"></line>
                                          <line x1="6" y1="6" x2="18" y2="18"></line>
                                      </svg>
                                  </button>
                              </div>
                          `
                        : html`
                              <div class="detail-title-row">
                                  <span class="detail-info"
                                      >${this._getSessionTitle(this.selectedSession)} · ${this.formatDate(this.selectedSession.createdAt)} ·
                                      ${this.formatTime(this.selectedSession.createdAt)}</span
                                  >
                                  <button
                                      class="session-edit-btn"
                                      type="button"
                                      @click=${e =>
                                          this.startEditTitle(this.selectedSession.sessionId, this._getSessionTitle(this.selectedSession), e)}
                                      title="Rename session"
                                  >
                                      <svg
                                          width="12"
                                          height="12"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          stroke-width="2"
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                      >
                                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                      </svg>
                                  </button>
                              </div>
                          `
                }
                <div class="detail-header-actions">
                    <button
                        class="detail-delete-btn"
                        type="button"
                        @click=${() => this.deleteSession(this.selectedSession.sessionId)}
                        title="Delete this session from storage"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
            <div class="tab-row">
                <button
                    class="tab-btn ${this.activeTab === 'conversation' ? 'active' : ''}"
                    @click=${() => {
                        this.activeTab = 'conversation';
                    }}
                >
                    Conversation (${conversationCount})
                </button>
                <button
                    class="tab-btn ${this.activeTab === 'screen' ? 'active' : ''}"
                    @click=${() => {
                        this.activeTab = 'screen';
                    }}
                >
                    Screen (${screenCount})
                </button>
                <button
                    class="tab-btn ${this.activeTab === 'context' ? 'active' : ''}"
                    @click=${() => {
                        this.activeTab = 'context';
                    }}
                >
                    Context
                </button>
            </div>
            <section class="details-scroll" @click=${this.handleContentClick}>${this.renderTabContent()}</section>
        `;
    }

    handleContentClick(e) {
        handleCodeCopyClick(e);
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">${this.selectedSession ? this.renderDetailView() : this.renderListView()}</div>
            </div>

            ${
                this.previewImage
                    ? html`
                          <div class="image-modal-overlay" @click=${() => (this.previewImage = null)}>
                              <div class="image-modal-dialog" @click=${e => e.stopPropagation()}>
                                  <div class="image-modal-header">
                                      <span>Captured Screenshot</span>
                                      <button class="image-modal-close" @click=${() => (this.previewImage = null)}>
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                              <line x1="18" y1="6" x2="6" y2="18" />
                                              <line x1="6" y1="6" x2="18" y2="18" />
                                          </svg>
                                      </button>
                                  </div>
                                  <div class="image-modal-body">
                                      <img src="${this.previewImage}" alt="Full Screenshot" />
                                  </div>
                              </div>
                          </div>
                      `
                    : ''
            }
        `;
    }
}

customElements.define('history-view', HistoryView);
