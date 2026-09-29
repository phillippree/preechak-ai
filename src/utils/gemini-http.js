const { GoogleGenAI } = require('@google/genai');
const { getApiKey, getGroqApiKey, getConfig, getPreferences } = require('../storage');
const { getSystemPrompt } = require('./prompts');
const {
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    saveScreenAnalysis,
    sendToGroq,
    hasGroqKey,
    getProfileSpeakerSilencePause,
} = require('./gemini');

let httpSessionActive = false;
let sessionApiKey = '';
let sessionProfile = 'interview';
let sessionCustomPrompt = '';
let sessionLanguage = 'en-US';
let httpConversationHistory = [];
let isProcessingTurn = false;

// Audio buffering and VAD state
let isSpeaking = false;
let audioChunks = [];
let silenceFrames = 0;
let speechFrames = 0;
let activeSpeakerLabel = 'Interviewer';

const ENERGY_THRESHOLD = 60;
const SPEECH_FRAMES_REQUIRED = 2; // ~200ms of audio over threshold
const MAX_ACCUMULATED_CHUNKS = 150; // max ~15 seconds of audio before forcing a turn

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

function createWavBuffer(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);
    const dataSize = pcmBuffer.length;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(dataSize + 36, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
}

async function initializeGeminiHttpSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US') {
    sessionApiKey = apiKey;
    sessionProfile = profile;
    sessionCustomPrompt = customPrompt;
    sessionLanguage = language;
    httpConversationHistory = [];
    isProcessingTurn = false;
    isSpeaking = false;
    audioChunks = [];
    silenceFrames = 0;
    speechFrames = 0;
    httpSessionActive = true;

    initializeNewSession(profile, customPrompt);
    sendToRenderer('session-initializing', false);
    sendToRenderer('update-status', 'Live (HTTP)');

    console.log('[Gemini HTTP] Session initialized successfully. Model:', getConfig().geminiHttpModel || 'gemini-3.8-flash');
    return true;
}

function closeGeminiHttpSession() {
    httpSessionActive = false;
    isProcessingTurn = false;
    isSpeaking = false;
    audioChunks = [];
    silenceFrames = 0;
    speechFrames = 0;
    httpConversationHistory = [];
    console.log('[Gemini HTTP] Session closed');
}

function isGeminiHttpActive() {
    return httpSessionActive;
}

function processHttpAudioChunk(pcmBuffer, speaker = 'Interviewer') {
    if (!httpSessionActive || !pcmBuffer || pcmBuffer.length === 0) {
        return;
    }

    const energy = getPcmEnergy(pcmBuffer);
    activeSpeakerLabel = speaker || activeSpeakerLabel || 'Interviewer';

    if (energy > ENERGY_THRESHOLD) {
        speechFrames++;
        silenceFrames = 0;

        if (!isSpeaking && speechFrames >= SPEECH_FRAMES_REQUIRED) {
            isSpeaking = true;
            console.log(`[Gemini HTTP] Speech started (${speaker}, energy: ${energy.toFixed(1)})`);
            sendToRenderer('update-status', 'Listening... (speech detected)');
        }
    } else {
        silenceFrames++;
        speechFrames = 0;

        const pauseMs = getProfileSpeakerSilencePause ? getProfileSpeakerSilencePause(sessionProfile) : 1000;
        const requiredSilenceFrames = Math.max(6, Math.floor(pauseMs / 100)); // e.g. 10 frames = 1.0s

        if (isSpeaking && silenceFrames >= requiredSilenceFrames) {
            isSpeaking = false;
            silenceFrames = 0;
            speechFrames = 0;

            if (audioChunks.length > 0) {
                const combined = Buffer.concat(audioChunks);
                audioChunks = [];
                console.log(`[Gemini HTTP] Speech ended (${combined.length} bytes). Processing turn...`);
                handleSpeechSegment(combined, activeSpeakerLabel);
                return;
            }
        }
    }

    if (isSpeaking) {
        audioChunks.push(Buffer.from(pcmBuffer));

        // Safeguard for very long monologues
        if (audioChunks.length >= MAX_ACCUMULATED_CHUNKS) {
            isSpeaking = false;
            silenceFrames = 0;
            speechFrames = 0;
            const combined = Buffer.concat(audioChunks);
            audioChunks = [];
            console.log(`[Gemini HTTP] Max speech buffer reached (${combined.length} bytes). Processing turn...`);
            handleSpeechSegment(combined, activeSpeakerLabel);
        }
    }
}

