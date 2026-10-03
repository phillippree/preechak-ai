const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    BlockRegistry,
    defaultRegistry,
    ProfileOrchestrator,
    defaultOrchestrator,
    SessionManager,
    defaultSessionManager,
} = require('../src/services');

test('BlockRegistry properly registers, queries, and validates blocks', async () => {
    const registry = new BlockRegistry();

    // Verify initially empty
    assert.deepEqual(registry.list('audio'), []);
    assert.deepEqual(registry.list('prompt'), []);
    assert.deepEqual(registry.list('transport'), []);

    // Register a custom block
    registry.register('audio', 'custom_dual_mic', {
        name: 'Custom Dual Mic',
        config: { sampleRate: 16000 },
    });

    assert.equal(registry.has('audio', 'custom_dual_mic'), true);
    assert.equal(registry.has('audio', 'non_existent'), false);

    const block = registry.get('audio', 'custom_dual_mic');
    assert.equal(block.id, 'custom_dual_mic');
    assert.equal(block.category, 'audio');
    assert.equal(block.name, 'Custom Dual Mic');
    assert.equal(block.config.sampleRate, 16000);

    // Reject invalid category
    assert.throws(() => {
        registry.register('invalid_cat', 'test_id', {});
    }, /Invalid block category/);

    // Reject empty id
    assert.throws(() => {
        registry.register('audio', '', {});
    }, /Block id must be a non-empty string/);
});

test('defaultRegistry contains pre-registered core audio, prompt, and transport blocks', async () => {
    assert.ok(defaultRegistry.has('audio', 'dual_stream'));
    assert.ok(defaultRegistry.has('audio', 'mic_only'));
    assert.ok(defaultRegistry.has('audio', 'system_only'));
    assert.ok(defaultRegistry.has('audio', 'vad_chunking'));

    assert.ok(defaultRegistry.has('prompt', 'job_interview'));
    assert.ok(defaultRegistry.has('prompt', 'business_meeting'));
    assert.ok(defaultRegistry.has('prompt', 'pair_programming'));

    assert.ok(defaultRegistry.has('transport', 'gemini_live_websocket'));
    assert.ok(defaultRegistry.has('transport', 'gemini_http_rest'));
    assert.ok(defaultRegistry.has('transport', 'local_offline'));
});

test('ProfileOrchestrator resolves default recipes and allows profile switching', async () => {
    const orchestrator = new ProfileOrchestrator(defaultRegistry);

    // Resolve Job Interview pipeline
    const interviewPipeline = orchestrator.resolvePipeline('job-interview');
    assert.equal(interviewPipeline.recipe.id, 'job-interview');
    assert.equal(interviewPipeline.blocks.audio.id, 'dual_stream');
    assert.equal(interviewPipeline.blocks.prompt.id, 'job_interview');
    assert.equal(interviewPipeline.blocks.transport.id, 'gemini_live_websocket');

    // Resolve interview alias
    const interviewAlias = orchestrator.resolvePipeline('interview');
    assert.equal(interviewAlias.recipe.id, 'interview');
    assert.equal(interviewAlias.blocks.prompt.id, 'job_interview');

    // Resolve Business Meeting pipeline
    const meetingPipeline = orchestrator.resolvePipeline('business-meeting');
    assert.equal(meetingPipeline.recipe.id, 'business-meeting');
    assert.equal(meetingPipeline.blocks.audio.id, 'dual_stream');
    assert.equal(meetingPipeline.blocks.prompt.id, 'business_meeting');
    assert.equal(meetingPipeline.blocks.transport.id, 'gemini_http_rest');

    // Resolve meeting, coding, and general aliases
    assert.equal(orchestrator.resolvePipeline('meeting').blocks.prompt.id, 'business_meeting');
    assert.equal(orchestrator.resolvePipeline('coding').blocks.prompt.id, 'pair_programming');
    assert.equal(orchestrator.resolvePipeline('general').blocks.prompt.id, 'general_assistant');

    // Resolve with custom block overrides
    const customPipeline = orchestrator.resolvePipeline('job-interview', {
        promptBlockId: 'pair_programming',
    });
    assert.equal(customPipeline.blocks.audio.id, 'dual_stream');
    assert.equal(customPipeline.blocks.prompt.id, 'pair_programming');

    // Test profile change event listener
    let changeEvent = null;
    orchestrator.onProfileChange(evt => {
        changeEvent = evt;
    });

    orchestrator.setProfile('pair-programming');
    assert.ok(changeEvent);
    assert.equal(changeEvent.currentProfileId, 'pair-programming');
    assert.equal(changeEvent.pipeline.blocks.prompt.id, 'pair_programming');
});

test('SessionManager manages complete lifecycle state transitions and dynamic profile switching', async () => {
    const orchestrator = new ProfileOrchestrator(defaultRegistry);
    const sessionMgr = new SessionManager(orchestrator);

    const recordedEvents = [];
    sessionMgr.onEvent(evt => recordedEvents.push(evt));

    assert.equal(sessionMgr.getState(), 'idle');
    assert.equal(sessionMgr.isActive(), false);

    // 1. Start Session
    const activePipeline = await sessionMgr.start({ profile: 'job-interview' });
    assert.equal(sessionMgr.getState(), 'active');
    assert.equal(sessionMgr.isActive(), true);
    assert.ok(sessionMgr.startTime > 0);
    assert.equal(activePipeline.blocks.prompt.id, 'job_interview');

    // 2. Switch mode while session is active
    const updatedPipeline = sessionMgr.switchProfile('business-meeting');
    assert.equal(sessionMgr.isActive(), true);
    assert.equal(updatedPipeline.blocks.prompt.id, 'business_meeting');
    assert.equal(sessionMgr.activePipeline.blocks.prompt.id, 'business_meeting');

    // 3. Stop Session
    await sessionMgr.stop();
    assert.equal(sessionMgr.getState(), 'idle');
    assert.equal(sessionMgr.isActive(), false);
    assert.equal(sessionMgr.startTime, null);
    assert.equal(sessionMgr.activePipeline, null);

    // Verify recorded event sequence
    const eventTypes = recordedEvents.map(e => e.type);
    assert.ok(eventTypes.includes('stateChange'));
    assert.ok(eventTypes.includes('reconfigured'));
    assert.ok(eventTypes.includes('reset'));
});
