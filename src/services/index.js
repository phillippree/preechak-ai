/**
 * Modular Pipeline Services Barrel Export
 */

const { BlockRegistry, defaultRegistry } = require('./blockRegistry');
const { audioBlocks, registerDefaultAudioBlocks } = require('./audioCaptureBlocks');
const { promptBlocks, registerDefaultPromptBlocks } = require('./promptBlocks');
const { transportBlocks, registerDefaultTransportBlocks } = require('./transportBlocks');
const { ProfileOrchestrator, defaultOrchestrator, DEFAULT_PROFILE_RECIPES } = require('./profileOrchestrator');
const { SessionManager, defaultSessionManager } = require('./sessionManager');

module.exports = {
    BlockRegistry,
    defaultRegistry,
    audioBlocks,
    registerDefaultAudioBlocks,
    promptBlocks,
    registerDefaultPromptBlocks,
    transportBlocks,
    registerDefaultTransportBlocks,
    ProfileOrchestrator,
    defaultOrchestrator,
    DEFAULT_PROFILE_RECIPES,
    SessionManager,
    defaultSessionManager,
};
