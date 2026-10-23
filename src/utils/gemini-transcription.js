const WebSocket = require('ws');

// Two sockets deliberately preserve audio-source identity even during overlapping speech.
// Never replay acknowledged audio after reconnecting: that can duplicate conversation turns.
class GeminiTranscription {
    constructor({
        apiKey,
        model = 'gemini-3.5-transcribe-live',
        language = 'en-US',
        sources,
        mutedSources = [],
        onTranscript,
        onStatus,
        Socket = WebSocket,
        now = Date.now,
    }) {
        Object.assign(this, { apiKey, model, language, onTranscript, onStatus, Socket, now });
        this.sources = new Map(
            sources.map(source => [source, { source, sequence: 0, attempts: 0, queue: [], bytes: 0, epoch: 0, muted: mutedSources.includes(source) }])
        );
        this.closed = false;
    }

    async start() {
        try {
            await Promise.all([...this.sources.values()].filter(state => !state.muted).map(state => this.connect(state)));
        } catch (error) {
            this.close();
            throw error;
        }
    }

    connection() {
        return {
            url:
                'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' +
                encodeURIComponent(this.apiKey),
            headers: { 'x-goog-api-key': this.apiKey },
        };
    }
    setupMessage() {
        return {
            setup: {
                model: `models/${this.model}`,
                generationConfig: { responseModalities: ['TEXT'] },
                inputAudioTranscription: { languageCodes: this.language ? [this.language] : [] },
            },
        };
    }
    normalizeMessage(message) {
        return message;
    }
    audioMessage(pcm) {
        return { realtimeInput: { audio: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=24000' } } };
    }
    afterAudio() {}

    connect(state) {
        if (this.closed || state.muted) return Promise.resolve();
        const epoch = ++state.epoch;
        return new Promise((resolve, reject) => {
            const connection = this.connection();
            const socket = new this.Socket(connection.url, { headers: connection.headers });
            state.socket = socket;
            state.ready = false;
            let settled = false;
            const timeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    reject(new Error(`${state.source}: transcription connection timed out`));
                }
                socket.close();
            }, 15000);
            const current = () => !this.closed && epoch === state.epoch;
            state.cancelConnect = () => {
                clearTimeout(timeout);
                if (!settled) {
                    settled = true;
                    resolve();
                }
            };
            socket.on('open', () => {
                if (!current()) return socket.close();
                socket.send(JSON.stringify(this.setupMessage()));
            });
            socket.on('message', raw => {
                if (!current()) return;
                let message;
                try {
                    message = this.normalizeMessage(JSON.parse(raw.toString()), state);
                    if (!message) return;
                } catch {
                    return;
                }
                if (message.error) {
                    this.onStatus({ source: state.source, status: 'error', message: message.error.message || 'Transcription rejected' });
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeout);
                        reject(new Error(message.error.message || 'Transcription rejected'));
                    }
                    socket.close();
                    return;
                }
                if (message.setupComplete) {
                    settled = true;
                    clearTimeout(timeout);
                    state.ready = true;
                    state.attempts = 0;
                    this.onStatus({ source: state.source, status: 'connected' });
                    const queued = state.queue.splice(0);
                    state.bytes = 0;
                    for (const chunk of queued) this.send(state.source, chunk);
                    resolve();
                }
                const content = message.serverContent;
                if (!content || state.muted) return;
                const draft = content.interimInputTranscription;
                const final = content.inputTranscription;
                for (const [part, isFinal] of [
                    [draft, false],
                    [final, true],
                ]) {
                    if (typeof part?.text !== 'string' || !part.text.trim()) continue;
                    const at = this.now();
                    this.onTranscript({
                        id: part.id || `${state.source}-${state.epoch}-${state.sequence}`,
                        source: state.source,
                        text: part.text.trim(),
                        final: isFinal,
                        startedAt: part.startedAt || state.startedAt || at,
                        endedAt: at,
                    });
                    if (isFinal) {
                        state.sequence++;
                        state.startedAt = null;
                    }
                }
            });
            socket.on('error', () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    reject(new Error(`${state.source}: transcription connection failed`));
                }
            });
            socket.on('close', () => {
                clearTimeout(timeout);
                if (!settled) {
                    settled = true;
                    reject(new Error(`${state.source}: transcription connection closed`));
                }
                if (!current()) return;
                state.ready = false;
                state.startedAt = null;
                state.turnAudio = null;
                state.items = null;
                state.committedOnsets = [];
                this.onStatus({ source: state.source, status: 'reconnecting', message: 'Audio gap; speech during recovery may be missing.' });
                if (state.attempts++ >= 5) {
                    this.onStatus({ source: state.source, status: 'error', message: 'Transcription disconnected. Restart the session.' });
                    return;
                }
                state.timer = setTimeout(() => this.connect(state).catch(() => {}), Math.min(1000 * 2 ** (state.attempts - 1), 15000));
            });
        });
    }

    send(source, pcm) {
        const state = this.sources.get(source);
        if (this.closed || !state || state.muted || !Buffer.isBuffer(pcm) || !pcm.length) return;
        // Track the onset on the same app clock for both channels. Quiet frames do not
        // start an utterance, but are still streamed for Gemini's speech detection.
        if (!state.startedAt) {
            let energy = 0;
            for (let i = 0; i + 1 < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
            if (Math.sqrt(energy / (pcm.length / 2)) > 95) state.startedAt = this.now() - pcm.length / 48;
        }
        if (!state.ready) {
            state.queue.push(Buffer.from(pcm));
            state.bytes += pcm.length;
            while (state.bytes > 96000 && state.queue.length) state.bytes -= state.queue.shift().length;
            return;
        }
        if (state.socket.bufferedAmount > 192000) {
            this.onStatus({ source, status: 'error', message: 'Audio upload is falling behind; reconnecting.' });
            state.socket.close();
            return;
        }
        try {
            state.socket.send(JSON.stringify(this.audioMessage(pcm)));
            this.afterAudio(state, pcm);
        } catch {
            state.socket.close();
        }
    }

    mute(source, muted) {
        const state = this.sources.get(source);
        if (!state || this.closed) return;
        muted = Boolean(muted);
        if (Boolean(state.muted) === muted) return;
        state.muted = muted;
        clearTimeout(state.timer);
        state.cancelConnect?.();
        state.epoch++;
        state.ready = false;
        state.startedAt = null;
        state.turnAudio = null;
        state.items = null;
        state.committedOnsets = [];
        state.queue = [];
        state.bytes = 0;
        state.attempts = 0;
        state.socket?.close();
        this.onStatus({ source, status: muted ? 'muted' : 'reconnecting' });
        if (!muted) void this.connect(state).catch(() => {});
    }

    close() {
        this.closed = true;
        for (const state of this.sources.values()) {
            clearTimeout(state.timer);
            state.cancelConnect?.();
            state.epoch++;
            state.queue = [];
            state.bytes = 0;
            state.socket?.close();
        }
    }
}

module.exports = { GeminiTranscription };
