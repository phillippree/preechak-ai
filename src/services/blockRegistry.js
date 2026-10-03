/**
 * Central Block Registry for Composable Session Pipelines
 */

class BlockRegistry {
    constructor() {
        this._blocks = {
            audio: new Map(),
            prompt: new Map(),
            transport: new Map(),
        };
    }

    register(category, id, definition) {
        if (!this._blocks[category]) {
            throw new Error(`Invalid block category: ${category}. Allowed: audio, prompt, transport`);
        }
        if (!id || typeof id !== 'string') {
            throw new Error('Block id must be a non-empty string');
        }
        this._blocks[category].set(id, {
            id,
            category,
            ...definition,
        });
        return this;
    }

    get(category, id) {
        if (!this._blocks[category]) return null;
        return this._blocks[category].get(id) || null;
    }

    list(category) {
        if (!category) {
            return {
                audio: Array.from(this._blocks.audio.values()),
                prompt: Array.from(this._blocks.prompt.values()),
                transport: Array.from(this._blocks.transport.values()),
            };
        }
        if (!this._blocks[category]) return [];
        return Array.from(this._blocks[category].values());
    }

    has(category, id) {
        return !!this.get(category, id);
    }

    clear() {
        this._blocks.audio.clear();
        this._blocks.prompt.clear();
        this._blocks.transport.clear();
    }
}

const defaultRegistry = new BlockRegistry();

module.exports = {
    BlockRegistry,
    defaultRegistry,
};
