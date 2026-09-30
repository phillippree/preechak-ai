import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

const LOCAL_LLM_PRESETS = [
    { value: 'unsloth/Qwen3.5-0.8B-GGUF:Q4_K_M', label: 'Qwen 3.5 0.8B Q4 — 0.74 GB · Fastest' },
    { value: 'unsloth/Qwen3.5-0.8B-GGUF:Q8_0', label: 'Qwen 3.5 0.8B Q8 — 1.02 GB' },
    { value: 'unsloth/Qwen3.5-2B-GGUF:Q4_K_M', label: 'Qwen 3.5 2B Q4 — 1.95 GB' },
    { value: 'unsloth/Qwen3.5-2B-GGUF:Q8_0', label: 'Qwen 3.5 2B Q8 — 2.68 GB' },
    { value: 'unsloth/Qwen3.5-4B-GGUF:Q4_K_M', label: 'Qwen 3.5 4B Q4 — 3.42 GB · Recommended' },
    { value: 'unsloth/Qwen3.5-4B-GGUF:Q8_0', label: 'Qwen 3.5 4B Q8 — 5.16 GB' },
    { value: 'unsloth/Qwen3.5-9B-GGUF:Q4_K_M', label: 'Qwen 3.5 9B Q4 — 6.60 GB' },
    { value: 'unsloth/Qwen3.5-9B-GGUF:Q8_0', label: 'Qwen 3.5 9B Q8 — 10.45 GB' },
    { value: 'unsloth/Qwen3.5-27B-GGUF:Q4_K_M', label: 'Qwen 3.5 27B Q4 — 17.67 GB' },
    { value: 'unsloth/Qwen3.5-35B-A3B-GGUF:Q4_K_M', label: 'Qwen 3.5 35B-A3B Q4 — 22.92 GB · Largest' },
];

