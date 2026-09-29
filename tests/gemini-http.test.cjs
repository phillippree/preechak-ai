const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function harness({
    transcribe = async () => ({ text: 'What is a closure?' }),
    summarize = async () => ({ text: 'The interviewer asked about JS fundamentals. The candidate clarified experience with React.' }),
    config = {},
} = {}) {
    const events = [],
        saved = [],
        requests = [],
        summarizeRequests = [];
    const context = {
        Buffer,
        console: { log() {}, error() {}, warn() {} },
        module: { exports: {} },
        require(name) {
            if (name === './llmRequestLogger') return { logLlmRequest: (_, payload) => payload };
            if (name === '@google/genai')
                return {
                    GoogleGenAI: class {
                        models = {
                            generateContent: async request => {
                                const firstText = request?.contents?.[0]?.parts?.[0]?.text || '';
                                if (firstText.includes('conversation summarizer')) {
                                    summarizeRequests.push(request);
                                    return summarize(request);
                                }
                                return transcribe(request);
                            },
                            generateContentStream: async request => {
                                requests.push(request);
                                return (async function* () {
                                    yield { text: 'An answer.' };
                                })();
                            },
                        };
                    },
                };
            if (name === '../storage')
                return {
                    getApiKey: () => 'test',
                    getConfig: () => ({ httpRecentHistoryTokenBudget: 4000, httpSummaryTargetTokens: 500, ...config }),
                    getPreferences: () => ({}),
                };
            if (name === './prompts') return { getSystemPrompt: () => 'Profile instructions' };
            if (name === './gemini')
                return {
                    sendToRenderer: (...args) => events.push(args),
                    initializeNewSession() {},
                    saveConversationTurn: (...args) => saved.push(args),
                    hasGroqKey: () => false,
                    getProfileSpeakerSilencePause: () => 1000,
                };
            throw new Error(name);
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/utils/gemini-http.js'), 'utf8'), context);
    return {
        api: context.module.exports,
        segment: context.handleSpeechSegment,
        events,
        saved,
        requests,
        summarizeRequests,
    };
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
    const h = harness({ transcribe: async () => ({ text: '  ' }) });
    await h.api.initializeGeminiHttpSession('test');
    await h.segment(audio);
    assert.equal(h.requests.length, 0);
    assert.equal(h.saved.length, 0);
});

test('speech arriving during transcription is queued in order', async () => {
    let release,
        calls = 0;
    const h = harness({
        transcribe: () =>
            ++calls === 1
                ? new Promise(resolve => {
                      release = resolve;
                  })
                : Promise.resolve({ text: 'Second question' }),
    });
    await h.api.initializeGeminiHttpSession('test');
    const first = h.segment(audio);
    await h.segment(audio, 'You');
    assert.equal(calls, 1);
    release({ text: 'First question' });
    await first;
    await settle();
    assert.equal(h.saved.length, 2);
    assert.equal(h.saved[0][0], '[Interviewer]: First question');
    assert.equal(h.saved[1][0], '[You]: Second question');
});

test('closing and restarting discards old work and queued speech', async () => {
    let release;
    const h = harness({
        transcribe: () =>
            new Promise(resolve => {
                release = resolve;
            }),
    });
    await h.api.initializeGeminiHttpSession('test');
    const first = h.segment(audio);
    await h.segment(audio);
    h.api.closeGeminiHttpSession();
    await h.api.initializeGeminiHttpSession('test');
    release({ text: 'Obsolete question' });
    await first;
    await settle();
    assert.equal(h.requests.length, 0);
    assert.equal(h.saved.length, 0);
});

test('failed transcription releases the queue for the next segment', async () => {
    let reject,
        calls = 0;
    const h = harness({
        transcribe: () =>
            ++calls === 1
                ? new Promise((_, r) => {
                      reject = r;
                  })
                : Promise.resolve({ text: 'Next question' }),
    });
    await h.api.initializeGeminiHttpSession('test');
    const first = h.segment(audio);
    await h.segment(audio);
    reject(new Error('Network unavailable'));
    await first;
    await settle();
    assert.equal(h.saved.length, 1);
    assert.equal(h.saved[0][0], '[Interviewer]: Next question');
});

test('retains context across more than 10 entries when within token budget', async () => {
    let questionIndex = 0;
    const h = harness({
        transcribe: async () => ({ text: `Question ${++questionIndex}` }),
        config: { httpRecentHistoryTokenBudget: 5000 },
    });
    await h.api.initializeGeminiHttpSession('test');

    // Simulate 8 speech questions (creates 16 turns in history: 8 questions + 8 answers)
    for (let i = 0; i < 8; i++) {
        await h.segment(audio);
    }

    // 9th question request should retain all preceding turns (8 user turns + 8 model turns + 1 current = 17 parts)
    assert.equal(h.requests.length, 8);
    const lastRequest = h.requests[7];
    // With 7 previous question-answer pairs = 14 turns + 1 current question = 15 contents
    assert.equal(lastRequest.contents.length, 15);
    // Roles should alternate user/model
    for (let i = 0; i < 14; i++) {
        assert.equal(lastRequest.contents[i].role, i % 2 === 0 ? 'user' : 'model');
    }
    assert.equal(h.summarizeRequests.length, 0);
    assert.equal(h.saved.length, 8);
});

test('summarization is triggered when recent history exceeds token budget', async () => {
    let questionIndex = 0;
    const h = harness({
        transcribe: async () => ({ text: `Question ${++questionIndex}: Here is a moderately detailed question about system design.` }),
        summarize: async () => ({ text: 'Summary of earlier architecture and design questions.' }),
        // Small budget (e.g. 50 tokens) to trigger summarization quickly
        config: { httpRecentHistoryTokenBudget: 50, httpSummaryTargetTokens: 100 },
    });
    await h.api.initializeGeminiHttpSession('test');

    for (let i = 0; i < 5; i++) {
        await h.segment(audio);
    }

    assert.ok(h.summarizeRequests.length >= 1, 'Summarization request should be triggered');
    const lastSummaryPrompt = h.summarizeRequests[0].contents[0].parts[0].text;
    assert.ok(lastSummaryPrompt.includes('Question 1'));

    // The answer request should include the summary context message followed by recent turns
    const lastAnswerReq = h.requests[h.requests.length - 1];
    const summaryContextTurn = lastAnswerReq.contents.find(c => c.parts[0].text.includes('Summary of previous conversation'));
    assert.ok(summaryContextTurn, 'Request contents should include previous conversation summary');
    // Full original history remains in storage
    assert.equal(h.saved.length, 5);
});

test('typed and spoken questions use identical context handling and speaker labeling', async () => {
    const h = harness({
        transcribe: async () => ({ text: 'Spoken question from interviewer' }),
    });
    await h.api.initializeGeminiHttpSession('test');

    await h.segment(audio, 'Interviewer');
    await h.api.sendTextToGeminiHttp('Typed follow up question');

    assert.equal(h.requests.length, 2);
    // Second request should have turn 0 (interviewer), turn 1 (model answer), turn 2 (typed user question)
    assert.equal(h.requests[1].contents[0].parts[0].text, '[Interviewer]: Spoken question from interviewer');
    assert.equal(h.requests[1].contents[1].parts[0].text, 'An answer.');
    assert.equal(h.requests[1].contents[2].parts[0].text, '[You]: Typed follow up question');
    assert.equal(h.saved.length, 2);
    assert.equal(h.saved[1][0], 'Typed follow up question');
});

test('summarization failure gracefully falls back without crashing or dropping storage', async () => {
    let questionIndex = 0;
    const h = harness({
        transcribe: async () => ({ text: `Question ${++questionIndex}` }),
        summarize: async () => {
            throw new Error('Summarization rate limit');
        },
        config: { httpRecentHistoryTokenBudget: 20 },
    });
    await h.api.initializeGeminiHttpSession('test');

    for (let i = 0; i < 4; i++) {
        await h.segment(audio);
    }

    // Answers should still succeed despite summary failure
    assert.equal(h.requests.length, 4);
    assert.equal(h.saved.length, 4);
});
