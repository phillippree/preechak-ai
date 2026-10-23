const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function harness({
    transcribe = async () => ({ text: 'What is a closure?' }),
    summarize = async () => ({ text: 'The interviewer asked about JS fundamentals. The candidate clarified experience with React.' }),
    config = {},
    preferences = {},
    mockFs = null,
    mockWhisper = null,
    coachResponse = async () => ({
        text: JSON.stringify({
            action: 'quiet',
            newProblem: false,
            contribution: 'context',
            summary: 'Current problem',
            problem: { title: 'Current problem' },
            output: '',
        }),
    }),
    streamError = null,
    storageKey = 'test',
} = {}) {
    const events = [],
        saved = [],
        savedAnalyses = [],
        requests = [],
        summarizeRequests = [],
        geminiTranscribeRequests = [],
        transcriptionConnections = [],
        coachRequests = [];

    const effectiveFs = mockFs || fs;
    const prefs = { ...preferences };

    const context = {
        Buffer,
        console: { log() {}, error() {}, warn() {} },
        module: { exports: {} },
        require(name) {
            if (name === 'node:fs' || name === 'fs') return effectiveFs;
            if (name === 'node:path' || name === 'path') return path;
            if (name === './llmRequestLogger') return { logLlmRequest: (_, payload) => payload };
            if (name === './interview-coach') return require('../src/utils/interview-coach');
            if (name === './ai-providers')
                return {
                    createCoachGenerator: (provider, key) => async request => {
                        coachRequests.push({ ...request, provider, key });
                        return coachResponse(request);
                    },
                };
            if (name === './gemini-transcription' || name === './openai-transcription')
                return {
                    [name === './openai-transcription' ? 'OpenAITranscription' : 'GeminiTranscription']: class {
                        constructor(options) {
                            this.options = options;
                            this.audio = [];
                            transcriptionConnections.push(this);
                        }
                        mute() {}
                        async start() {
                            if (streamError) throw new Error(streamError);
                        }
                        send(source, pcm) {
                            this.audio.push({ source, pcm });
                        }
                        close() {
                            this.closed = true;
                        }
                    },
                };
            if (name === './speech-segmenter') return require('../src/utils/speech-segmenter');
            if (name === './whisper-runtime')
                return {
                    startWhisperServer: mockWhisper?.startWhisperServer || (async () => 'http://127.0.0.1:8080'),
                    stopWhisperServer: mockWhisper?.stopWhisperServer || (() => {}),
                    transcribeAudio: mockWhisper?.transcribeAudio || (async () => 'Local whisper transcribed question'),
                    resample24kTo16k: buf => buf,
                    isWhisperServerRunning: () => true,
                };
            if (name === '@google/genai')
                return {
                    GoogleGenAI: class {
                        models = {
                            generateContent: async request => {
                                if (request.config?.responseMimeType === 'application/json') {
                                    coachRequests.push(request);
                                    return coachResponse(request);
                                }
                                const firstText = request?.contents?.[0]?.parts?.[0]?.text || '';
                                if (firstText.includes('conversation summarizer')) {
                                    summarizeRequests.push(request);
                                    return summarize(request);
                                }
                                geminiTranscribeRequests.push(request);
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
                    getApiKey: () => storageKey,
                    getConfig: () => ({ httpRecentHistoryTokenBudget: 4000, httpSummaryTargetTokens: 500, ...config }),
                    getPreferences: () => prefs,
                };
            if (name === './prompts') return { getSystemPrompt: () => 'Profile instructions' };
            if (name === './gemini')
                return {
                    sendToRenderer: (...args) => events.push(args),
                    initializeNewSession() {},
                    saveConversationTurn: (...args) => saved.push(args),
                    saveScreenAnalysis: (...args) => savedAnalyses.push(args),
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
        prefs,
        events,
        saved,
        savedAnalyses,
        requests,
        summarizeRequests,
        geminiTranscribeRequests,
        transcriptionConnections,
        coachRequests,
        getCoach: () => vm.runInContext('coach', context),
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

test('new screenshot capture becomes active and stores turn in shared history', async () => {
    const h = harness();
    await h.api.initializeGeminiHttpSession('test');

    const result = await h.api.handleHttpScreenshot('base64Image1Data', 'What does this diagram show?', '/fake/path/shot1.jpg');
    assert.ok(result.success);
    assert.equal(result.text, 'An answer.');

    // Screenshot should be registered and active
    const state = h.api.getAttachmentsState();
    assert.equal(state.screenshots.length, 1);
    assert.equal(state.activeAttachmentIds.length, 1);
    assert.equal(state.activeAttachmentIds[0], result.imageId);

    // Screenshot request uses its own prompt and image only, independent of profile/history.
    assert.equal(h.requests.length, 1);
    const request = h.requests[0];
    const parts = request.contents[0].parts;
    assert.equal(request.config.systemInstruction, 'What does this diagram show?');
    assert.equal(request.contents.length, 1);
    assert.equal(request.contents[0].role, 'user');
    assert.equal(parts[0].text, '[Screen Analysis]: What does this diagram show?');
    assert.ok(parts[1].inlineData && parts[1].inlineData.data === 'base64Image1Data');

    // Turns should be saved
    assert.equal(h.saved.length, 1);
    assert.equal(h.saved[0][0], '[Screen Analysis]: What does this diagram show?');
    assert.equal(h.savedAnalyses.length, 1);
});

test('screenshot analysis ignores conflicting profile instructions and prior turns', async () => {
    const h = harness();
    await h.api.initializeGeminiHttpSession('test', 'A profile instruction about UI/UX.', 'designSystem');

    await h.api.handleHttpScreenshot('firstImage', 'Design a distributed cache.', '/fake/first.jpg');
    const request = h.requests[0];
    assert.equal(request.config.systemInstruction, 'Design a distributed cache.');
    assert.equal(request.contents.length, 1);
    assert.deepEqual(
        Array.from(request.contents[0].parts, part => part.text || part.inlineData?.data),
        ['[Screen Analysis]: Design a distributed cache.', 'firstImage']
    );

    await h.api.handleHttpScreenshot('secondImage', 'Design a URL shortener.', '/fake/second.jpg');
    const nextRequest = h.requests[1];
    assert.equal(nextRequest.config.systemInstruction, 'Design a URL shortener.');
    assert.equal(nextRequest.contents.length, 1);
    assert.deepEqual(
        Array.from(nextRequest.contents[0].parts, part => part.text || part.inlineData?.data),
        ['[Screen Analysis]: Design a URL shortener.', 'secondImage']
    );
});

test('spoken and typed follow-ups include the active image', async () => {
    const h = harness({
        transcribe: async () => ({ text: 'Can you explain the right chart?' }),
    });
    await h.api.initializeGeminiHttpSession('test');

    // Capture screenshot
    await h.api.handleHttpScreenshot('base64ActiveImage', 'Analyze page', '/fake/path/shot.jpg');

    // Typed follow-up
    await h.api.sendTextToGeminiHttp('Can you focus on the header?');
    assert.equal(h.requests.length, 2);
    const typedParts = h.requests[1].contents[h.requests[1].contents.length - 1].parts;
    assert.ok(typedParts.some(p => p.inlineData && p.inlineData.data === 'base64ActiveImage'));
    assert.ok(typedParts.some(p => p.text === '[You]: Can you focus on the header?'));

    // Spoken follow-up
    await h.segment(audio, 'Interviewer');
    assert.equal(h.requests.length, 3);
    const spokenParts = h.requests[2].contents[h.requests[2].contents.length - 1].parts;
    assert.ok(spokenParts.some(p => p.inlineData && p.inlineData.data === 'base64ActiveImage'));
    assert.ok(spokenParts.some(p => p.text === '[Interviewer]: Can you explain the right chart?'));
});

test('removing an attachment excludes it from subsequent requests without deleting the original', async () => {
    const h = harness();
    await h.api.initializeGeminiHttpSession('test');

    const res = await h.api.handleHttpScreenshot('base64ImageData', 'Initial scan', '/fake/path/shot.jpg');
    assert.equal(h.api.getAttachmentsState().activeAttachmentIds.length, 1);

    // Remove attachment
    h.api.removeAttachment(res.imageId);
    assert.equal(h.api.getAttachmentsState().activeAttachmentIds.length, 0);
    // Original screenshot is still preserved in session history
    assert.equal(h.api.getAttachmentsState().screenshots.length, 1);

    // Subsequent typed follow-up
    await h.api.sendTextToGeminiHttp('General question without image');
    assert.equal(h.requests.length, 2);
    const parts = h.requests[1].contents[h.requests[1].contents.length - 1].parts;
    assert.equal(parts.length, 1);
    assert.equal(parts[0].text, '[You]: General question without image');
    assert.ok(!parts.some(p => p.inlineData));
});

test('comparison selects and sends both screenshots with clear labels', async () => {
    const h = harness();
    await h.api.initializeGeminiHttpSession('test');

    const s1 = await h.api.handleHttpScreenshot('img1Base64', 'First screen', '/fake/shot1.jpg');
    const s2 = await h.api.handleHttpScreenshot('img2Base64', 'Second screen', '/fake/shot2.jpg');

    // Trigger comparison
    h.api.compareWithPrevious();
    const state = h.api.getAttachmentsState();
    assert.equal(state.activeAttachmentIds.length, 2);
    assert.equal(state.activeAttachmentIds[0], s2.imageId);
    assert.equal(state.activeAttachmentIds[1], s1.imageId);

    // Send comparison question
    await h.api.sendTextToGeminiHttp('What changed between the two screens?');
    assert.equal(h.requests.length, 3);
    const userParts = h.requests[2].contents[h.requests[2].contents.length - 1].parts;

    // Verify both images and labels exist in order
    assert.ok(userParts.some(p => p.inlineData && p.inlineData.data === 'img2Base64'));
    assert.ok(userParts.some(p => p.text === '[Attached Image 1 (Current)]'));
    assert.ok(userParts.some(p => p.inlineData && p.inlineData.data === 'img1Base64'));
    assert.ok(userParts.some(p => p.text === '[Attached Image 2 (Previous)]'));
    assert.ok(userParts.some(p => p.text === '[You]: What changed between the two screens?'));
});

test('queued speech retains its snapshot of attachments from speech start time', async () => {
    let release;
    const h = harness({
        transcribe: () =>
            new Promise(resolve => {
                release = resolve;
            }),
    });
    await h.api.initializeGeminiHttpSession('test');

    // First screenshot is active
    await h.api.handleHttpScreenshot('img1Base64', 'First capture', '/fake/shot1.jpg');

    // Speech starts while img1 is active (takes snapshot of [img1])
    const speechPromise = h.segment(audio, 'Interviewer');

    // While speech is transcribing, user takes a second screenshot (img2 becomes active)
    await h.api.handleHttpScreenshot('img2Base64', 'Second capture', '/fake/shot2.jpg');
    assert.equal(h.api.getAttachmentsState().activeAttachmentIds[0], h.api.getAttachmentsState().screenshots[1].id);

    // Release transcription
    release({ text: 'Question spoken while viewing first image' });
    await speechPromise;
    await settle();

    // The speech request should have executed using img1Base64 (the snapshot at speech-time)
    assert.equal(h.requests.length, 3);
    const speechReq = h.requests[2];
    const speechUserParts = speechReq.contents[speechReq.contents.length - 1].parts;
    assert.ok(speechUserParts.some(p => p.inlineData && p.inlineData.data === 'img1Base64'));
    assert.ok(!speechUserParts.some(p => p.inlineData && p.inlineData.data === 'img2Base64'));
});

test('missing image file produces a visible error without silently answering', async () => {
    const customFs = {
        existsSync: () => false,
        readFileSync: () => {
            throw new Error('ENOENT: no such file');
        },
    };
    const h = harness({ mockFs: customFs });
    await h.api.initializeGeminiHttpSession('test');

    // Register a screenshot with a path that does not exist and no memory cache
    h.api.registerScreenshot({ id: 'missing_img', path: '/deleted/screenshot.jpg', base64Data: null });

    const result = await h.api.sendTextToGeminiHttp('Follow up on missing image');
    assert.equal(result.success, false);
    assert.match(result.error, /Screenshot file missing on disk/);

    const errorEvent = h.events.find(e => e[0] === 'update-status' && String(e[1]).includes('Error:'));
    assert.ok(errorEvent, 'Renderer should receive error status');
});

test('closing and resetting session clears active attachments and prevents stale updates', async () => {
    const h = harness();
    await h.api.initializeGeminiHttpSession('test');

    await h.api.handleHttpScreenshot('img1Base64', 'First screen', '/fake/shot1.jpg');
    assert.equal(h.api.getAttachmentsState().activeAttachmentIds.length, 1);

    h.api.closeGeminiHttpSession();
    assert.equal(h.api.getAttachmentsState().activeAttachmentIds.length, 0);
    assert.equal(h.api.getAttachmentsState().screenshots.length, 0);

    await h.api.initializeGeminiHttpSession('test');
    assert.equal(h.api.getAttachmentsState().activeAttachmentIds.length, 0);
});

test('retains context across more than 10 entries when within token budget', async () => {
    let questionIndex = 0;
    const h = harness({
        transcribe: async () => ({ text: `Question ${++questionIndex}` }),
        config: { httpRecentHistoryTokenBudget: 5000 },
    });
    await h.api.initializeGeminiHttpSession('test');

    for (let i = 0; i < 8; i++) {
        await h.segment(audio);
    }

    assert.equal(h.requests.length, 8);
    const lastRequest = h.requests[7];
    assert.equal(lastRequest.contents.length, 15);
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
        config: { httpRecentHistoryTokenBudget: 50, httpSummaryTargetTokens: 100 },
    });
    await h.api.initializeGeminiHttpSession('test');

    for (let i = 0; i < 5; i++) {
        await h.segment(audio);
    }

    assert.ok(h.summarizeRequests.length >= 1, 'Summarization request should be triggered');
    const lastSummaryPrompt = h.summarizeRequests[0].contents[0].parts[0].text;
    assert.ok(lastSummaryPrompt.includes('Question 1'));

    const lastAnswerReq = h.requests[h.requests.length - 1];
    const summaryContextTurn = lastAnswerReq.contents.find(c => c.parts[0].text.includes('Summary of previous conversation'));
    assert.ok(summaryContextTurn, 'Request contents should include previous conversation summary');
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
    assert.equal(h.requests[1].contents[0].parts[0].text, '[Interviewer]: Spoken question from interviewer');
    assert.equal(h.requests[1].contents[1].parts[0].text, 'An answer.');
    assert.equal(h.requests[1].contents[2].parts[0].text, '[You]: Typed follow up question');
    assert.equal(h.saved.length, 2);
    assert.equal(h.saved[1][0], 'Typed follow up question');
});

test('local whisper transcription routes transcript to answer pipeline without gemini transcription', async () => {
    let whisperTranscribeCalls = 0;
    const h = harness({
        preferences: { geminiHttpLocalWhisper: true, whisperModel: 'base.en' },
        mockWhisper: {
            startWhisperServer: async () => 'http://127.0.0.1:8080',
            stopWhisperServer: () => {},
            transcribeAudio: async () => {
                whisperTranscribeCalls++;
                return 'Local whisper question text';
            },
        },
    });

    await h.api.initializeGeminiHttpSession('test');
    assert.equal(h.api.isUsingLocalWhisper(), true);

    await h.segment(audio, 'Interviewer');
    assert.equal(whisperTranscribeCalls, 1, 'Local whisper transcribeAudio should be invoked');
    assert.equal(h.geminiTranscribeRequests.length, 0, 'Gemini remote audio transcription must NOT be called');

    // Result should be passed to Gemini answer pipeline
    assert.equal(h.requests.length, 1, 'Gemini answer pipeline should be invoked with prompt');
    assert.equal(h.requests[0].contents[0].parts[0].text, '[Interviewer]: Local whisper question text');
    assert.equal(h.saved.length, 1);
    assert.equal(h.saved[0][0], '[Interviewer]: Local whisper question text');
});

test('disabled local whisper preserves standard Gemini audio transcription', async () => {
    let whisperTranscribeCalls = 0;
    const h = harness({
        preferences: { geminiHttpLocalWhisper: false, geminiHttpTranscriptionMode: 'gemini' },
        mockWhisper: {
            transcribeAudio: async () => {
                whisperTranscribeCalls++;
                return 'Should not be called';
            },
        },
    });

    await h.api.initializeGeminiHttpSession('test');
    assert.equal(h.api.isUsingLocalWhisper(), false);
    assert.equal(h.api.getTranscriptionMode(), 'gemini');

    await h.segment(audio, 'Interviewer');
    assert.equal(whisperTranscribeCalls, 0, 'Local whisper must NOT be called when preference is false');
    assert.equal(h.geminiTranscribeRequests.length, 1, 'Gemini audio transcription should be called');
    assert.equal(h.requests.length, 1);
});

test('transcriptionMode none ignores incoming audio completely without API or Whisper calls', async () => {
    let whisperTranscribeCalls = 0;
    const h = harness({
        preferences: { geminiHttpTranscriptionMode: 'none' },
        mockWhisper: {
            transcribeAudio: async () => {
                whisperTranscribeCalls++;
                return 'Should not be called';
            },
        },
    });

    await h.api.initializeGeminiHttpSession('test');
    assert.equal(h.api.isUsingLocalWhisper(), false);
    assert.equal(h.api.getTranscriptionMode(), 'none');

    await h.segment(audio, 'Interviewer');
    assert.equal(whisperTranscribeCalls, 0, 'Local whisper must NOT be called in none mode');
    assert.equal(h.geminiTranscribeRequests.length, 0, 'Gemini audio transcription must NOT be called in none mode');
    assert.equal(h.requests.length, 0, 'No answer request should be made');
    assert.equal(h.saved.length, 0, 'No turns should be saved');

    // Screenshot questions still work normally
    const result = await h.api.handleHttpScreenshot('base64Image', 'Manual question', '/fake/shot.jpg');
    assert.ok(result.success);
    assert.equal(h.requests.length, 1);
});

test('whisper transcription failure emits error status and does not silently upload audio to gemini', async () => {
    const h = harness({
        preferences: { geminiHttpLocalWhisper: true },
        mockWhisper: {
            startWhisperServer: async () => 'http://127.0.0.1:8080',
            stopWhisperServer: () => {},
            transcribeAudio: async () => {
                throw new Error('Whisper server process crashed');
            },
        },
    });

    await h.api.initializeGeminiHttpSession('test');
    await h.segment(audio, 'Interviewer');

    // Remote gemini transcription must NEVER be called as a silent fallback
    assert.equal(h.geminiTranscribeRequests.length, 0, 'Must not silently fall back to Gemini audio upload');
    assert.equal(h.requests.length, 0, 'Answer pipeline should not be called on failed transcription');

    // Actionable error status should be sent to renderer
    const errorEvent = h.events.find(e => e[0] === 'update-status' && String(e[1]).includes('Whisper transcription failed'));
    assert.ok(errorEvent, 'Error status informing user of Whisper failure must be emitted');
});

test('local whisper handles queued speech and preserves attachments snapshots', async () => {
    let release;
    const h = harness({
        preferences: { geminiHttpLocalWhisper: true },
        mockWhisper: {
            startWhisperServer: async () => 'http://127.0.0.1:8080',
            stopWhisperServer: () => {},
            transcribeAudio: () =>
                new Promise(resolve => {
                    release = resolve;
                }),
        },
    });

    await h.api.initializeGeminiHttpSession('test');
    await h.api.handleHttpScreenshot('shot1Base64', 'First screen', '/fake/shot1.jpg');

    // Speech started while shot1 is active
    const speechPromise = h.segment(audio, 'Interviewer');

    // User takes a second screenshot during transcription
    await h.api.handleHttpScreenshot('shot2Base64', 'Second screen', '/fake/shot2.jpg');

    release('Question while looking at shot1');
    await speechPromise;
    await settle();

    assert.equal(h.requests.length, 3);
    const speechRequest = h.requests[2];
    const userParts = speechRequest.contents[speechRequest.contents.length - 1].parts;
    assert.ok(
        userParts.some(p => p.inlineData && p.inlineData.data === 'shot1Base64'),
        'Speech request should include snapshot image from start of speech'
    );
    assert.ok(!userParts.some(p => p.inlineData && p.inlineData.data === 'shot2Base64'));
});

test('session close followed by reopen with whisper transcription mode successfully transcribes new audio', async () => {
    let whisperCalls = 0;
    const h = harness({
        preferences: { geminiHttpTranscriptionMode: 'none' },
        mockWhisper: {
            startWhisperServer: async () => 'http://127.0.0.1:8080',
            stopWhisperServer: () => {},
            transcribeAudio: async () => {
                whisperCalls++;
                return 'Reconnected session question';
            },
        },
    });

    // Session 1: initialized in 'none' mode
    await h.api.initializeGeminiHttpSession('test');
    await h.segment(audio, 'Interviewer');
    assert.equal(whisperCalls, 0, 'No whisper calls in none mode');
    assert.equal(h.requests.length, 0);

    // Close session 1
    h.api.closeGeminiHttpSession();

    // User switches mode to 'whisper' and starts Session 2
    h.prefs.geminiHttpTranscriptionMode = 'whisper';
    await h.api.initializeGeminiHttpSession('test');

    // New speech arrives in Session 2
    await h.segment(audio, 'Interviewer');
    await settle();

    assert.equal(whisperCalls, 1, 'Whisper must be called in session 2 after switching mode to whisper');
    assert.equal(h.requests.length, 1, 'Gemini answer must be generated from Whisper transcript');
    const userParts = h.requests[0].contents[h.requests[0].contents.length - 1].parts;
    assert.ok(
        userParts.some(p => p.text && p.text.includes('Reconnected session question')),
        'Transcript must be included in conversation prompt'
    );
});

test('Gemini cloud transcription uses configured geminiHttpModel with verbatim instruction prompt and inline audio', async () => {
    const h = harness({
        preferences: { geminiHttpTranscriptionMode: 'gemini' },
        config: {
            geminiHttpModel: 'gemini-3.8-flash',
        },
    });

    await h.api.initializeGeminiHttpSession('test', '', 'interview', 'en-US');
    await h.segment(audio, 'Interviewer');
    await settle();

    assert.equal(h.geminiTranscribeRequests.length, 1, 'Should make 1 Gemini cloud transcription request');
    const trReq = h.geminiTranscribeRequests[0];
    assert.equal(trReq.model, 'gemini-3.8-flash', 'Must use configured geminiHttpModel');
    assert.equal(trReq.contents[0].parts.length, 2, 'Must include inline audio and verbatim prompt');
    assert.ok(trReq.contents[0].parts[0].inlineData, 'Must contain inline audio data');
    assert.ok(trReq.contents[0].parts[1].text.includes('Transcribe the spoken words verbatim'));

    // Answer request should follow
    assert.equal(h.requests.length, 1, 'Should trigger answer request after valid transcription');
    assert.equal(h.requests[0].model, 'gemini-3.8-flash', 'Answer request must use geminiHttpModel');
});

test('Gemini cloud transcription extracts text from candidate parts fallback when text property is missing', async () => {
    const h = harness({
        preferences: { geminiHttpTranscriptionMode: 'gemini' },
        transcribe: async () => ({
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: 'How does useEffect work?',
                            },
                        ],
                    },
                },
            ],
        }),
    });

    await h.api.initializeGeminiHttpSession('test', '', 'interview', 'en-US');
    await h.segment(audio, 'Interviewer');
    await settle();

    assert.equal(h.requests.length, 1, 'Should generate answer from candidate parts');
    const userParts = h.requests[0].contents[h.requests[0].contents.length - 1].parts;
    assert.ok(
        userParts.some(p => p.text && p.text.includes('How does useEffect work?')),
        'Candidate text should be extracted into transcript'
    );
});

