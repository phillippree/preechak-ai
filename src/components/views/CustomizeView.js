import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

const DEFAULT_SCREENSHOT_PROMPTS = {
    interview: `Help me on this page, give me the answer no bs, complete answer.
So if its a code question, give me the approach in few bullet points, then the entire code. Also if theres anything else i need to know, tell me.
If its a question about the website, give me the answer no bs, complete answer.
If its a mcq question, give me the answer no bs, complete answer.
If its python code, don't use fancy library just use the basics. Only use advance library if you were told to use it.`,
    meeting: `Analyze this screen for my meeting.
- Summarize key slides, documents, or data in 2-3 concise bullet points.
- Highlight key decisions, metrics, blockers, or deadlines shown.
- Suggest 1-2 direct, ready-to-speak talking points or questions I can contribute.
- List any action items or follow-ups.`,
    sales: `Analyze this prospect screen/document.
- Identify prospect pain points or objections.
- Provide 2-3 persuasive, ready-to-speak talking points and value propositions.
- Suggest direct next steps or closing questions.`,
    presentation: `Review this slide/presentation screen.
- Provide a clear, engaging 2-3 sentence talking point script for this slide.
- Highlight key takeaways and notable numbers or metrics.`,
    negotiation: `Analyze this contract/pricing/proposal screen.
- Identify leverage points, risks, and concessions.
- Provide strategic, ready-to-speak counter-offers and responses.`,
    exam: `Solve the questions visible on this screen directly and concisely.
- For each question, output: **Question**, **Answer**, and a brief **Why**.
- Be direct, accurate, and concise.`,
};

