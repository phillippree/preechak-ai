const { logLlmRequest } = require('./llmRequestLogger');
const { GoogleGenAI, Modality } = require('@google/genai');
const { BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { saveDebugAudio } = require('../audioUtils');
const { getSystemPrompt } = require('./prompts');
const {
    getAvailableModel,
    incrementLimitCount,
    getApiKey,
    getGroqApiKey,
    incrementCharUsage,
    getConfig,
    getPreferences,
    saveScreenshotImage,
} = require('../storage');
const { connectCloud, sendCloudAudio, sendCloudText, sendCloudImage, closeCloud, isCloudActive, setOnTurnComplete } = require('./cloud');
const { startTransportLog, logTransportEvent, closeTransportLog } = require('./transportLogger');

// Lazy-loaded to avoid circular dependency (localai.js imports from gemini.js)
let _localai = null;
function getLocalAi() {
    if (!_localai) _localai = require('./localai');
    return _localai;
}

let _geminiHttp = null;
function getGeminiHttp() {
    if (!_geminiHttp) _geminiHttp = require('./gemini-http');
    return _geminiHttp;
}

// Provider mode: 'byok', 'byok_http', 'cloud', or 'local'
let currentProviderMode = 'byok';

// Groq conversation history for context
let groqConversationHistory = [];

// Conversation tracking variables
let currentSessionId = null;
let currentTranscription = '';
let conversationHistory = [];
let screenAnalysisHistory = [];
let currentProfile = null;
let currentCustomPrompt = null;
let isInitializingSession = false;
let lastMicVoiceTime = 0;
let lastSystemVoiceTime = 0;
let activeSpeaker = 'Interviewer';
let currentActiveChannel = 'Interviewer';
let isUserSpeakingOnMic = false;
let userMicTimer = null;
let systemSilenceTimer = null;
let lastTranscriptionSpeaker = null;
let isMicMuted = false;
let isSpeakerMuted = false;

const SILENCE_BOUNDARY_CHUNK = Buffer.alloc(24000 * 2 * 0.15); // 150ms of zeros

function getProfileSpeakerSilencePause(profile) {
    if (profile === 'meeting' || profile === 'presentation' || profile === 'negotiation') {
        return 2000; // 2.0s pause for business meetings / presentations
    }
    return 1000; // 1.0s pause for interviews / exams / default
}

async function sendSilenceBoundary(sessionRef) {
    const session = sessionRef?.current || global.geminiSessionRef?.current;
    if (!session) return;
    try {
        await session.sendRealtimeInput(
            logLlmRequest('Gemini sendRealtimeInput', {
                audio: {
                    data: SILENCE_BOUNDARY_CHUNK.toString('base64'),
                    mimeType: 'audio/pcm;rate=24000',
                },
            })
        );
    } catch (e) {}
}

function getPcmEnergy(buffer) {
    if (!buffer || buffer.length < 2) return 0;
    let sum = 0;
    const numSamples = Math.floor(buffer.length / 2);
    for (let i = 0; i < buffer.length - 1; i += 2) {
        const sample = buffer.readInt16LE(i);
        sum += sample * sample;
    }
    return Math.sqrt(sum / numSamples);
}

function resetAudioBuffers() {
    activeSpeaker = 'Interviewer';
    currentActiveChannel = 'Interviewer';
    isUserSpeakingOnMic = false;
    lastTranscriptionSpeaker = null;
    isMicMuted = false;
    isSpeakerMuted = false;
    if (userMicTimer) {
        clearTimeout(userMicTimer);
        userMicTimer = null;
    }
    if (systemSilenceTimer) {
        clearTimeout(systemSilenceTimer);
        systemSilenceTimer = null;
    }
}

function formatSpeakerResults(results) {
    let text = '';
    let prefs = {};
    try {
        prefs = getPreferences() || {};
    } catch (e) {}

    for (const result of results) {
        if (result.transcript) {
            let speakerLabel = 'Interviewer';
            if (prefs.audioMode === 'mic_only') {
                speakerLabel = 'You';
            } else if (prefs.audioMode === 'speaker_only') {
                speakerLabel = 'Interviewer';
            } else if (prefs.audioMode === 'both') {
                if (result.speakerId === 2) {
                    speakerLabel = 'You';
                } else if (result.speakerId === 1 && activeSpeaker === 'You') {
                    speakerLabel = 'You';
                } else {
                    speakerLabel = activeSpeaker || 'Interviewer';
                }
            }
            text += `[${speakerLabel}]: ${result.transcript}\n`;
        }
    }
    return text;
}

module.exports.formatSpeakerResults = formatSpeakerResults;

// Audio capture variables
let systemAudioProc = null;
let messageBuffer = '';
let groqRequestStartedForTurn = false;

const GROQ_MAX_COMPLETION_TOKENS = 16384;
const GROQ_EMPTY_RESPONSE_MESSAGE =
    'Groq reached the maximum completion-token limit before returning a final answer. Disable thinking in Home → AI responses and try again.';

// Reconnection variables
let isUserClosing = false;
let sessionParams = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

// Build context message for session restoration
function buildContextMessage() {
    const lastTurns = conversationHistory.slice(-20);
    const validTurns = lastTurns.filter(turn => turn.transcription?.trim() && turn.ai_response?.trim());

    if (validTurns.length === 0) return null;

    const contextLines = validTurns.map(turn => `[Interviewer]: ${turn.transcription.trim()}\n[Your answer]: ${turn.ai_response.trim()}`);

    return `Session reconnected. Here's the conversation so far:\n\n${contextLines.join('\n\n')}\n\nContinue from here.`;
}

// Conversation management functions
function initializeNewSession(profile = null, customPrompt = null) {
    currentSessionId = Date.now().toString();
    startTransportLog(currentSessionId);
    currentTranscription = '';
    groqRequestStartedForTurn = false;
    conversationHistory = [];
    screenAnalysisHistory = [];
    groqConversationHistory = [];
    currentProfile = profile;
    currentCustomPrompt = customPrompt;
    console.log('New conversation session started:', currentSessionId, 'profile:', profile);

    // Save initial session with profile context
    if (profile) {
        sendToRenderer('save-session-context', {
            sessionId: currentSessionId,
            profile: profile,
            customPrompt: customPrompt || '',
        });
    }
}

function saveConversationTurn(transcription, aiResponse) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const conversationTurn = {
        timestamp: Date.now(),
        transcription: transcription.trim(),
        ai_response: aiResponse.trim(),
    };

    conversationHistory.push(conversationTurn);
    console.log('Saved conversation turn:', conversationTurn);

    // Send to renderer to save in IndexedDB
    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn: conversationTurn,
        fullHistory: conversationHistory,
    });
}

