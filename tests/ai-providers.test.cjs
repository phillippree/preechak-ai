const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionSelection, jsonSchema, createCoachGenerator } = require('../src/utils/ai-providers');

for (const coachingProvider of ['gemini', 'openai'])
    for (const transcriptionProvider of ['gemini', 'openai']) {
        test(`selects isolated credentials for ${coachingProvider} coaching and ${transcriptionProvider} transcription`, () => {
            const prefs = { coachingProvider, transcriptionProvider };
            const selection = sessionSelection(prefs, { apiKey: 'gemini-secret', openaiApiKey: 'openai-secret' });
            assert.equal(selection.coachingKey, `${coachingProvider}-secret`);
            assert.equal(selection.transcriptionKey, `${transcriptionProvider}-secret`);
            prefs.coachingProvider = 'other';
            assert.equal(selection.coachingProvider, coachingProvider);
            assert.ok(Object.isFrozen(selection));
        });
    }
test('requires only selected keys and validates models and providers', () => {
    assert.equal(sessionSelection({ coachingProvider: 'openai', transcriptionProvider: 'openai' }, { openaiApiKey: 'key' }).model, 'gpt-6-luna');
    assert.equal(
        sessionSelection({ coachingProvider: 'openai', transcriptionProvider: 'openai', openaiCoachingModel: 'gpt-6-sol' }, { openaiApiKey: 'key' })
            .model,
        'gpt-6-sol'
    );
    assert.throws(() => sessionSelection({ coachingProvider: 'openai' }, { openaiApiKey: 'key' }), /Gemini API key/);
    assert.throws(() => sessionSelection({ coachingProvider: 'bad' }), /Unsupported AI provider/);
    assert.throws(() => sessionSelection({ openaiCoachingModel: 'arbitrary' }), /Unsupported OpenAI/);
});
test('converts schemas recursively without modifying the shared Gemini schema', () => {
    const schema = {
        type: 'OBJECT',
        properties: {
            nested: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] },
            items: { type: 'ARRAY', items: { type: 'STRING' } },
        },
    };
    const result = jsonSchema(schema);
    assert.equal(result.type, 'object');
    assert.equal(result.additionalProperties, false);
    assert.equal(result.properties.nested.additionalProperties, false);
    assert.equal(result.properties.items.items.type, 'string');
    assert.equal(schema.type, 'OBJECT');
    assert.equal(schema.additionalProperties, undefined);
});
test('OpenAI receives shared context, images, structured schema and cancellation without retention', async () => {
    let request;
    const generate = createCoachGenerator('openai', 'secret', {
        fetchImpl: async (url, options) => {
            assert.equal(url, 'https://api.openai.com/v1/responses');
            request = options;
            return {
                ok: true,
                json: async () => ({ output: [{ content: [{ type: 'output_text', text: '{"action":"quiet"}' }] }], usage: { input_tokens: 123 } }),
            };
        },
    });
    const controller = new AbortController();
    const result = await generate({
        model: 'gpt-6-luna',
        instructions: 'Shared prompt',
        context: { recentConversation: [{ source: 'You', text: 'Question' }] },
        images: [{ data: 'pixels' }],
        schema: { type: 'OBJECT', properties: { action: { type: 'STRING' } } },
        signal: controller.signal,
    });
    const body = JSON.parse(request.body);
    assert.equal(request.headers.Authorization, 'Bearer secret');
    assert.equal(request.signal, controller.signal);
    assert.equal(body.store, false);
    assert.equal(body.instructions, 'Shared prompt');
    assert.equal(body.input[0].content[1].image_url, 'data:image/jpeg;base64,pixels');
    assert.equal(JSON.parse(body.input[0].content[0].text).recentConversation[0].source, 'You');
    assert.equal(body.text.format.strict, true);
    assert.equal(result.usage.input_tokens, 123);
});
test('provider failures never echo secrets, silently retry elsewhere, or accept empty/refused answers', async () => {
    const request = { model: 'gpt-6-luna', context: {}, images: [], schema: { type: 'OBJECT', properties: {} }, instructions: '' };
    const failed = createCoachGenerator('openai', 'private', {
        fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'private' }) }),
    });
    await assert.rejects(failed(request), /401.*API key/);
    for (const data of [{ status: 'incomplete' }, { output: [] }, { output: [{ content: [{ type: 'refusal' }] }] }]) {
        const generate = createCoachGenerator('openai', 'private', { fetchImpl: async () => ({ ok: true, json: async () => data }) });
        await assert.rejects(generate(request));
    }
});