test('Cloud transcription failure produces visible actionable error without silent fallback or answering', async () => {
    const h = harness({
        preferences: { geminiHttpTranscriptionMode: 'gemini' },
        config: {
            geminiHttpModel: 'gemini-3.8-flash',
        },
        transcribe: async () => {
            throw new Error('Model not found or permission denied');
        },
    });

    await h.api.initializeGeminiHttpSession('test');
    await h.segment(audio, 'Interviewer');
    await settle();

    assert.equal(h.requests.length, 0, 'Must not call answer pipeline on transcription error');
    const errEvent = h.events.find(e => e[0] === 'update-status' && String(e[1]).includes('Transcription failed (gemini-3.8-flash)'));
    assert.ok(errEvent, 'Must emit actionable error identifying the model');
});

test('storage DEFAULT_PREFERENCES defaults vadEnergyThreshold to 95', () => {
    const storage = require('../src/storage');
    assert.equal(storage.DEFAULT_PREFERENCES.vadEnergyThreshold, 95, 'Default VAD energy threshold must be 95');
});

test('speech gate ignores quiet noise and opens after sustained voice-like audio', async () => {
    const h = harness();
    await h.api.initializeGeminiHttpSession('test');

    // Generate 100ms 24kHz 16-bit mono PCM buffer of low amplitude (energy < 95)
    // 2400 samples * 2 bytes = 4800 bytes
    const lowEnergyChunk = Buffer.alloc(4800);
    const lowSampleVal = 50; // amplitude 50 has RMS energy 50 (< 95)
    for (let i = 0; i < lowEnergyChunk.length; i += 2) {
        lowEnergyChunk.writeInt16LE(lowSampleVal, i);
    }

    // Feed low-energy chunks
    h.api.processHttpAudioChunk(lowEnergyChunk, 'Interviewer');
    h.api.processHttpAudioChunk(lowEnergyChunk, 'Interviewer');
    await settle();

    assert.ok(!h.events.some(e => e[0] === 'update-status' && String(e[1]).includes('speech detected')), 'Low energy must not trigger speech');

    // An alternating waveform has speech-band activity; a fixed DC level does not.
    const highEnergyChunk = Buffer.alloc(4800);
    for (let i = 0; i < highEnergyChunk.length; i += 2) {
        highEnergyChunk.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 220 * i) / 48000)), i);
    }

    // Three consecutive chunks are required to open a segment.
    h.api.processHttpAudioChunk(highEnergyChunk, 'Interviewer');
    h.api.processHttpAudioChunk(highEnergyChunk, 'Interviewer');
    h.api.processHttpAudioChunk(highEnergyChunk, 'Interviewer');
    await settle();

    assert.ok(
        h.events.some(e => e[0] === 'update-status' && String(e[1]).includes('speech detected')),
        'High energy must trigger speech detected status'
    );
});

