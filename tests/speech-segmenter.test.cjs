const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSpeechSegmenter } = require('../src/utils/speech-segmenter');

function tone(amplitude = 3000, frequency = 220) {
    const chunk = Buffer.alloc(4800);
    for (let i = 0; i < 2400; i++) chunk.writeInt16LE(Math.round(amplitude * Math.sin((2 * Math.PI * frequency * i) / 24000)), i * 2);
    return chunk;
}

test('rejects silence, steady hum, and brief impulses', () => {
    const segments = [];
    const gate = createSpeechSegmenter({ onSegment: data => segments.push(data), pauseMs: 300 });
    const silence = Buffer.alloc(4800);
    const hum = Buffer.alloc(4800);
    hum.fill(200);
    const click = Buffer.alloc(4800);
    click.writeInt16LE(30000, 200);
    for (let i = 0; i < 12; i++) gate.push(silence);
    for (let i = 0; i < 12; i++) gate.push(hum);
    gate.push(click);
    for (let i = 0; i < 5; i++) gate.push(silence);
    assert.equal(segments.length, 0);
});

test('keeps the lead-in and closes a segment after a pause', () => {
    const segments = [];
    const gate = createSpeechSegmenter({ onSegment: data => segments.push(data), pauseMs: 300 });
    const quiet = tone(50);
    const speech = tone();
    gate.push(quiet);
    for (let i = 0; i < 6; i++) gate.push(speech);
    for (let i = 0; i < 3; i++) gate.push(Buffer.alloc(4800));
    assert.equal(segments.length, 1);
    assert.equal(segments[0].length, 10 * 4800);
    assert.deepEqual(segments[0].subarray(0, 4800), quiet);
});

test('caps a long segment and resets without emitting pending audio', () => {
    const segments = [];
    const gate = createSpeechSegmenter({ onSegment: data => segments.push(data), maxSegmentMs: 500 });
    for (let i = 0; i < 5; i++) gate.push(tone());
    assert.equal(segments.length, 1);
    gate.push(tone());
    gate.reset();
    for (let i = 0; i < 12; i++) gate.push(Buffer.alloc(4800));
    assert.equal(segments.length, 1);
});
