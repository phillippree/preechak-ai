const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

for (const platform of ['darwin', 'win32', 'linux']) {
    test(`shortcut defaults match help and settings on ${platform}`, () => {
        for (const file of ['src/utils/window.js', 'src/components/views/HelpView.js', 'src/components/views/CustomizeView.js']) {
            const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
            const method = file.includes('utils/window')
                ? source.match(/function getDefaultKeybinds\(\) \{[\s\S]*?\n\}/)[0]
                : source.match(/getDefaultKeybinds\(\) \{[\s\S]*?\n    \}/)[0];
            const fn = vm.runInNewContext(`({${method.replace(/^function /, '')}}).getDefaultKeybinds`, {
                process: { platform },
                preechakAi: { isMacOS: platform === 'darwin' },
                navigator: { platform: platform === 'darwin' ? 'MacIntel' : 'Win32' },
            });
            const keys = fn();
            assert.equal(keys.moveUp, platform === 'darwin' ? 'Cmd+Up' : 'Ctrl+Up');
            assert.equal(keys.increaseOpacity, platform === 'darwin' ? 'Cmd+.' : 'Alt+.');
            assert.equal(keys.decreaseOpacity, platform === 'darwin' ? 'Cmd+,' : 'Alt+,');
        }
    });
}

test('saved default migration preserves custom bindings and runs once', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/storage.js'), 'utf8');
    const method = source.slice(source.indexOf('function getKeybinds()'), source.indexOf('function setKeybinds('));
    let saved = { moveUp: 'Alt+Up', moveDown: 'Alt+Shift+D', increaseOpacity: 'Alt+.' },
        version;
    const fn = vm.runInNewContext(`${method}; getKeybinds`, {
        process: { platform: 'darwin' },
        DEFAULT_KEYBINDS: null,
        getKeybindsPath: () => '',
        readJsonFile: () => saved,
        getPreferences: () => ({ commandShortcutsVersion: version }),
        setKeybinds: value => {
            saved = value;
            return true;
        },
        updatePreference: (_, value) => {
            version = value;
        },
    });
    assert.equal(fn().moveUp, 'Cmd+Up');
    assert.equal(saved.moveDown, 'Alt+Shift+D');
    assert.equal(saved.increaseOpacity, 'Cmd+.');
    saved.moveUp = 'Alt+Up';
    assert.equal(fn().moveUp, 'Alt+Up');
});