test('mic and system speech buffers close independently with their own labels', async () => {
    const h = harness();
    await h.api.initializeGeminiHttpSession('test');
    const speech = Buffer.alloc(4800);
    for (let i = 0; i < 2400; i++) speech.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 220 * i) / 24000)), i * 2);
    const silence = Buffer.alloc(4800);
    for (let i = 0; i < 5; i++) {
        h.api.processHttpAudioChunk(speech, 'You');
        h.api.processHttpAudioChunk(speech, 'Interviewer');
    }
    for (let i = 0; i < 10; i++) h.api.processHttpAudioChunk(silence, 'You');
    await settle();
    assert.equal(h.saved.length, 1);
    assert.match(h.saved[0][0], /^\[You\]:/);
    for (let i = 0; i < 10; i++) h.api.processHttpAudioChunk(silence, 'Interviewer');
    await settle();
    assert.equal(h.saved.length, 2);
    assert.match(h.saved[1][0], /^\[Interviewer\]:/);
});

test('conversation coach starts independent Gemini streams, bypasses Whisper, and does not block audio on coaching', async t => {
    const h = harness({ preferences: { conversationCoaching: true, audioMode: 'both', geminiHttpTranscriptionMode: 'whisper' } });
    t.after(() => h.api.closeGeminiHttpSession());
    assert.equal(await h.api.initializeGeminiHttpSession('test'), true);
    const streams = h.transcriptionConnections[0];
    assert.deepEqual(Array.from(streams.options.sources), ['You', 'Interviewer']);
    assert.equal(h.api.getTranscriptionMode(), 'gemini-streaming');
    h.api.processHttpAudioChunk(audio, 'You');
    h.api.processHttpAudioChunk(audio, 'Interviewer');
    assert.deepEqual(
        streams.audio.map(v => v.source),
        ['You', 'Interviewer']
    );
    assert.equal(h.geminiTranscribeRequests.length, 0);
    streams.options.onTranscript({ id: 'mic-1', source: 'You', text: 'Can edits happen offline?', final: true, startedAt: 1000 });
    await h.getCoach().evaluate();
    assert.equal(h.coachRequests.length, 1);
    assert.equal(h.requests.length, 0);
});

