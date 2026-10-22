const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function handler(sendTextMessage) {
    const source = fs.readFileSync(path.join(__dirname, '../src/components/app/PreechakAiApp.js'), 'utf8');
    const method = source.slice(source.indexOf('    async handleSendText(message)'), source.indexOf('    handleResponseIndexChanged'));
    return vm.runInNewContext(`({${method}}).handleSendText`, { window: { preechakAi: { sendTextMessage } } });
}

test('completed coaching requests clear the waiting indicator after publishing their answer', async () => {
    const app = {
        _awaitingNewResponse: false,
        setStatus(text) {
            this.status = text;
        },
    };
    const send = handler(async () => {
        assert.equal(app._awaitingNewResponse, true);
        return { success: true, text: 'A complete explanation.' };
    });
    await send.call(app, 'Explain this approach');
    assert.equal(app._awaitingNewResponse, false);
    assert.equal(app._currentResponseIsComplete, true);
    assert.equal(app.status, 'Listening...');
});

test('failed coaching requests clear the waiting indicator and show their error', async () => {
    const app = {
        setStatus(text) {
            this.status = text;
        },
    };
    await handler(async () => ({ success: false, error: 'Model unavailable' })).call(app, 'Help');
    assert.equal(app._awaitingNewResponse, false);
    assert.match(app.status, /Model unavailable/);
});

function startHandler(overrides = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../src/components/app/PreechakAiApp.js'), 'utf8');
    const method = source.slice(source.indexOf('    async handleStart()'), source.indexOf('    async handleCancelLocalDownload'));
    const api = {
        storage: { getPreferences: async () => ({ providerMode: 'byok' }), getApiKey: async () => 'test' },
        initializeGemini: async () => true,
        startCapture: async () => true,
        ...overrides,
    };
    const window = {
        preechakAi: { sessionManager: { start: async () => {}, stop: async () => {} } },
        require: () => ({ ipcRenderer: { invoke: async () => {} } }),
    };
    return vm.runInNewContext(`({${method}}).handleStart`, { preechakAi: api, window });
}

test('session startup preserves answers arriving while capture permissions are being resolved', async () => {
    const app = { responses: [], selectedProfile: 'interview', _startTimer() {} };
    await startHandler({
        startCapture: async () => {
            app.responses.push({ text: 'Early coaching response' });
            return true;
        },
    }).call(app);
    assert.equal(app.sessionActive, true);
    assert.equal(app.responses[0].text, 'Early coaching response');
});

test('a failed Gemini setup does not begin audio capture', async () => {
    let captured = false;
    const app = { selectedProfile: 'interview' };
    await startHandler({
        initializeGemini: async () => false,
        startCapture: async () => {
            captured = true;
            return true;
        },
    }).call(app);
    assert.equal(captured, false);
    assert.notEqual(app.sessionActive, true);
});