export class MainView extends LitElement {
    static styles = css`
        * {
            font-family: var(--font);
            cursor: default;
            user-select: none;
            box-sizing: border-box;
        }

        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-xl) var(--space-lg);
        }

        .form-wrapper {
            width: 100%;
            max-width: 420px;
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
        }

        .page-title {
            font-size: var(--font-size-xl);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            margin-bottom: var(--space-xs);
        }

        .page-title .mode-suffix {
            opacity: 0.5;
        }

        .page-subtitle {
            font-size: var(--font-size-sm);
            color: var(--text-muted);
            margin-bottom: var(--space-md);
        }

        /* ── Cloud promo card ── */

        .cloud-promo {
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 14px 16px;
            border-radius: var(--radius-md);
            border: 1px solid rgba(59, 130, 246, 0.45);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(139, 92, 246, 0.09) 100%);
            cursor: pointer;
            transition:
                border-color 0.2s,
                background 0.2s;
        }

        .cloud-promo:hover {
            border-color: rgba(59, 130, 246, 0.65);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(139, 92, 246, 0.12) 100%);
            box-shadow:
                0 0 20px rgba(59, 130, 246, 0.15),
                0 0 40px rgba(139, 92, 246, 0.08);
        }

        .cloud-promo-glow {
            position: absolute;
            top: -40%;
            right: -20%;
            width: 120px;
            height: 120px;
            background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
            pointer-events: none;
        }

        .cloud-promo-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .cloud-promo-title {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
        }

        .cloud-promo-arrow {
            color: var(--accent);
            font-size: 16px;
            transition: transform 0.2s;
        }

        .cloud-promo:hover .cloud-promo-arrow {
            transform: translateX(2px);
        }

        .cloud-promo-desc {
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
            line-height: var(--line-height);
        }

        /* ── Form controls ── */

        .form-group {
            display: flex;
            flex-direction: column;
            gap: var(--space-xs);
        }

        .config-section {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: var(--bg-surface);
            overflow: hidden;
        }

        .config-summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-md);
            padding: 12px 14px;
            cursor: pointer;
            list-style: none;
        }

        .config-summary::-webkit-details-marker {
            display: none;
        }

        .config-summary-text {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .config-summary-title {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-medium);
            color: var(--text-primary);
        }

        .config-summary-description {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
        }

        .config-chevron {
            width: 16px;
            height: 16px;
            color: var(--text-muted);
            transition: transform var(--transition);
        }

        .config-section[open] .config-chevron {
            transform: rotate(180deg);
        }

        .config-content {
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
            padding: 14px;
            border-top: 1px solid var(--border);
        }

        .config-note {
            padding: 10px 12px;
            border: 1px solid rgba(212, 160, 23, 0.28);
            border-radius: var(--radius-sm);
            background: rgba(212, 160, 23, 0.08);
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
            line-height: var(--line-height);
        }

        .config-checkbox {
            display: flex;
            align-items: flex-start;
            gap: var(--space-sm);
            cursor: pointer;
        }

        .config-checkbox input {
            width: 16px;
            height: 16px;
            margin-top: 2px;
            padding: 0;
            accent-color: var(--accent);
            cursor: pointer;
        }

        .config-checkbox-text {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .form-label {
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        input,
        select,
        textarea {
            background: var(--bg-elevated);
            color: var(--text-primary);
            border: 1px solid var(--border);
            padding: 10px 12px;
            width: 100%;
            border-radius: var(--radius-sm);
            font-size: var(--font-size-sm);
            font-family: var(--font);
            transition:
                border-color var(--transition),
                box-shadow var(--transition);
        }

        input:hover:not(:focus),
        select:hover:not(:focus),
        textarea:hover:not(:focus) {
            border-color: var(--text-muted);
        }

        input:focus,
        select:focus,
        textarea:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 1px var(--accent);
        }

        input::placeholder,
        textarea::placeholder {
            color: var(--text-muted);
        }

        input.error {
            border-color: var(--danger, #ef4444);
        }

        select {
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23999' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
            background-position: right 8px center;
            background-repeat: no-repeat;
            background-size: 14px;
            padding-right: 28px;
        }

        textarea {
            resize: vertical;
            min-height: 80px;
            line-height: var(--line-height);
        }

        .form-hint {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
        }

        .form-hint a,
        .form-hint span.link {
            color: var(--accent);
            text-decoration: none;
            cursor: pointer;
        }

        .form-hint span.link:hover {
            text-decoration: underline;
        }

        .whisper-label-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .whisper-spinner {
            width: 12px;
            height: 12px;
            border: 2px solid var(--border);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: whisper-spin 0.8s linear infinite;
        }

        @keyframes whisper-spin {
            to {
                transform: rotate(360deg);
            }
        }

        /* ── Local Whisper in HTTP Mode ── */

        .whisper-settings-box {
            margin-top: var(--space-xs);
            padding: var(--space-sm);
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            display: flex;
            flex-direction: column;
            gap: var(--space-sm);
        }

        .whisper-status-card {
            display: flex;
            flex-direction: column;
            gap: 6px;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 8px 10px;
        }

        .whisper-status-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: var(--font-size-xs);
        }

        .whisper-status-label {
            color: var(--text-secondary);
            font-weight: var(--font-weight-medium);
        }

        .whisper-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: var(--font-weight-medium);
        }

        .badge-ready {
            background: rgba(34, 197, 94, 0.12);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.25);
        }

        .badge-not_downloaded {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-muted);
            border: 1px solid var(--border);
        }

        .badge-downloading {
            background: rgba(59, 130, 246, 0.12);
            color: var(--accent);
            border: 1px solid rgba(59, 130, 246, 0.25);
        }

        .badge-verifying {
            background: rgba(168, 85, 247, 0.12);
            color: #c084fc;
            border: 1px solid rgba(168, 85, 247, 0.25);
        }

        .badge-needs_repair {
            background: rgba(212, 160, 23, 0.12);
            color: #eab308;
            border: 1px solid rgba(212, 160, 23, 0.25);
        }

        .badge-unsupported {
            background: rgba(239, 68, 68, 0.12);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.25);
        }

        .whisper-progress-container {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 4px 0;
        }

        .whisper-progress-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
        }

        .whisper-progress-bar-track {
            width: 100%;
            height: 6px;
            background: var(--bg-app);
            border-radius: 3px;
            overflow: hidden;
            position: relative;
        }

        .whisper-progress-bar-fill {
            height: 100%;
            background: var(--accent);
            border-radius: 3px;
            transition: width 150ms ease;
        }

        .whisper-progress-bar-fill.indeterminate {
            width: 40%;
            animation: indeterminate-slide 1.5s infinite ease-in-out;
        }

        @keyframes indeterminate-slide {
            0% {
                transform: translateX(-100%);
            }
            100% {
                transform: translateX(300%);
            }
        }

        .whisper-buttons-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: var(--space-xs);
            margin-top: 4px;
        }

        .btn-action-sm {
            background: var(--bg-hover);
            color: var(--text-primary);
            border: 1px solid var(--border);
            padding: 5px 10px;
            border-radius: var(--radius-sm);
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transition:
                background var(--transition),
                border-color var(--transition);
        }

        .btn-action-sm:hover:not(:disabled) {
            background: var(--bg-elevated);
            border-color: var(--border-strong);
        }

        .btn-action-sm:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .btn-action-sm.primary {
            background: #e8e8e8;
            border-color: #e8e8e8;
            color: #111111;
            font-weight: var(--font-weight-semibold);
        }

        .btn-action-sm.primary:hover:not(:disabled) {
            background: #ffffff;
            border-color: #ffffff;
            color: #000000;
        }

        .btn-action-sm.danger {
            color: var(--danger);
            border-color: rgba(239, 68, 68, 0.3);
            background: rgba(239, 68, 68, 0.06);
        }

        .btn-action-sm.danger:hover:not(:disabled) {
            background: rgba(239, 68, 68, 0.15);
            border-color: var(--danger);
        }

        .confirm-delete-box {
            padding: 8px 10px;
            border-radius: var(--radius-sm);
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.25);
            font-size: var(--font-size-xs);
            color: var(--text-primary);
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        /* ── Start button ── */

        .start-button {
            position: relative;
            overflow: hidden;
            background: #e8e8e8;
            color: #111111;
            border: none;
            padding: 12px var(--space-md);
            border-radius: var(--radius-sm);
            font-size: var(--font-size-base);
            font-weight: var(--font-weight-semibold);
            cursor: pointer;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-sm);
        }

        .start-button canvas.btn-aurora {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
        }

        .start-button canvas.btn-dither {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
            opacity: 0.1;
            mix-blend-mode: overlay;
            pointer-events: none;
            image-rendering: pixelated;
        }

        .start-button .btn-label {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            gap: var(--space-sm);
        }

        .start-button:hover {
            opacity: 0.9;
        }

        .start-button.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .start-button.disabled:hover {
            opacity: 0.5;
        }

        .download-progress-fill {
            position: absolute;
            inset: 0 auto 0 0;
            z-index: 2;
            width: 0;
            background: rgba(17, 17, 17, 0.16);
            transition: width 0.2s ease;
            pointer-events: none;
        }

        .download-progress-fill.indeterminate {
            width: 38%;
            animation: download-progress-slide 1.2s ease-in-out infinite;
        }

        .download-controls {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-md);
            margin-top: var(--space-xs);
            font-size: var(--font-size-xs);
            color: var(--text-muted);
        }

        .download-cancel {
            flex: none;
            padding: 0;
            border: none;
            background: none;
            color: var(--danger, #ef4444);
            font: inherit;
            cursor: pointer;
        }

        .download-cancel:hover {
            text-decoration: underline;
        }

        @keyframes download-progress-slide {
            from {
                transform: translateX(-105%);
            }
            to {
                transform: translateX(270%);
            }
        }

        .shortcut-hint {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            opacity: 0.5;
            font-family: var(--font-mono);
        }

        /* ── Divider ── */

        .divider {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            margin: var(--space-sm) 0;
        }

        .divider-line {
            flex: 1;
            height: 1px;
            background: var(--border);
        }

        .divider-text {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            text-transform: lowercase;
        }

        /* ── Session mode bar ── */

        .session-mode-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-sm);
            padding: 8px 12px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            margin-bottom: var(--space-sm);
        }

        .session-mode-label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
            color: var(--text-secondary);
        }

        .session-mode-select {
            padding: 4px 8px;
            border-radius: var(--radius-sm);
            border: 1px solid var(--border);
            background: var(--bg-elevated);
            color: var(--text-primary);
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            outline: none;
            transition: border-color var(--transition);
        }

        .session-mode-select:focus {
            border-color: var(--accent);
        }

        /* ── Mode switch links ── */

        .mode-links {
            display: flex;
            justify-content: center;
            gap: var(--space-lg);
        }

        .mode-link {
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
            cursor: pointer;
            background: none;
            border: none;
            padding: 0;
            transition: color var(--transition);
        }

        .mode-link:hover {
            color: var(--text-primary);
        }

        /* ── Mode option cards ── */

        .mode-cards {
            display: flex;
            gap: var(--space-sm);
        }

        .mode-card {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 14px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            background: var(--bg-elevated);
            cursor: pointer;
            transition:
                border-color 0.2s,
                background 0.2s;
        }

        .mode-card:hover {
            border-color: var(--text-muted);
            background: var(--bg-hover);
        }

        .mode-card-title {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
        }

        .mode-card-desc {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            line-height: var(--line-height);
        }

        /* ── Title row with help ── */

        .title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--space-xs);
        }

        .title-row .page-title {
            margin-bottom: 0;
        }

        .help-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            padding: 4px;
            border-radius: var(--radius-sm);
            transition: color 0.2s;
            display: flex;
            align-items: center;
        }

        .help-btn:hover {
            color: var(--text-secondary);
        }

        .help-btn * {
            pointer-events: none;
        }

        .help-dialog-backdrop {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-lg);
            background: rgba(0, 0, 0, 0.62);
        }

        .help-dialog {
            width: min(680px, 100%);
            max-height: calc(100vh - 48px);
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
            padding: var(--space-lg);
            overflow: hidden;
            background: var(--bg-surface);
            border: 1px solid var(--border-strong);
            border-radius: var(--radius-lg);
            color: var(--text-primary);
        }

        .help-dialog-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-md);
        }

        .help-dialog-title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
        }

        /* ── Help content ── */

        .help-content {
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
            overflow-y: auto;
        }

        .help-section {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .help-section-title {
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
        }

        .help-section-text {
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
            line-height: var(--line-height);
        }

        .help-code {
            font-family: var(--font-mono);
            font-size: 11px;
            background: var(--bg-hover);
            padding: 6px 8px;
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            display: block;
        }

        .help-link {
            color: var(--accent);
            cursor: pointer;
            text-decoration: none;
        }

        .help-link:hover {
            text-decoration: underline;
        }

        .help-models {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .help-model {
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
            display: flex;
            justify-content: space-between;
        }

        .help-model-name {
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--text-primary);
        }

        .help-divider {
            border: none;
            border-top: 1px solid var(--border);
            margin: 0;
        }

        .help-cloud-btn {
            background: #e8e8e8;
            color: #111111;
            border: none;
            padding: 10px var(--space-md);
            border-radius: var(--radius-sm);
            font-size: var(--font-size-sm);
            font-family: var(--font);
            font-weight: var(--font-weight-semibold);
            cursor: pointer;
            width: 100%;
            transition: opacity 0.15s;
        }

        .help-cloud-btn:hover {
            opacity: 0.9;
        }

        .help-warn {
            font-size: var(--font-size-xs);
            color: var(--warning);
            line-height: var(--line-height);
        }
    `;

