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
} = {}) {
    const events = [],
        saved = [],
        savedAnalyses = [],
        requests = [],
        summarizeRequests = [],
        geminiTranscribeRequests = [];

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
                    getApiKey: () => 'test',
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

    // Request should contain inlineData and prompt
    assert.equal(h.requests.length, 1);
    const parts = h.requests[0].contents[0].parts;
    assert.ok(parts.some(p => p.inlineData && p.inlineData.data === 'base64Image1Data'));
    assert.ok(parts.some(p => p.text === '[Screen Analysis]: What does this diagram show?'));

    // Turns should be saved
    assert.equal(h.saved.length, 1);
    assert.equal(h.saved[0][0], '[Screen Analysis]: What does this diagram show?');
    assert.equal(h.savedAnalyses.length, 1);
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
