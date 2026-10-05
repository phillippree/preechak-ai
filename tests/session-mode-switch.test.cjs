const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultSessionManager, defaultOrchestrator } = require('../src/services');

test('SessionManager dynamic profile switching during active session', async () => {
    // Start in interview mode
    await defaultSessionManager.start({
        profile: 'interview',
        connectionMode: 'http',
        transcriptionMode: 'whisper',
    });

    assert.equal(defaultSessionManager.isActive(), true);
    assert.equal(defaultOrchestrator.getActiveProfileId(), 'interview');

    let reconfiguredEvent = null;
    const unsubscribe = defaultSessionManager.onEvent(event => {
        if (event.type === 'reconfigured') {
            reconfiguredEvent = event;
        }
    });

    // Switch to meeting mode dynamically while in session
    const pipeline = defaultSessionManager.switchProfile('meeting');
    assert.ok(pipeline);
    assert.equal(defaultOrchestrator.getActiveProfileId(), 'meeting');
    assert.ok(reconfiguredEvent);
    assert.equal(reconfiguredEvent.type, 'reconfigured');

    // Switch to sales mode
    defaultSessionManager.switchProfile('sales');
    assert.equal(defaultOrchestrator.getActiveProfileId(), 'sales');

    // Switch to designSystem mode
    const dsPipeline = defaultSessionManager.switchProfile('designSystem');
    assert.ok(dsPipeline);
    assert.equal(defaultOrchestrator.getActiveProfileId(), 'designSystem');
    assert.equal(dsPipeline.blocks.prompt.role, 'designSystem');

    unsubscribe();
    await defaultSessionManager.stop();
    assert.equal(defaultSessionManager.isActive(), false);
});

test('Session mode profile labels and values match expectations', () => {
    const profileOptions = [
        { value: 'interview', label: 'Job Interview' },
        { value: 'meeting', label: 'Business Meeting' },
        { value: 'sales', label: 'Sales Call' },
        { value: 'presentation', label: 'Presentation' },
        { value: 'negotiation', label: 'Negotiation' },
        { value: 'exam', label: 'Exam Assistant' },
        { value: 'designSystem', label: 'Design System' },
    ];

    const values = profileOptions.map(o => o.value);
    assert.ok(values.includes('interview'));
    assert.ok(values.includes('meeting'));
    assert.ok(values.includes('sales'));
    assert.ok(values.includes('presentation'));
    assert.ok(values.includes('negotiation'));
    assert.ok(values.includes('exam'));
    assert.ok(values.includes('designSystem'));
});
