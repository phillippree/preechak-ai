import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { markdownStyles } from './markdownStyles.js';
import { renderMarkdown, handleCodeCopyClick } from '../../utils/markdownRenderer.js';

export class AssistantView extends LitElement {
    static styles = [
        markdownStyles,
        css`
            :host {
                position: relative;
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            * {
                font-family: var(--font);
                cursor: default;
            }

            /* ── Scrolling Chat Stream ── */

            /* ── Live Typing / Listening Indicator (Messaging App Style) ── */

            .live-row {
                animation: fadeIn 0.2s ease-out;
                margin-top: 4px;
            }

            .bubble-user.typing-bubble {
                background: #ffffff;
                color: #111827;
                border-radius: 18px 18px 4px 18px;
                padding: 8px 14px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
                min-width: 72px;
                width: fit-content;
                max-width: 80%;
                display: inline-flex;
                flex-direction: column;
                gap: 6px;
            }

            .typing-bubble-inner {
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }

            .bubble-ai.live-ai-bubble {
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: 18px 18px 18px 4px;
                padding: 9px 15px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
                display: inline-flex;
                align-items: center;
                width: fit-content;
                max-width: 80%;
            }

            .typing-dots-wrap {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 2px;
                vertical-align: middle;
                height: 16px;
            }

            .typing-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #2563eb;
                display: inline-block;
                animation: typingWave 1.4s infinite ease-in-out both;
            }

            .typing-dot.ai-dot {
                background: #8b5cf6;
            }

            .typing-dot:nth-child(1) {
                animation-delay: -0.32s;
            }

            .typing-dot:nth-child(2) {
                animation-delay: -0.16s;
            }

            .typing-dot:nth-child(3) {
                animation-delay: 0s;
            }

            @keyframes typingWave {
                0%,
                80%,
                100% {
                    transform: translateY(0) scale(0.75);
                    opacity: 0.35;
                }
                40% {
                    transform: translateY(-5px) scale(1.15);
                    opacity: 1;
                }
            }

            .live-thinking-content {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                color: var(--text-secondary);
                font-size: var(--response-font-size, 14px);
                font-style: italic;
            }

            .live-user-meta {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: var(--text-muted);
                font-weight: 500;
            }

            .chat-event-row {
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 6px 0;
                width: 100%;
                animation: fadeIn 0.2s ease-out;
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

            .chat-event-badge svg {
                flex-shrink: 0;
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

            .muted-live-bubble {
                border-color: rgba(239, 68, 68, 0.35) !important;
                background: rgba(239, 68, 68, 0.07) !important;
            }

            .chat-empty-listening {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 14px;
            }

            .listening-radar {
                position: relative;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .listening-radar-ring {
                position: absolute;
                inset: 0;
                border-radius: 50%;
                border: 2px solid var(--accent, #6366f1);
                opacity: 0.8;
                animation: radarPulse 2s infinite cubic-bezier(0.215, 0.61, 0.355, 1);
            }

            .listening-radar-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: var(--accent, #6366f1);
                box-shadow: 0 0 10px var(--accent, #6366f1);
            }

            @keyframes radarPulse {
                0% {
                    transform: scale(0.6);
                    opacity: 0.9;
                }
                100% {
                    transform: scale(2);
                    opacity: 0;
                }
            }

            .chat-container {
                flex: 1;
                overflow-y: auto;
                padding: var(--space-md);
                display: flex;
                flex-direction: column;
                gap: 16px;
                scroll-behavior: smooth;
                user-select: text;
                cursor: text;
            }

            .chat-container * {
                user-select: text;
                cursor: text;
            }

            .chat-container a {
                cursor: pointer;
            }

            .chat-empty {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-muted);
                font-size: var(--response-font-size, 14px);
                font-style: italic;
                text-align: center;
                padding: var(--space-xl);
                min-height: 200px;
            }

            .chat-row {
                display: flex;
                width: 100%;
                animation: fadeIn 0.2s ease;
            }

            .chat-row.user {
                justify-content: flex-end;
            }

            .chat-row.ai {
                justify-content: flex-start;
            }

            /* ── User Bubble (Right) ── */

            .bubble-user-wrap {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                max-width: 80%;
                gap: 4px;
            }

            .bubble-user {
                background: #ffffff;
                color: #111827;
                border-radius: 18px 18px 4px 18px;
                padding: 10px 16px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
                display: flex;
                flex-direction: column;
                gap: 6px;
                width: 100%;
                box-sizing: border-box;
            }

            .bubble-user-content {
                font-size: var(--response-font-size, 14px);
                line-height: 1.45;
                word-break: break-word;
                white-space: pre-wrap;
                user-select: text;
            }

            .bubble-user-meta {
                font-size: 11px;
                color: var(--text-muted);
                padding-right: 4px;
            }

            .speaker-turn-block {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .speaker-turn-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            .speaker-turn-badge.interviewer {
                color: #2563eb;
            }

            .speaker-turn-badge.you {
                color: #7c3aed;
            }

            .speaker-turn-badge svg {
                width: 12px;
                height: 12px;
            }

            .speaker-turn-text {
                font-size: var(--response-font-size, 14px);
                color: #1f2937;
                line-height: 1.45;
            }

            /* ── Assistant Bubble (Left) ── */

            .bubble-ai-wrap {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                max-width: 85%;
                gap: 4px;
            }

            .bubble-ai {
                background: var(--bg-surface);
                color: var(--text-primary);
                border: 1px solid var(--border);
                border-radius: 18px 18px 18px 4px;
                padding: 12px 18px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                width: 100%;
                box-sizing: border-box;
            }

            .bubble-ai-content {
                font-size: var(--response-font-size, 14px);
                line-height: var(--line-height);
                word-break: break-word;
                color: var(--text-primary);
            }

            .bubble-ai-meta {
                font-size: 11px;
                color: var(--text-muted);
                padding-left: 4px;
            }

            /* ── Markdown in AI Bubble ── */

            .bubble-ai-content h1,
            .bubble-ai-content h2,
            .bubble-ai-content h3,
            .bubble-ai-content h4,
            .bubble-ai-content h5,
            .bubble-ai-content h6 {
                margin: 0.8em 0 0.4em 0;
                color: var(--text-primary);
                font-weight: var(--font-weight-semibold);
            }

            .bubble-ai-content h1 {
                font-size: 1.35em;
            }
            .bubble-ai-content h2 {
                font-size: 1.2em;
            }
            .bubble-ai-content h3 {
                font-size: 1.1em;
            }

            .bubble-ai-content p {
                margin: 0.5em 0;
                color: var(--text-primary);
            }

            .bubble-ai-content p:first-child {
                margin-top: 0;
            }

            .bubble-ai-content p:last-child {
                margin-bottom: 0;
            }

            .bubble-ai-content ul,
            .bubble-ai-content ol {
                margin: 0.5em 0;
                padding-left: 1.4em;
                color: var(--text-primary);
            }

            .bubble-ai-content li {
                margin: 0.25em 0;
            }

            .bubble-ai-content blockquote {
                margin: 0.6em 0;
                padding: 0.4em 0.8em;
                border-left: 2px solid var(--border-strong);
                background: var(--bg-elevated);
                border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
            }

            .bubble-ai-content code {
                background: var(--bg-elevated);
                padding: 0.15em 0.4em;
                border-radius: var(--radius-sm);
                font-family: var(--font-mono);
                font-size: 0.88em;
            }

            .bubble-ai-content pre {
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: var(--space-sm) var(--space-md);
                overflow-x: hidden;
                white-space: pre-wrap;
                word-break: break-word;
                overflow-wrap: anywhere;
                margin: 0.6em 0;
            }

            .bubble-ai-content pre code {
                background: none;
                padding: 0;
                white-space: pre-wrap;
                word-break: break-word;
                overflow-wrap: anywhere;
            }

            .bubble-ai-content a {
                color: var(--accent);
                text-decoration: underline;
                text-underline-offset: 2px;
            }

            .bubble-ai-content strong,
            .bubble-ai-content b {
                font-weight: var(--font-weight-semibold);
            }

            .bubble-ai-content hr {
                border: none;
                border-top: 1px solid var(--border);
                margin: 1.2em 0;
            }

            .bubble-ai-content table {
                border-collapse: collapse;
                width: 100%;
                margin: 0.6em 0;
            }

            .bubble-ai-content th,
            .bubble-ai-content td {
                border: 1px solid var(--border);
                padding: var(--space-xs) var(--space-sm);
                text-align: left;
            }

            .bubble-ai-content th {
                background: var(--bg-elevated);
                font-weight: var(--font-weight-semibold);
            }

            /* ── Screen Analysis Thumbnail ── */

            .screenshot-preview-trigger {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 8px;
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                cursor: pointer;
                transition: all var(--transition);
                color: var(--text-primary);
                font-size: 11px;
                font-weight: var(--font-weight-medium);
                align-self: flex-start;
            }

            .screenshot-preview-trigger:hover {
                background: var(--bg-hover);
                border-color: var(--accent);
                color: var(--accent);
            }

            .screenshot-mini-thumb {
                width: 24px;
                height: 15px;
                object-fit: cover;
                border-radius: 2px;
                border: 1px solid var(--border);
            }

            .screenshot-trigger-text {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                cursor: pointer;
            }

            /* ── Scrollbar ── */

            .chat-container::-webkit-scrollbar {
                width: 6px;
            }

            .chat-container::-webkit-scrollbar-track {
                background: transparent;
            }

            .chat-container::-webkit-scrollbar-thumb {
                background: var(--border-strong);
                border-radius: 3px;
            }

            .chat-container::-webkit-scrollbar-thumb:hover {
                background: #555555;
            }

            /* ── Floating Scroll To Bottom Button ── */

            .scroll-bottom-btn {
                position: absolute;
                bottom: 66px;
                right: 22px;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: var(--bg-surface, #1e1e24);
                border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.2));
                color: var(--text-primary, #ffffff);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
                z-index: 50;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                animation: fadeIn 0.15s ease-out;
            }

            .scroll-bottom-btn:hover {
                background: var(--bg-hover, #2c2c36);
                border-color: var(--accent, #6366f1);
                color: var(--accent, #6366f1);
                transform: translateY(-2px);
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
            }

            .scroll-bottom-btn svg {
                cursor: pointer;
                pointer-events: none;
            }

            .scroll-bottom-btn.has-new {
                border-color: var(--accent, #6366f1);
            }

            .scroll-new-badge {
                position: absolute;
                top: -2px;
                right: -2px;
                width: 9px;
                height: 9px;
                border-radius: 50%;
                background: var(--accent, #6366f1);
                box-shadow: 0 0 6px var(--accent, #6366f1);
                animation: pulseDot 1.5s infinite;
            }

            @keyframes pulseDot {
                0%,
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
                50% {
                    transform: scale(1.3);
                    opacity: 0.7;
                }
            }

            /* ── Bottom input bar ── */

            .input-bar {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
                padding: var(--space-md);
                background: transparent;
            }

            .input-bar-inner {
                display: flex;
                align-items: center;
                flex: 1;
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: 100px;
                padding: 0 var(--space-md);
                height: 32px;
                transition: border-color var(--transition);
            }

            .input-bar-inner:focus-within {
                border-color: var(--accent);
            }

            .input-bar-inner input {
                flex: 1;
                background: none;
                color: var(--text-primary);
                border: none;
                padding: 0;
                font-size: var(--font-size-sm);
                font-family: var(--font);
                height: 100%;
                outline: none;
            }

            .input-bar-inner input::placeholder {
                color: var(--text-muted);
            }

            .analyze-btn {
                position: relative;
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                color: var(--text-primary);
                cursor: pointer;
                font-size: var(--font-size-xs);
                font-family: var(--font-mono);
                white-space: nowrap;
                padding: var(--space-xs) var(--space-md);
                border-radius: 100px;
                height: 32px;
                display: flex;
                align-items: center;
                gap: 4px;
                transition:
                    border-color 0.4s ease,
                    background var(--transition);
                flex-shrink: 0;
                overflow: hidden;
            }

            .analyze-btn:hover:not(.analyzing) {
                border-color: var(--accent);
                background: var(--bg-surface);
            }

            .analyze-btn.analyzing {
                cursor: default;
                border-color: transparent;
            }

            .analyze-btn-content {
                display: flex;
                align-items: center;
                gap: 4px;
                transition: opacity 0.4s ease;
                z-index: 1;
                position: relative;
            }

            .analyze-btn.analyzing .analyze-btn-content {
                opacity: 0;
            }

            .analyze-canvas {
                position: absolute;
                inset: -1px;
                width: calc(100% + 2px);
                height: calc(100% + 2px);
                pointer-events: none;
            }

            .snip-btn {
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                color: var(--text-primary);
                cursor: pointer;
                font-size: var(--font-size-xs);
                font-family: var(--font-mono);
                white-space: nowrap;
                padding: var(--space-xs) 10px;
                border-radius: 100px;
                height: 32px;
                display: flex;
                align-items: center;
                gap: 4px;
                transition:
                    border-color 0.2s ease,
                    background var(--transition);
                flex-shrink: 0;
            }

            .snip-btn:hover:not(.disabled) {
                border-color: var(--accent);
                background: var(--bg-surface);
            }

            .snip-btn.disabled {
                opacity: 0.5;
                cursor: default;
                pointer-events: none;
            }

            /* ── Lightbox Modal ── */

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
                border: 1px solid var(--border);
                border-radius: var(--radius-lg);
                overflow: hidden;
                max-width: 90vw;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
                animation: scaleIn 0.15s ease-out;
            }

            .image-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--space-sm) var(--space-md);
                border-bottom: 1px solid var(--border);
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
                color: var(--text-secondary);
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
                    opacity: 1;
                }
            }

            /* ── Attachment Controls Bar ── */
            .attachment-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 6px 14px;
                background: rgba(255, 255, 255, 0.03);
                border-top: 1px solid var(--border);
                font-size: 11px;
                flex-wrap: wrap;
                position: relative;
            }

            .attachment-items {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .attachment-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: var(--bg-surface);
                border: 1px solid var(--accent, #6366f1);
                border-radius: var(--radius-sm);
                padding: 2px 6px 2px 4px;
                box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
                color: var(--text-primary);
            }

            .attachment-thumb {
                width: 24px;
                height: 24px;
                object-fit: cover;
                border-radius: 3px;
                cursor: pointer;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .attachment-label {
                font-size: 11px;
                font-weight: 500;
                color: var(--text-primary);
            }

            .attachment-remove-btn {
                background: transparent;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                line-height: 1;
                transition:
                    color 0.15s ease,
                    background 0.15s ease;
            }

            .attachment-remove-btn:hover {
                color: #ef4444;
                background: rgba(239, 68, 68, 0.15);
            }

            .attachment-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .attachment-action-btn {
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                color: var(--text-secondary);
                cursor: pointer;
                font-size: 11px;
                padding: 3px 8px;
                border-radius: var(--radius-sm);
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
            }

            .attachment-action-btn:hover:not(:disabled) {
                border-color: var(--accent);
                color: var(--text-primary);
                background: var(--bg-surface);
            }

            .attachment-action-btn:disabled {
                opacity: 0.4;
                cursor: default;
            }

            .attachment-hint {
                font-size: 10px;
                color: var(--text-muted);
                font-style: italic;
            }

            /* History Popover */
            .history-picker-popover {
                position: absolute;
                bottom: 44px;
                right: 14px;
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 10px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                z-index: 100;
                width: 260px;
                max-height: 220px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .history-picker-title {
                font-size: 10px;
                font-weight: 600;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 2px;
            }

            .history-picker-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 6px;
                border-radius: var(--radius-sm);
                cursor: pointer;
                border: 1px solid transparent;
                background: rgba(255, 255, 255, 0.02);
                transition: all 0.15s ease;
            }

            .history-picker-item:hover {
                background: var(--bg-hover);
                border-color: var(--border);
            }

            .history-picker-item.selected {
                border-color: var(--accent);
                background: rgba(99, 102, 241, 0.1);
            }

            .history-picker-thumb {
                width: 32px;
                height: 32px;
                object-fit: cover;
                border-radius: 3px;
            }

            .history-picker-info {
                display: flex;
                flex-direction: column;
                font-size: 11px;
                overflow: hidden;
            }

            .history-picker-time {
                font-size: 10px;
                color: var(--text-muted);
            }
        `,
    ];

