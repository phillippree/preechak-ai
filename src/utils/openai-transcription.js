const { GeminiTranscription } = require('./gemini-transcription');

// Share source isolation, bounded queues, mute epochs and reconnect lifecycle.
class OpenAITranscription extends GeminiTranscription {
    connection() {
        return { url: 'wss://api.openai.com/v1/realtime?intent=transcription', headers: { Authorization: `Bearer ${this.apiKey}` } };
    }
    setupMessage() {
        return {
            type: 'session.update',
            session: {
                type: 'transcription',
                audio: {
                    input: {
                        format: { type: 'audio/pcm', rate: 24000 },
                        transcription: { model: this.model, delay: 'low', ...(this.language ? { languages: [this.language.split('-')[0]] } : {}) },
                        turn_detection: null,
                    },
                },
            },
        };
    }
    audioMessage(pcm) {
        return { type: 'input_audio_buffer.append', audio: pcm.toString('base64') };
    }
    afterAudio(state, pcm) {
        let energy = 0;
        for (let i = 0; i + 1 < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
        const voiced = Math.sqrt(energy / (pcm.length / 2)) > 95;
        const duration = pcm.length / 48;
        const turn = (state.turnAudio ||= { ms: 0, silence: 0, speech: 0, onset: null });
        turn.ms += duration;
        if (voiced) {
            turn.speech += duration;
            turn.silence = 0;
            turn.onset ??= this.now() - duration;
        } else turn.silence += duration;
        if ((turn.speech >= 200 && turn.silence >= 800) || turn.ms >= 30000) {
            if (turn.speech >= 200) {
                (state.committedOnsets ||= []).push(turn.onset);
                if (state.committedOnsets.length > 100) state.committedOnsets.shift();
                state.socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
            } else state.socket.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
            state.turnAudio = null;
        }
    }
    normalizeMessage(message, state) {
        if (message.type === 'error')
            return { error: { message: 'OpenAI transcription rejected the request. Check API key, quota, and transcription model access.' } };
        if (message.type === 'session.updated') return { setupComplete: {} };
        if (message.type === 'input_audio_buffer.committed') {
            const item = this.item(state, message.item_id);
            item.startedAt = state.committedOnsets?.shift() || item.startedAt;
            return null;
        }
        if (message.type === 'conversation.item.input_audio_transcription.failed') {
            this.onStatus({ source: state.source, status: 'error', message: 'OpenAI could not transcribe this audio turn.' });
            return null;
        }
        const final = message.type === 'conversation.item.input_audio_transcription.completed';
        if (!final && message.type !== 'conversation.item.input_audio_transcription.delta') return null;
        if (!message.item_id) return null;
        const item = this.item(state, message.item_id);
        item.text = final ? message.transcript || '' : item.text + (message.delta || '');
        const part = { text: item.text, id: `${state.source}-${state.epoch}-${message.item_id}`, startedAt: item.startedAt };
        if (final) state.items.delete(message.item_id);
        return { serverContent: { [final ? 'inputTranscription' : 'interimInputTranscription']: part } };
    }
    item(state, id) {
        state.items ||= new Map();
        if (!state.items.has(id)) {
            if (state.items.size >= 100) state.items.delete(state.items.keys().next().value);
            state.items.set(id, { text: '', startedAt: state.turnAudio?.onset || state.startedAt || this.now() });
        }
        return state.items.get(id);
    }
}
module.exports = { OpenAITranscription };