function saveScreenAnalysis(prompt, response, model, image = null, imagePath = null) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const analysisEntry = {
        timestamp: Date.now(),
        prompt: prompt,
        response: response.trim(),
        model: model,
        image: image,
        imagePath: imagePath,
    };

    screenAnalysisHistory.push(analysisEntry);
    console.log('Saved screen analysis:', analysisEntry.prompt, 'imagePath:', imagePath);

    // Send to renderer to save
    sendToRenderer('save-screen-analysis', {
        sessionId: currentSessionId,
        analysis: analysisEntry,
        fullHistory: screenAnalysisHistory,
        profile: currentProfile,
        customPrompt: currentCustomPrompt,
    });
}

function getCurrentSessionData() {
    return {
        sessionId: currentSessionId,
        history: conversationHistory,
    };
}

async function getEnabledTools() {
    const tools = [];

    // Check if Google Search is enabled (default: true)
    const googleSearchEnabled = await getStoredSetting('googleSearchEnabled', 'true');
    console.log('Google Search enabled:', googleSearchEnabled);

    if (googleSearchEnabled === 'true') {
        tools.push({ googleSearch: {} });
        console.log('Added Google Search tool');
    } else {
        console.log('Google Search tool disabled');
    }

    return tools;
}

async function getStoredSetting(key, defaultValue) {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            // Wait a bit for the renderer to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to get setting from renderer process localStorage
            const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') {
                            console.log('localStorage not available yet for ${key}');
                            return '${defaultValue}';
                        }
                        const stored = localStorage.getItem('${key}');
                        console.log('Retrieved setting ${key}:', stored);
                        return stored || '${defaultValue}';
                    } catch (e) {
                        console.error('Error accessing localStorage for ${key}:', e);
                        return '${defaultValue}';
                    }
                })()
            `);
            return value;
        }
    } catch (error) {
        console.error('Error getting stored setting for', key, ':', error.message);
    }
    console.log('Using default value for', key, ':', defaultValue);
    return defaultValue;
}

// helper to check if groq has been configured
function hasGroqKey() {
    const key = getGroqApiKey();
    return key && key.trim() != '';
}

function sendFinalTranscriptionToGroq() {
    if (!hasGroqKey() || groqRequestStartedForTurn) {
        return;
    }

    const transcription = currentTranscription.trim();
    if (transcription === '') {
        return;
    }

    groqRequestStartedForTurn = true;
    sendToGroq(transcription);
}

function trimConversationHistoryForGemma(history, maxChars = 42000) {
    if (!history || history.length === 0) return [];
    let totalChars = 0;
    const trimmed = [];

    for (let i = history.length - 1; i >= 0; i--) {
        const turn = history[i];
        const turnChars = (turn.content || '').length;

        if (totalChars + turnChars > maxChars) break;
        totalChars += turnChars;
        trimmed.unshift(turn);
    }
    return trimmed;
}

function stripThinkingTags(text) {
    const trimmedStart = text.trimStart();
    if ('<think>'.startsWith(trimmedStart)) {
        return '';
    }

    return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
}

function getGroqReasoningOptions(model, disableThinking) {
    if (model.includes('qwen3')) {
        const options = {
            reasoning_format: 'hidden',
        };

        if (disableThinking) {
            options.reasoning_effort = 'none';
        }

        return options;
    }

    if (model.startsWith('openai/gpt-oss-')) {
        return {
            include_reasoning: false,
        };
    }

    return {};
}

async function sendToGroq(transcription) {
    const groqApiKey = getGroqApiKey();
    if (!groqApiKey) {
        console.log('No Groq API key configured, skipping Groq response');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Groq');
        return;
    }

    const config = getConfig();
    const modelToUse = config.groqModel;

    console.log(`Sending to Groq (${modelToUse}):`, transcription.substring(0, 100) + '...');
    logTransportEvent('groq.text.request', {
        model: modelToUse,
        transcription,
    });

    sendToRenderer('live-thinking', { isThinking: true, prompt: transcription });

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    if (groqConversationHistory.length > 20) {
        groqConversationHistory = groqConversationHistory.slice(-20);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(
                logLlmRequest('Groq', {
                    model: modelToUse,
                    messages: [{ role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' }, ...groqConversationHistory],
                    stream: true,
                    temperature: 0.7,
                    max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
                    ...getGroqReasoningOptions(modelToUse, config.disableGroqThinking),
                })
            ),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', response.status, errorText);
            logTransportEvent('groq.text.http_error', {
                status: response.status,
                body: errorText,
            });
            sendToRenderer('update-status', `Groq error: ${response.status}`);
            return;
        }

        logTransportEvent('groq.text.http_response', {
            status: response.status,
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;
        let finishReason = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            logTransportEvent('groq.text.stream_chunk', { chunk });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        logTransportEvent('groq.text.stream_event', json);
                        finishReason = json.choices?.[0]?.finish_reason || finishReason;
                        const token = json.choices?.[0]?.delta?.content || '';
                        if (token) {
                            fullText += token;
                            const displayText = stripThinkingTags(fullText);
                            if (displayText) {
                                if (isFirst) {
                                    sendToRenderer('live-thinking', { isThinking: false });
                                    sendToRenderer('live-transcription', { text: '', isListening: false });
                                }
                                sendToRenderer(isFirst ? 'new-response' : 'update-response', {
                                    prompt: transcription,
                                    text: displayText,
                                    timestamp: Date.now(),
                                });
                                isFirst = false;
                            }
                        }
                    } catch (parseError) {
                        logTransportEvent('groq.text.stream_parse_error', {
                            data,
                            error: parseError.message,
                        });
                    }
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        const modelKey = modelToUse.split('/').pop();

        const systemPromptChars = (currentSystemPrompt || 'You are a helpful assistant.').length;
        const historyChars = groqConversationHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
        const inputChars = systemPromptChars + historyChars;
        const outputChars = cleanedResponse.length;

        incrementCharUsage('groq', modelKey, inputChars + outputChars);

        if (cleanedResponse) {
            groqConversationHistory.push({
                role: 'assistant',
                content: cleanedResponse,
            });

            saveConversationTurn(transcription, cleanedResponse);
        } else {
            console.warn(`Groq returned no final answer (${modelToUse})`);
            logTransportEvent('groq.text.empty_response', {
                model: modelToUse,
                fullText,
                finishReason,
            });
            sendToRenderer('live-thinking', { isThinking: false });
            sendToRenderer('live-transcription', { text: '', isListening: false });
            sendToRenderer('new-response', GROQ_EMPTY_RESPONSE_MESSAGE);
            sendToRenderer('update-status', 'Groq reached the completion-token limit');
            return;
        }

        logTransportEvent('groq.text.completed', {
            model: modelToUse,
            response: cleanedResponse,
        });
        console.log(`Groq response completed (${modelToUse})`);
        sendToRenderer('live-thinking', { isThinking: false });
        sendToRenderer('live-transcription', { text: '', isListening: false });
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Groq API:', error);
        logTransportEvent('groq.text.error', {
            error: error.message,
            stack: error.stack,
        });
        sendToRenderer('live-thinking', { isThinking: false });
        sendToRenderer('live-transcription', { text: '', isListening: false });
        sendToRenderer('update-status', 'Groq error: ' + error.message);
    }
}

async function sendImageToGroq(base64Data, prompt, savedImagePath = null) {
    const groqApiKey = getGroqApiKey();
    const config = getConfig();
    const model = config.groqImageModel;

    logTransportEvent('groq.image.request', {
        model,
        prompt,
        imageBytes: Buffer.byteLength(base64Data, 'base64'),
    });

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(
                logLlmRequest('Groq', {
                    model,
                    messages: [
                        { role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/jpeg;base64,${base64Data}`,
                                    },
                                },
                            ],
                        },
                    ],
                    stream: true,
                    temperature: 0.7,
                    max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
                    ...getGroqReasoningOptions(model, config.disableGroqThinking),
                })
            ),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq image API error:', response.status, errorText);
            logTransportEvent('groq.image.http_error', {
                status: response.status,
                body: errorText,
            });
            return { success: false, error: `Groq error: ${response.status}` };
        }

        logTransportEvent('groq.image.http_response', {
            status: response.status,
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;
        let finishReason = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            logTransportEvent('groq.image.stream_chunk', { chunk });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    logTransportEvent('groq.image.stream_event', json);
                    finishReason = json.choices?.[0]?.finish_reason || finishReason;
                    const token = json.choices?.[0]?.delta?.content || '';
                    if (!token) continue;

                    fullText += token;
                    const displayText = stripThinkingTags(fullText);
                    if (displayText) {
                        sendToRenderer(isFirst ? 'new-response' : 'update-response', {
                            prompt: prompt || 'Screen Analysis',
                            text: displayText,
                            image: `data:image/jpeg;base64,${base64Data}`,
                            imagePath: savedImagePath,
                            timestamp: Date.now(),
                        });
                        isFirst = false;
                    }
                } catch (parseError) {
                    logTransportEvent('groq.image.stream_parse_error', {
                        data,
                        error: parseError.message,
                    });
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        if (!cleanedResponse) {
            logTransportEvent('groq.image.empty_response', {
                model,
                fullText,
                finishReason,
            });
            return { success: false, error: GROQ_EMPTY_RESPONSE_MESSAGE };
        }

        saveScreenAnalysis(prompt, cleanedResponse, model, `data:image/jpeg;base64,${base64Data}`, savedImagePath);
        logTransportEvent('groq.image.completed', {
            model,
            response: cleanedResponse,
        });
        return { success: true, text: cleanedResponse, model };
    } catch (error) {
        console.error('Error calling Groq image API:', error);
        logTransportEvent('groq.image.error', {
            error: error.message,
            stack: error.stack,
        });
        return { success: false, error: error.message };
    }
}

