const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function harness(transcribe = async () => ({ text: 'What is a closure?' })) {
    const events = [], saved = [], requests = [];
    const context = {
        Buffer, console: { log() {}, error() {} }, module: { exports: {} },
        require(name) {
            if (name === '@google/genai') return { GoogleGenAI: class {
                models = {
                    generateContent: transcribe,
                    generateContentStream: async request => {
                        requests.push(request);
                        return (async function* () { yield { text: 'An answer.' }; })();
                    },
                };
            } };
            if (name === '../storage') return { getApiKey: () => 'test', getConfig: () => ({}), getPreferences: () => ({}) };
            if (name === './prompts') return { getSystemPrompt: () => 'Profile instructions' };
            if (name === './gemini') return {
                sendToRenderer: (...args) => events.push(args), initializeNewSession() {},
                saveConversationTurn: (...args) => saved.push(args), hasGroqKey: () => false,
            };
            throw new Error(name);
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/utils/gemini-http.js'), 'utf8'), context);
    return { api: context.module.exports, segment: context.handleSpeechSegment, events, saved, requests };
}
const audio = Buffer.alloc(24000);
const settle = () => new Promise(resolve => setImmediate(resolve));

test('transcript is displayed before answering and used in prompts, history, and context', async () => {
    const h = harness();
    await h.api.initializeGeminiHttpSession('test');
    await h.segment(audio);
    assert.equal(h.requests[0].contents[0].parts[0].text, '[Interviewer]: What is a closure?');
    assert.equal(h.saved[0][0], '[Interviewer]: What is a closure?');
    assert.ok(h.events.findIndex(e => e[0] === 'live-transcription') < h.events.findIndex(e => e[0] === 'new-response'));
    assert.equal(h.events.find(e => e[0] === 'new-response')[1].prompt, h.saved[0][0]);
    await h.segment(audio, 'You');
    assert.equal(h.requests[1].contents.length, 3);
    assert.equal(h.requests[1].contents[0].parts[0].text, h.saved[0][0]);
});

test('empty transcription does not request an answer or save a turn', async () => {
    const h = harness(async () => ({ text: '  ' }));
    await h.api.initializeGeminiHttpSession('test');
    await h.segment(audio);
    assert.equal(h.requests.length, 0);
    assert.equal(h.saved.length, 0);
});

test('speech arriving during transcription is queued in order', async () => {
    let release, calls = 0;
    const h = harness(() => ++calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ text: 'Second question' }));
    await h.api.initializeGeminiHttpSession('test');
    const first = h.segment(audio);
    await h.segment(audio, 'You');
    assert.equal(calls, 1);
    release({ text: 'First question' });
    await first; await settle();
    assert.equal(h.saved.length, 2);
    assert.equal(h.saved[0][0], '[Interviewer]: First question');
    assert.equal(h.saved[1][0], '[You]: Second question');
});

test('closing and restarting discards old work and queued speech', async () => {
    let release;
    const h = harness(() => new Promise(resolve => { release = resolve; }));
    await h.api.initializeGeminiHttpSession('test');
    const first = h.segment(audio);
    await h.segment(audio);
    h.api.closeGeminiHttpSession();
    await h.api.initializeGeminiHttpSession('test');
    release({ text: 'Obsolete question' });
    await first; await settle();
    assert.equal(h.requests.length, 0);
    assert.equal(h.saved.length, 0);
});

test('failed transcription releases the queue for the next segment', async () => {
    let reject, calls = 0;
    const h = harness(() => ++calls === 1 ? new Promise((_, r) => { reject = r; }) : Promise.resolve({ text: 'Next question' }));
    await h.api.initializeGeminiHttpSession('test');
    const first = h.segment(audio);
    await h.segment(audio);
    reject(new Error('Network unavailable'));
    await first; await settle();
    assert.equal(h.saved.length, 1);
    assert.equal(h.saved[0][0], '[Interviewer]: Next question');
});
