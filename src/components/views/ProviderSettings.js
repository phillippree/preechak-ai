import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class ProviderSettings extends LitElement {
    static properties = {
        active: { type: Boolean },
        settings: { state: true },
        geminiKey: { state: true },
        openaiKey: { state: true },
        message: { state: true },
        busy: { state: true },
    };
    static styles = css`
        :host {
            display: block;
            margin: 16px 0;
            color: var(--text-primary);
            font: inherit;
        }
        section {
            padding: 16px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--bg-surface);
        }
        h3 {
            margin: 0 0 12px;
        }
        p {
            font-size: 12px;
            color: var(--text-secondary);
        }
        fieldset {
            border: 0;
            padding: 0;
            margin: 0;
            display: grid;
            gap: 12px;
        }
        label {
            display: grid;
            gap: 6px;
            font-size: 13px;
        }
        input,
        select,
        button {
            font: inherit;
            color: var(--text-primary);
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 5px;
            padding: 8px;
            cursor: default;
            min-width: 0;
        }
        button:hover:enabled {
            background: var(--bg-hover);
            border-color: var(--accent);
        }
        button[aria-pressed='true'] {
            background: var(--accent);
            color: var(--btn-primary-text, #fff);
            border-color: var(--accent);
        }
        button:disabled {
            opacity: 0.5;
        }
        .buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
    `;
    constructor() {
        super();
        this.settings = null;
        this.geminiKey = '';
        this.openaiKey = '';
        this.message = '';
        this.busy = false;
        this.active = false;
    }
    async connectedCallback() {
        super.connectedCallback();
        try {
            this.settings = await this.ipc('ai:get-settings');
        } catch {
            this.message = 'Could not load AI provider settings.';
        }
    }
    ipc(channel, payload) {
        return window.require('electron').ipcRenderer.invoke(channel, payload);
    }
    async save() {
        this.busy = true;
        this.message = '';
        try {
            const result = await this.ipc('ai:save-settings', {
                ...this.settings,
                ...(this.geminiKey ? { geminiApiKey: this.geminiKey } : {}),
                ...(this.openaiKey ? { openaiApiKey: this.openaiKey } : {}),
            });
            if (!result.success) throw new Error(result.error);
            this.settings = result.settings;
            this.geminiKey = '';
            this.openaiKey = '';
            this.message = 'Saved. These selections apply to your next session.';
        } catch (error) {
            this.message = error.message;
        } finally {
            this.busy = false;
        }
    }
    async check(provider) {
        this.busy = true;
        try {
            const result = await this.ipc('ai:check-connection', provider);
            this.message = result.success
                ? 'Connected. Model access and available quota are checked when you start a session or make a request.'
                : result.error;
        } catch {
            this.message = 'Could not check connection.';
        } finally {
            this.busy = false;
        }
    }
    render() {
        const s = this.settings;
        if (!s) return html`<p role="status">${this.message || 'Loading provider settings…'}</p>`;
        return html`<section aria-label="AI providers">
            <h3>AI providers</h3>
            <p>
                Choose before starting a session. Voice transcription and coaching can use different providers. Coaching also handles screenshots and
                typed messages. Conversation Coach is enabled automatically.
            </p>
            <fieldset ?disabled=${this.active || this.busy}>
                <label
                    >Gemini API key ${s.hasGeminiKey ? '(saved)' : ''}<input
                        type="password"
                        autocomplete="off"
                        .value=${this.geminiKey}
                        placeholder="Leave blank to keep saved key"
                        @input=${e => {
                            this.geminiKey = e.target.value;
                        }}
                /></label>
                <label
                    >OpenAI API key ${s.hasOpenAIKey ? '(saved)' : ''}<input
                        type="password"
                        autocomplete="off"
                        .value=${this.openaiKey}
                        placeholder="Leave blank to keep saved key"
                        @input=${e => {
                            this.openaiKey = e.target.value;
                        }}
                /></label>
                ${[
                    ['transcriptionProvider', 'Voice transcription'],
                    ['coachingProvider', 'Coaching and screen analysis'],
                ].map(
                    ([field, label]) => html`
                        <div role="group" aria-label=${label}>
                            <p>${label}</p>
                            <div class="buttons">
                                ${[
                                    ['gemini', 'Gemini'],
                                    ['openai', field === 'transcriptionProvider' ? 'OpenAI · Live Transcribe' : 'OpenAI'],
                                ].map(
                                    ([value, name]) => html`
                                        <button
                                            type="button"
                                            aria-pressed=${s[field] === value}
                                            @click=${() => {
                                                this.settings = { ...s, [field]: value };
                                            }}
                                        >
                                            ${name}
                                        </button>
                                    `
                                )}
                            </div>
                        </div>
                    `
                )}
                <label
                    >Gemini coaching model
                    <input
                        type="text"
                        .value=${s.geminiCoachingModel || 'gemini-3.8-flash'}
                        @input=${e => {
                            this.settings = { ...s, geminiCoachingModel: e.target.value.trim() };
                        }}
                    />
                </label>
                <div role="group" aria-label="OpenAI coaching model">
                    <p>OpenAI coaching model</p>
                    <div class="buttons">
                        ${[
                            ['gpt-6-luna', 'GPT-6 Luna'],
                            ['gpt-6-sol', 'GPT-6 Sol'],
                            ['gpt-6.1-sol', 'GPT-6.1 Sol'],
                        ].map(
                            ([value, name]) => html`
                                <button
                                    type="button"
                                    aria-pressed=${s.openaiCoachingModel === value}
                                    @click=${() => {
                                        this.settings = { ...s, openaiCoachingModel: value };
                                    }}
                                >
                                    ${name}
                                </button>
                            `
                        )}
                    </div>
                </div>
                <div class="buttons">
                    <button @click=${this.save}>Save providers and keys</button
                    ><button ?disabled=${!s.hasGeminiKey} @click=${() => this.check('gemini')}>Check Gemini</button
                    ><button ?disabled=${!s.hasOpenAIKey} @click=${() => this.check('openai')}>Check OpenAI</button>
                </div>
            </fieldset>
            ${this.active ? html`<p>End the current session to change providers.</p>` : ''}
            <p role="status">${this.message}</p>
        </section>`;
    }
}
customElements.define('provider-settings', ProviderSettings);
