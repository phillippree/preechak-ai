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

test('capture answers update the original request bubble without duplicating or replacing other turns', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/components/app/PreechakAiApp.js'), 'utf8');
    const method = source.slice(source.indexOf('    addNewResponse(response)'), source.indexOf('    updateCurrentResponse(response)'));
    const add = vm.runInNewContext(`({${method}}).addNewResponse`);
    const app = { responses: [], currentResponseIndex: -1, requestUpdate() {} };
    add.call(app, { requestId: 'capture-1', prompt: 'Explain visually', text: '' });
    add.call(app, { prompt: 'Another turn', text: 'Other answer' });
    add.call(app, { requestId: 'capture-1', prompt: 'Explain visually', text: 'Diagram' });
    assert.equal(app.responses.length, 2);
    assert.equal(app.responses[0].text, 'Diagram');
    assert.equal(app.responses[0].prompt, 'Explain visually');
    assert.equal(app.responses[1].text, 'Other answer');
});

test('coach layout bounds invalid and extreme saved heights', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/components/views/AssistantView.js'), 'utf8');
    const method = source.slice(source.indexOf('    clampCoachHeight(height)'), source.indexOf('    async saveCoachLayout()'));
    const clamp = vm.runInNewContext(`({${method}}).clampCoachHeight`);
    assert.equal(clamp(undefined), 260);
    assert.equal(clamp(NaN), 260);
    assert.equal(clamp(-50), 100);
    assert.equal(clamp(900), 600);
    assert.equal(clamp(320), 320);
});

test('coach expand and collapse save layout without losing its height', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/components/views/AssistantView.js'), 'utf8');
    const method = source.slice(source.indexOf('    toggleCoach()'), source.indexOf('    startCoachResize(event)'));
    const toggle = vm.runInNewContext(`({${method}}).toggleCoach`);
    let saves = 0;
    const state = {
        coachExpanded: false,
        coachHeight: 320,
        saveCoachLayout() {
            saves++;
        },
    };
    toggle.call(state);
    assert.equal(state.coachExpanded, true);
    toggle.call(state);
    assert.equal(state.coachExpanded, false);
    assert.equal(state.coachHeight, 320);
    assert.equal(saves, 2);
});

test('dragging the coach divider adjusts height and saves on release', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/components/views/AssistantView.js'), 'utf8');
    const method = source.slice(source.indexOf('    startCoachResize(event)'), source.indexOf('    renderCoachPanel()'));
    const resize = vm.runInNewContext(`({${method}}).startCoachResize`);
    const listeners = new Map();
    let saves = 0;
    const handle = {
        setPointerCapture(id) {
            assert.equal(id, 7);
        },
        addEventListener(name, fn) {
            listeners.set(name, fn);
        },
        removeEventListener(name) {
            listeners.delete(name);
        },
    };
    const state = {
        coachExpanded: false,
        shadowRoot: { querySelector: () => ({ getBoundingClientRect: () => ({ height: 100 }) }) },
        clampCoachHeight: h => Math.max(100, Math.min(600, h)),
        saveCoachLayout() {
            saves++;
        },
    };
    resize.call(state, { button: 0, clientY: 500, pointerId: 7, currentTarget: handle, preventDefault() {} });
    listeners.get('pointermove')({ clientY: 300 });
    assert.equal(state.coachHeight, 300);
    assert.equal(state.coachExpanded, true);
    listeners.get('pointerup')();
    assert.equal(saves, 1);
    assert.equal(listeners.size, 0);
});
