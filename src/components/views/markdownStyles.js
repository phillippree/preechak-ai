import { css } from '../../assets/lit-core-2.7.4.min.js';

export const markdownStyles = css`
    /* ── Markdown Document Typography ── */
    .markdown-body,
    .bubble-ai-content {
        color: var(--text-primary);
        font-size: var(--response-font-size, 14px);
        line-height: var(--line-height, 1.6);
        word-break: break-word;
    }

    .markdown-body h1,
    .markdown-body h2,
    .markdown-body h3,
    .markdown-body h4,
    .markdown-body h5,
    .markdown-body h6,
    .bubble-ai-content h1,
    .bubble-ai-content h2,
    .bubble-ai-content h3,
    .bubble-ai-content h4,
    .bubble-ai-content h5,
    .bubble-ai-content h6 {
        margin: 0.9em 0 0.4em 0;
        color: var(--text-primary);
        font-weight: var(--font-weight-semibold);
        line-height: 1.3;
    }

    .markdown-body h1,
    .bubble-ai-content h1 {
        font-size: 1.35em;
        border-bottom: 1px solid var(--border);
        padding-bottom: 0.25em;
    }
    .markdown-body h2,
    .bubble-ai-content h2 {
        font-size: 1.2em;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        padding-bottom: 0.2em;
    }
    .markdown-body h3,
    .bubble-ai-content h3 {
        font-size: 1.08em;
    }
    .markdown-body h4,
    .bubble-ai-content h4 {
        font-size: 1em;
    }

    .markdown-body p,
    .bubble-ai-content p {
        margin: 0.5em 0;
        color: var(--text-primary);
    }

    .markdown-body p:first-child,
    .bubble-ai-content p:first-child {
        margin-top: 0;
    }

    .markdown-body p:last-child,
    .bubble-ai-content p:last-child {
        margin-bottom: 0;
    }

    .markdown-body ul,
    .markdown-body ol,
    .bubble-ai-content ul,
    .bubble-ai-content ol {
        margin: 0.5em 0;
        padding-left: 1.4em;
        color: var(--text-primary);
    }

    .markdown-body li,
    .bubble-ai-content li {
        margin: 0.25em 0;
    }

    .markdown-body blockquote,
    .bubble-ai-content blockquote {
        margin: 0.7em 0;
        padding: 0.4em 0.9em;
        border-left: 3px solid var(--accent, #6366f1);
        background: rgba(255, 255, 255, 0.03);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        color: var(--text-secondary);
        font-style: italic;
    }

    .markdown-body code:not(.hljs),
    .bubble-ai-content code:not(.hljs) {
        background: var(--bg-elevated, #1a1a1a);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 0.15em 0.4em;
        border-radius: var(--radius-sm);
        font-family: var(--font-mono);
        font-size: 0.88em;
        color: #e2e8f0;
    }

    .markdown-body a,
    .bubble-ai-content a {
        color: var(--accent, #3b82f6);
        text-decoration: none;
        transition: color var(--transition);
    }

    .markdown-body a:hover,
    .bubble-ai-content a:hover {
        text-decoration: underline;
        color: var(--accent-hover, #60a5fa);
    }

    .markdown-body table,
    .bubble-ai-content table {
        width: 100%;
        border-collapse: collapse;
        margin: 0.8em 0;
        font-size: 0.92em;
    }

    .markdown-body th,
    .markdown-body td,
    .bubble-ai-content th,
    .bubble-ai-content td {
        border: 1px solid var(--border);
        padding: 6px 10px;
        text-align: left;
    }

    .markdown-body th,
    .bubble-ai-content th {
        background: var(--bg-elevated);
        font-weight: var(--font-weight-semibold);
    }

    .markdown-body tr:nth-child(even),
    .bubble-ai-content tr:nth-child(even) {
        background: rgba(255, 255, 255, 0.02);
    }

    .markdown-body hr,
    .bubble-ai-content hr {
        border: none;
        border-top: 1px solid var(--border);
        margin: 1.2em 0;
    }

    /* ── Editor-Style Code Blocks ── */
    .code-block-wrapper {
        margin: 0.9em 0;
        border-radius: var(--radius-md, 8px);
        background: var(--bg-elevated, rgba(13, 17, 23, 0.85));
        border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        width: 100%;
        box-sizing: border-box;
    }

    .code-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 12px;
        background: rgba(255, 255, 255, 0.04);
        border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
        user-select: none;
    }

    .code-block-lang {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 500;
        color: var(--text-muted, #8b949e);
        letter-spacing: 0.03em;
        text-transform: uppercase;
    }

    .code-block-copy-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: transparent;
        border: 1px solid transparent;
        color: var(--text-muted, #8b949e);
        cursor: pointer;
        padding: 3px 7px;
        border-radius: var(--radius-sm, 4px);
        font-size: 11px;
        font-family: var(--font);
        transition: all 0.15s ease;
    }

    .code-block-copy-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-primary, #f5f5f5);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .code-block-copy-btn:focus-visible {
        outline: 2px solid var(--accent, #3b82f6);
        outline-offset: 1px;
    }

    .code-block-copy-btn .check-icon {
        display: none;
        color: #4ade80;
    }

    .code-block-copy-btn.copied {
        color: #4ade80;
        border-color: rgba(74, 222, 128, 0.3);
        background: rgba(74, 222, 128, 0.1);
    }

    .code-block-copy-btn.copied .copy-icon {
        display: none;
    }

    .code-block-copy-btn.copied .check-icon {
        display: inline-block;
    }

    .code-block-pre {
        margin: 0;
        padding: 12px 14px;
        background: transparent;
        overflow-x: hidden;
        max-width: 100%;
        box-sizing: border-box;
    }

    .code-block-pre code.hljs {
        display: block;
        padding: 0;
        background: transparent;
        font-family: var(--font-mono);
        font-size: 12.5px;
        line-height: 1.55;
        white-space: pre-wrap;
        tab-size: 4;
        -moz-tab-size: 4;
        word-break: break-word;
        word-wrap: break-word;
        overflow-wrap: anywhere;
        color: #c9d1d9;
    }

    /* ── Highlight.js Syntax Theme (VS Code / GitHub Dark) ── */
    .hljs {
        color: #c9d1d9;
        background: transparent;
    }
    .hljs-doctag,
    .hljs-keyword,
    .hljs-meta .hljs-keyword,
    .hljs-template-tag,
    .hljs-template-variable,
    .hljs-type,
    .hljs-variable.language_ {
        color: #ff7b72;
    }
    .hljs-title,
    .hljs-title.class_,
    .hljs-title.class_.inherited__,
    .hljs-title.function_ {
        color: #d2a8ff;
    }
    .hljs-attr,
    .hljs-attribute,
    .hljs-literal,
    .hljs-meta,
    .hljs-number,
    .hljs-operator,
    .hljs-selector-attr,
    .hljs-selector-class,
    .hljs-selector-id,
    .hljs-variable {
        color: #79c0ff;
    }
    .hljs-meta .hljs-string,
    .hljs-regexp,
    .hljs-string {
        color: #a5d6ff;
    }
    .hljs-built_in,
    .hljs-symbol {
        color: #ffa657;
    }
    .hljs-code,
    .hljs-comment,
    .hljs-formula {
        color: #8b949e;
        font-style: italic;
    }
    .hljs-name,
    .hljs-quote,
    .hljs-selector-pseudo,
    .hljs-selector-tag {
        color: #7ee787;
    }
    .hljs-subst {
        color: #c9d1d9;
    }
    .hljs-section {
        color: #1f6feb;
        font-weight: 700;
    }
    .hljs-bullet {
        color: #f2cc60;
    }
    .hljs-emphasis {
        color: #c9d1d9;
        font-style: italic;
    }
    .hljs-strong {
        color: #c9d1d9;
        font-weight: 700;
    }
    .hljs-addition {
        color: #aff5b4;
        background-color: #033a16;
    }
    .hljs-deletion {
        color: #ffdcd7;
        background-color: #67060c;
    }
`;