test('coached snapshots include confirmed speech and two related images without resetting the active problem', async t => {
    const h = harness({
        preferences: { conversationCoaching: true, audioMode: 'both' },
        coachResponse: async () => ({
            text: JSON.stringify({
                action: 'patch',
                captureIntent: 'review_code',
                captureReason: 'Current implementation of the active problem.',
                newProblem: false,
                contribution: 'screen',
                summary: 'Two sum. Constant space.',
                problem: { title: 'Two sum', requirements: ['Constant space'] },
                output: 'Basic: scan pairs. Optimized: two pointers on sorted input.',
            }),
        }),
    });
    t.after(() => h.api.closeGeminiHttpSession());
    await h.api.initializeGeminiHttpSession('test');
    h.transcriptionConnections[0].options.onTranscript({
        id: 'sys-1',
        source: 'Interviewer',
        text: 'Use constant space.',
        final: true,
        startedAt: 1000,
    });
    const first = await h.api.handleHttpScreenshot('statementData', 'Give two solutions', '/fake/statement.jpg');
    const second = await h.api.handleHttpScreenshot('codeData', 'Review the current code', '/fake/code.jpg');
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    const request = h.coachRequests.at(-1);
    assert.equal(request.contents[0].parts.length, 3);
    const context = JSON.parse(request.contents[0].parts[0].text);
    assert.ok(context.recentConversation.some(turn => turn.text === 'Use constant space.'));
    assert.equal(context.request.screenshotPreferences, 'Review the current code');
    assert.equal(h.api.getCoachState().problemId, 1);
    assert.equal(h.savedAnalyses.length, 2);
    assert.equal(h.api.startNewProblem().success, true);
    assert.equal(h.api.getCoachState().problemId, 2);
    assert.equal(h.api.getAttachmentsState().activeAttachmentIds.length, 0);
});

