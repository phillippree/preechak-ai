const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function harness(active = false) {
    const source = fs.readFileSync(path.join(__dirname, '../src/utils/gemini.js'), 'utf8');
    const handlers = new Map(),
        saved = [],
        prefs = { coachingProvider: 'gemini' },
        credentials = { apiKey: 'legacy-secret' };
    const code = source.slice(source.indexOf('    const providerSettings = () =>'), source.indexOf("    ipcMain.handle('initialize-cloud'"));
    const storage = {
        setCredentials: value => {
            Object.assign(credentials, value);
            saved.push(value);
            return true;
        },
        updateConfig: () => true,
        updatePreference: (key, value) => {
            prefs[key] = value;
            return true;
        },
    };
    vm.runInNewContext(code, {
        getConfig: () => ({ geminiHttpModel: 'gemini-custom' }),
        getPreferences: () => prefs,
        getCredentials: () => credentials,
        getGeminiHttp: () => ({ isGeminiHttpActive: () => active }),
        getLocalAi: () => ({ isLocalSessionActive: () => false }),
        geminiSessionRef: { current: null },
        isCloudActive: () => false,
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
        require: name => (name === '../storage' ? storage : require('../src/utils/ai-providers')),
    });
    return { handlers, saved, prefs };
}
test('provider settings expose presence only, validate IPC and save selected providers', () => {
    const h = harness();
    const settings = h.handlers.get('ai:get-settings')();
    assert.equal(settings.hasGeminiKey, true);
    assert.equal(JSON.stringify(settings).includes('secret'), false);
    const handler = h.handlers.get('ai:save-settings');
    const payload = { coachingProvider: 'openai', transcriptionProvider: 'gemini', openaiCoachingModel: 'gpt-6-luna', openaiApiKey: 'sk-new' };
    assert.equal(handler(null, { ...payload, coachingProvider: 'unknown' }).success, false);
    assert.equal(h.saved.length, 0);
    assert.equal(handler(null, { ...payload, openaiApiKey: 'bad\nkey' }).success, false);
    assert.equal(h.saved.length, 0);
    assert.equal(handler(null, payload).success, true);
    assert.equal(h.prefs.coachingProvider, 'openai');
});
test('active sessions reject provider and key changes', () => {
    const h = harness(true);
    const result = h.handlers.get('ai:save-settings')(null, {
        coachingProvider: 'openai',
        transcriptionProvider: 'openai',
        openaiCoachingModel: 'gpt-6-luna',
    });
    assert.equal(result.success, false);
    assert.match(result.error, /End the session/);
    assert.equal(h.saved.length, 0);
});

test('AI providers exposes the saved Gemini model and validates edits', () => {
    const h = harness();
    assert.equal(h.handlers.get('ai:get-settings')().geminiCoachingModel, 'gemini-custom');
    const save = h.handlers.get('ai:save-settings');
    const payload = { coachingProvider: 'gemini', transcriptionProvider: 'gemini', openaiCoachingModel: 'gpt-6-luna' };
    assert.equal(save(null, { ...payload, geminiCoachingModel: 'https://untrusted.test' }).success, false);
    assert.equal(save(null, { ...payload, geminiCoachingModel: 'gemini-3.7-flash' }).success, true);
    assert.equal(h.prefs.conversationCoaching, true);
});