async function handleSpeechSegment(pcmBuffer, speaker = 'Interviewer') {
    // Ignore segments shorter than 0.4 seconds (24000 * 2 * 0.4 = 19200 bytes)
    if (pcmBuffer.length < 19200) {
        console.log('[Gemini HTTP] Speech segment too short, ignoring');
        sendToRenderer('update-status', 'Listening...');
        return;
    }

    if (isProcessingTurn) {
        console.log('[Gemini HTTP] Already processing a turn, skipping overlapping audio');
        return;
    }

    isProcessingTurn = true;
    const wavBuffer = createWavBuffer(pcmBuffer, 24000, 1, 16);
    const base64Wav = wavBuffer.toString('base64');

    const apiKey = sessionApiKey || getApiKey();
    if (!apiKey) {
        console.error('[Gemini HTTP] No API key available');
        sendToRenderer('update-status', 'Error: No Gemini API Key');
        isProcessingTurn = false;
        return;
    }

    const config = getConfig();
    const modelToUse = config.geminiHttpModel || 'gemini-2.5-flash';

    try {
        const ai = new GoogleGenAI({ apiKey });

        if (hasGroqKey()) {
            // Flow: Transcribe with Gemini HTTP, then send transcript to Groq for answer streaming
            sendToRenderer('update-status', 'Transcribing audio...');
            console.log(`[Gemini HTTP] Transcribing audio with ${modelToUse} for Groq response...`);

            const transcriptionResponse = await ai.models.generateContent({
                model: modelToUse,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'audio/wav',
                                    data: base64Wav,
                                },
                            },
                            {
                                text: 'Transcribe the spoken words in the audio verbatim. Output ONLY the exact transcribed text, with no preamble, quotes, speaker tags, or explanations.',
                            },
                        ],
                    },
                ],
            });

            const transcriptText = transcriptionResponse.text ? transcriptionResponse.text.trim() : '';
            console.log('[Gemini HTTP] Transcription result:', transcriptText);

            if (transcriptText && transcriptText.length > 1) {
                const formattedTranscript = `[${speaker}]: ${transcriptText}`;
                sendToRenderer('live-transcription', {
                    text: formattedTranscript,
                    speaker: speaker,
                    isListening: false,
                });

                sendToGroq(formattedTranscript);
            } else {
                console.log('[Gemini HTTP] Empty or silent transcription, skipping Groq');
                sendToRenderer('update-status', 'Listening...');
            }
        } else {
            // Flow: Gemini HTTP generates direct stream answer
            sendToRenderer('update-status', 'Generating answer...');
            console.log(`[Gemini HTTP] Generating answer directly from audio with ${modelToUse}...`);

            const prefs = getPreferences() || {};
            const googleSearchEnabled = prefs.googleSearchEnabled === true;
            const systemPrompt = getSystemPrompt(sessionProfile, sessionCustomPrompt, googleSearchEnabled);

            const contents = [];
            // Add rolling context history (up to last 10 turns)
            for (const turn of httpConversationHistory.slice(-10)) {
                contents.push({
                    role: turn.role,
                    parts: [{ text: turn.text }],
                });
            }

            contents.push({
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: 'audio/wav',
                            data: base64Wav,
                        },
                    },
                    {
                        text: 'Analyze the question or dialogue in this audio and provide the direct, concise answer and talking points according to your instructions.',
                    },
                ],
            });

            const responseStream = await ai.models.generateContentStream({
                model: modelToUse,
                contents: contents,
                config: {
                    systemInstruction: systemPrompt,
                },
            });

            let fullResponseText = '';
            let isFirst = true;

            for await (const chunk of responseStream) {
                const chunkText = chunk.text;
                if (chunkText) {
                    fullResponseText += chunkText;
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', {
                        prompt: `[${speaker}] Spoken question`,
                        text: fullResponseText,
                        timestamp: Date.now(),
                    });
                    isFirst = false;
                }
            }

            if (fullResponseText.trim()) {
                httpConversationHistory.push({ role: 'user', text: `[${speaker}]: (Spoken question)` });
                httpConversationHistory.push({ role: 'model', text: fullResponseText });

                saveConversationTurn(`[${speaker}] Spoken question`, fullResponseText);
            }

            sendToRenderer('update-status', 'Listening...');
        }
    } catch (error) {
        console.error('[Gemini HTTP] Error processing speech segment:', error);
        sendToRenderer('update-status', `Error: ${error.message}`);
    } finally {
        isProcessingTurn = false;
    }
}

async function sendTextToGeminiHttp(text) {
    if (!text || text.trim() === '') return { success: false, error: 'Empty text' };

    if (hasGroqKey()) {
        sendToGroq(`[You]: ${text.trim()}`);
        return { success: true };
    }

    const apiKey = sessionApiKey || getApiKey();
    if (!apiKey) {
        return { success: false, error: 'No API key configured' };
    }

    const config = getConfig();
    const modelToUse = config.geminiHttpModel || 'gemini-2.5-flash';
    const prefs = getPreferences() || {};
    const googleSearchEnabled = prefs.googleSearchEnabled === true;
    const systemPrompt = getSystemPrompt(sessionProfile, sessionCustomPrompt, googleSearchEnabled);

    try {
        const ai = new GoogleGenAI({ apiKey });
        const contents = [];

        for (const turn of httpConversationHistory.slice(-10)) {
            contents.push({
                role: turn.role,
                parts: [{ text: turn.text }],
            });
        }

        contents.push({
            role: 'user',
            parts: [{ text: text }],
        });

        sendToRenderer('update-status', 'Generating answer...');

        const responseStream = await ai.models.generateContentStream({
            model: modelToUse,
            contents: contents,
            config: {
                systemInstruction: systemPrompt,
            },
        });

        let fullText = '';
        let isFirst = true;

        for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullText += chunkText;
                sendToRenderer(isFirst ? 'new-response' : 'update-response', {
                    prompt: text,
                    text: fullText,
                    timestamp: Date.now(),
                });
                isFirst = false;
            }
        }

        if (fullText.trim()) {
            httpConversationHistory.push({ role: 'user', text: text });
            httpConversationHistory.push({ role: 'model', text: fullText });
            saveConversationTurn(text, fullText);
        }

        sendToRenderer('update-status', 'Listening...');
        return { success: true, text: fullText };
    } catch (error) {
        console.error('[Gemini HTTP] Text error:', error);
        sendToRenderer('update-status', `Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = {
    initializeGeminiHttpSession,
    closeGeminiHttpSession,
    isGeminiHttpActive,
    processHttpAudioChunk,
    sendTextToGeminiHttp,
};