test('failed live transcription setup fails the session without silently selecting another provider', async () => {
    const h = harness({ preferences: { conversationCoaching: true }, streamError: 'Model access denied' });
    assert.equal(await h.api.initializeGeminiHttpSession('test'), false);
    assert.equal(h.api.isGeminiHttpActive(), false);
    assert.equal(h.transcriptionConnections[0].closed, true);
    assert.ok(h.events.some(event => event[0] === 'update-status' && event[1].includes('Model access denied')));
    assert.equal(h.requests.length, 0);
});

test('closing a coaching session rejects late transcript callbacks', async () => {
    const h = harness({ preferences: { conversationCoaching: true } });
    await h.api.initializeGeminiHttpSession('test');
    const connection = h.transcriptionConnections[0];
    h.api.closeGeminiHttpSession();
    connection.options.onTranscript({ id: 'late', source: 'You', text: 'Old transcript', final: true });
    assert.equal(h.saved.length, 0);
    assert.equal(h.api.getCoachState().active, false);
});

test('explicit coached follow-ups retain the images selected at submission time', async t => {
    const h = harness({
        preferences: { conversationCoaching: true },
        coachResponse: async () => ({
            text: JSON.stringify({
                action: 'explain',
                newProblem: false,
                contribution: 'question',
                summary: 'Current problem',
                problem: { title: 'Current problem' },
                output: 'Explanation of the selected image.',
            }),
        }),
    });
    t.after(() => h.api.closeGeminiHttpSession());
    await h.api.initializeGeminiHttpSession('test');
    h.api.registerScreenshot({ id: 'first', base64Data: 'first-data' });
    const pending = h.api.sendTextToGeminiHttp('Explain this code');
    h.api.registerScreenshot({ id: 'later', base64Data: 'later-data' });
    await h.getCoach().evaluate();
    assert.equal((await pending).success, true);
    const context = JSON.parse(h.coachRequests[0].contents[0].parts[0].text);
    assert.deepEqual(
        context.images.map(image => image.id),
        ['first']
    );
});