export class CustomizeView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .danger-surface {
                border-color: var(--danger);
            }

            .warning-callout {
                position: relative;
                margin-top: 4px;
                padding: 8px 12px;
                border: 1px solid var(--danger);
                border-radius: var(--radius-sm);
                color: var(--danger);
                font-size: var(--font-size-xs);
                line-height: 1.4;
                background: rgba(239, 68, 68, 0.06);
            }

            .warning-callout::before {
                content: '';
                position: absolute;
                top: -6px;
                left: 16px;
                width: 10px;
                height: 10px;
                background: var(--bg-surface);
                border-top: 1px solid var(--danger);
                border-left: 1px solid var(--danger);
                transform: rotate(45deg);
            }

            .toggle-row {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
                padding: var(--space-sm);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
            }

            .toggle-input {
                width: 14px;
                height: 14px;
                accent-color: var(--text-primary);
                cursor: pointer;
            }

            .toggle-label {
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                cursor: pointer;
                user-select: none;
            }

            .slider-wrap {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: var(--space-xs);
            }

            .slider-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-sm);
            }

            .slider-value {
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 2px 8px;
            }

            .slider-input {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 4px;
                border-radius: 2px;
                background: var(--border);
                outline: none;
                cursor: pointer;
            }

            .slider-input::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--text-primary);
                border: none;
            }

            .slider-input::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--text-primary);
                border: none;
            }

            .keybind-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--space-sm) 0;
                border-bottom: 1px solid var(--border);
            }

            .keybind-row:last-of-type {
                border-bottom: none;
            }

            .keybind-name {
                color: var(--text-secondary);
                font-size: var(--font-size-sm);
            }

            .keybind-input {
                width: 140px;
                text-align: center;
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
            }

            .danger-button {
                border: 1px solid var(--danger);
                color: var(--danger);
                background: transparent;
                border-radius: var(--radius-sm);
                padding: 9px 12px;
                font-size: var(--font-size-sm);
                cursor: pointer;
                transition: background var(--transition);
            }

            .danger-button:hover {
                background: rgba(241, 76, 76, 0.11);
            }

            .danger-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .status {
                margin-top: var(--space-sm);
                padding: var(--space-sm);
                border-radius: var(--radius-sm);
                border: 1px solid var(--border);
                font-size: var(--font-size-xs);
            }

            .status.success {
                border-color: var(--success);
                color: var(--success);
            }

            .status.error {
                border-color: var(--danger);
                color: var(--danger);
            }
        `,
    ];

    static properties = {
        selectedProfile: { type: String },
        promptProfile: { type: String },
        selectedLanguage: { type: String },
        selectedImageQuality: { type: String },
        layoutMode: { type: String },
        keybinds: { type: Object },
        stealthMode: { type: Boolean },
        googleSearchEnabled: { type: Boolean },
        backgroundTransparency: { type: Number },
        fontSize: { type: Number },
        theme: { type: String },
        manualScreenshotPrompt: { type: String },
        screenshotPrompts: { type: Object },
        onProfileChange: { type: Function },
        onLanguageChange: { type: Function },
        onImageQualityChange: { type: Function },
        audioMode: { type: String },
        audioInputDevice: { type: String },
        audioInputDevices: { type: Array, state: true },
        isClearing: { type: Boolean },
        isRestoring: { type: Boolean },
        clearStatusMessage: { type: String },
        clearStatusType: { type: String },
    };

    constructor() {
        super();
        this.selectedProfile = 'interview';
        this.promptProfile = 'interview';
        this.selectedLanguage = 'en-US';
        this.selectedImageQuality = 'medium';
        this.layoutMode = 'normal';
        this.keybinds = this.getDefaultKeybinds();
        this.onProfileChange = () => {};
        this.onLanguageChange = () => {};
        this.onImageQualityChange = () => {};
        this.onLayoutModeChange = () => {};
        this.stealthMode = true;
        this.googleSearchEnabled = true;
        this.isClearing = false;
        this.isRestoring = false;
        this.clearStatusMessage = '';
        this.clearStatusType = '';
        this.backgroundTransparency = 0.8;
        this.fontSize = 20;
        this.audioMode = 'speaker_only';
        this.audioInputDevice = 'default';
        this.audioInputDevices = [];
        this.customPrompt = '';
        this.manualScreenshotPrompt = DEFAULT_SCREENSHOT_PROMPTS.interview;
        this.screenshotPrompts = { ...DEFAULT_SCREENSHOT_PROMPTS };
        this.theme = 'dark';
        this._loadFromStorage();
    }

    getThemes() {
        return preechakAi.theme.getAll();
    }

    async _loadFromStorage() {
        try {
            const [prefs, keybinds] = await Promise.all([preechakAi.storage.getPreferences(), preechakAi.storage.getKeybinds()]);
            this.selectedProfile = prefs.selectedProfile || 'interview';
            this.promptProfile = this.selectedProfile;
            this.screenshotPrompts = prefs.screenshotPrompts || { ...DEFAULT_SCREENSHOT_PROMPTS };
            this.manualScreenshotPrompt =
                this.screenshotPrompts[this.promptProfile] || prefs.manualScreenshotPrompt || DEFAULT_SCREENSHOT_PROMPTS.interview;
            this.stealthMode = prefs.stealthMode ?? true;
            this.googleSearchEnabled = prefs.googleSearchEnabled ?? true;
            this.backgroundTransparency = prefs.backgroundTransparency ?? 0.8;
            this.fontSize = prefs.fontSize ?? 20;
            this.audioMode = prefs.audioMode ?? 'speaker_only';
            this.audioInputDevice = prefs.audioInputDevice || 'default';
            this.customPrompt = prefs.customPrompt ?? '';
            this.theme = prefs.theme ?? 'dark';
            if (keybinds) {
                this.keybinds = { ...this.getDefaultKeybinds(), ...keybinds };
            }
            this.updateBackgroundAppearance();
            this.updateFontSize();
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    getProfiles() {
        return [
            { value: 'interview', name: 'Job Interview' },
            { value: 'sales', name: 'Sales Call' },
            { value: 'meeting', name: 'Business Meeting' },
            { value: 'presentation', name: 'Presentation' },
            { value: 'negotiation', name: 'Negotiation' },
            { value: 'exam', name: 'Exam Assistant' },
        ];
    }

    getLanguages() {
        return [
            { value: 'en-US', name: 'English (US)' },
            { value: 'en-GB', name: 'English (UK)' },
            { value: 'en-AU', name: 'English (Australia)' },
            { value: 'en-IN', name: 'English (India)' },
            { value: 'de-DE', name: 'German (Germany)' },
            { value: 'es-US', name: 'Spanish (US)' },
            { value: 'es-ES', name: 'Spanish (Spain)' },
            { value: 'fr-FR', name: 'French (France)' },
            { value: 'fr-CA', name: 'French (Canada)' },
            { value: 'hi-IN', name: 'Hindi (India)' },
            { value: 'pt-BR', name: 'Portuguese (Brazil)' },
            { value: 'ar-XA', name: 'Arabic (Generic)' },
            { value: 'id-ID', name: 'Indonesian (Indonesia)' },
            { value: 'it-IT', name: 'Italian (Italy)' },
            { value: 'ja-JP', name: 'Japanese (Japan)' },
            { value: 'tr-TR', name: 'Turkish (Turkey)' },
            { value: 'vi-VN', name: 'Vietnamese (Vietnam)' },
            { value: 'bn-IN', name: 'Bengali (India)' },
            { value: 'gu-IN', name: 'Gujarati (India)' },
            { value: 'kn-IN', name: 'Kannada (India)' },
            { value: 'ml-IN', name: 'Malayalam (India)' },
            { value: 'mr-IN', name: 'Marathi (India)' },
            { value: 'ta-IN', name: 'Tamil (India)' },
            { value: 'te-IN', name: 'Telugu (India)' },
            { value: 'nl-NL', name: 'Dutch (Netherlands)' },
            { value: 'ko-KR', name: 'Korean (South Korea)' },
            { value: 'cmn-CN', name: 'Mandarin Chinese (China)' },
            { value: 'pl-PL', name: 'Polish (Poland)' },
            { value: 'ru-RU', name: 'Russian (Russia)' },
            { value: 'th-TH', name: 'Thai (Thailand)' },
        ];
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadAudioInputDevices();
        this._onDeviceChange = () => this._loadAudioInputDevices();
        if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', this._onDeviceChange);
        }

        this._onOpacityChanged = e => {
            if (e.detail && e.detail.opacity !== undefined) {
                this.backgroundTransparency = e.detail.opacity;
                this.requestUpdate();
            }
        };
        this._onStealthModeChanged = e => {
            if (e.detail && e.detail.stealthMode !== undefined) {
                this.stealthMode = e.detail.stealthMode;
                this.requestUpdate();
            }
        };
        window.addEventListener('opacity-changed', this._onOpacityChanged);
        window.addEventListener('stealth-mode-changed', this._onStealthModeChanged);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._onDeviceChange && typeof navigator !== 'undefined' && navigator.mediaDevices) {
            navigator.mediaDevices.removeEventListener('devicechange', this._onDeviceChange);
        }
        if (this._onOpacityChanged) {
            window.removeEventListener('opacity-changed', this._onOpacityChanged);
        }
        if (this._onStealthModeChanged) {
            window.removeEventListener('stealth-mode-changed', this._onStealthModeChanged);
        }
    }

    async _loadAudioInputDevices() {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const inputs = devices.filter(d => d.kind === 'audioinput');
                this.audioInputDevices = inputs;
                this.requestUpdate();
            } catch (err) {
                console.warn('Failed to enumerate audio input devices:', err);
            }
        }
    }

    getDefaultKeybinds() {
        const isMac = preechakAi.isMacOS || navigator.platform.includes('Mac');
        return {
            moveUp: isMac ? 'Alt+Up' : 'Ctrl+Up',
            moveDown: isMac ? 'Alt+Down' : 'Ctrl+Down',
            moveLeft: isMac ? 'Alt+Left' : 'Ctrl+Left',
            moveRight: isMac ? 'Alt+Right' : 'Ctrl+Right',
            toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
            toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
            toggleStealthMode: isMac ? 'Cmd+Shift+H' : 'Ctrl+Shift+H',
            nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
            previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
            nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
            scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
            scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
            increaseOpacity: 'Alt+.',
            decreaseOpacity: 'Alt+,',
        };
    }

    getKeybindActions() {
        return [
            { key: 'moveUp', name: 'Move Window Up', description: 'Move the app window up' },
            { key: 'moveDown', name: 'Move Window Down', description: 'Move the app window down' },
            { key: 'moveLeft', name: 'Move Window Left', description: 'Move the app window left' },
            { key: 'moveRight', name: 'Move Window Right', description: 'Move the app window right' },
            { key: 'toggleVisibility', name: 'Toggle Visibility', description: 'Show or hide the app window' },
            { key: 'toggleClickThrough', name: 'Toggle Click-through', description: 'Enable or disable click-through mode' },
            { key: 'toggleStealthMode', name: 'Toggle Stealth Mode', description: 'Toggle screen capture protection & stealth' },
            { key: 'nextStep', name: 'Ask Next Step', description: 'Take screenshot and ask for next step' },
            { key: 'previousResponse', name: 'Previous Response', description: 'Move to previous AI response' },
            { key: 'nextResponse', name: 'Next Response', description: 'Move to next AI response' },
            { key: 'scrollUp', name: 'Scroll Response Up', description: 'Scroll response content upward' },
            { key: 'scrollDown', name: 'Scroll Response Down', description: 'Scroll response content downward' },
            { key: 'increaseOpacity', name: 'Increase Opacity', description: 'Make window less transparent (+10%)' },
            { key: 'decreaseOpacity', name: 'Decrease Opacity', description: 'Make window more transparent (-10%)' },
        ];
    }

    async saveKeybinds() {
        await preechakAi.storage.setKeybinds(this.keybinds);
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('update-keybinds', this.keybinds);
        }
    }

    handleProfileSelect(e) {
        this.selectedProfile = e.target.value;
        this.onProfileChange(this.selectedProfile);
    }

    handleLanguageSelect(e) {
        this.selectedLanguage = e.target.value;
        this.onLanguageChange(this.selectedLanguage);
    }

    handleImageQualitySelect(e) {
        this.selectedImageQuality = e.target.value;
        this.onImageQualityChange(this.selectedImageQuality);
    }

    handleLayoutModeSelect(e) {
        this.layoutMode = e.target.value;
        this.onLayoutModeChange(this.layoutMode);
    }

    async handleCustomPromptInput(e) {
        this.customPrompt = e.target.value;
        await preechakAi.storage.updatePreference('customPrompt', this.customPrompt);
    }

    async handleAudioModeSelect(e) {
        this.audioMode = e.target.value;
        await preechakAi.storage.updatePreference('audioMode', this.audioMode);
        this.requestUpdate();
    }

    async handleAudioInputDeviceSelect(e) {
        this.audioInputDevice = e.target.value;
        await preechakAi.storage.updatePreference('audioInputDevice', this.audioInputDevice);
        this.requestUpdate();
    }

    async handleThemeChange(e) {
        this.theme = e.target.value;
        await preechakAi.theme.save(this.theme);
        this.updateBackgroundAppearance();
        this.requestUpdate();
    }

    async handleStealthModeChange(e) {
        this.stealthMode = e.target.checked;
        await preechakAi.storage.updatePreference('stealthMode', this.stealthMode);
        if (window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('set-stealth-mode', this.stealthMode);
            } catch (error) {
                console.error('Failed to set stealth mode:', error);
            }
        }
        this.requestUpdate();
    }

    async handleGoogleSearchChange(e) {
        this.googleSearchEnabled = e.target.checked;
        await preechakAi.storage.updatePreference('googleSearchEnabled', this.googleSearchEnabled);
        if (window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('update-google-search-setting', this.googleSearchEnabled);
            } catch (error) {
                console.error('Failed to notify main process:', error);
            }
        }
        this.requestUpdate();
    }

    async handleBackgroundTransparencyChange(e) {
        this.backgroundTransparency = parseFloat(e.target.value);
        await preechakAi.storage.updatePreference('backgroundTransparency', this.backgroundTransparency);
        this.updateBackgroundAppearance();
        this.requestUpdate();
    }

    updateBackgroundAppearance() {
        const colors = preechakAi.theme.get(this.theme);
        preechakAi.theme.applyBackgrounds(colors.background, this.backgroundTransparency);
    }

    async handleFontSizeChange(e) {
        this.fontSize = parseInt(e.target.value, 10);
        await preechakAi.storage.updatePreference('fontSize', this.fontSize);
        this.updateFontSize();
        this.requestUpdate();
    }

    updateFontSize() {
        document.documentElement.style.setProperty('--response-font-size', `${this.fontSize}px`);
    }

    handlePromptProfileChange(e) {
        this.promptProfile = e.target.value;
        this.manualScreenshotPrompt = this.screenshotPrompts[this.promptProfile] || DEFAULT_SCREENSHOT_PROMPTS[this.promptProfile] || '';
        this.requestUpdate();
    }

    async handleManualScreenshotPromptChange(e) {
        this.manualScreenshotPrompt = e.target.value;
        this.screenshotPrompts = {
            ...this.screenshotPrompts,
            [this.promptProfile]: this.manualScreenshotPrompt,
        };
        await preechakAi.storage.updatePreference('screenshotPrompts', this.screenshotPrompts);
        if (this.promptProfile === this.selectedProfile) {
            await preechakAi.storage.updatePreference('manualScreenshotPrompt', this.manualScreenshotPrompt);
        }
    }

    async resetManualScreenshotPrompt() {
        const defaultPrompt = DEFAULT_SCREENSHOT_PROMPTS[this.promptProfile] || DEFAULT_SCREENSHOT_PROMPTS.interview;
        this.manualScreenshotPrompt = defaultPrompt;
        this.screenshotPrompts = {
            ...this.screenshotPrompts,
            [this.promptProfile]: defaultPrompt,
        };
        await preechakAi.storage.updatePreference('screenshotPrompts', this.screenshotPrompts);
        if (this.promptProfile === this.selectedProfile) {
            await preechakAi.storage.updatePreference('manualScreenshotPrompt', defaultPrompt);
        }
        this.requestUpdate();
    }

    handleKeybindChange(action, value) {
        this.keybinds = { ...this.keybinds, [action]: value };
        this.saveKeybinds();
        this.requestUpdate();
    }

    handleKeybindFocus(e) {
        e.target.placeholder = 'Press key combination...';
        e.target.select();
    }

    handleKeybindInput(e) {
        e.preventDefault();
        const modifiers = [];
        if (e.ctrlKey) modifiers.push('Ctrl');
        if (e.metaKey) modifiers.push('Cmd');
        if (e.altKey) modifiers.push('Alt');
        if (e.shiftKey) modifiers.push('Shift');
        let mainKey = e.key;

        switch (e.code) {
            case 'ArrowUp':
                mainKey = 'Up';
                break;
            case 'ArrowDown':
                mainKey = 'Down';
                break;
            case 'ArrowLeft':
                mainKey = 'Left';
                break;
            case 'ArrowRight':
                mainKey = 'Right';
                break;
            case 'Enter':
                mainKey = 'Enter';
                break;
            case 'Space':
                mainKey = 'Space';
                break;
            case 'Backslash':
                mainKey = '\\';
                break;
            default:
                if (e.key.length === 1) mainKey = e.key.toUpperCase();
                break;
        }

        if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;

        const action = e.target.dataset.action;
        const keybind = [...modifiers, mainKey].join('+');
        this.handleKeybindChange(action, keybind);
        e.target.value = keybind;
        e.target.blur();
    }

    async resetKeybinds() {
        this.keybinds = this.getDefaultKeybinds();
        await preechakAi.storage.setKeybinds(null);
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('update-keybinds', this.keybinds);
        }
        this.requestUpdate();
    }

    async restoreAllSettings() {
        if (this.isRestoring) return;
        this.isRestoring = true;
        this.clearStatusMessage = '';
        this.clearStatusType = '';
        this.requestUpdate();
        try {
            // Restore all preferences to defaults
            const defaults = {
                customPrompt: '',
                customPrompts: {
                    interview: '',
                    meeting: '',
                    sales: '',
                    presentation: '',
                    negotiation: '',
                    exam: '',
                },
                selectedProfile: 'interview',
                selectedLanguage: 'en-US',
                selectedScreenshotInterval: '5',
                selectedImageQuality: 'medium',
                audioMode: 'speaker_only',
                fontSize: 20,
                backgroundTransparency: 0.8,
                stealthMode: true,
                googleSearchEnabled: false,
                manualScreenshotPrompt: DEFAULT_SCREENSHOT_PROMPTS.interview,
                screenshotPrompts: { ...DEFAULT_SCREENSHOT_PROMPTS },
                theme: 'dark',
            };
            for (const [key, value] of Object.entries(defaults)) {
                await preechakAi.storage.updatePreference(key, value);
            }

            // Restore keybinds
            this.keybinds = this.getDefaultKeybinds();
            await preechakAi.storage.setKeybinds(null);
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('update-keybinds', this.keybinds);
                await ipcRenderer.invoke('set-stealth-mode', true);
            }

            // Apply to local state
            this.selectedProfile = defaults.selectedProfile;
            this.promptProfile = defaults.selectedProfile;
            this.selectedLanguage = defaults.selectedLanguage;
            this.selectedImageQuality = defaults.selectedImageQuality;
            this.audioMode = defaults.audioMode;
            this.fontSize = defaults.fontSize;
            this.backgroundTransparency = defaults.backgroundTransparency;
            this.stealthMode = defaults.stealthMode;
            this.googleSearchEnabled = defaults.googleSearchEnabled;
            this.customPrompt = defaults.customPrompt;
            this.screenshotPrompts = { ...DEFAULT_SCREENSHOT_PROMPTS };
            this.manualScreenshotPrompt = DEFAULT_SCREENSHOT_PROMPTS.interview;
            this.theme = defaults.theme;

            // Notify parent callbacks
            this.onProfileChange(defaults.selectedProfile);
            this.onLanguageChange(defaults.selectedLanguage);
            this.onImageQualityChange(defaults.selectedImageQuality);

            // Apply visual changes
            this.updateBackgroundAppearance();
            this.updateFontSize();
            await preechakAi.theme.save(defaults.theme);

            this.clearStatusMessage = 'All settings restored to defaults';
            this.clearStatusType = 'success';
        } catch (error) {
            console.error('Error restoring settings:', error);
            this.clearStatusMessage = `Error restoring settings: ${error.message}`;
            this.clearStatusType = 'error';
        } finally {
            this.isRestoring = false;
            this.requestUpdate();
        }
    }

    async clearLocalData() {
        if (this.isClearing) return;
        this.isClearing = true;
        this.clearStatusMessage = '';
        this.clearStatusType = '';
        this.requestUpdate();
        try {
            await preechakAi.storage.clearAll();
            this.clearStatusMessage = 'Successfully cleared all local data';
            this.clearStatusType = 'success';
            this.requestUpdate();
            setTimeout(() => {
                this.clearStatusMessage = 'Closing application...';
                this.requestUpdate();
                setTimeout(async () => {
                    if (window.require) {
                        const { ipcRenderer } = window.require('electron');
                        await ipcRenderer.invoke('quit-application');
                    }
                }, 1000);
            }, 2000);
        } catch (error) {
            console.error('Error clearing data:', error);
            this.clearStatusMessage = `Error clearing data: ${error.message}`;
            this.clearStatusType = 'error';
        } finally {
            this.isClearing = false;
            this.requestUpdate();
        }
    }

    renderAudioSection() {
        return html`
            <section class="surface">
                <div class="surface-title">Audio Input</div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Audio Mode</label>
                        <select class="control" .value=${this.audioMode} @change=${this.handleAudioModeSelect}>
                            <option value="speaker_only">Speaker Only (Interviewer)</option>
                            <option value="mic_only">Microphone Only (Me)</option>
                            <option value="both">Both Speaker and Microphone</option>
                        </select>
                    </div>
                    ${
                        this.audioMode !== 'speaker_only'
                            ? html`
                                  <div class="form-group">
                                      <label class="form-label">Microphone Device</label>
                                      <select class="control" .value=${this.audioInputDevice} @change=${this.handleAudioInputDeviceSelect}>
                                          <option value="default">Default System Microphone</option>
                                          ${this.audioInputDevices.map(
                                              (device, idx) => html`
                                                  <option value=${device.deviceId}>${device.label || `Microphone ${idx + 1}`}</option>
                                              `
                                          )}
                                      </select>
                                  </div>
                              `
                            : ''
                    }
                    <div class="form-group">
                        <label class="form-label">Image Quality</label>
                        <select class="control" .value=${this.selectedImageQuality} @change=${this.handleImageQualitySelect}>
                            <option value="high">High Quality</option>
                            <option value="medium">Medium Quality</option>
                            <option value="low">Low Quality</option>
                        </select>
                    </div>
                </div>
            </section>
        `;
    }

    renderLanguageSection() {
        return html`
            <section class="surface">
                <div class="surface-title">Language</div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Speech Language</label>
                        <select class="control" .value=${this.selectedLanguage} @change=${this.handleLanguageSelect}>
                            ${this.getLanguages().map(language => html`<option value=${language.value}>${language.name}</option>`)}
                        </select>
                    </div>
                </div>
            </section>
        `;
    }

    renderAppearanceSection() {
        return html`
            <section class="surface">
                <div class="surface-title">Appearance</div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Theme</label>
                        <select class="control" .value=${this.theme} @change=${this.handleThemeChange}>
                            ${this.getThemes().map(theme => html`<option value=${theme.value}>${theme.name}</option>`)}
                        </select>
                    </div>
                    <div class="form-group slider-wrap">
                        <div class="slider-header">
                            <label class="form-label">Background Transparency</label>
                            <span class="slider-value">${Math.round(this.backgroundTransparency * 100)}%</span>
                        </div>
                        <input
                            class="slider-input"
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            .value=${this.backgroundTransparency}
                            @input=${this.handleBackgroundTransparencyChange}
                        />
                    </div>
                    <div class="form-group slider-wrap">
                        <div class="slider-header">
                            <label class="form-label">Response Font Size</label>
                            <span class="slider-value">${this.fontSize}px</span>
                        </div>
                        <input
                            class="slider-input"
                            type="range"
                            min="12"
                            max="32"
                            step="1"
                            .value=${this.fontSize}
                            @input=${this.handleFontSizeChange}
                        />
                    </div>
                </div>
            </section>
        `;
    }

    renderStealthSection() {
        return html`
            <section class="surface">
                <div class="surface-title">Stealth & Screen Protection</div>
                <div class="form-grid">
                    <div class="toggle-row">
                        <input
                            type="checkbox"
                            id="stealthModeToggle"
                            class="toggle-input"
                            .checked=${this.stealthMode}
                            @change=${this.handleStealthModeChange}
                        />
                        <label for="stealthModeToggle" class="toggle-label">
                            Enable Content Protection & Stealth (Hides window from screen shares, recordings, screenshots, and Mission Control)
                        </label>
                    </div>
                </div>
            </section>
        `;
    }

    renderKeyboardSection() {
        return html`
            <section class="surface">
                <div class="surface-title">Keyboard Shortcuts</div>
                ${this.getKeybindActions().map(
                    action => html`
                        <div class="keybind-row">
                            <span class="keybind-name">${action.name}</span>
                            <input
                                type="text"
                                class="control keybind-input"
                                .value=${this.keybinds[action.key]}
                                data-action=${action.key}
                                @keydown=${this.handleKeybindInput}
                                @focus=${this.handleKeybindFocus}
                                readonly
                            />
                        </div>
                    `
                )}
                <div style="margin-top: var(--space-sm);">
                    <button class="control" style="width:auto;padding:8px 10px;" @click=${this.resetKeybinds}>Reset to defaults</button>
                </div>
            </section>
        `;
    }

    renderPrivacySection() {
        return html`
            <section class="surface danger-surface">
                <div class="surface-title danger">Privacy and Data</div>
                <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;">
                    <button class="danger-button" @click=${this.restoreAllSettings} ?disabled=${this.isRestoring}>
                        ${this.isRestoring ? 'Restoring...' : 'Restore all settings'}
                    </button>
                    <button class="danger-button" @click=${this.clearLocalData} ?disabled=${this.isClearing}>
                        ${this.isClearing ? 'Clearing...' : 'Delete all data'}
                    </button>
                </div>
                ${
                    this.clearStatusMessage
                        ? html` <div class="status ${this.clearStatusType === 'success' ? 'success' : 'error'}">${this.clearStatusMessage}</div> `
                        : ''
                }
            </section>
        `;
    }

    renderScreenCaptureSection() {
        const currentProfileName = this.getProfiles().find(p => p.value === this.promptProfile)?.name || this.promptProfile;

        return html`
            <section class="surface">
                <div
                    style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-sm); flex-wrap:wrap; gap:var(--space-xs);"
                >
                    <div class="surface-title" style="margin-bottom:0;">Screen Capture Prompt</div>
                    <div style="display:flex; align-items:center; gap:var(--space-xs);">
                        <label class="form-label" style="margin-bottom:0; font-size:var(--font-size-xs);">Mode:</label>
                        <select
                            class="control"
                            style="width:auto; padding:4px 8px; font-size:var(--font-size-xs);"
                            .value=${this.promptProfile}
                            @change=${this.handlePromptProfileChange}
                        >
                            ${this.getProfiles().map(profile => html`<option value=${profile.value}>${profile.name}</option>`)}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Instruction Prompt for Screenshots (${currentProfileName})</label>
                    <textarea
                        class="control"
                        style="height: 120px; font-family: var(--font); font-size: var(--font-size-xs); line-height: 1.5; resize: vertical; padding: 8px 10px;"
                        .value=${this.manualScreenshotPrompt}
                        @input=${this.handleManualScreenshotPromptChange}
                        placeholder="Enter instructions for screen capture analysis in ${currentProfileName} mode..."
                    ></textarea>
                    <div style="margin-top: var(--space-xs); display: flex; justify-content: space-between; align-items: center;">
                        <div class="form-help" style="font-size: var(--font-size-xs); color: var(--text-muted);">
                            Injected when capturing screen in ${currentProfileName} mode.
                        </div>
                        <button
                            class="control"
                            style="width: auto; padding: 6px 10px; font-size: var(--font-size-xs);"
                            @click=${this.resetManualScreenshotPrompt}
                        >
                            Reset to default for ${currentProfileName}
                        </button>
                    </div>
                </div>
            </section>
        `;
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">Settings</div>
                    ${this.renderAudioSection()} ${this.renderLanguageSection()} ${this.renderAppearanceSection()} ${this.renderStealthSection()}
                    ${this.renderScreenCaptureSection()} ${this.renderKeyboardSection()} ${this.renderPrivacySection()}
                </div>
            </div>
        `;
    }
}

customElements.define('customize-view', CustomizeView);
