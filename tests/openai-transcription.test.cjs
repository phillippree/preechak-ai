const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { OpenAITranscription } = require('../src/utils/openai-transcription');
function fixture(t) {
    const sockets = [],
        transcripts = [],
        statuses = [];
    class Socket extends EventEmitter {
        constructor(url, options) {
            super();
            this.url = url;
            this.options = options;
            this.messages = [];
            this.bufferedAmount = 0;
            sockets.push(this);
            queueMicrotask(() => this.emit('open'));
        }
        send(raw) {
            const message = JSON.parse(raw);
            this.messages.push(message);
            if (message.type === 'session.update') queueMicrotask(() => this.receive({ type: 'session.updated' }));
        }
        receive(message) {
            this.emit('message', Buffer.from(JSON.stringify(message)));
        }
        close() {
            this.closed = true;
            queueMicrotask(() => this.emit('close'));
        }
    }
    const streams = new OpenAITranscription({
        apiKey: 'secret',
        model: 'gpt-live-transcribe',
        language: 'en-US',
        sources: ['You', 'Interviewer'],
        Socket,
        onTranscript: event => transcripts.push(event),
        onStatus: event => statuses.push(event),
        now: () => 5000,
    });
    t.after(() => streams.close());
    return { streams, sockets, transcripts, statuses };
}
test('two independent OpenAI sessions stream 24kHz PCM and commit after speech pauses', async t => {
    const h = fixture(t);
    await h.streams.start();
    assert.equal(h.sockets.length, 2);
    assert.equal(h.sockets[0].url, 'wss://api.openai.com/v1/realtime?intent=transcription');
    assert.equal(h.sockets[0].options.headers.Authorization, 'Bearer secret');
    const setup = h.sockets[0].messages[0];
    assert.equal(setup.session.audio.input.format.rate, 24000);
    assert.equal(setup.session.audio.input.turn_detection, null);
    const pcm = Buffer.alloc(4800);
    for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(1000, i);
    for (let i = 0; i < 3; i++) h.streams.send('You', pcm);
    for (let i = 0; i < 8; i++) h.streams.send('You', Buffer.alloc(4800));
    assert.ok(h.sockets[0].messages.some(m => m.type === 'input_audio_buffer.commit'));
    assert.equal(h.sockets[1].messages.length, 1);
});
test('draft deltas accumulate per item and out-of-order finals preserve identity', async t => {
    const h = fixture(t);
    await h.streams.start();
    const s = h.sockets[0];
    for (const delta of ['Hello', ' world']) s.receive({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta });
    s.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'b', transcript: 'Second' });
    s.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'Hello world' });
    assert.equal(h.transcripts[1].text, 'Hello world');
    assert.equal(h.transcripts[0].id, h.transcripts[3].id);
    assert.notEqual(h.transcripts[2].id, h.transcripts[3].id);
});
test('mute clears audio and ignores old OpenAI transcripts after unmute', async t => {
    const h = fixture(t);
    await h.streams.start();
    const old = h.sockets[0];
    h.streams.mute('You', true);
    h.streams.send('You', Buffer.alloc(4800));
    assert.equal(old.closed, true);
    h.streams.mute('You', false);
    await new Promise(resolve => setImmediate(resolve));
    old.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'old', transcript: 'Late' });
    assert.equal(h.transcripts.length, 0);
    assert.equal(h.sockets[1].closed, undefined);
    h.sockets[2].receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'new', transcript: 'Fresh' });
    assert.equal(h.transcripts.length, 1);
});