async function sendToGemma(transcription) {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log('No Gemini API key configured');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Gemma');
        return;
    }

    console.log('Sending to Gemma:', transcription.substring(0, 100) + '...');

    sendToRenderer('live-thinking', { isThinking: true, prompt: transcription });

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    const trimmedHistory = trimConversationHistoryForGemma(groqConversationHistory, 42000);

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const messages = trimmedHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
        }));

        const systemPrompt = currentSystemPrompt || 'You are a helpful assistant.';
        const messagesWithSystem = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
            ...messages,
        ];

        const response = await ai.models.generateContentStream(
            logLlmRequest('Gemini generateContentStream', {
                model: 'gemma-4-26b-a4b-it',
                contents: messagesWithSystem,
            })
        );

        let fullText = '';
        let isFirst = true;

        for await (const chunk of response) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullText += chunkText;
                if (isFirst) {
                    sendToRenderer('live-thinking', { isThinking: false });
                    sendToRenderer('live-transcription', { text: '', isListening: false });
                }
                sendToRenderer(isFirst ? 'new-response' : 'update-response', {
                    prompt: transcription,
                    text: fullText,
                    timestamp: Date.now(),
                });
                isFirst = false;
            }
        }

        const systemPromptChars = (currentSystemPrompt || 'You are a helpful assistant.').length;
        const historyChars = trimmedHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
        const inputChars = systemPromptChars + historyChars;
        const outputChars = fullText.length;

        incrementCharUsage('gemini', 'gemma-4-26b-a4b-it', inputChars + outputChars);

        if (fullText.trim()) {
            groqConversationHistory.push({
                role: 'assistant',
                content: fullText.trim(),
            });

            if (groqConversationHistory.length > 40) {
                groqConversationHistory = groqConversationHistory.slice(-40);
            }

            saveConversationTurn(transcription, fullText);
        }

        console.log('Gemma response completed');
        sendToRenderer('live-thinking', { isThinking: false });
        sendToRenderer('live-transcription', { text: '', isListening: false });
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Gemma API:', error);
        sendToRenderer('live-thinking', { isThinking: false });
        sendToRenderer('live-transcription', { text: '', isListening: false });
        sendToRenderer('update-status', 'Gemma error: ' + error.message);
    }
}

