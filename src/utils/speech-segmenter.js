// Lightweight, local speech gate for 24 kHz mono signed 16-bit PCM chunks.
// This is a signal heuristic, not a trained speech classifier.
function measureChunk(pcm) {
    if (!Buffer.isBuffer(pcm) || pcm.length < 2 || pcm.length % 2 !== 0) return null;
    const count = pcm.length / 2;
    let squares = 0;
    let peak = 0;
    let crossings = 0;
    let previous = 0;
    for (let i = 0; i < count; i++) {
        const sample = pcm.readInt16LE(i * 2);
        squares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
        if (i && ((sample >= 0) !== (previous >= 0))) crossings++;
        previous = sample;
    }
    return { rms: Math.sqrt(squares / count), crest: peak / Math.max(1, Math.sqrt(squares / count)), crossingRate: crossings / count };
}

function createSpeechSegmenter({ onSegment, onSpeechStart = () => {}, pauseMs = 1000, minSpeechMs = 400, maxSegmentMs = 15000, chunkMs = 100, minRms = 95 } = {}) {
    if (typeof onSegment !== 'function') throw new TypeError('onSegment is required');
    const leadInChunks = Math.ceil(500 / chunkMs);
    const startChunks = Math.ceil(300 / chunkMs);
    const endChunks = Math.max(2, Math.ceil(pauseMs / chunkMs));
    const maxChunks = Math.ceil(maxSegmentMs / chunkMs);
    let noiseFloor = 35;
    let preRoll = [];
    let chunks = [];
    let speechChunks = 0;
    let silenceChunks = 0;
    let voicedChunks = 0;

    function emit() {
        if (voicedChunks * chunkMs >= minSpeechMs && chunks.length) onSegment(Buffer.concat(chunks));
        chunks = [];
        speechChunks = 0;
        silenceChunks = 0;
        voicedChunks = 0;
    }

    function push(pcm) {
        const metric = measureChunk(pcm);
        if (!metric) return null;
        // Short impulses have a large peak relative to their average energy.
        const isSpeechCandidate = metric.rms > Math.max(minRms, noiseFloor * 2.5) && metric.crest < 12 && metric.crossingRate > 0.005;
        if (!chunks.length && !isSpeechCandidate) noiseFloor = Math.min(1200, noiseFloor * 0.98 + metric.rms * 0.02);
        const diagnostic = { rms: metric.rms, noiseFloor, speechCandidate: isSpeechCandidate };

        if (!chunks.length) {
            preRoll.push(Buffer.from(pcm));
            if (preRoll.length > leadInChunks) preRoll.shift();
            speechChunks = isSpeechCandidate ? speechChunks + 1 : 0;
            if (speechChunks >= startChunks) {
                chunks = preRoll;
                preRoll = [];
                voicedChunks = speechChunks;
                silenceChunks = 0;
                onSpeechStart(diagnostic);
            }
            return diagnostic;
        }

        chunks.push(Buffer.from(pcm));
        if (isSpeechCandidate) {
            voicedChunks++;
            silenceChunks = 0;
        } else {
            silenceChunks++;
        }
        if (silenceChunks >= endChunks || chunks.length >= maxChunks) {
            emit();
        }
        return diagnostic;
    }

    return { push, reset: () => { noiseFloor = 35; preRoll = []; chunks = []; speechChunks = 0; silenceChunks = 0; voicedChunks = 0; } };
}

module.exports = { createSpeechSegmenter, measureChunk };