    static properties = {
        onStart: { type: Function },
        onExternalLink: { type: Function },
        selectedProfile: { type: String },
        onProfileChange: { type: Function },
        isInitializing: { type: Boolean },
        whisperDownloading: { type: Boolean },
        downloadProgress: { type: Object },
        onCancelDownload: { type: Function },
        isSessionActive: { type: Boolean },
        // Internal state
        _mode: { state: true },
        _token: { state: true },
        _geminiKey: { state: true },
        _groqKey: { state: true },
        _openaiKey: { state: true },
        _apiTransportMode: { state: true },
        _geminiLiveModel: { state: true },
        _geminiHttpModel: { state: true },
        _geminiHttpLocalWhisper: { state: true },
        _geminiHttpTranscriptionMode: { state: true },
        _groqModel: { state: true },
        _groqImageModel: { state: true },
        _disableGroqThinking: { state: true },
        _tokenError: { state: true },
        _keyError: { state: true },
        // Local AI & Whisper state
        _localLlmModel: { state: true },
        _useCustomLocalLlmModel: { state: true },
        _whisperModel: { state: true },
        _whisperStatus: { state: true },
        _whisperDownloadState: { state: true },
        _isWhisperDownloading: { state: true },
        _confirmDeleteModel: { state: true },
        _whisperActionError: { state: true },
        _showLocalHelp: { state: true },
    };

    constructor() {
        super();
        this.onStart = () => {};
        this.onExternalLink = () => {};
        this.selectedProfile = 'interview';
        this.onProfileChange = () => {};
        this.isInitializing = false;
        this.whisperDownloading = false;
        this.downloadProgress = { active: false, label: '', percentage: null };
        this.onCancelDownload = () => {};
        this.isSessionActive = false;

        this._mode = 'byok';
        this._token = '';
        this._geminiKey = '';
        this._groqKey = '';
        this._openaiKey = '';
        this._apiTransportMode = 'websocket';
        this._geminiLiveModel = 'gemini-3.1-flash-live-preview';
        this._geminiHttpModel = 'gemini-3.8-flash';
        this._geminiHttpLocalWhisper = false;
        this._geminiHttpTranscriptionMode = 'whisper';
        this._groqModel = 'qwen/qwen3.6-27b';
        this._groqImageModel = 'qwen/qwen3.6-27b';
        this._disableGroqThinking = true;
        this._tokenError = false;
        this._keyError = false;
        this._showLocalHelp = false;
        this._localLlmModel = 'unsloth/Qwen3.5-4B-GGUF:Q4_K_M';
        this._useCustomLocalLlmModel = false;
        this._whisperModel = 'base.en';
        this._whisperStatus = null;
        this._whisperDownloadState = null;
        this._isWhisperDownloading = false;
        this._confirmDeleteModel = false;
        this._whisperActionError = null;

        this._animId = null;
        this._time = 0;
        this._mouseX = -1;
        this._mouseY = -1;

        this.boundKeydownHandler = this._handleKeydown.bind(this);
        this._loadFromStorage();
    }