    static properties = {
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedProfile: { type: String },
        sessionActive: { type: Boolean },
        liveTranscription: { type: Object },
        liveThinking: { type: Object },
        statusText: { type: String },
        isMicMuted: { type: Boolean },
        isSpeakerMuted: { type: Boolean },
        onSendText: { type: Function },
        shouldAnimateResponse: { type: Boolean },
        isAnalyzing: { type: Boolean, state: true },
        previewImage: { type: String, state: true },
        isScrolledUp: { type: Boolean, state: true },
        hasNewMessagesWhileScrolled: { type: Boolean, state: true },
        attachmentsState: { type: Object, state: true },
        showHistoryPicker: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.responses = [];
        this.currentResponseIndex = -1;
        this.selectedProfile = 'interview';
        this.sessionActive = false;
        this.liveTranscription = null;
        this.liveThinking = null;
        this.statusText = '';
        this.isMicMuted = false;
        this.isSpeakerMuted = false;
        this.onSendText = () => {};
        this.isAnalyzing = false;
        this.previewImage = null;
        this._animFrame = null;
        this.isScrolledUp = false;
        this.hasNewMessagesWhileScrolled = false;
        this.attachmentsState = { activeAttachmentIds: [], activeAttachments: [], screenshots: [] };
        this.showHistoryPicker = false;
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

    renderMarkdown(content) {
        return renderMarkdown(content || '');
    }

    handleContentClick(e) {
        handleCodeCopyClick(e);
    }

    formatTime(timestamp) {
        if (!timestamp) {
            return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    handleChatScroll() {
        const container = this.shadowRoot.querySelector('#chatContainer');
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
        const isUp = distanceFromBottom > 60;
        if (this.isScrolledUp !== isUp) {
            this.isScrolledUp = isUp;
            if (!isUp) {
                this.hasNewMessagesWhileScrolled = false;
            }
            this.requestUpdate();
        }
    }

    scrollResponseUp() {
        const container = this.shadowRoot.querySelector('#chatContainer');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3;
            container.scrollTop = Math.max(0, container.scrollTop - scrollAmount);
            this.handleChatScroll();
        }
    }

    scrollResponseDown() {
        const container = this.shadowRoot.querySelector('#chatContainer');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3;
            container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + scrollAmount);
            this.handleChatScroll();
        }
    }

