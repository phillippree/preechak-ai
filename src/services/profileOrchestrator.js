/**
 * Profile & Mode Switch Orchestrator
 * Maps profiles/modes into combinations of reusable blocks.
 */

const { defaultRegistry } = require('./blockRegistry');
require('./audioCaptureBlocks');
require('./promptBlocks');
require('./transportBlocks');

const DEFAULT_PROFILE_RECIPES = {
    'job-interview': {
        id: 'job-interview',
        name: 'Job Interview',
        audioBlockId: 'dual_stream',
        promptBlockId: 'job_interview',
        transportBlockId: 'gemini_live_websocket',
        defaultAudioMode: 'both',
    },
    interview: {
        id: 'interview',
        name: 'Job Interview',
        audioBlockId: 'dual_stream',
        promptBlockId: 'job_interview',
        transportBlockId: 'gemini_live_websocket',
        defaultAudioMode: 'both',
    },
    'business-meeting': {
        id: 'business-meeting',
        name: 'Business Meeting',
        audioBlockId: 'dual_stream',
        promptBlockId: 'business_meeting',
        transportBlockId: 'gemini_http_rest',
        defaultAudioMode: 'both',
    },
    meeting: {
        id: 'meeting',
        name: 'Business Meeting',
        audioBlockId: 'dual_stream',
        promptBlockId: 'business_meeting',
        transportBlockId: 'gemini_http_rest',
        defaultAudioMode: 'both',
    },
    'pair-programming': {
        id: 'pair-programming',
        name: 'Pair Programming',
        audioBlockId: 'mic_only',
        promptBlockId: 'pair_programming',
        transportBlockId: 'gemini_http_rest',
        defaultAudioMode: 'mic_only',
    },
    coding: {
        id: 'coding',
        name: 'Pair Programming',
        audioBlockId: 'mic_only',
        promptBlockId: 'pair_programming',
        transportBlockId: 'gemini_http_rest',
        defaultAudioMode: 'mic_only',
    },
    'general-assistant': {
        id: 'general-assistant',
        name: 'General Assistant',
        audioBlockId: 'dual_stream',
        promptBlockId: 'general_assistant',
        transportBlockId: 'gemini_live_websocket',
        defaultAudioMode: 'both',
    },
    general: {
        id: 'general',
        name: 'General Assistant',
        audioBlockId: 'dual_stream',
        promptBlockId: 'general_assistant',
        transportBlockId: 'gemini_live_websocket',
        defaultAudioMode: 'both',
    },
};

class ProfileOrchestrator {
    constructor(registry = defaultRegistry) {
        this.registry = registry;
        this._recipes = new Map(Object.entries(DEFAULT_PROFILE_RECIPES));
        this._activeProfileId = 'job-interview';
        this._listeners = new Set();
    }

    registerRecipe(recipe) {
        if (!recipe || !recipe.id) {
            throw new Error('Recipe must have an id');
        }
        this._recipes.set(recipe.id, recipe);
    }

    getRecipe(profileId) {
        return this._recipes.get(profileId) || this._recipes.get('job-interview');
    }

    listRecipes() {
        return Array.from(this._recipes.values());
    }

    getActiveProfileId() {
        return this._activeProfileId;
    }

    resolvePipeline(profileId = this._activeProfileId, overrides = {}) {
        const recipe = this.getRecipe(profileId);
        const audioBlockId = overrides.audioBlockId || recipe.audioBlockId;
        const promptBlockId = overrides.promptBlockId || recipe.promptBlockId;
        const transportBlockId = overrides.transportBlockId || recipe.transportBlockId;

        const audioBlock = this.registry.get('audio', audioBlockId);
        const promptBlock = this.registry.get('prompt', promptBlockId);
        const transportBlock = this.registry.get('transport', transportBlockId);

        if (!audioBlock) throw new Error(`Audio block not found: ${audioBlockId}`);
        if (!promptBlock) throw new Error(`Prompt block not found: ${promptBlockId}`);
        if (!transportBlock) throw new Error(`Transport block not found: ${transportBlockId}`);

        return {
            recipe,
            blocks: {
                audio: audioBlock,
                prompt: promptBlock,
                transport: transportBlock,
            },
            config: {
                audioMode: overrides.audioMode || recipe.defaultAudioMode || audioBlock.config.audioMode,
                ...overrides,
            },
        };
    }

    setProfile(profileId, overrides = {}) {
        const oldProfileId = this._activeProfileId;
        this._activeProfileId = profileId;
        const pipeline = this.resolvePipeline(profileId, overrides);

        this._emitChange({
            previousProfileId: oldProfileId,
            currentProfileId: profileId,
            pipeline,
        });

        return pipeline;
    }

    onProfileChange(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _emitChange(event) {
        for (const listener of this._listeners) {
            try {
                listener(event);
            } catch (err) {
                console.error('Error in profile change listener:', err);
            }
        }
    }
}

const defaultOrchestrator = new ProfileOrchestrator();

module.exports = {
    ProfileOrchestrator,
    defaultOrchestrator,
    DEFAULT_PROFILE_RECIPES,
};
