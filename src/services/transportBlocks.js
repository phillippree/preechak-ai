/**
 * Reusable Transport & Gemini Dispatch Blocks
 */

const { defaultRegistry } = require('./blockRegistry');

const transportBlocks = [
    {
        id: 'gemini_live_websocket',
        name: 'Gemini Live WebSocket Transport',
        description: 'Bidirectional low-latency WebSocket connection for streaming conversational audio and real-time responses.',
        type: 'websocket',
        provider: 'gemini',
        config: {
            endpoint: 'live',
            requiresApiKey: true,
            streaming: true,
        },
    },
    {
        id: 'gemini_http_rest',
        name: 'Gemini Buffered HTTP REST Transport',
        description: 'Dispatches buffered voice segments and prompts via HTTP REST requests with VAD segmentation.',
        type: 'http',
        provider: 'gemini',
        config: {
            endpoint: 'generateContent',
            requiresApiKey: true,
            streaming: false,
        },
    },
    {
        id: 'local_offline',
        name: 'Local Offline Runtime (whisper.cpp + llama.cpp)',
        description: 'Offline inference using local whisper.cpp for speech-to-text and llama.cpp for local LLM completion.',
        type: 'local',
        provider: 'localai',
        config: {
            requiresApiKey: false,
            streaming: true,
        },
    },
];

function registerDefaultTransportBlocks(registry = defaultRegistry) {
    for (const block of transportBlocks) {
        registry.register('transport', block.id, block);
    }
}

registerDefaultTransportBlocks();

module.exports = {
    transportBlocks,
    registerDefaultTransportBlocks,
};
