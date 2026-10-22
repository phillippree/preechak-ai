const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function capture(rate, microphone) {
    const chunks = [];
    const context = {
        sampleRate: rate,
        AudioWorkletProcessor: class {
            port = { postMessage: data => chunks.push(data) };
        },
        registerProcessor: (_, constructor) => {
            context.Processor = constructor;
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/utils/audio-capture-worklet.js'), 'utf8'), context);
    return { processor: new context.Processor({ processorOptions: { microphone } }), chunks };
}

for (const rate of [24000, 44100, 48000]) {
    test(`worklet produces 24kHz PCM in 100ms chunks from ${rate}Hz without drift`, () => {
        const { processor, chunks } = capture(rate, false);
        for (let i = 0; i < rate; i += 128) {
            const samples = new Float32Array(Math.min(128, rate - i)).fill(0.25);
            processor.process([[samples]]);
        }
        assert.equal(chunks.length, 10);
        assert.ok(chunks.every(chunk => chunk.pcm.byteLength === 4800));
        assert.equal(new Int16Array(chunks[0].pcm)[100], 8192);
    });
}

test('microphone high-pass reduces DC/low-frequency rumble while retaining speech-band audio', () => {
    const { processor, chunks } = capture(24000, true);
    const audio = new Float32Array(24000);
    for (let i = 0; i < audio.length; i++) audio[i] = 0.3 + 0.1 * Math.sin((2 * Math.PI * 1000 * i) / 24000);
    processor.process([[audio]]);
    const tail = new Int16Array(chunks.at(-1).pcm);
    const mean = [...tail].reduce((sum, value) => sum + value, 0) / tail.length;
    assert.ok(Math.abs(mean) < 5);
    assert.ok(chunks.at(-1).rms > 0.05);
});

test('worklet downmixes stereo and reports clipping without rendering playback', () => {
    const { processor, chunks } = capture(24000, false);
    processor.process([[new Float32Array(2400).fill(2), new Float32Array(2400).fill(2)]]);
    assert.equal(chunks[0].clipped, 2400);
    assert.equal(new Int16Array(chunks[0].pcm)[0], 32767);
});
