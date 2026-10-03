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
    source = source.replace(/^import .*;\n/, '').replace('export class MainView', 'class MainView');
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

test('saved Gemini key reaches password input even when config loading fails', async () => {
    const { view, input } = loadMainView({
        getConfig: async () => {
            throw new Error('config unavailable');
        },
        getPreferences: async () => ({ providerMode: 'byok' }),
        getCredentials: async () => ({ apiKey: 'test-key' }),
    });
    await view._loadFromStorage();
    assert.equal(view._geminiKey, 'test-key');
    assert.equal(input.value, 'test-key');
});

test('saved Gemini key loads independently of a preferences failure', async () => {
    const { view, input } = loadMainView({
        getConfig: async () => ({}),
        getPreferences: async () => {
            throw new Error('preferences unavailable');
        },
        getCredentials: async () => ({ apiKey: 'test-key' }),
    });
    await view._loadFromStorage();
    assert.equal(input.value, 'test-key');
});
