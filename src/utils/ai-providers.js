const { logLlmRequest } = require('./llmRequestLogger');
// Provider selection is validated once and copied at session startup.
const OPENAI_MODELS = ['gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol'];
function sessionSelection(preferences = {}, credentials = {}, config = {}) {
    const coachingProvider = preferences.coachingProvider || 'gemini';
    const transcriptionProvider = preferences.transcriptionProvider || 'gemini';
    for (const provider of [coachingProvider, transcriptionProvider]) {
        if (!['gemini', 'openai'].includes(provider)) throw new Error('Unsupported AI provider');
    }
    const openaiModel = preferences.openaiCoachingModel || 'gpt-6-luna';
    if (!OPENAI_MODELS.includes(openaiModel)) throw new Error('Unsupported OpenAI coaching model');
    if (preferences.openaiTranscriptionModel && preferences.openaiTranscriptionModel !== 'gpt-live-transcribe')
        throw new Error('Unsupported OpenAI transcription model');
    const keys = { gemini: credentials.geminiApiKey || credentials.apiKey || '', openai: credentials.openaiApiKey || '' };
    const needsTranscription = preferences.audioMode !== 'none';
    for (const provider of new Set([coachingProvider, ...(needsTranscription ? [transcriptionProvider] : [])])) {
        if (!keys[provider].trim()) throw new Error(`Add a ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API key in Settings before starting`);
    }
    return Object.freeze({
        coachingProvider,
        transcriptionProvider,
        coachingKey: keys[coachingProvider],
        transcriptionKey: keys[transcriptionProvider],
        model: coachingProvider === 'openai' ? openaiModel : config.geminiHttpModel || 'gemini-3.8-flash',
        transcriptionModel:
            transcriptionProvider === 'openai' ? 'gpt-live-transcribe' : preferences.geminiTranscriptionModel || 'gemini-3.5-transcribe-live',
    });
}

function jsonSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    const result = { ...schema };
    if (typeof result.type === 'string') result.type = result.type.toLowerCase();
    if (result.properties) {
        result.properties = Object.fromEntries(Object.entries(result.properties).map(([key, value]) => [key, jsonSchema(value)]));
        result.additionalProperties = false;
        result.required = Object.keys(result.properties);
    }
    if (result.items) result.items = jsonSchema(result.items);
    return result;
}

function createCoachGenerator(provider, apiKey, { fetchImpl = globalThis.fetch, GoogleGenAI, client } = {}) {
    if (provider === 'gemini') {
        const ai = client || new (GoogleGenAI || require('@google/genai').GoogleGenAI)({ apiKey });
        return async ({ model, instructions, context, images, schema, signal }) => {
            const response = await ai.models.generateContent(
                logLlmRequest('Gemini Conversation Coach', {
                    model,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: JSON.stringify(context) },
                                ...images.map(image => ({ inlineData: { mimeType: 'image/jpeg', data: image.data } })),
                            ],
                        },
                    ],
                    config: { systemInstruction: instructions, responseMimeType: 'application/json', responseSchema: schema, abortSignal: signal },
                })
            );
            return { text: response.text, usage: response.usageMetadata };
        };
    }
    if (provider !== 'openai') throw new Error('Unsupported coaching provider');
    return async ({ model, instructions, context, images, schema, signal }) => {
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                instructions,
                store: false,
                input: [
                    {
                        role: 'user',
                        content: [
                            { type: 'input_text', text: JSON.stringify(context) },
                            ...images.map(image => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${image.data}`, detail: 'auto' })),
                        ],
                    },
                ],
                text: { format: { type: 'json_schema', name: 'interview_coach', strict: true, schema: jsonSchema(schema) } },
            }),
        });
        if (!response.ok) {
            // Do not echo server payloads: these may contain request data or secrets.
            throw new Error(
                `OpenAI request failed (${response.status}). ${response.status === 401 ? 'Check your API key.' : response.status === 429 ? 'Check API quota and rate limits.' : 'Check model access and retry.'}`
            );
        }
        const data = await response.json();
        if (data.status === 'incomplete') throw new Error('OpenAI response was incomplete. Please retry.');
        const parts = (data.output || []).flatMap(item => item.content || []);
        if (parts.some(part => part.type === 'refusal')) throw new Error('OpenAI declined this request.');
        const text = parts
            .filter(part => part.type === 'output_text')
            .map(part => part.text)
            .join('');
        if (!text.trim()) throw new Error('OpenAI returned no answer. Please retry.');
        return { text, usage: data.usage };
    };
}
module.exports = { OPENAI_MODELS, sessionSelection, jsonSchema, createCoachGenerator };