test('ambiguous captures support mouse resolution and retain their screenshot in history', async t => {
    let evaluations = 0;
    const h = harness({
        preferences: { conversationCoaching: true },
        coachResponse: async () => ({
            text: JSON.stringify({
                action: ++evaluations === 1 ? 'wait' : 'patch',
                newProblem: false,
                captureIntent: evaluations === 1 ? 'ambiguous' : 'review_code',
                captureReason: 'Partial code needs intent clarification.',
                contribution: 'screen',
                summary: 'Multiply strings',
                problem: { title: 'Multiply strings' },
                output: evaluations === 1 ? '' : 'Append the remaining carry after the loop.',
            }),
        }),
    });
    t.after(() => h.api.closeGeminiHttpSession());
    await h.api.initializeGeminiHttpSession('test');
    const capture = await h.api.handleHttpScreenshot('codePixels', 'Give two complete solutions', '/fake/code.jpg');
    assert.equal(capture.needsChoice, true);
    assert.equal(h.savedAnalyses.length, 0);
    const result = await h.api.captureAction(h.api.getCoachState().capture.id, 'review_code');
    assert.equal(result.success, true);
    assert.equal(h.savedAnalyses.length, 1);
    assert.equal(h.savedAnalyses[0][3], 'data:image/jpeg;base64,codePixels');
    assert.equal(h.savedAnalyses[0][4], '/fake/code.jpg');
});

