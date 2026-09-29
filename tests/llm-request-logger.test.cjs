const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitize, logLlmRequest } = require('../src/utils/llmRequestLogger');

test('preserves prompts and context while masking credentials and media', () => {
    const source = {
        model: 'test-model',
        config: { systemInstruction: 'Be concise.' },
        contents: [{ text: 'Previous question' }, { inlineData: { mimeType: 'audio/wav', data: 'AAAA' } }],
        apiKey: 'private-value',
        headers: { Authorization: 'Bearer private-value' },
        image: 'data:image/jpeg;base64,AAAA',
        callbacks: { onmessage() {} },
    };
    const result = sanitize(source);
    assert.equal(result.config.systemInstruction, 'Be concise.');
    assert.equal(result.contents[0].text, 'Previous question');
    assert.equal(result.contents[1].inlineData.data, '[media omitted: 4 encoded characters]');
    assert.equal(result.apiKey, '[REDACTED]');
    assert.equal(result.headers.Authorization, '[REDACTED]');
    assert.equal(result.image, '[image/jpeg payload omitted]');
    assert.equal(result.callbacks, undefined);
    assert.equal(source.apiKey, 'private-value');
});

test('logs readable request without mutating payload; controls audio and disabled mode', () => {
    const originalLog = console.log;
    const before = { requests: process.env.LLM_LOG_REQUESTS, audio: process.env.LLM_LOG_AUDIO };
    const output = [];
    try {
        console.log = value => output.push(value);
        delete process.env.LLM_LOG_REQUESTS;
        delete process.env.LLM_LOG_AUDIO;
        const payload = { model: 'demo', contents: [{ text: 'Question?' }] };
        assert.equal(logLlmRequest('Gemini', payload), payload);
        assert.match(output[0], /LLM REQUEST/);
        assert.match(output[0], /Question\?/);
        logLlmRequest('Live', { audio: { data: 'AAAA' } });
        assert.equal(output.length, 1);
        process.env.LLM_LOG_AUDIO = '1';
        logLlmRequest('Live', { audio: { data: 'AAAA' } });
        assert.equal(output.length, 2);
        assert.ok(!output[1].includes('AAAA'));
        process.env.LLM_LOG_REQUESTS = '0';
        logLlmRequest('Gemini', payload);
        assert.equal(output.length, 2);
        delete process.env.LLM_LOG_REQUESTS;
        console.log = () => {
            throw new Error('output unavailable');
        };
        assert.equal(logLlmRequest('Gemini', payload), payload);
    } finally {
        console.log = originalLog;
        for (const [key, value] of [
            ['LLM_LOG_REQUESTS', before.requests],
            ['LLM_LOG_AUDIO', before.audio],
        ]) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('redacts known API key patterns in text and handles circular data', () => {
    const value = 'AIza' + 'x'.repeat(35);
    assert.equal(sanitize('key ' + value), 'key [REDACTED]');
    assert.equal(sanitize('https://example.test?token=secret'), 'https://example.test?token=[REDACTED]');
    const circular = {};
    circular.self = circular;
    assert.equal(sanitize(circular).self, '[Circular]');
});
