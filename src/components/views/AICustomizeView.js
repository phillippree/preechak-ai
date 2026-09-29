import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class AICustomizeView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .unified-page {
                height: 100%;
            }
            .unified-wrap {
                height: 100%;
            }
            section.surface {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .form-grid {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .form-group.vertical {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            textarea.control {
                flex: 1;
                resize: none;
                overflow-y: auto;
                min-height: 0;
            }
        `,
    ];

    static properties = {
        selectedProfile: { type: String },
        onProfileChange: { type: Function },
        _context: { state: true },
        _customPrompts: { state: true },
    };

    constructor() {
        super();
        this.selectedProfile = 'interview';
        this.onProfileChange = () => {};
        this._context = '';
        this._customPrompts = {};
        this._loadFromStorage();
    }

    async _loadFromStorage() {
        try {
            const prefs = await preechakAi.storage.getPreferences();
            this._customPrompts = prefs.customPrompts || {};
            this.selectedProfile = prefs.selectedProfile || 'interview';
            this._context = this._customPrompts[this.selectedProfile] || prefs.customPrompt || '';
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading AI customize storage:', error);
        }
    }

    async _handleProfileChange(e) {
        const newProfile = e.target.value;
        this.selectedProfile = newProfile;
        this._context = this._customPrompts[newProfile] || '';
        await preechakAi.storage.updatePreference('selectedProfile', newProfile);
        await preechakAi.storage.updatePreference('customPrompt', this._context);
        this.onProfileChange(newProfile);
        this.requestUpdate();
    }

    async _saveContext(val) {
        this._context = val;
        this._customPrompts = {
            ...this._customPrompts,
            [this.selectedProfile]: val,
        };
        await preechakAi.storage.updatePreference('customPrompts', this._customPrompts);
        await preechakAi.storage.updatePreference('customPrompt', val);
    }

    _getProfileName(profile) {
        const names = {
            interview: 'Job Interview',
            sales: 'Sales Call',
            meeting: 'Business Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam Assistant',
        };
        return names[profile] || profile;
    }

    _getPlaceholder(profile) {
        const placeholders = {
            interview: 'Resume details, target role, technical stack, key achievements, brevity constraints...',
            meeting: 'Meeting agenda, project scope, attendee roles, metrics to focus on, action items...',
            sales: 'Product USP, competitor battlecards, pricing model, prospect pain points...',
            presentation: 'Talk topic, key audience takeaways, time limit, tone/style...',
            negotiation: 'Target price/terms, fallback positions, red lines, leverage points...',
            exam: 'Course subject, formula sheets, special rules or answer format constraints...',
        };
        return placeholders[profile] || 'Custom instructions, role requirements, constraints...';
    }

    render() {
        const profiles = [
            { value: 'interview', label: 'Job Interview' },
            { value: 'sales', label: 'Sales Call' },
            { value: 'meeting', label: 'Business Meeting' },
            { value: 'presentation', label: 'Presentation' },
            { value: 'negotiation', label: 'Negotiation' },
            { value: 'exam', label: 'Exam Assistant' },
        ];

        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div>
                        <div class="page-title">AI Context</div>
                    </div>

                    <section class="surface">
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Active Mode / Profile</label>
                                <select class="control" .value=${this.selectedProfile} @change=${this._handleProfileChange}>
                                    ${profiles.map(profile => html`<option value=${profile.value}>${profile.label}</option>`)}
                                </select>
                            </div>
                            <div class="form-group vertical">
                                <label class="form-label">Custom Instructions for ${this._getProfileName(this.selectedProfile)}</label>
                                <textarea
                                    class="control"
                                    placeholder=${this._getPlaceholder(this.selectedProfile)}
                                    .value=${this._context}
                                    @input=${e => this._saveContext(e.target.value)}
                                ></textarea>
                                <div class="form-help">
                                    Injected into session prompt when running in ${this._getProfileName(this.selectedProfile)} mode.
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;
    }
}

customElements.define('ai-customize-view', AICustomizeView);