    async _loadFromStorage() {
        try {
            const [config, prefs, creds] = await Promise.all([
                preechakAi.storage.getConfig(),
                preechakAi.storage.getPreferences(),
                preechakAi.storage.getCredentials().catch(() => ({})),
            ]);

            const storedMode = prefs.providerMode || 'byok';
            this._mode = storedMode === 'cloud' ? 'byok' : storedMode;

            if (storedMode === 'cloud') {
                await preechakAi.storage.updatePreference('providerMode', this._mode);
            }

            // Load keys
            this._token = creds.cloudToken || '';
            this._geminiKey = (await preechakAi.storage.getApiKey().catch(() => '')) || '';
            this._groqKey = (await preechakAi.storage.getGroqApiKey().catch(() => '')) || '';
            this._openaiKey = creds.openaiKey || '';
            this._apiTransportMode = config.apiTransportMode || 'websocket';
            this._geminiLiveModel = config.geminiLiveModel || 'gemini-3.1-flash-live-preview';
            this._geminiHttpModel = config.geminiHttpModel || 'gemini-3.8-flash';
            this._groqModel = config.groqModel || 'qwen/qwen3.6-27b';
            this._groqImageModel = config.groqImageModel || 'qwen/qwen3.6-27b';
            this._disableGroqThinking = config.disableGroqThinking === true;

            // Load local AI settings
            this._localLlmModel = prefs.localLlmModel || 'unsloth/Qwen3.5-4B-GGUF:Q4_K_M';
            this._useCustomLocalLlmModel = !LOCAL_LLM_PRESETS.some(preset => preset.value === this._localLlmModel);
            this._whisperModel = prefs.whisperModel || 'base.en';
            this._geminiHttpTranscriptionMode = prefs.geminiHttpTranscriptionMode || (prefs.geminiHttpLocalWhisper === true ? 'whisper' : 'whisper');
            this._geminiHttpLocalWhisper = this._geminiHttpTranscriptionMode === 'whisper';

            this.requestUpdate();

            if (this._geminiHttpLocalWhisper || this._mode === 'local') {
                this._checkWhisperStatus();
            }
        } catch (e) {
            console.error('Error loading MainView storage:', e);
        }
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('keydown', this.boundKeydownHandler);

        if (typeof preechakAi !== 'undefined' && preechakAi.whisper) {
            this._unsubscribeWhisperProgress = preechakAi.whisper.onDownloadProgress?.(p => {
                this._whisperDownloadState = p;
                this._isWhisperDownloading = true;
                this.requestUpdate();
            });
            this._unsubscribeWhisperStatus = preechakAi.whisper.onStatusUpdated?.(s => {
                this._whisperStatus = s;
                this._isWhisperDownloading = false;
                this._whisperDownloadState = null;
                this.requestUpdate();
            });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('keydown', this.boundKeydownHandler);
        if (this._animId) cancelAnimationFrame(this._animId);
        if (this._unsubscribeWhisperProgress) this._unsubscribeWhisperProgress();
        if (this._unsubscribeWhisperStatus) this._unsubscribeWhisperStatus();
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('_mode')) {
            // Stop old animation when switching modes
            if (this._animId) {
                cancelAnimationFrame(this._animId);
                this._animId = null;
            }
        }
    }