test('muting discards an in-flight legacy transcription even after unmuting', async () => {
    let release;
    const h = harness({
        transcribe: () =>
            new Promise(resolve => {
                release = resolve;
            }),
    });
    await h.api.initializeGeminiHttpSession('test');
    const pending = h.segment(audio, 'You');
    h.api.setAudioMuted({ micMuted: true });
    h.api.setAudioMuted({ micMuted: false });
    release({ text: 'Obsolete muted speech' });
    await pending;
    assert.equal(h.saved.length, 0);
    assert.equal(h.requests.length, 0);
});

test('both muted blocks streaming audio and late captions while text requests remain available', async () => {
    const h = harness({ preferences: { conversationCoaching: true, audioMode: 'both' } });
    await h.api.initializeGeminiHttpSession('test');
    h.api.setAudioMuted({ micMuted: true, speakerMuted: true });
    const streams = h.transcriptionConnections[0];
    for (const source of ['You', 'Interviewer']) {
        h.api.processHttpAudioChunk(audio, source);
        streams.options.onTranscript({ id: source, source, text: 'Muted speech', final: true });
    }
    assert.equal(streams.audio.length, 0);
    assert.equal(h.saved.length, 0);
    await h.api.sendTextToGeminiHttp('Explain this');
    assert.equal(h.coachRequests.length, 1);
    h.api.closeGeminiHttpSession();
});

