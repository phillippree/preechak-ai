/**
 * Reusable Audio Capture Blocks
 */

const { defaultRegistry } = require('./blockRegistry');

const audioBlocks = [
    {
        id: 'dual_stream',
        name: 'Dual Stream Capture (Mic + System Audio)',
        description: 'Captures both local microphone and system audio with speaker diarization and turn tracking.',
        config: {
            audioMode: 'both',
            sampleRate: 24000,
            channels: 2,
            chunkDurationSec: 0.1,
            energyThreshold: 60,
        },
        setup({ ipcRenderer, onMicData, onSystemData }) {
            return {
                mode: 'both',
                supportedPlatforms: ['darwin', 'linux', 'win32'],
                requiresSystemAudioDump: process.platform === 'darwin',
            };
        },
    },
    {
        id: 'mic_only',
        name: 'Microphone Only Capture',
        description: 'Captures local user microphone via Web Audio API.',
        config: {
            audioMode: 'mic_only',
            sampleRate: 24000,
            channels: 1,
            chunkDurationSec: 0.1,
        },
        setup() {
            return {
                mode: 'mic_only',
                supportedPlatforms: ['darwin', 'linux', 'win32'],
                requiresSystemAudioDump: false,
            };
        },
    },
    {
        id: 'system_only',
        name: 'System Audio Only Capture',
        description: 'Captures remote party / speaker output only.',
        config: {
            audioMode: 'speaker_only',
            sampleRate: 24000,
            channels: 1,
            chunkDurationSec: 0.1,
        },
        setup() {
            return {
                mode: 'speaker_only',
                supportedPlatforms: ['darwin', 'linux', 'win32'],
                requiresSystemAudioDump: process.platform === 'darwin',
            };
        },
    },
    {
        id: 'vad_chunking',
        name: 'Voice Activity Detection (VAD) Chunking',
        description: 'Buffers audio and packages speech segments on conversational pauses.',
        config: {
            vadThreshold: 95,
            silenceDurationMs: 800,
            maxSegmentDurationSec: 15,
        },
        setup() {
            return {
                mode: 'vad_buffered',
                supportedPlatforms: ['darwin', 'linux', 'win32'],
            };
        },
    },
];

function registerDefaultAudioBlocks(registry = defaultRegistry) {
    for (const block of audioBlocks) {
        registry.register('audio', block.id, block);
    }
}

registerDefaultAudioBlocks();

module.exports = {
    audioBlocks,
    registerDefaultAudioBlocks,
};