    _initButtonAurora() {
        const btn = this.shadowRoot.querySelector('.start-button');
        const aurora = this.shadowRoot.querySelector('canvas.btn-aurora');
        const dither = this.shadowRoot.querySelector('canvas.btn-dither');
        if (!aurora || !dither || !btn) return;

        // Mouse tracking
        this._mouseX = -1;
        this._mouseY = -1;
        btn.addEventListener('mousemove', e => {
            const rect = btn.getBoundingClientRect();
            this._mouseX = (e.clientX - rect.left) / rect.width;
            this._mouseY = (e.clientY - rect.top) / rect.height;
        });
        btn.addEventListener('mouseleave', () => {
            this._mouseX = -1;
            this._mouseY = -1;
        });

        // Dither
        const blockSize = 8;
        const cols = Math.ceil(aurora.offsetWidth / blockSize);
        const rows = Math.ceil(aurora.offsetHeight / blockSize);
        dither.width = cols;
        dither.height = rows;
        const dCtx = dither.getContext('2d');
        const img = dCtx.createImageData(cols, rows);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random() > 0.5 ? 255 : 0;
            img.data[i] = v;
            img.data[i + 1] = v;
            img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
        dCtx.putImageData(img, 0, 0);

        // Aurora
        const ctx = aurora.getContext('2d');
        const scale = 0.4;
        aurora.width = Math.floor(aurora.offsetWidth * scale);
        aurora.height = Math.floor(aurora.offsetHeight * scale);

        const blobs = [
            { color: [120, 160, 230], x: 0.1, y: 0.3, vx: 0.25, vy: 0.2, phase: 0 },
            { color: [150, 120, 220], x: 0.8, y: 0.5, vx: -0.2, vy: 0.25, phase: 1.5 },
            { color: [200, 140, 210], x: 0.5, y: 0.6, vx: 0.18, vy: -0.22, phase: 3.0 },
            { color: [100, 190, 190], x: 0.3, y: 0.7, vx: 0.3, vy: 0.15, phase: 4.5 },
            { color: [220, 170, 130], x: 0.7, y: 0.4, vx: -0.22, vy: -0.25, phase: 6.0 },
        ];

        const draw = () => {
            this._time += 0.008;
            const w = aurora.width;
            const h = aurora.height;
            const maxDim = Math.max(w, h);

            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, w, h);

            const hovering = this._mouseX >= 0;

            for (const blob of blobs) {
                const t = this._time;
                const cx = (blob.x + Math.sin(t * blob.vx + blob.phase) * 0.4) * w;
                const cy = (blob.y + Math.cos(t * blob.vy + blob.phase * 0.7) * 0.4) * h;
                const r = maxDim * 0.45;

                let boost = 1;
                if (hovering) {
                    const dx = cx / w - this._mouseX;
                    const dy = cy / h - this._mouseY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    boost = 1 + 2.5 * Math.max(0, 1 - dist / 0.6);
                }

                const a0 = Math.min(1, 0.18 * boost);
                const a1 = Math.min(1, 0.08 * boost);
                const a2 = Math.min(1, 0.02 * boost);

                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                grad.addColorStop(0, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a0})`);
                grad.addColorStop(0.3, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a1})`);
                grad.addColorStop(0.6, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a2})`);
                grad.addColorStop(1, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, 0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
            }

            this._animId = requestAnimationFrame(draw);
        };

        draw();
    }

    _handleKeydown(e) {
        if (e.key === 'Escape' && this._showLocalHelp) {
            this._closeLocalHelp();
            return;
        }

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            this._handleStart();
        }
    }

    // ── Persistence ──

    async _saveMode(mode) {
        this._mode = mode;
        this._tokenError = false;
        this._keyError = false;
        await preechakAi.storage.updatePreference('providerMode', mode);
        this.requestUpdate();
    }

    async _saveToken(val) {
        this._token = val;
        this._tokenError = false;
        try {
            const creds = await preechakAi.storage.getCredentials().catch(() => ({}));
            await preechakAi.storage.setCredentials({ ...creds, cloudToken: val });
        } catch (e) {}
        this.requestUpdate();
    }

    async _saveGeminiKey(val) {
        this._geminiKey = val;
        this._keyError = false;
        await preechakAi.storage.setApiKey(val);
        this.requestUpdate();
    }

    async _saveGroqKey(val) {
        this._groqKey = val;
        await preechakAi.storage.setGroqApiKey(val);
        this.requestUpdate();
    }

    async _saveApiTransportMode(val) {
        this._apiTransportMode = val;
        await preechakAi.storage.updateConfig('apiTransportMode', val);
        this.requestUpdate();
    }

    async _saveGeminiLiveModel(val) {
        this._geminiLiveModel = val;
        await preechakAi.storage.updateConfig('geminiLiveModel', val);
        this.requestUpdate();
    }

    async _saveGeminiHttpModel(val) {
        this._geminiHttpModel = val;
        await preechakAi.storage.updateConfig('geminiHttpModel', val);
        this.requestUpdate();
    }

    async _saveGroqModel(val) {
        this._groqModel = val;
        await preechakAi.storage.updateConfig('groqModel', val);
        this.requestUpdate();
    }

    async _saveGroqImageModel(val) {
        this._groqImageModel = val;
        await preechakAi.storage.updateConfig('groqImageModel', val);
        this.requestUpdate();
    }

    async _saveDisableGroqThinking(disabled) {
        this._disableGroqThinking = disabled;
        await preechakAi.storage.updateConfig('disableGroqThinking', disabled);
        this.requestUpdate();
    }

    async _saveOpenaiKey(val) {
        this._openaiKey = val;
        try {
            const creds = await preechakAi.storage.getCredentials().catch(() => ({}));
            await preechakAi.storage.setCredentials({ ...creds, openaiKey: val });
        } catch (e) {}
        this.requestUpdate();
    }

    async _saveLocalLlmModel(val) {
        this._localLlmModel = val;
        await preechakAi.storage.updatePreference('localLlmModel', val);
        this.requestUpdate();
    }

    async _selectLocalLlmModel(value) {
        if (value === 'custom') {
            this._useCustomLocalLlmModel = true;
            this.requestUpdate();
            return;
        }

        this._useCustomLocalLlmModel = false;
        await this._saveLocalLlmModel(value);
    }

    async _saveWhisperModel(val) {
        this._whisperModel = val;
        await preechakAi.storage.updatePreference('whisperModel', val);
        this.requestUpdate();
        await this._checkWhisperStatus(val);
        if (this._geminiHttpLocalWhisper) {
            const engineReady = this._whisperStatus?.engine?.status === 'ready';
            const modelReady = this._whisperStatus?.model?.status === 'ready';
            if (!engineReady || !modelReady) {
                void this._downloadWhisper();
            }
        }
    }

    async _saveGeminiHttpTranscriptionMode(val) {
        this._geminiHttpTranscriptionMode = val;
        this._geminiHttpLocalWhisper = val === 'whisper';
        await Promise.all([
            preechakAi.storage.updatePreference('geminiHttpTranscriptionMode', val),
            preechakAi.storage.updatePreference('geminiHttpLocalWhisper', val === 'whisper'),
        ]);
        this.requestUpdate();
        if (val === 'whisper') {
            await this._checkWhisperStatus();
            const engineReady = this._whisperStatus?.engine?.status === 'ready';
            const modelReady = this._whisperStatus?.model?.status === 'ready';
            if (!engineReady || !modelReady) {
                void this._downloadWhisper();
            }
        }
    }

    async _saveGeminiHttpLocalWhisper(val) {
        return this._saveGeminiHttpTranscriptionMode(val ? 'whisper' : 'gemini');
    }

    async _checkWhisperStatus(modelName = null) {
        const modelToCheck = modelName || this._whisperModel || 'base.en';
        if (typeof preechakAi === 'undefined' || !preechakAi.whisper) return;
        this._isCheckingWhisper = true;
        this.requestUpdate();
        try {
            const status = await preechakAi.whisper.getStatus(modelToCheck);
            this._whisperStatus = status;
        } catch (err) {
            console.warn('Error checking whisper status:', err);
        } finally {
            this._isCheckingWhisper = false;
            this.requestUpdate();
        }
    }

    async _downloadWhisper() {
        if (typeof preechakAi === 'undefined' || !preechakAi.whisper) return;
        this._isWhisperDownloading = true;
        this._whisperActionError = null;
        this.requestUpdate();
        try {
            const res = await preechakAi.whisper.download(this._whisperModel);
            if (!res.success) {
                this._whisperActionError = res.error || 'Download failed';
            }
        } catch (err) {
            this._whisperActionError = err.message;
        } finally {
            this._isWhisperDownloading = false;
            await this._checkWhisperStatus();
        }
    }

    async _cancelWhisperDownload() {
        if (typeof preechakAi === 'undefined' || !preechakAi.whisper) return;
        try {
            await preechakAi.whisper.cancelDownload();
        } catch (e) {}
        this._isWhisperDownloading = false;
        this._whisperDownloadState = null;
        await this._checkWhisperStatus();
    }

    async _handleDeleteWhisperModel() {
        if (typeof preechakAi === 'undefined' || !preechakAi.whisper) return;
        this._confirmDeleteModel = false;
        try {
            const res = await preechakAi.whisper.deleteModel(this._whisperModel);
            if (!res.success) {
                this._whisperActionError = res.error || 'Deletion failed';
            }
        } catch (err) {
            this._whisperActionError = err.message;
        }
        await this._checkWhisperStatus();
    }

    async _openWhisperFolder() {
        if (typeof preechakAi === 'undefined' || !preechakAi.whisper) return;
        await preechakAi.whisper.openFolder();
    }

    _renderStatusBadge(status) {
        const labels = {
            ready: 'Ready',
            not_downloaded: 'Not downloaded',
            downloading: 'Downloading…',
            verifying: 'Verifying…',
            needs_repair: 'Needs repair',
            unsupported: 'Unsupported',
            checking: 'Checking…',
        };
        const displayLabel = labels[status] || status || 'Not downloaded';
        const badgeClass = `whisper-badge badge-${status || 'not_downloaded'}`;
        return html`<span class="${badgeClass}">${displayLabel}</span>`;
    }

    _formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 MB';
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    _renderWhisperSection() {
        const engine = this._whisperStatus?.engine;
        const model = this._whisperStatus?.model;
        const engineReady = engine?.status === 'ready';
        const modelReady = model?.status === 'ready';
        const isDownloading = this._isWhisperDownloading || engine?.status === 'downloading' || model?.status === 'downloading';
        const needsDownload = !engineReady || !modelReady;
        const needsRepair = engine?.status === 'needs_repair' || model?.status === 'needs_repair';
        const downloadProgress = this._whisperDownloadState;

        return html`
            <div class="whisper-settings-box" role="region" aria-label="Whisper local transcription settings">
                <div class="form-group">
                    <div class="whisper-label-row">
                        <label class="form-label">Whisper Speech Model (English only)</label>
                        ${this._isCheckingWhisper ? html`<div class="whisper-spinner"></div>` : ''}
                    </div>
                    <select
                        .value=${this._whisperModel}
                        ?disabled=${this.isSessionActive || isDownloading}
                        @change=${e => {
                            this._saveWhisperModel(e.target.value);
                            this._checkWhisperStatus(e.target.value);
                        }}
                    >
                        <option value="tiny.en" ?selected=${this._whisperModel === 'tiny.en'}>Tiny English (75 MB · Fastest)</option>
                        <option value="base.en" ?selected=${this._whisperModel === 'base.en'}>Base English (142 MB · Recommended)</option>
                        <option value="small.en" ?selected=${this._whisperModel === 'small.en'}>Small English (466 MB · Most accurate)</option>
                    </select>
                    <div class="form-hint">English models only. Transcription speed depends on your local CPU / GPU hardware.</div>
                </div>

                <div class="whisper-status-card">
                    <div class="whisper-status-row">
                        <span class="whisper-status-label">Whisper engine:</span>
                        ${this._renderStatusBadge(this._isCheckingWhisper ? 'checking' : engine?.status)}
                    </div>
                    <div class="whisper-status-row">
                        <span class="whisper-status-label">${model?.name || 'Selected model'}:</span>
                        ${this._renderStatusBadge(this._isCheckingWhisper ? 'checking' : model?.status)}
                    </div>
                </div>

                ${
                    isDownloading
                        ? html`
                              <div class="whisper-progress-container" aria-live="polite">
                                  <div class="whisper-progress-header">
                                      <span>${downloadProgress?.label || 'Downloading components...'}</span>
                                      <span>
                                          ${
                                              downloadProgress?.percentage !== null && downloadProgress?.percentage !== undefined
                                                  ? `${downloadProgress.percentage}%`
                                                  : ''
                                          }
                                      </span>
                                  </div>
                                  <div class="whisper-progress-bar-track">
                                      <div
                                          class="whisper-progress-bar-fill ${downloadProgress?.percentage === null ? 'indeterminate' : ''}"
                                          style="width: ${
                                              downloadProgress?.percentage !== null && downloadProgress?.percentage !== undefined
                                                  ? `${downloadProgress.percentage}%`
                                                  : '40%'
                                          }"
                                          role="progressbar"
                                          aria-valuenow="${downloadProgress?.percentage || 0}"
                                          aria-valuemin="0"
                                          aria-valuemax="100"
                                      ></div>
                                  </div>
                                  <div class="whisper-progress-header">
                                      <span>
                                          ${
                                              downloadProgress?.expectedBytes > 0
                                                  ? `${this._formatBytes(downloadProgress.downloadedBytes)} / ${this._formatBytes(downloadProgress.expectedBytes)}`
                                                  : downloadProgress?.downloadedBytes > 0
                                                    ? `${this._formatBytes(downloadProgress.downloadedBytes)} downloaded`
                                                    : ''
                                          }
                                      </span>
                                      <button class="btn-action-sm" type="button" @click=${() => this._cancelWhisperDownload()}>Cancel</button>
                                  </div>
                              </div>
                          `
                        : ''
                }
                ${this._whisperActionError ? html`<div class="form-hint" style="color: var(--danger);">${this._whisperActionError}</div>` : ''}

                <div class="whisper-buttons-row">
                    ${
                        !isDownloading && (needsDownload || needsRepair)
                            ? html`
                                  <button
                                      class="btn-action-sm primary"
                                      type="button"
                                      ?disabled=${this.isSessionActive}
                                      @click=${() => this._downloadWhisper()}
                                  >
                                      ${needsRepair ? 'Download again (Repair)' : 'Download missing files'}
                                  </button>
                              `
                            : ''
                    }

                    <button class="btn-action-sm" type="button" @click=${() => this._openWhisperFolder()}>Open download folder</button>

                    ${
                        !isDownloading && modelReady && !this._confirmDeleteModel
                            ? html`
                                  <button
                                      class="btn-action-sm danger"
                                      type="button"
                                      ?disabled=${this.isSessionActive}
                                      @click=${() => {
                                          this._confirmDeleteModel = true;
                                          this.requestUpdate();
                                      }}
                                  >
                                      Remove model
                                  </button>
                              `
                            : ''
                    }
                </div>

                ${
                    this._confirmDeleteModel
                        ? html`
                              <div class="confirm-delete-box" role="alert">
                                  <span>Remove downloaded file for <strong>${model?.name || this._whisperModel}</strong>?</span>
                                  <div class="whisper-buttons-row" style="margin-top: 2px;">
                                      <button class="btn-action-sm danger" type="button" @click=${() => this._handleDeleteWhisperModel()}>
                                          Confirm Remove
                                      </button>
                                      <button
                                          class="btn-action-sm"
                                          type="button"
                                          @click=${() => {
                                              this._confirmDeleteModel = false;
                                              this.requestUpdate();
                                          }}
                                      >
                                          Cancel
                                      </button>
                                  </div>
                              </div>
                          `
                        : ''
                }
            </div>
        `;
    }

    _handleProfileChange(e) {
        this.onProfileChange(e.target.value);
    }

    _openLocalHelp() {
        this._showLocalHelp = true;
    }

    _closeLocalHelp() {
        this._showLocalHelp = false;
    }

    _handleHelpDialogClick(e) {
        e.stopPropagation();
    }

    // ── Start ──

    _handleStart() {
        if (this.isInitializing || this.downloadProgress.active) return;

        if (this._mode === 'byok') {
            if (!this._geminiKey.trim()) {
                this._keyError = true;
                this.requestUpdate();
                return;
            }
        } else if (this._mode === 'local') {
            if (!this._localLlmModel.trim()) {
                return;
            }
        }

        this.onStart();
    }

    triggerApiKeyError() {
        this._keyError = this._mode !== 'local';
        this.requestUpdate();
        setTimeout(() => {
            this._tokenError = false;
            this._keyError = false;
            this.requestUpdate();
        }, 2000);
    }

    async _handleProfileChange(e) {
        const newProfile = e.target.value;
        this.selectedProfile = newProfile;
        await preechakAi.storage.updatePreference('selectedProfile', newProfile);
        this.onProfileChange(newProfile);
        this.requestUpdate();
    }

    _renderStartButton() {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isDownloading = this._mode === 'local' && this.downloadProgress.active;
        const percentage = this.downloadProgress.percentage;
        const hasPercentage = Number.isFinite(percentage);

        const cmdIcon = html`<svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path
                d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"
            />
        </svg>`;
        const ctrlIcon = html`<svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M6 15l6-6 6 6" />
        </svg>`;
        const enterIcon = html`<svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M9 10l-5 5 5 5" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </svg>`;

        return html`
            <div class="session-mode-bar">
                <label class="session-mode-label">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                    Session Mode
                </label>
                <select class="session-mode-select" .value=${this.selectedProfile} @change=${this._handleProfileChange}>
                    <option value="interview">Job Interview</option>
                    <option value="meeting">Business Meeting</option>
                    <option value="sales">Sales Call</option>
                    <option value="presentation">Presentation</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="exam">Exam Assistant</option>
                </select>
            </div>

            <button
                class="start-button ${this.isInitializing || isDownloading ? 'disabled' : ''}"
                ?disabled=${this.isInitializing || isDownloading}
                @click=${() => this._handleStart()}
            >
                <canvas class="btn-aurora"></canvas>
                <canvas class="btn-dither"></canvas>
                ${
                    isDownloading
                        ? html`<span
                              class="download-progress-fill ${hasPercentage ? '' : 'indeterminate'}"
                              style=${hasPercentage ? `width: ${percentage}%` : ''}
                          ></span>`
                        : ''
                }
                <span class="btn-label">
                    ${isDownloading ? (hasPercentage ? `${percentage}%` : 'Preparing...') : 'Start Session'}
                    ${isDownloading ? '' : html`<span class="shortcut-hint">${isMac ? cmdIcon : ctrlIcon}${enterIcon}</span>`}
                </span>
            </button>
            ${
                isDownloading
                    ? html`
                          <div class="download-controls">
                              <span>Downloading: ${this.downloadProgress.label || 'Local AI files'}</span>
                              <button class="download-cancel" @click=${() => this.onCancelDownload()}>Cancel</button>
                          </div>
                      `
                    : ''
            }
        `;
    }

    _renderDivider() {
        return html`
            <div class="divider">
                <div class="divider-line"></div>
                <span class="divider-text">or</span>
                <div class="divider-line"></div>
            </div>
        `;
    }

    // ── Cloud mode ──
    // Cloud UI intentionally disabled. Backend cloud wiring is still present in
    // the codebase, but the renderer no longer exposes this setup path.

    // ── BYOK mode ──

    _renderConfigChevron() {
        return html`
            <svg class="config-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m5 7.5 5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        `;
    }

    _renderByokMode() {
        return html`
            <details class="config-section">
                <summary class="config-summary">
                    <span class="config-summary-text">
                        <span class="config-summary-title">Gemini API & Connection</span>
                        <span class="config-summary-description"
                            >${this._apiTransportMode === 'http' ? 'HTTP Buffered Requests' : 'WebSocket Live Streaming'}</span
                        >
                    </span>
                    ${this._renderConfigChevron()}
                </summary>
                <div class="config-content">
                    <div class="form-group">
                        <label class="form-label">Gemini API Key</label>
                        <input
                            type="password"
                            placeholder="Required"
                            .value=${this._geminiKey}
                            @input=${e => this._saveGeminiKey(e.target.value)}
                            class=${this._keyError ? 'error' : ''}
                        />
                        <div class="form-hint">
                            <span class="link" @click=${() => this.onExternalLink('https://aistudio.google.com/apikey')}>Get Gemini key</span>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Connection Mode</label>
                        <select .value=${this._apiTransportMode} @change=${e => this._saveApiTransportMode(e.target.value)}>
                            <option value="websocket">Live Streaming (WebSocket) — Gemini Live</option>
                            <option value="http">Buffered Requests (HTTP) — Any Gemini Model</option>
                        </select>
                        <div class="form-hint">
                            ${
                                this._apiTransportMode === 'http'
                                    ? 'Buffers audio segments upon pauses and queries standard Gemini models via HTTP REST.'
                                    : 'Real-time bidirectional WebSocket streaming connection.'
                            }
                        </div>
                    </div>

                    ${
                        this._apiTransportMode === 'http'
                            ? html`
                                  <div class="form-group">
                                      <label class="form-label">Gemini HTTP Model</label>
                                      <input type="text" .value=${this._geminiHttpModel} @input=${e => this._saveGeminiHttpModel(e.target.value)} />
                                      <div class="form-hint">Examples: gemini-3.8-flash, gemini-2.0-flash, gemini-1.5-pro</div>
                                  </div>

                                  <div class="form-group">
                                      <label class="form-label">Audio Transcription</label>
                                      <select
                                          class="control"
                                          .value=${this._geminiHttpTranscriptionMode}
                                          ?disabled=${this.isSessionActive}
                                          @change=${e => this._saveGeminiHttpTranscriptionMode(e.target.value)}
                                      >
                                          <option value="whisper" ?selected=${this._geminiHttpTranscriptionMode === 'whisper'}>
                                              Local Whisper (whisper.cpp · Offline)
                                          </option>
                                          <option value="gemini" ?selected=${this._geminiHttpTranscriptionMode === 'gemini'}>
                                              Google Gemini Cloud
                                          </option>
                                          <option value="none" ?selected=${this._geminiHttpTranscriptionMode === 'none'}>
                                              No Transcription (Manual Screenshots & Text Only)
                                          </option>
                                      </select>
                                      <div class="form-hint">
                                          ${
                                              this._geminiHttpTranscriptionMode === 'whisper'
                                                  ? 'Audio is transcribed locally with whisper.cpp. Only recognized text is sent to Gemini.'
                                                  : this._geminiHttpTranscriptionMode === 'none'
                                                    ? 'Audio listening is disabled. No sound is sent anywhere; ask questions via screenshots or typing.'
                                                    : 'Audio is buffered and transcribed remotely by Google Gemini.'
                                          }
                                      </div>
                                  </div>

                                  ${this._geminiHttpTranscriptionMode === 'whisper' ? this._renderWhisperSection() : ''}
                              `
                            : html`
                                  <div class="form-group">
                                      <label class="form-label">Gemini Live Model</label>
                                      <input type="text" .value=${this._geminiLiveModel} @input=${e => this._saveGeminiLiveModel(e.target.value)} />
                                      <div class="form-hint">Live WebSocket model (e.g. gemini-3.1-flash-live-preview)</div>
                                  </div>
                              `
                    }
                </div>
            </details>

            <details class="config-section">
                <summary class="config-summary">
                    <span class="config-summary-text">
                        <span class="config-summary-title">AI responses</span>
                        <span class="config-summary-description">Groq key and response model</span>
                    </span>
                    ${this._renderConfigChevron()}
                </summary>
                <div class="config-content">
                    <div class="form-group">
                        <label class="form-label">Groq API Key</label>
                        <input type="password" placeholder="Optional" .value=${this._groqKey} @input=${e => this._saveGroqKey(e.target.value)} />
                        <div class="form-hint">
                            <span class="link" @click=${() => this.onExternalLink('https://console.groq.com/keys')}>Get Groq key</span>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Groq Model</label>
                        <input type="text" .value=${this._groqModel} @input=${e => this._saveGroqModel(e.target.value)} />
                    </div>

                    <div class="form-group">
                        <label class="form-label">Groq Image Model</label>
                        <input type="text" .value=${this._groqImageModel} @input=${e => this._saveGroqImageModel(e.target.value)} />
                    </div>

                    <label class="config-checkbox">
                        <input
                            type="checkbox"
                            .checked=${this._disableGroqThinking}
                            @change=${e => this._saveDisableGroqThinking(e.target.checked)}
                        />
                        <span class="config-checkbox-text">
                            <span class="config-summary-title">Disable thinking</span>
                            <span class="config-summary-description">Faster responses with less internal reasoning</span>
                        </span>
                    </label>

                    <div class="config-note">
                        If the Groq API key is empty, Gemini Live is used for answers instead. Its answer quality may be lower.
                    </div>
                </div>
            </details>

            ${this._renderStartButton()} ${this._renderDivider()}

            <!-- Cloud promo intentionally removed from the active UI. -->

            <div class="mode-links">
                <button class="mode-link" @click=${() => this._saveMode('local')}>Use local AI</button>
            </div>
        `;
    }

    // ── Local AI mode ──

    _renderLocalMode() {
        return html`
            <details class="config-section">
                <summary class="config-summary">
                    <span class="config-summary-text">
                        <span class="config-summary-title">Language model</span>
                        <span class="config-summary-description">Local GGUF model</span>
                    </span>
                    ${this._renderConfigChevron()}
                </summary>
                <div class="config-content">
                    <div class="form-group">
                        <label class="form-label">Model</label>
                        <select
                            .value=${this._useCustomLocalLlmModel ? 'custom' : this._localLlmModel}
                            @change=${event => this._selectLocalLlmModel(event.target.value)}
                        >
                            ${LOCAL_LLM_PRESETS.map(preset => html`<option value=${preset.value}>${preset.label}</option>`)}
                            <option value="custom">Custom Hugging Face model or local GGUF…</option>
                        </select>
                        ${
                            this._useCustomLocalLlmModel
                                ? html`
                                      <input
                                          type="text"
                                          placeholder="owner/repository:quant or /absolute/model.gguf"
                                          .value=${this._localLlmModel}
                                          @input=${event => this._saveLocalLlmModel(event.target.value)}
                                      />
                                  `
                                : ''
                        }
                        <div class="form-hint">Sizes include the vision model. Q4 uses less memory; Q8 preserves more quality.</div>
                    </div>
                </div>
            </details>

            <details class="config-section">
                <summary class="config-summary">
                    <span class="config-summary-text">
                        <span class="config-summary-title">Transcription</span>
                        <span class="config-summary-description">Whisper speech-to-text model</span>
                    </span>
                    ${this._renderConfigChevron()}
                </summary>
                <div class="config-content">
                    <div class="form-group">
                        <div class="whisper-label-row">
                            <label class="form-label">Whisper Model</label>
                            ${this.whisperDownloading ? html`<div class="whisper-spinner"></div>` : ''}
                        </div>
                        <select .value=${this._whisperModel} @change=${e => this._saveWhisperModel(e.target.value)}>
                            <option value="tiny.en" ?selected=${this._whisperModel === 'tiny.en'}>Tiny English (75 MB, fastest)</option>
                            <option value="base.en" ?selected=${this._whisperModel === 'base.en'}>Base English (142 MB)</option>
                            <option value="small.en" ?selected=${this._whisperModel === 'small.en'}>Small English (466 MB, most accurate)</option>
                        </select>
                        <div class="form-hint">${this.whisperDownloading ? 'Downloading model...' : 'Downloaded automatically on first use'}</div>
                    </div>
                </div>
            </details>

            ${this._renderStartButton()} ${this._renderDivider()}

            <!-- Cloud promo intentionally removed from the active UI. -->

            <div class="mode-links">
                <button class="mode-link" @click=${() => this._saveMode('byok')}>Use own API keys</button>
            </div>
        `;
    }

    // ── Main render ──

    render() {
        const helpIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0m9 5v.01" />
                <path d="M12 13.5a1.5 1.5 0 0 1 1-1.5a2.6 2.6 0 1 0-3-4" />
            </g>
        </svg>`;
        const closeIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12" />
        </svg>`;

        return html`
            <div class="form-wrapper">
                ${
                    this._mode === 'local'
                        ? html`
                              <div class="title-row">
                                  <div class="page-title">Preechak AI <span class="mode-suffix">Local AI</span></div>
                                  <button class="help-btn" @click=${this._openLocalHelp} aria-label="Open Local AI help">${helpIcon}</button>
                              </div>
                          `
                        : html` <div class="page-title">${html`Preechak AI <span class="mode-suffix">BYOK</span>`}</div> `
                }
                <div class="page-subtitle">${this._mode === 'byok' ? 'Bring your own API keys' : 'Run models locally on your machine'}</div>

                <!-- Cloud mode render branch intentionally disabled. -->
                ${this._mode === 'byok' ? this._renderByokMode() : ''} ${this._mode === 'local' ? this._renderLocalMode() : ''}
            </div>
            ${this._mode === 'local' && this._showLocalHelp ? this._renderLocalHelp(closeIcon) : ''}
        `;
    }

    _renderLocalHelp(closeIcon) {
        return html`
            <div class="help-dialog-backdrop" @click=${this._closeLocalHelp}>
                <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="local-help-title" @click=${this._handleHelpDialogClick}>
                    <div class="help-dialog-header">
                        <div id="local-help-title" class="help-dialog-title">Local AI setup</div>
                        <button class="help-btn" @click=${this._closeLocalHelp} aria-label="Close Local AI help">${closeIcon}</button>
                    </div>

                    <div class="help-content">
                        <div class="help-section">
                            <div class="help-section-title">Native local AI</div>
                            <div class="help-section-text">
                                Preechak AI runs llama.cpp and whisper.cpp directly. Everything stays on your computer — no external AI service or
                                Ollama installation is required.
                            </div>
                        </div>

                        <div class="help-section">
                            <div class="help-section-title">Automatic setup</div>
                            <div class="help-section-text">
                                The correct native runners, selected Whisper model, and language model are downloaded and checksum-verified on first
                                use. They are stored in the Preechak AI config directory.
                            </div>
                        </div>

                        <div class="help-section">
                            <div class="help-section-title">Default model</div>
                            <div class="help-models">
                                <div class="help-model">
                                    <span class="help-model-name">Qwen3.5 4B Q4_K_M</span><span>About 2.7 GB — balanced local quality and speed</span>
                                </div>
                            </div>
                        </div>

                        <div class="help-section">
                            <div class="help-section-title">Whisper</div>
                            <div class="help-section-text">
                                The selected whisper.cpp model is downloaded automatically once and kept in the config directory.
                            </div>
                        </div>

                        <hr class="help-divider" />

                        <div class="help-section">
                            <div class="help-section-title">Computer hanging or slow?</div>
                            <div class="help-section-text">
                                Running models locally uses a lot of RAM and CPU. If your computer slows down or freezes, it's likely the LLM. Switch
                                back to BYOK mode if you want to use a hosted provider instead.
                            </div>
                        </div>

                        <button
                            class="help-cloud-btn"
                            @click=${() => {
                                this._closeLocalHelp();
                                this._saveMode('byok');
                            }}
                        >
                            Switch to BYOK
                        </button>
                    </div>
                </section>
            </div>
        `;
    }
}

customElements.define('main-view', MainView);
