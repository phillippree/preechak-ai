const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.join(__dirname, '..');

test('renderer bootstrap resolves services relative to index.html, as Electron does', () => {
    const htmlRequire = createRequire(path.join(root, 'src/index.html'));
    const source = fs.readFileSync(path.join(root, 'src/utils/renderer.js'), 'utf8');
    const bootstrap = source.slice(0, source.indexOf('let mediaStream'));
    const context = {
        require: name => (name === 'electron' ? { ipcRenderer: {} } : htmlRequire(name)),
    };
    vm.runInNewContext(bootstrap + '\nglobalThis.loaded = Boolean(defaultSessionManager && defaultOrchestrator && defaultRegistry);', context);
    assert.equal(context.loaded, true);
});

function loadMainView(storage) {
    let source = fs.readFileSync(path.join(root, 'src/components/views/MainView.js'), 'utf8');
    source = source.replace(/^import .*;\n/gm, '').replace('export class MainView', 'class MainView');
    const context = {
        html: () => '',
        css: () => '',
        LitElement: class {},
        customElements: { define() {} },
        console,
        preechakAi: { storage },
    };
    vm.runInNewContext(source + '\nglobalThis.View = MainView;', context);
    const view = Object.create(context.View.prototype);
    const input = { value: '' };
    view.shadowRoot = { querySelector: () => input };
    view.requestUpdate = () => {};
    view.updateComplete = Promise.resolve();
    return { view, input };
}

test('legacy home does not populate duplicate key fields when config loading fails', async () => {
    const { view, input } = loadMainView({
        getConfig: async () => {
            throw new Error('config unavailable');
        },
        getPreferences: async () => ({ providerMode: 'byok' }),
        getCredentials: async () => ({ apiKey: 'test-key' }),
    });
    await view._loadFromStorage();
    assert.equal(view._geminiKey, undefined);
    assert.equal(input.value, '');
});

test('legacy home does not populate duplicate key fields when preferences fail', async () => {
    const { view, input } = loadMainView({
        getConfig: async () => ({}),
        getPreferences: async () => {
            throw new Error('preferences unavailable');
        },
        getCredentials: async () => ({ apiKey: 'test-key' }),
    });
    await view._loadFromStorage();
    assert.equal(input.value, '');
});

test('renderer library bootstrap tolerates Electron exposing module without exports', () => {
    const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    const script = html.match(/<script>\s*if \(typeof module === 'object'\)[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g, '');
    const context = { module: {}, window: {} };
    vm.runInNewContext(script, context);
    assert.equal(context.window.exports, undefined);
    assert.equal(context.window.__temp_module, context.module);
});

test('home contains one provider settings component and no legacy Gemini key input', () => {
    const source = fs.readFileSync(path.join(root, 'src/components/views/MainView.js'), 'utf8');
    assert.equal((source.match(/<provider-settings/g) || []).length, 1);
    assert.equal(source.includes('_saveGeminiKey'), false);
    assert.equal(source.includes('>Gemini API Key</label>'), false);
});

test('API home exposes only provider settings and Start without legacy session options', () => {
    const source = fs.readFileSync(path.join(root, 'src/components/views/MainView.js'), 'utf8');
    const byok = source.slice(source.indexOf('    _renderByokMode()'), source.indexOf('    _renderLocalMode()'));
    assert.match(byok, /<provider-settings/);
    assert.match(byok, /_renderStartButton/);
    assert.equal(byok.includes('Session settings'), false);
    assert.equal(byok.includes('Connection Mode'), false);
    assert.equal(byok.includes('type="checkbox"'), false);
});
