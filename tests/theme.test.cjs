const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createTheme(savedTheme = 'dark', savedPreferences = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../src/utils/renderer.js'), 'utf8');
    const start = source.indexOf('const theme = {');
    const end = source.indexOf('// Consolidated preechakAi object', start);
    assert.ok(start >= 0 && end > start);

    const properties = new Map();
    const updates = [];
    const context = {
        document: { documentElement: { style: { setProperty: (name, value) => properties.set(name, value) } } },
        storage: {
            getPreferences: async () => ({ theme: savedTheme, backgroundTransparency: 0.8, ...savedPreferences }),
            updatePreference: async (name, value) => updates.push([name, value]),
        },
    };
    const theme = vm.runInNewContext(`${source.slice(start, end)}\ntheme`, context);
    return { theme, properties, updates };
}

test('migrates the previous theme to Windows Blue with independent readable surfaces', async () => {
    const { theme, properties, updates } = createTheme();
    assert.equal(await theme.load(), 'windowsblue');
    assert.equal(theme.current, 'windowsblue');
    assert.equal(properties.get('--accent'), '#0078d4');
    assert.equal(properties.get('--bubble-user-bg'), '#0078d4');
    assert.deepEqual(updates, [
        ['backgroundTransparency', 0.4],
        ['blueLayoutVersion', 1],
        ['theme', 'windowsblue'],
    ]);
    assert.equal(properties.get('--bg-app'), 'rgba(11, 23, 41, 0.4)');
    assert.equal(properties.get('--conversation-opacity'), 0.4);
    assert.equal(properties.get('--answer-background'), 'rgba(21, 33, 51, 0.9)');
    assert.equal(properties.get('--coach-background'), 'rgba(33, 59, 91, 0.95)');
});

test('keeps the former dark palette available as Charcoal', () => {
    const { theme, properties } = createTheme();
    theme.apply('charcoal');
    assert.equal(theme.current, 'charcoal');
    assert.equal(properties.get('--bg-app'), 'rgba(16, 16, 16, 0.8)');
    assert.ok(theme.getAll().some(entry => entry.value === 'charcoal' && entry.name === 'Charcoal'));
});

test('changing window transparency preserves independent answer and code opacity', () => {
    const { theme, properties } = createTheme('windowsblue');
    theme.apply('windowsblue', 0.25);
    const answer = properties.get('--answer-background');
    const code = properties.get('--code-background');
    theme.applyBackgrounds('#0b1729', 0.6);
    assert.equal(properties.get('--bg-app'), 'rgba(11, 23, 41, 0.6)');
    assert.equal(properties.get('--answer-background'), answer);
    assert.equal(properties.get('--code-background'), code);
});

test('migration runs once and preserves a subsequently selected Deep Teal theme', async () => {
    const { theme, properties, updates } = createTheme('deepteal', { blueLayoutVersion: 1, backgroundTransparency: 0.55, answerReadability: 0.85 });
    assert.equal(await theme.load(), 'deepteal');
    assert.equal(properties.get('--bg-app'), 'rgba(16, 44, 48, 0.55)');
    assert.equal(properties.get('--conversation-opacity'), 0.55);
    assert.equal(updates.length, 0);
});

test('old readability settings do not change fixed answer opacity', async () => {
    const { theme, properties } = createTheme('windowsblue', { blueLayoutVersion: 1, answerReadability: 0.1 });
    await theme.load();
    assert.equal(properties.get('--answer-background'), 'rgba(21, 33, 51, 0.9)');
    assert.equal(properties.get('--text-primary'), '#f1f6ff');
});
