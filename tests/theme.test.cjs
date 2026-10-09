const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createTheme(savedTheme = 'dark') {
    const source = fs.readFileSync(path.join(__dirname, '../src/utils/renderer.js'), 'utf8');
    const start = source.indexOf('const theme = {');
    const end = source.indexOf('// Consolidated preechakAi object', start);
    assert.ok(start >= 0 && end > start);

    const properties = new Map();
    const updates = [];
    const context = {
        document: { documentElement: { style: { setProperty: (name, value) => properties.set(name, value) } } },
        storage: {
            getPreferences: async () => ({ theme: savedTheme, backgroundTransparency: 0.8 }),
            updatePreference: async (name, value) => updates.push([name, value]),
        },
    };
    const theme = vm.runInNewContext(`${source.slice(start, end)}\ntheme`, context);
    return { theme, properties, updates };
}

test('migrates a saved dark theme to Deep Teal and applies its colors', async () => {
    const { theme, properties, updates } = createTheme();
    assert.equal(await theme.load(), 'deepteal');
    assert.equal(theme.current, 'deepteal');
    assert.equal(properties.get('--accent'), '#80e0d5');
    assert.equal(properties.get('--bubble-user-bg'), '#ddf8f3');
    assert.deepEqual(updates, [['theme', 'deepteal']]);
});

test('keeps the former dark palette available as Charcoal', () => {
    const { theme, properties } = createTheme();
    theme.apply('charcoal');
    assert.equal(theme.current, 'charcoal');
    assert.equal(properties.get('--bg-app'), 'rgba(16, 16, 16, 0.8)');
    assert.ok(theme.getAll().some(entry => entry.value === 'charcoal' && entry.name === 'Charcoal'));
});