    scrollToBottom(force = false) {
        if (this.isScrolledUp && !force) return;
        requestAnimationFrame(() => {
            const container = this.shadowRoot.querySelector('#chatContainer');
            if (container) {
                container.scrollTop = container.scrollHeight;
                this.isScrolledUp = false;
                this.hasNewMessagesWhileScrolled = false;
            }
        });
    }

    scrollToBottomSmooth() {
        requestAnimationFrame(() => {
            const container = this.shadowRoot.querySelector('#chatContainer');
            if (container) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                this.isScrolledUp = false;
                this.hasNewMessagesWhileScrolled = false;
                this.requestUpdate();
            }
        });
    }

    firstUpdated() {
        super.firstUpdated();
        const container = this.shadowRoot.querySelector('#chatContainer');
        if (container) {
            container.addEventListener('scroll', () => this.handleChatScroll());
        }
        this.scrollToBottom(true);
    }

    connectedCallback() {
        super.connectedCallback();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');

            this.handleScrollUp = () => this.scrollResponseUp();
            this.handleScrollDown = () => this.scrollResponseDown();

            ipcRenderer.on('scroll-response-up', this.handleScrollUp);
            ipcRenderer.on('scroll-response-down', this.handleScrollDown);

            this.handleAttachmentsUpdated = (event, state) => {
                if (state) {
                    this.attachmentsState = state;
                    this.requestUpdate();
                }
            };
            ipcRenderer.on('gemini-http:attachments-updated', this.handleAttachmentsUpdated);

            ipcRenderer
                .invoke('gemini-http:get-attachments')
                .then(state => {
                    if (state) {
                        this.attachmentsState = state;
                        this.requestUpdate();
                    }
                })
                .catch(() => {});
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopWaveformAnimation();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (this.handleScrollUp) ipcRenderer.removeListener('scroll-response-up', this.handleScrollUp);
            if (this.handleScrollDown) ipcRenderer.removeListener('scroll-response-down', this.handleScrollDown);
            if (this.handleAttachmentsUpdated) ipcRenderer.removeListener('gemini-http:attachments-updated', this.handleAttachmentsUpdated);
        }
    }

    async handleRemoveAttachment(id) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            const state = await ipcRenderer.invoke('gemini-http:remove-attachment', id);
            if (state) {
                this.attachmentsState = state;
                this.requestUpdate();
            }
        }
    }

    async handleComparePrevious() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            const state = await ipcRenderer.invoke('gemini-http:compare-previous');
            if (state) {
                this.attachmentsState = state;
                this.requestUpdate();
            }
        }
    }

    async handleSelectHistoryAttachment(id) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            const state = await ipcRenderer.invoke('gemini-http:select-history-attachment', id);
            if (state) {
                this.attachmentsState = state;
                this.showHistoryPicker = false;
                this.requestUpdate();
            }
        }
    }

    async handleClearAttachments() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            const state = await ipcRenderer.invoke('gemini-http:clear-attachments');
            if (state) {
                this.attachmentsState = state;
                this.requestUpdate();
            }
        }
    }

    toggleHistoryPicker() {
        this.showHistoryPicker = !this.showHistoryPicker;
    }

    async handleSendText() {
        const textInput = this.shadowRoot.querySelector('#textInput');
        if (textInput && textInput.value.trim()) {
            const message = textInput.value.trim();
            textInput.value = '';
            await this.onSendText(message);
        }
    }

    handleTextKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendText();
        }
    }

    async handleScreenAnswer() {
        if (this.isAnalyzing) return;
        if (window.captureManualScreenshot) {
            this.isAnalyzing = true;
            this._responseCountWhenStarted = this.responses.length;
            window.captureManualScreenshot();
        }
    }

    async handleSnipAnswer() {
        if (this.isAnalyzing) return;
        if (window.captureSnipArea) {
            this.isAnalyzing = true;
            this._responseCountWhenStarted = this.responses.length;
            const res = await window.captureSnipArea();
            if (!res || res.cancelled) {
                this.isAnalyzing = false;
            }
        }
    }

    _startWaveformAnimation() {
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const dangerColor = getComputedStyle(this).getPropertyValue('--danger').trim() || '#EF4444';
        const startTime = performance.now();
        const FADE_IN = 0.5;
        const PARTICLE_SPREAD = 4;
        const PARTICLE_COUNT = 250;

        const w = rect.width;
        const h = rect.height;
        const r = h / 2;
        const straightLen = w - 2 * r;
        const arcLen = Math.PI * r;
        const perimeter = 2 * straightLen + 2 * arcLen;

        const pointOnPerimeter = d => {
            d = ((d % perimeter) + perimeter) % perimeter;
            if (d < straightLen) {
                return { x: r + d, y: 0, nx: 0, ny: 1 };
            }
            d -= straightLen;
            if (d < arcLen) {
                const angle = -Math.PI / 2 + (d / arcLen) * Math.PI;
                return {
                    x: w - r + Math.cos(angle) * r,
                    y: r + Math.sin(angle) * r,
                    nx: -Math.cos(angle),
                    ny: -Math.sin(angle),
                };
            }
            d -= arcLen;
            if (d < straightLen) {
                return { x: w - r - d, y: h, nx: 0, ny: -1 };
            }
            d -= straightLen;
            const angle = Math.PI / 2 + (d / arcLen) * Math.PI;
            return {
                x: r + Math.cos(angle) * r,
                y: r + Math.sin(angle) * r,
                nx: -Math.cos(angle),
                ny: -Math.sin(angle),
            };
        };

        const seeds = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            seeds.push({ pos: Math.random(), drift: Math.random(), depthSeed: Math.random() });
        }

        const draw = now => {
            const elapsed = (now - startTime) / 1000;
            const fade = Math.min(1, elapsed / FADE_IN);

            ctx.clearRect(0, 0, w, h);

            ctx.fillStyle = dangerColor;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const s = seeds[i];
                const along = (s.pos + s.drift * elapsed * 0.03) * perimeter;
                const depth = s.depthSeed * PARTICLE_SPREAD;
                const density = 1 - depth / PARTICLE_SPREAD;

                const pt = pointOnPerimeter(along);
                const px = pt.x + pt.nx * depth;
                const py = pt.y + pt.ny * depth;

                const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4 + s.pos * 12);
                const alpha = density * pulse * fade * 0.85;

                ctx.globalAlpha = alpha;
                ctx.fillRect(px, py, 1.5, 1.5);
            }
            ctx.globalAlpha = 1;

            this._animFrame = requestAnimationFrame(draw);
        };

        this._animFrame = requestAnimationFrame(draw);
    }

    _stopWaveformAnimation() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has('responses')) {
            if (!this.isScrolledUp) {
                this.scrollToBottom();
            } else {
                this.hasNewMessagesWhileScrolled = true;
            }
        }

        if (changedProperties.has('liveTranscription') || changedProperties.has('liveThinking')) {
            if (!this.isScrolledUp) {
                this.scrollToBottom();
            }
        }

        if (changedProperties.has('isAnalyzing')) {
            if (this.isAnalyzing) {
                this._startWaveformAnimation();
            } else {
                this._stopWaveformAnimation();
            }
        }

        if (changedProperties.has('responses') && this.isAnalyzing) {
            if (this.responses.length > this._responseCountWhenStarted) {
                this.isAnalyzing = false;
            }
        }
    }

    renderLiveIndicator() {
        if (this.liveThinking && this.liveThinking.isThinking) {
            return html`
                <div class="chat-row ai live-row">
                    <div class="bubble-ai-wrap">
                        <div class="bubble-ai live-ai-bubble">
                            <div class="live-thinking-content">
                                <span>Assistant is thinking</span>
                                <div class="typing-dots-wrap">
                                    <span class="typing-dot ai-dot"></span>
                                    <span class="typing-dot ai-dot"></span>
                                    <span class="typing-dot ai-dot"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (this.isMicMuted && this.isSpeakerMuted) {
            return html`
                <div class="chat-row ai live-row">
                    <div class="bubble-ai-wrap">
                        <div class="bubble-ai live-ai-bubble muted-live-bubble">
                            <div class="live-thinking-content">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                                    <line x1="12" y1="19" x2="12" y2="23" />
                                    <line x1="8" y1="23" x2="16" y2="23" />
                                </svg>
                                <span style="color: #ef4444; font-style: normal;">Audio Muted — Mic & System Audio are paused</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        const isListening = this.sessionActive || this.statusText?.includes('Listening') || this.statusText?.includes('connected');
        const liveText = this.liveTranscription?.text;
        const speaker = this.liveTranscription?.speaker || 'Interviewer';
        const isYou = /^(You|Candidate|Me)$/i.test(speaker);
        const speakerClass = isYou ? 'you' : 'interviewer';
        const speakerLabel = isYou ? 'You' : 'Interviewer';

        if (liveText && liveText.trim()) {
            return html`
                <div class="chat-row user live-row">
                    <div class="bubble-user-wrap">
                        <div class="bubble-user typing-bubble">${this.renderFormattedLivePrompt(liveText, speaker)}</div>
                        <div class="bubble-user-meta live-user-meta">
                            <div class="typing-dots-wrap">
                                <span class="typing-dot"></span>
                                <span class="typing-dot"></span>
                                <span class="typing-dot"></span>
                            </div>
                            <span>Listening...</span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (isListening) {
            const subtitle = this.isMicMuted
                ? 'Mic Muted · Listening to Interviewer...'
                : this.isSpeakerMuted
                  ? 'System Muted · Listening to You...'
                  : null;

            return html`
                <div class="chat-row user live-row">
                    <div class="bubble-user-wrap">
                        <div class="bubble-user typing-bubble">
                            <div class="typing-bubble-inner">
                                <div class="speaker-turn-badge ${speakerClass}">
                                    ${
                                        isYou
                                            ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                                                  <circle cx="12" cy="7" r="4" />
                                              </svg>`
                                            : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                              </svg>`
                                    }
                                    <span>${speakerLabel}</span>
                                </div>
                                <div class="typing-dots-wrap">
                                    <span class="typing-dot"></span>
                                    <span class="typing-dot"></span>
                                    <span class="typing-dot"></span>
                                </div>
                            </div>
                        </div>
                        ${subtitle ? html`<div class="bubble-user-meta live-user-meta" style="color: #f59e0b;">${subtitle}</div>` : ''}
                    </div>
                </div>
            `;
        }

        return '';
    }

    renderFormattedLivePrompt(liveText, speaker) {
        const speakerRegex = /\[(Speaker|Interviewer|You|Candidate|Me)\]:\s*([\s\S]*?)(?=(?:\[(?:Speaker|Interviewer|You|Candidate|Me)\]:|$))/gi;
        const matches = [...liveText.matchAll(speakerRegex)];

        if (matches.length > 0) {
            return matches.map((m, idx) => {
                const rawSpeaker = m[1];
                const text = m[2].trim();
                const isYou = /^(You|Candidate|Me)$/i.test(rawSpeaker);
                const speakerClass = isYou ? 'you' : 'interviewer';
                const speakerLabel = isYou ? 'You' : 'Interviewer';
                const isLast = idx === matches.length - 1;
                return html`
                    <div class="speaker-turn-block">
                        <div class="speaker-turn-badge ${speakerClass}">
                            ${
                                isYou
                                    ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                                          <circle cx="12" cy="7" r="4" />
                                      </svg>`
                                    : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                      </svg>`
                            }
                            <span>${speakerLabel}</span>
                        </div>
                        <div class="speaker-turn-text">
                            ${text}${
                                isLast
                                    ? html`<span class="typing-dots-wrap" style="margin-left: 6px; vertical-align: middle;">
                                          <span class="typing-dot"></span>
                                          <span class="typing-dot"></span>
                                          <span class="typing-dot"></span>
                                      </span>`
                                    : ''
                            }
                        </div>
                    </div>
                `;
            });
        }

        return html`
            <div class="speaker-turn-block">
                <div class="speaker-turn-badge interviewer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    <span>${speaker || 'Interviewer'}</span>
                </div>
                <div class="speaker-turn-text">
                    ${liveText}
                    <span class="typing-dots-wrap" style="margin-left: 6px; vertical-align: middle;">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </span>
                </div>
            </div>
        `;
    }

    renderUserPromptBubble(promptText, timestamp) {
        if (!promptText || !promptText.trim()) return '';

        const speakerRegex = /\[(Speaker|Interviewer|You|Candidate|Me)\]:\s*([\s\S]*?)(?=(?:\[(?:Speaker|Interviewer|You|Candidate|Me)\]:|$))/gi;
        const matches = [...promptText.matchAll(speakerRegex)];

        return html`
            <div class="chat-row user">
                <div class="bubble-user-wrap">
                    <div class="bubble-user">
                        ${
                            matches.length > 0
                                ? matches.map(m => {
                                      const rawSpeaker = m[1];
                                      const text = m[2].trim();
                                      if (!text) return '';
                                      const isYou = /^(You|Candidate|Me)$/i.test(rawSpeaker);
                                      const speakerClass = isYou ? 'you' : 'interviewer';
                                      const speakerLabel = isYou ? 'You' : 'Interviewer';
                                      return html`
                                          <div class="speaker-turn-block">
                                              <div class="speaker-turn-badge ${speakerClass}">
                                                  ${
                                                      isYou
                                                          ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                                                                <circle cx="12" cy="7" r="4" />
                                                            </svg>`
                                                          : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                                            </svg>`
                                                  }
                                                  <span>${speakerLabel}</span>
                                              </div>
                                              <div class="speaker-turn-text">${text}</div>
                                          </div>
                                      `;
                                  })
                                : html`<div class="bubble-user-content">${promptText}</div>`
                        }
                    </div>
                    <div class="bubble-user-meta">${this.formatTime(timestamp)}</div>
                </div>
            </div>
        `;
    }

    renderAssistantResponseBubble(item) {
        const text = typeof item === 'object' && item !== null ? item.text || '' : item || '';
        if (!text.trim()) return '';

        const renderedMarkdown = this.renderMarkdown(text);
        const imageData = typeof item === 'object' && item !== null ? item.image || item.imagePath || null : null;
        const timestamp = typeof item === 'object' && item !== null ? item.timestamp : null;

        return html`
            <div class="chat-row ai">
                <div class="bubble-ai-wrap">
                    <div class="bubble-ai">
                        ${
                            imageData
                                ? html`
                                      <button
                                          class="screenshot-preview-trigger"
                                          type="button"
                                          @click=${() => (this.previewImage = imageData)}
                                          title="View captured screenshot"
                                      >
                                          <img src="${imageData}" class="screenshot-mini-thumb" alt="Thumb" />
                                          <span class="screenshot-trigger-text">
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                              </svg>
                                              View Screen
                                          </span>
                                      </button>
                                  `
                                : ''
                        }
                        <div class="bubble-ai-content" .innerHTML=${renderedMarkdown}></div>
                    </div>
                    <div class="bubble-ai-meta">${this.formatTime(timestamp)}</div>
                </div>
            </div>
        `;
    }

    render() {
        const profileNames = this.getProfileNames();
        const hasResponses = this.responses.length > 0;
        const isListening = this.sessionActive || this.statusText?.includes('Listening') || this.statusText?.includes('connected');

        return html`
            <div class="chat-container" id="chatContainer" @click=${this.handleContentClick}>
                ${
                    !hasResponses && !isListening
                        ? html`
                              <div class="chat-empty">
                                  <div class="chat-empty-listening">
                                      <div class="listening-radar">
                                          <div class="listening-radar-ring"></div>
                                          <div class="listening-radar-dot"></div>
                                      </div>
                                      <div>Listening in ${profileNames[this.selectedProfile] || 'Session'} mode...</div>
                                  </div>
                              </div>
                          `
                        : ''
                }
                ${this.responses.map(item => {
                    if (item && item.type === 'status_event') {
                        return html`
                            <div class="chat-event-row">
                                <div class="chat-event-badge ${item.isMuted ? 'muted' : 'unmuted'}">
                                    ${
                                        item.isMuted
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
                                    <span>${item.text}</span>
                                    <span class="chat-event-time">${this.formatTime(item.timestamp)}</span>
                                </div>
                            </div>
                        `;
                    }

                    const promptText = typeof item === 'object' && item !== null ? item.prompt || '' : '';
                    const timestamp = typeof item === 'object' && item !== null ? item.timestamp : null;
                    return html`
                        ${promptText ? this.renderUserPromptBubble(promptText, timestamp) : ''} ${this.renderAssistantResponseBubble(item)}
                    `;
                })}
                ${this.renderLiveIndicator()}
            </div>

            ${
                this.isScrolledUp
                    ? html`
                          <button
                              class="scroll-bottom-btn ${this.hasNewMessagesWhileScrolled ? 'has-new' : ''}"
                              @click=${() => this.scrollToBottomSmooth()}
                              title="Jump to latest message"
                          >
                              <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2.5"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                              >
                                  <line x1="12" y1="5" x2="12" y2="19"></line>
                                  <polyline points="19 12 12 19 5 12"></polyline>
                              </svg>
                              ${this.hasNewMessagesWhileScrolled ? html`<span class="scroll-new-badge"></span>` : ''}
                          </button>
                      `
                    : ''
            }
            ${this.renderAttachmentControls()}

            <div class="input-bar">
                <div class="input-bar-inner">
                    <input type="text" id="textInput" placeholder="Type a message..." @keydown=${this.handleTextKeydown} />
                </div>
                <button
                    class="snip-btn ${this.isAnalyzing ? 'disabled' : ''}"
                    @click=${this.handleSnipAnswer}
                    title="Snip Area (Drag mouse to highlight)"
                >
                    <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                        <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                    </svg>
                    Snip
                </button>
                <button class="analyze-btn ${this.isAnalyzing ? 'analyzing' : ''}" @click=${this.handleScreenAnswer}>
                    <canvas class="analyze-canvas"></canvas>
                    <span class="analyze-btn-content">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                            <path
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 3v7h6l-8 11v-7H5z"
                            />
                        </svg>
                        Analyze Screen
                    </span>
                </button>
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

    renderAttachmentControls() {
        const state = this.attachmentsState || {};
        const activeList = state.activeAttachments || [];
        const allScreenshots = state.screenshots || [];
        const hasActive = activeList.length > 0;
        const hasScreenshots = allScreenshots.length > 0;

        if (!hasActive && !hasScreenshots) return '';

        return html`
            <div class="attachment-bar">
                <div class="attachment-items">
                    ${activeList.map((item, index) => {
                        const label = activeList.length > 1 ? (index === 0 ? 'Image 1 (Current)' : 'Image 2 (Previous)') : 'Active Screenshot';
                        const imgSrc = item.path ? `file://${item.path}` : '';
                        return html`
                            <div class="attachment-pill">
                                ${imgSrc ? html`<img src="${imgSrc}" class="attachment-thumb" alt="Thumb" @click=${() => (this.previewImage = imgSrc)} title="Click to preview screenshot" />` : ''}
                                <span class="attachment-label">${label}</span>
                                <button
                                    class="attachment-remove-btn"
                                    type="button"
                                    @click=${() => this.handleRemoveAttachment(item.id)}
                                    title="Remove attachment from next requests"
                                >
                                    ✕
                                </button>
                            </div>
                        `;
                    })}
                    ${hasActive ? html`<span class="attachment-hint">Follow-ups include active screenshot(s)</span>` : ''}
                </div>

                <div class="attachment-actions">
                    ${
                        allScreenshots.length >= 2
                            ? html`
                                  <button
                                      class="attachment-action-btn"
                                      type="button"
                                      @click=${() => this.handleComparePrevious()}
                                      title="Select current and immediately previous captures for comparison"
                                  >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                                      </svg>
                                      Compare with previous
                                  </button>
                              `
                            : ''
                    }
                    ${
                        allScreenshots.length > 0
                            ? html`
                                  <button
                                      class="attachment-action-btn"
                                      type="button"
                                      @click=${() => this.toggleHistoryPicker()}
                                      title="Choose a screenshot from session history"
                                  >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                          <circle cx="8.5" cy="8.5" r="1.5" />
                                          <polyline points="21 15 16 10 5 21" />
                                      </svg>
                                      History (${allScreenshots.length})
                                  </button>
                              `
                            : ''
                    }
                    ${
                        hasActive
                            ? html`
                                  <button
                                      class="attachment-action-btn"
                                      type="button"
                                      @click=${() => this.handleClearAttachments()}
                                      title="Clear all active attachments"
                                  >
                                      Clear
                                  </button>
                              `
                            : ''
                    }
                </div>

                ${
                    this.showHistoryPicker
                        ? html`
                              <div class="history-picker-popover" @click=${e => e.stopPropagation()}>
                                  <div class="history-picker-title">Session Screenshots</div>
                                  ${allScreenshots.map(item => {
                                      const isSelected = (state.activeAttachmentIds || []).includes(item.id);
                                      const imgSrc = item.path ? `file://${item.path}` : '';
                                      return html`
                                          <div
                                              class="history-picker-item ${isSelected ? 'selected' : ''}"
                                              @click=${() => this.handleSelectHistoryAttachment(item.id)}
                                          >
                                              ${imgSrc ? html`<img src="${imgSrc}" class="history-picker-thumb" alt="History thumb" />` : ''}
                                              <div class="history-picker-info">
                                                  <span>${item.id}</span>
                                                  <span class="history-picker-time">${this.formatTime(item.timestamp)}</span>
                                              </div>
                                          </div>
                                      `;
                                  })}
                              </div>
                          `
                        : ''
                }
            </div>
        `;
    }
}

customElements.define('assistant-view', AssistantView);
