const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { GeminiTranscription } = require('../src/utils/gemini-transcription');

function fixture(t, { rejectSetup = false } = {}) {
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
            if (message.setup)
                queueMicrotask(() =>
                    this.emit(
                        'message',
                        Buffer.from(JSON.stringify(rejectSetup ? { error: { message: 'Model unavailable' } } : { setupComplete: {} }))
                    )
                );
        }
        close() {
            this.closed = true;
            queueMicrotask(() => this.emit('close'));
        }
        receive(message) {
            this.emit('message', Buffer.from(JSON.stringify(message)));
        }
    }
    const streams = new GeminiTranscription({
        apiKey: 'secret',
        sources: ['You', 'Interviewer'],
        Socket,
        onTranscript: event => transcripts.push(event),
        onStatus: event => statuses.push(event),
        now: () => 5000,
    });
    t.after(() => streams.close());
    return { streams, sockets, transcripts, statuses };
}

test('uses independent audio sockets and routes only the corresponding PCM', async t => {
    const h = fixture(t);
    await h.streams.start();
    assert.equal(h.sockets.length, 2);
    assert.equal(new URL(h.sockets[0].url).searchParams.get('key'), 'secret');
    assert.equal(h.sockets[0].options.headers['x-goog-api-key'], 'secret');
    h.streams.send('You', Buffer.from([1, 0, 2, 0]));
    assert.equal(h.sockets[0].messages.length, 2);
    assert.equal(h.sockets[1].messages.length, 1);
    assert.equal(h.sockets[0].messages[1].realtimeInput.audio.mimeType, 'audio/pcm;rate=24000');
});

test('draft revisions share an utterance ID and finals retain their source', async t => {
    const h = fixture(t);
    await h.streams.start();
    h.sockets[0].receive({ serverContent: { interimInputTranscription: { text: 'Can two' } } });
    h.sockets[0].receive({ serverContent: { interimInputTranscription: { text: 'Can two devices edit?' } } });
    h.sockets[1].receive({ serverContent: { inputTranscription: { text: 'Yes.' } } });
    h.sockets[0].receive({ serverContent: { inputTranscription: { text: 'Can two devices edit?' } } });
    assert.equal(h.transcripts[0].id, h.transcripts[1].id);
    assert.equal(h.transcripts[0].final, false);
    assert.equal(h.transcripts[2].source, 'Interviewer');
    assert.equal(h.transcripts[3].final, true);
});

test('recovery buffering is bounded and closed sessions ignore late results', async t => {
    const h = fixture(t);
    for (let i = 0; i < 100; i++) h.streams.send('You', Buffer.alloc(4800));
    assert.ok(h.streams.sources.get('You').bytes <= 96000);
    await h.streams.start();
    h.streams.close();
    h.sockets[0].receive({ serverContent: { inputTranscription: { text: 'Obsolete' } } });
    assert.equal(h.transcripts.length, 0);
    assert.equal(h.streams.sources.get('You').bytes, 0);
});

test('setup failure closes both connections and reports an actionable error', async t => {
    const h = fixture(t, { rejectSetup: true });
    await assert.rejects(h.streams.start(), /Model unavailable/);
    assert.equal(h.streams.closed, true);
    assert.ok(h.sockets.every(socket => socket.closed));
});

test('upload backpressure closes the affected source instead of queuing unbounded audio', async t => {
    const h = fixture(t);
    await h.streams.start();
    h.sockets[0].bufferedAmount = 200000;
    h.streams.send('You', Buffer.alloc(4800));
    assert.equal(h.sockets[0].closed, true);
    assert.ok(h.statuses.some(event => event.source === 'You' && event.message?.includes('falling behind')));
    assert.equal(h.sockets[1].closed, undefined);
});

test('muting finalizes the source and unmuting resumes without affecting the other connection', async t => {
    const h = fixture(t);
    await h.streams.start();
    h.streams.mute('You', true);
    assert.equal(h.sockets[0].messages.at(-1).realtimeInput.audioStreamEnd, true);
    const count = h.sockets[0].messages.length;
    h.streams.send('You', Buffer.alloc(4800));
    assert.equal(h.sockets[0].messages.length, count);
    h.streams.send('Interviewer', Buffer.alloc(4800));
    assert.equal(h.sockets[1].messages.length, 2);
    h.streams.mute('You', false);
    h.streams.send('You', Buffer.alloc(4800));
    assert.equal(h.sockets[0].messages.length, count + 1);
});