async function initializeGeminiSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US', isReconnect = false) {
    if (isInitializingSession) {
        console.log('Session initialization already in progress');
        return false;
    }

    isInitializingSession = true;
    if (!isReconnect) {
        sendToRenderer('session-initializing', true);
    }

    // Store params for reconnection
    if (!isReconnect) {
        sessionParams = { apiKey, customPrompt, profile, language };
        reconnectAttempts = 0;
    }

    const client = new GoogleGenAI({
        vertexai: false,
        apiKey: apiKey,
        httpOptions: { apiVersion: 'v1alpha' },
    });

    // Get enabled tools first to determine Google Search status
    const enabledTools = await getEnabledTools();
    const googleSearchEnabled = enabledTools.some(tool => tool.googleSearch);

    const systemPrompt = getSystemPrompt(profile, customPrompt, googleSearchEnabled);
    currentSystemPrompt = systemPrompt; // Store for Groq

    // Initialize new conversation session only on first connect
    if (!isReconnect) {
        initializeNewSession(profile, customPrompt);
    }

    try {
        const liveModel = getConfig().geminiLiveModel;
        console.log(`Connecting to Gemini Live with model: "${liveModel}"`);
        const session = await client.live.connect(
            logLlmRequest('Gemini connect', {
                model: liveModel,
                callbacks: {
                    onopen: function () {
                        logTransportEvent('gemini.live.opened', {});
                        sendToRenderer('update-status', 'Live session connected');
                    },
                    onmessage: function (message) {
                        console.log('----------------', message);
                        logTransportEvent('gemini.live.message', message);

                        // Handle input transcription (what was spoken)
                        if (message.serverContent?.inputTranscription?.results) {
                            currentTranscription += formatSpeakerResults(message.serverContent.inputTranscription.results);
                            sendToRenderer('live-transcription', {
                                text: currentTranscription.trim(),
                                speaker: activeSpeaker || 'Interviewer',
                                isListening: true,
                            });
                        } else if (message.serverContent?.inputTranscription?.text) {
                            const text = message.serverContent.inputTranscription.text;
                            if (text.trim() !== '') {
                                let prefs = {};
                                try {
                                    prefs = getPreferences() || {};
                                } catch (e) {}

                                let speaker = 'Interviewer';
                                if (prefs.audioMode === 'mic_only') {
                                    speaker = 'You';
                                } else if (prefs.audioMode === 'speaker_only') {
                                    speaker = 'Interviewer';
                                } else if (prefs.audioMode === 'both') {
                                    speaker = activeSpeaker || 'Interviewer';
                                }

                                if (lastTranscriptionSpeaker !== speaker) {
                                    if (currentTranscription.trim() !== '') {
                                        currentTranscription += '\n';
                                    }
                                    currentTranscription += `[${speaker}]: ${text}`;
                                    lastTranscriptionSpeaker = speaker;
                                } else {
                                    currentTranscription += ` ${text}`;
                                }

                                sendToRenderer('live-transcription', {
                                    text: currentTranscription.trim(),
                                    speaker: speaker,
                                    isListening: true,
                                });
                            }
                        }

                        if (message.serverContent?.inputTranscription) {
                            sendFinalTranscriptionToGroq();
                        }

                        if (!hasGroqKey() && message.serverContent?.outputTranscription?.text) {
                            const isFirstChunk = messageBuffer === '';
                            messageBuffer += message.serverContent.outputTranscription.text;
                            sendToRenderer('live-transcription', { text: '', isListening: false });
                            sendToRenderer('live-thinking', { isThinking: false });
                            sendToRenderer(isFirstChunk ? 'new-response' : 'update-response', {
                                prompt: currentTranscription.trim(),
                                text: messageBuffer,
                                timestamp: Date.now(),
                            });
                        }

                        if (message.serverContent?.interrupted) {
                            lastTranscriptionSpeaker = null;
                            sendToRenderer('live-transcription', { text: '', isListening: false });
                            sendToRenderer('live-thinking', { isThinking: false });
                            if (currentTranscription.trim() !== '' && !hasGroqKey() && messageBuffer.trim() !== '') {
                                saveConversationTurn(currentTranscription, messageBuffer);
                            }
                        }

                        if (message.serverContent?.generationComplete) {
                            lastTranscriptionSpeaker = null;
                            sendToRenderer('live-transcription', { text: '', isListening: false });
                            sendToRenderer('live-thinking', { isThinking: false });
                            if (currentTranscription.trim() !== '') {
                                if (!hasGroqKey() && messageBuffer.trim() !== '') {
                                    saveConversationTurn(currentTranscription, messageBuffer);
                                }
                                currentTranscription = '';
                            }
                            messageBuffer = '';
                        }

                        if (message.serverContent?.turnComplete) {
                            lastTranscriptionSpeaker = null;
                            currentTranscription = '';
                            messageBuffer = '';
                            groqRequestStartedForTurn = false;
                            sendToRenderer('live-transcription', { text: '', isListening: false });
                            sendToRenderer('live-thinking', { isThinking: false });
                            sendToRenderer('update-status', 'Listening...');
                        }
                    },
                    onerror: function (e) {
                        console.log('Session error:', e.message);
                        logTransportEvent('gemini.live.error', {
                            error: e.message,
                        });
                        sendToRenderer('update-status', 'Error: ' + e.message);
                    },
                    onclose: function (e) {
                        console.log('Session closed:', e.reason);
                        logTransportEvent('gemini.live.closed', {
                            reason: e.reason,
                        });

                        // Don't reconnect if user intentionally closed
                        if (isUserClosing) {
                            isUserClosing = false;
                            closeTransportLog();
                            sendToRenderer('update-status', 'Session closed');
                            return;
                        }

                        // Attempt reconnection
                        if (sessionParams && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                            attemptReconnect();
                        } else {
                            closeTransportLog();
                            sendToRenderer('update-status', 'Session closed');
                        }
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    proactivity: { proactiveAudio: true },
                    outputAudioTranscription: {},
                    tools: enabledTools,
                    // Enable speaker diarization
                    inputAudioTranscription: {
                        enableSpeakerDiarization: true,
                        minSpeakerCount: 2,
                        maxSpeakerCount: 2,
                    },
                    contextWindowCompression: { slidingWindow: {} },
                    speechConfig: { languageCode: language },
                    systemInstruction: {
                        parts: [{ text: systemPrompt }],
                    },
                },
            })
        );

        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return session;
    } catch (error) {
        console.error('Failed to initialize Gemini session:', error);
        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return null;
    }
}

