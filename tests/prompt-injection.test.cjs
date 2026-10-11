const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { getSystemPrompt, profilePrompts } = require('../src/utils/prompts');

function createGeminiHttpHarness() {
    const events = [];
    const saved = [];
    const context = {
        Buffer,
        console: { log() {}, error() {}, warn() {} },
        module: { exports: {} },
        require(name) {
            if (name === 'node:fs' || name === 'fs') return fs;
            if (name === 'node:path' || name === 'path') return path;
            if (name === './llmRequestLogger') return { logLlmRequest: (_, payload) => payload };
            if (name === './whisper-runtime')
                return {
                    startWhisperServer: async () => 'http://127.0.0.1:8080',
                    stopWhisperServer: () => {},
                    transcribeAudio: async () => 'Transcribed audio',
                    resample24kTo16k: buf => buf,
                    isWhisperServerRunning: () => true,
                };
            if (name === '@google/genai')
                return {
                    GoogleGenAI: class {
                        models = {
                            generateContent: async () => ({ text: 'Mock response' }),
                            generateContentStream: async () =>
                                (async function* () {
                                    yield { text: 'Mock stream' };
                                })(),
                        };
                    },
                };
            if (name === '../storage')
                return {
                    getApiKey: () => 'test',
                    getConfig: () => ({ httpRecentHistoryTokenBudget: 4000, httpSummaryTargetTokens: 500 }),
                    getPreferences: () => ({}),
                };
            if (name === './prompts') return { getSystemPrompt, profilePrompts };
            if (name === './speech-segmenter') return require('../src/utils/speech-segmenter');
            if (name === './gemini')
                return {
                    sendToRenderer: (...args) => events.push(args),
                    initializeNewSession() {},
                    saveConversationTurn: (...args) => saved.push(args),
                    saveScreenAnalysis: () => {},
                    hasGroqKey: () => false,
                    getProfileSpeakerSilencePause: () => 1000,
                };
            throw new Error(`Unhandled mock require: ${name}`);
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/utils/gemini-http.js'), 'utf8'), context);
    return {
        api: context.module.exports,
        events,
        saved,
    };
}

test('switchSessionProfile updates active profile and injects prompt into conversation history', async () => {
    const { api } = createGeminiHttpHarness();

    // Initialize session with interview mode
    await api.initializeGeminiHttpSession('fake-api-key', '', 'interview', 'en-US');

    // Switch profile to business meeting mode
    const res1 = api.switchSessionProfile('meeting', 'Always suggest action items');
    assert.equal(res1.success, true);
    assert.equal(res1.profile, 'meeting');
    assert.ok(res1.systemPrompt.includes('meeting assistant'));
    assert.ok(res1.systemPrompt.includes('Always suggest action items'));

    // Switch profile to sales mode
    const res2 = api.switchSessionProfile('sales', '');
    assert.equal(res2.success, true);
    assert.equal(res2.profile, 'sales');
    assert.ok(res2.systemPrompt.includes('sales call assistant'));

    // Switch profile to exam mode
    const res3 = api.switchSessionProfile('exam', '');
    assert.equal(res3.success, true);
    assert.equal(res3.profile, 'exam');
    assert.ok(res3.systemPrompt.includes('exam assistant'));

    // Switch profile to designSystem mode
    const res4 = api.switchSessionProfile('designSystem', 'Enforce WCAG AAA contrast');
    assert.equal(res4.success, true);
    assert.equal(res4.profile, 'designSystem');
    assert.ok(res4.systemPrompt.includes('Design System and UI/UX expert assistant'));
    assert.ok(res4.systemPrompt.includes('Enforce WCAG AAA contrast'));

    await api.closeGeminiHttpSession();
});

test('getSystemPrompt builds mode-specific prompts with custom instructions and formatting guidelines', () => {
    const interviewPrompt = getSystemPrompt('interview', 'Custom interview notes');
    assert.ok(interviewPrompt.includes('# PRIMARY INSTRUCTIONS & ROLE (USER OVERRIDE)'));
    assert.ok(interviewPrompt.includes('Custom interview notes'));
    assert.ok(interviewPrompt.includes(profilePrompts.interview.intro));

    const meetingPrompt = getSystemPrompt('meeting');
    assert.ok(meetingPrompt.includes(profilePrompts.meeting.intro));
    assert.ok(meetingPrompt.includes(profilePrompts.meeting.formatRequirements));

    const salesPrompt = getSystemPrompt('sales');
    assert.ok(salesPrompt.includes(profilePrompts.sales.intro));

    const presentationPrompt = getSystemPrompt('presentation');
    assert.ok(presentationPrompt.includes(profilePrompts.presentation.intro));

    const negotiationPrompt = getSystemPrompt('negotiation');
    assert.ok(negotiationPrompt.includes(profilePrompts.negotiation.intro));

    const examPrompt = getSystemPrompt('exam');
    assert.ok(examPrompt.includes(profilePrompts.exam.intro));

    const designSystemPrompt = getSystemPrompt('designSystem');
    assert.ok(designSystemPrompt.includes(profilePrompts.designSystem.intro));
    assert.ok(designSystemPrompt.includes(profilePrompts.designSystem.formatRequirements));
});