for (const coachingProvider of ['gemini', 'openai'])
    for (const transcriptionProvider of ['gemini', 'openai']) {
        test(`shared coach retains text and screen actions with ${coachingProvider}/${transcriptionProvider}`, async () => {
            const h = harness({
                preferences: { conversationCoaching: true, audioMode: 'both' },
                storageKey: '',
                coachResponse: async () => ({
                    text: JSON.stringify({
                        action: 'hint',
                        newProblem: false,
                        captureIntent: 'review_code',
                        captureReason: 'Existing code',
                        contribution: 'context',
                        summary: 'Shared problem',
                        problem: { title: 'Shared problem' },
                        output: 'A focused answer',
                    }),
                }),
            });
            const selection = {
                coachingProvider,
                transcriptionProvider,
                coachingKey: 'coach-secret',
                transcriptionKey: 'transcription-secret',
                model: coachingProvider === 'openai' ? 'gpt-6-luna' : 'gemini-model',
                transcriptionModel: transcriptionProvider === 'openai' ? 'gpt-live-transcribe' : 'gemini-transcription',
            };
            assert.equal(await h.api.initializeGeminiHttpSession('', '', 'interview', 'en-US', selection), true);
            assert.equal(h.api.getCoachState().sessionInfo.coaching.provider, coachingProvider);
            assert.equal(h.api.getCoachState().sessionInfo.coaching.model, selection.model);
            assert.equal(h.api.getCoachState().sessionInfo.transcription.provider, transcriptionProvider);
            assert.equal(JSON.stringify(h.api.getCoachState()).includes('secret'), false);
            const connection = h.transcriptionConnections[0];
            assert.equal(connection.options.apiKey, 'transcription-secret');
            assert.equal(connection.options.model, selection.transcriptionModel);
            for (const source of ['You', 'Interviewer']) h.api.processHttpAudioChunk(audio, source);
            assert.equal(connection.audio.length, 2);
            await h.api.sendTextToGeminiHttp('Explain this');
            assert.equal(h.coachRequests[0].provider, coachingProvider);
            assert.equal(h.coachRequests[0].key, 'coach-secret');
            assert.equal(h.coachRequests[0].model, selection.model);
            assert.equal(
                h.events.some(([channel]) => channel === 'new-response'),
                true
            );
            const screen = await h.api.handleHttpScreenshot('synthetic-image', 'Use Python', '/fake/screen.png');
            assert.equal(screen.success, true);
            assert.equal(h.coachRequests[1].images[0].data, 'synthetic-image');
            assert.equal(h.coachRequests[1].context.request.screenshotPreferences, 'Use Python');
            const action = await h.api.captureAction(h.api.getCoachState().capture.id, 'explain_visual');
            assert.equal(action.success, true);
            assert.equal(h.coachRequests[2].context.request.captureAction, 'explain_visual');
            h.api.closeGeminiHttpSession();
            assert.equal(connection.closed, true);
        });
    }