async function attemptReconnect() {
    reconnectAttempts++;
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    // Clear stale buffers
    messageBuffer = '';
    currentTranscription = '';
    // Don't reset groqConversationHistory to preserve context across reconnects

    sendToRenderer('update-status', `Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    // Wait before attempting
    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

    try {
        const session = await initializeGeminiSession(
            sessionParams.apiKey,
            sessionParams.customPrompt,
            sessionParams.profile,
            sessionParams.language,
            true // isReconnect
        );

        if (session && global.geminiSessionRef) {
            global.geminiSessionRef.current = session;

            // Restore context from conversation history via text message
            const contextMessage = buildContextMessage();
            if (contextMessage) {
                try {
                    console.log('Restoring conversation context...');
                    await session.sendRealtimeInput(logLlmRequest('Gemini sendRealtimeInput', { text: contextMessage }));
                } catch (contextError) {
                    console.error('Failed to restore context:', contextError);
                    // Continue without context - better than failing
                }
            }

            // Don't reset reconnectAttempts here - let it reset on next fresh session
            sendToRenderer('update-status', 'Reconnected! Listening...');
            console.log('Session reconnected successfully');
            return true;
        }
    } catch (error) {
        console.error(`Reconnection attempt ${reconnectAttempts} failed:`, error);
    }

    // If we still have attempts left, try again
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        return attemptReconnect();
    }

    // Max attempts reached - notify frontend
    console.log('Max reconnection attempts reached');
    sendToRenderer('reconnect-failed', {
        message: 'Tried 3 times to reconnect. Must be upstream/network issues. Try restarting or download updated app from site.',
    });
    sessionParams = null;
    return false;
}

function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        console.log('Checking for existing SystemAudioDump processes...');

        // Kill any existing SystemAudioDump processes
        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
            stdio: 'ignore',
        });

        killProc.on('close', code => {
            if (code === 0) {
                console.log('Killed existing SystemAudioDump processes');
            } else {
                console.log('No existing SystemAudioDump processes found');
            }
            resolve();
        });

        killProc.on('error', err => {
            console.log('Error checking for existing processes (this is normal):', err.message);
            resolve();
        });

        // Timeout after 2 seconds
        setTimeout(() => {
            killProc.kill();
            resolve();
        }, 2000);
    });
}

async function startMacOSAudioCapture(geminiSessionRef) {
    if (process.platform !== 'darwin') return false;

    resetAudioBuffers();

    // Kill any existing SystemAudioDump processes first
    await killExistingSystemAudioDump();

    console.log('Starting macOS audio capture with SystemAudioDump...');

    const { app } = require('electron');
    const path = require('path');

    let systemAudioPath;
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../assets', 'SystemAudioDump');
    }

    console.log('SystemAudioDump path:', systemAudioPath);

    const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
        },
    };

    systemAudioProc = spawn(systemAudioPath, [], spawnOptions);

    if (!systemAudioProc.pid) {
        console.error('Failed to start SystemAudioDump');
        return false;
    }

    console.log('SystemAudioDump started with PID:', systemAudioProc.pid);

    const CHUNK_DURATION = 0.1;
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

    let audioBuffer = Buffer.alloc(0);

    systemAudioProc.stdout.on('data', data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);

            let prefs = {};
            try {
                prefs = getPreferences() || {};
            } catch (e) {}

            const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;
            if (isSpeakerMuted) {
                continue;
            }
            const energy = getPcmEnergy(monoChunk);

            if (prefs.audioMode === 'both') {
                if (energy > 60) {
                    lastSystemVoiceTime = Date.now();
                    if (systemSilenceTimer) {
                        clearTimeout(systemSilenceTimer);
                        systemSilenceTimer = null;
                    }
                    if (currentActiveChannel !== 'Interviewer') {
                        currentActiveChannel = 'Interviewer';
                        activeSpeaker = 'Interviewer';
                        sendSilenceBoundary(geminiSessionRef);
                    } else {
                        activeSpeaker = 'Interviewer';
                    }
                } else if (lastSystemVoiceTime > 0 && currentActiveChannel === 'Interviewer' && !systemSilenceTimer) {
                    const activeProf = sessionParams?.profile || currentProfile || 'interview';
                    const pauseDelay = getProfileSpeakerSilencePause(activeProf);
                    systemSilenceTimer = setTimeout(() => {
                        if (currentActiveChannel === 'Interviewer' && !isUserSpeakingOnMic) {
                            sendSilenceBoundary(geminiSessionRef);
                        }
                        systemSilenceTimer = null;
                    }, pauseDelay);
                }
            } else {
                if (energy > 60) {
                    lastSystemVoiceTime = Date.now();
                    activeSpeaker = 'Interviewer';
                }
            }

            if (currentProviderMode === 'cloud') {
                sendCloudAudio(monoChunk);
            } else if (currentProviderMode === 'local') {
                getLocalAi().processLocalAudio(monoChunk);
            } else if (currentProviderMode === 'byok_http') {
                getGeminiHttp().processHttpAudioChunk(monoChunk, 'Interviewer');
            } else {
                const base64Data = monoChunk.toString('base64');
                sendAudioToGemini(base64Data, geminiSessionRef);
            }

            if (process.env.DEBUG_AUDIO) {
                console.log(`Processed audio chunk: ${chunk.length} bytes`);
                saveDebugAudio(monoChunk, 'system_audio');
            }
        }

        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    systemAudioProc.stderr.on('data', data => {
        console.error('SystemAudioDump stderr:', data.toString());
    });

    systemAudioProc.on('close', code => {
        console.log('SystemAudioDump process closed with code:', code);
        systemAudioProc = null;
    });

    systemAudioProc.on('error', err => {
        console.error('SystemAudioDump process error:', err);
        systemAudioProc = null;
    });

    return true;
}

function convertStereoToMono(stereoBuffer) {
    const samples = stereoBuffer.length / 4;
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
        const leftSample = stereoBuffer.readInt16LE(i * 4);
        monoBuffer.writeInt16LE(leftSample, i * 2);
    }

    return monoBuffer;
}

function stopMacOSAudioCapture() {
    resetAudioBuffers();
    if (systemAudioProc) {
        console.log('Stopping SystemAudioDump...');
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }
}

async function sendAudioToGemini(base64Data, geminiSessionRef) {
    if (!geminiSessionRef.current) return;

    try {
        process.stdout.write('.');
        await geminiSessionRef.current.sendRealtimeInput(
            logLlmRequest('Gemini sendRealtimeInput', {
                audio: {
                    data: base64Data,
                    mimeType: 'audio/pcm;rate=24000',
                },
            })
        );
    } catch (error) {
        console.error('Error sending audio to Gemini:', error);
    }
}

async function sendImageToGeminiHttp(base64Data, prompt, savedImagePath = null) {
    const config = getConfig();
    const model = config.apiTransportMode === 'http' && config.geminiHttpModel ? config.geminiHttpModel : getAvailableModel();

    const apiKey = getApiKey();
    if (!apiKey) {
        return { success: false, error: 'No API key configured' };
    }

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const contents = [
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                },
            },
            { text: prompt },
        ];

        console.log(`Sending image to ${model} (streaming)...`);
        const response = await ai.models.generateContentStream(
            logLlmRequest('Gemini generateContentStream', {
                model: model,
                contents: contents,
            })
        );

        // Increment count after successful call
        incrementLimitCount(model);

        // Stream the response
        let fullText = '';
        let isFirst = true;
        for await (const chunk of response) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullText += chunkText;
                // Send to renderer - new response for first chunk, update for subsequent
                sendToRenderer(isFirst ? 'new-response' : 'update-response', {
                    prompt: prompt || 'Screen Analysis',
                    text: fullText,
                    image: `data:image/jpeg;base64,${base64Data}`,
                    imagePath: savedImagePath,
                    timestamp: Date.now(),
                });
                isFirst = false;
            }
        }

        console.log(`Image response completed from ${model}`);

        // Save screen analysis to history
        saveScreenAnalysis(prompt, fullText, model, `data:image/jpeg;base64,${base64Data}`, savedImagePath);

        return { success: true, text: fullText, model: model };
    } catch (error) {
        console.error('Error sending image to Gemini HTTP:', error);
        return { success: false, error: error.message };
    }
}

function setupGeminiIpcHandlers(geminiSessionRef) {
    // Store the geminiSessionRef globally for reconnection access
    global.geminiSessionRef = geminiSessionRef;

    ipcMain.handle('initialize-cloud', async (event, token, profile, userContext) => {
        try {
            currentProviderMode = 'cloud';
            initializeNewSession(profile);
            setOnTurnComplete((transcription, response) => {
                saveConversationTurn(transcription, response);
            });
            sendToRenderer('session-initializing', true);
            await connectCloud(token, profile, userContext);
            sendToRenderer('session-initializing', false);
            return true;
        } catch (err) {
            console.error('[Cloud] Init error:', err);
            currentProviderMode = 'byok';
            sendToRenderer('session-initializing', false);
            return false;
        }
    });

    ipcMain.handle('initialize-gemini', async (event, apiKey, customPrompt, profile = 'interview', language = 'en-US') => {
        const config = getConfig();
        const transportMode = config.apiTransportMode || 'websocket';

        if (transportMode === 'http') {
            currentProviderMode = 'byok_http';
            const success = await getGeminiHttp().initializeGeminiHttpSession(apiKey, customPrompt, profile, language);
            return success;
        }

        currentProviderMode = 'byok';
        const session = await initializeGeminiSession(apiKey, customPrompt, profile, language);
        if (session) {
            geminiSessionRef.current = session;
            return true;
        }
        return false;
    });

    ipcMain.handle('initialize-local', async (event, localLlmModel, whisperModel, profile, customPrompt) => {
        currentProviderMode = 'local';
        const success = await getLocalAi().initializeLocalSession(localLlmModel, whisperModel, profile, customPrompt);
        if (!success) {
            currentProviderMode = 'byok';
        }
        return success;
    });

    ipcMain.handle('cancel-local-initialization', async () => {
        const cancelled = await getLocalAi().cancelLocalInitialization();
        if (cancelled) {
            currentProviderMode = 'byok';
        }
        return cancelled;
    });

    ipcMain.handle('send-audio-content', async (event, { data, mimeType }) => {
        if (isSpeakerMuted) {
            return { success: true, muted: true };
        }

        let pcmBuffer = null;
        try {
            pcmBuffer = Buffer.from(data, 'base64');
        } catch (e) {}

        let prefs = {};
        try {
            prefs = getPreferences() || {};
        } catch (e) {}

        const energy = pcmBuffer ? getPcmEnergy(pcmBuffer) : 0;

        if (prefs.audioMode === 'both') {
            if (energy > 60) {
                lastSystemVoiceTime = Date.now();
                if (systemSilenceTimer) {
                    clearTimeout(systemSilenceTimer);
                    systemSilenceTimer = null;
                }
                if (currentActiveChannel !== 'Interviewer') {
                    currentActiveChannel = 'Interviewer';
                    activeSpeaker = 'Interviewer';
                    sendSilenceBoundary(geminiSessionRef);
                } else {
                    activeSpeaker = 'Interviewer';
                }
            } else if (lastSystemVoiceTime > 0 && currentActiveChannel === 'Interviewer' && !systemSilenceTimer) {
                const activeProf = sessionParams?.profile || currentProfile || 'interview';
                const pauseDelay = getProfileSpeakerSilencePause(activeProf);
                systemSilenceTimer = setTimeout(() => {
                    if (currentActiveChannel === 'Interviewer' && !isUserSpeakingOnMic) {
                        sendSilenceBoundary(geminiSessionRef);
                    }
                    systemSilenceTimer = null;
                }, pauseDelay);
            }
        } else {
            if (energy > 60) {
                lastSystemVoiceTime = Date.now();
                activeSpeaker = 'Interviewer';
            }
        }

        if (currentProviderMode === 'cloud') {
            try {
                sendCloudAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (currentProviderMode === 'local') {
            try {
                getLocalAi().processLocalAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending local audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (currentProviderMode === 'byok_http') {
            try {
                getGeminiHttp().processHttpAudioChunk(pcmBuffer, activeSpeaker || 'Interviewer');
                return { success: true };
            } catch (error) {
                console.error('Error sending HTTP audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };
        try {
            process.stdout.write('.');
            await geminiSessionRef.current.sendRealtimeInput(
                logLlmRequest('Gemini sendRealtimeInput', {
                    audio: { data: data, mimeType: mimeType },
                })
            );
            return { success: true };
        } catch (error) {
            console.error('Error sending system audio:', error);
            return { success: false, error: error.message };
        }
    });

    // Handle microphone audio on a separate channel
    ipcMain.handle('send-mic-audio-content', async (event, { data, mimeType }) => {
        if (isMicMuted) {
            return { success: true, muted: true };
        }

        let pcmBuffer = null;
        try {
            pcmBuffer = Buffer.from(data, 'base64');
        } catch (e) {}

        let prefs = {};
        try {
            prefs = getPreferences() || {};
        } catch (e) {}

        const energy = pcmBuffer ? getPcmEnergy(pcmBuffer) : 0;

        if (prefs.audioMode === 'both') {
            if (energy > 120) {
                lastMicVoiceTime = Date.now();
                isUserSpeakingOnMic = true;
                if (systemSilenceTimer) {
                    clearTimeout(systemSilenceTimer);
                    systemSilenceTimer = null;
                }
                if (userMicTimer) clearTimeout(userMicTimer);
                userMicTimer = setTimeout(() => {
                    isUserSpeakingOnMic = false;
                    sendSilenceBoundary(geminiSessionRef);
                }, 500);

                if (currentActiveChannel !== 'You') {
                    currentActiveChannel = 'You';
                    activeSpeaker = 'You';
                    sendSilenceBoundary(geminiSessionRef);
                }
            }
        } else {
            if (energy > 60) {
                lastMicVoiceTime = Date.now();
                activeSpeaker = 'You';
            }
        }

        if (currentProviderMode === 'cloud') {
            try {
                sendCloudAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud mic audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (currentProviderMode === 'local') {
            try {
                getLocalAi().processLocalAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending local mic audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (currentProviderMode === 'byok_http') {
            try {
                getGeminiHttp().processHttpAudioChunk(pcmBuffer, 'You');
                return { success: true };
            } catch (error) {
                console.error('Error sending HTTP mic audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };
        try {
            process.stdout.write(',');
            await geminiSessionRef.current.sendRealtimeInput(
                logLlmRequest('Gemini sendRealtimeInput', {
                    audio: { data: data, mimeType: mimeType },
                })
            );
            return { success: true };
        } catch (error) {
            console.error('Error sending mic audio:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-image-content', async (event, { data, prompt }) => {
        try {
            if (!data || typeof data !== 'string') {
                console.error('Invalid image data received');
                return { success: false, error: 'Invalid image data' };
            }

            const buffer = Buffer.from(data, 'base64');

            if (buffer.length < 1000) {
                console.error(`Image buffer too small: ${buffer.length} bytes`);
                return { success: false, error: 'Image buffer too small' };
            }

            // Save screenshot image to local storage
            const savedImagePath = saveScreenshotImage(currentSessionId || Date.now(), data);

            process.stdout.write('!');

            if (currentProviderMode === 'cloud') {
                const sent = sendCloudImage(data);
                if (!sent) {
                    return { success: false, error: 'Cloud connection not active' };
                }
                return { success: true, model: 'cloud', imagePath: savedImagePath };
            }

            if (currentProviderMode === 'local') {
                const result = await getLocalAi().sendLocalImage(data, prompt, savedImagePath);
                return result;
            }

            if (currentProviderMode === 'byok_http') {
                return await getGeminiHttp().handleHttpScreenshot(data, prompt, savedImagePath);
            }

            const result = hasGroqKey()
                ? await sendImageToGroq(data, prompt, savedImagePath)
                : await sendImageToGeminiHttp(data, prompt, savedImagePath);
            return result;
        } catch (error) {
            console.error('Error sending image:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('gemini-http:get-attachments', () => {
        return getGeminiHttp().getAttachmentsState();
    });

    ipcMain.handle('gemini-http:set-active-attachments', (event, ids) => {
        return getGeminiHttp().setActiveAttachments(ids);
    });

    ipcMain.handle('gemini-http:remove-attachment', (event, id) => {
        return getGeminiHttp().removeAttachment(id);
    });

    ipcMain.handle('gemini-http:compare-previous', () => {
        return getGeminiHttp().compareWithPrevious();
    });

    ipcMain.handle('gemini-http:select-history-attachment', (event, id) => {
        return getGeminiHttp().selectHistoryAttachment(id);
    });

    ipcMain.handle('gemini-http:clear-attachments', () => {
        return getGeminiHttp().clearActiveAttachments();
    });

    ipcMain.handle('set-audio-mute-state', (event, { micMuted, speakerMuted }) => {
        if (micMuted !== undefined) isMicMuted = !!micMuted;
        if (speakerMuted !== undefined) isSpeakerMuted = !!speakerMuted;
        return { success: true, isMicMuted, isSpeakerMuted };
    });

    ipcMain.handle('get-audio-mute-state', () => {
        return { isMicMuted, isSpeakerMuted };
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { success: false, error: 'Invalid text message' };
        }

        const trimmedText = text.trim();

        if (currentProviderMode === 'cloud') {
            try {
                console.log('Sending text to cloud:', text);
                sendCloudText(trimmedText);
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud text:', error);
                return { success: false, error: error.message };
            }
        }

        if (currentProviderMode === 'local') {
            try {
                console.log('Sending text to local Llama:', text);
                return await getLocalAi().sendLocalText(trimmedText);
            } catch (error) {
                console.error('Error sending local text:', error);
                return { success: false, error: error.message };
            }
        }

        if (currentProviderMode === 'byok_http') {
            return await getGeminiHttp().sendTextToGeminiHttp(trimmedText);
        }

        try {
            console.log('Sending text message:', text);
            currentTranscription = trimmedText;

            if (hasGroqKey()) {
                groqRequestStartedForTurn = true;
                await sendToGroq(trimmedText);
                return { success: true };
            }

            await sendToGemma(trimmedText);
            return { success: true };
        } catch (error) {
            console.error('Error sending text:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-macos-audio', async event => {
        if (process.platform !== 'darwin') {
            return {
                success: false,
                error: 'macOS audio capture only available on macOS',
            };
        }

        try {
            const success = await startMacOSAudioCapture(geminiSessionRef);
            return { success };
        } catch (error) {
            console.error('Error starting macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-macos-audio', async event => {
        try {
            stopMacOSAudioCapture();
            return { success: true };
        } catch (error) {
            console.error('Error stopping macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('close-session', async event => {
        try {
            stopMacOSAudioCapture();

            if (currentProviderMode === 'cloud') {
                closeCloud();
                currentProviderMode = 'byok';
                closeTransportLog();
                return { success: true };
            }

            if (currentProviderMode === 'local') {
                getLocalAi().closeLocalSession();
                currentProviderMode = 'byok';
                closeTransportLog();
                return { success: true };
            }

            if (currentProviderMode === 'byok_http') {
                getGeminiHttp().closeGeminiHttpSession();
                currentProviderMode = 'byok';
                closeTransportLog();
                return { success: true };
            }

            // Set flag to prevent reconnection attempts
            isUserClosing = true;
            sessionParams = null;

            // Cleanup session
            if (geminiSessionRef.current) {
                await geminiSessionRef.current.close();
                geminiSessionRef.current = null;
            } else {
                closeTransportLog();
            }

            return { success: true };
        } catch (error) {
            console.error('Error closing session:', error);
            return { success: false, error: error.message };
        }
    });

    // Conversation history IPC handlers
    ipcMain.handle('get-current-session', async event => {
        try {
            return { success: true, data: getCurrentSessionData() };
        } catch (error) {
            console.error('Error getting current session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-new-session', async event => {
        try {
            initializeNewSession();
            return { success: true, sessionId: currentSessionId };
        } catch (error) {
            console.error('Error starting new session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        try {
            console.log('Google Search setting updated to:', enabled);
            // The setting is already saved in localStorage by the renderer
            // This is just for logging/confirmation
            return { success: true };
        } catch (error) {
            console.error('Error updating Google Search setting:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    initializeGeminiSession,
    getEnabledTools,
    getStoredSetting,
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    saveScreenAnalysis,
    getCurrentSessionData,
    killExistingSystemAudioDump,
    startMacOSAudioCapture,
    convertStereoToMono,
    stopMacOSAudioCapture,
    sendAudioToGemini,
    sendImageToGeminiHttp,
    setupGeminiIpcHandlers,
    formatSpeakerResults,
    sendToGroq,
    hasGroqKey,
    getProfileSpeakerSilencePause,
};
