const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const whisperRuntime = require('../src/utils/whisper-runtime');

function createTempDir() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-test-'));
    return tempDir;
}

test('normalizes legacy and standard Whisper model identifiers', () => {
    assert.equal(whisperRuntime.normalizeWhisperModel('Xenova/whisper-tiny'), 'tiny.en');
    assert.equal(whisperRuntime.normalizeWhisperModel('Xenova/whisper-base'), 'base.en');
    assert.equal(whisperRuntime.normalizeWhisperModel('Xenova/whisper-small'), 'small.en');
    assert.equal(whisperRuntime.normalizeWhisperModel('tiny.en'), 'tiny.en');
    assert.equal(whisperRuntime.normalizeWhisperModel('base.en'), 'base.en');
    assert.equal(whisperRuntime.normalizeWhisperModel('small.en'), 'small.en');
    assert.equal(whisperRuntime.normalizeWhisperModel('unknown'), 'unknown');
    assert.equal(whisperRuntime.normalizeWhisperModel(null), 'base.en');
});

test('checkFileIntegrity correctly validates matching and corrupt files', async () => {
    const tempDir = createTempDir();
    try {
        const testFile = path.join(tempDir, 'sample.bin');
        const content = Buffer.from('hello-whisper-test-content');
        fs.writeFileSync(testFile, content);

        const expectedSha256 = crypto.createHash('sha256').update(content).digest('hex');
        const wrongSha256 = '0000000000000000000000000000000000000000000000000000000000000000';

        const isValid = await whisperRuntime.checkFileIntegrity(testFile, expectedSha256);
        assert.equal(isValid, true, 'Valid file with matching sha256 should return true');

        const isInvalid = await whisperRuntime.checkFileIntegrity(testFile, wrongSha256);
        assert.equal(isInvalid, false, 'Corrupt file with mismatching sha256 should return false');

        const nonExistent = await whisperRuntime.checkFileIntegrity(path.join(tempDir, 'does-not-exist.bin'), expectedSha256);
        assert.equal(nonExistent, false, 'Non-existent file should return false');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('resample24kTo16k downsamples PCM audio accurately', () => {
    // 24000 samples/sec -> 16000 samples/sec (3:2 ratio)
    // 6 samples at 24kHz -> 4 samples at 16kHz
    const sampleCount24k = 240;
    const buffer24k = Buffer.alloc(sampleCount24k * 2);
    for (let i = 0; i < sampleCount24k; i++) {
        buffer24k.writeInt16LE(1000, i * 2);
    }

    const resampled = whisperRuntime.resample24kTo16k(buffer24k);
    const expectedSampleCount16k = Math.floor((sampleCount24k * 2) / 3);
    assert.equal(resampled.length, expectedSampleCount16k * 2);
    assert.equal(resampled.readInt16LE(0), 1000);
});

test('createWav16kBuffer generates valid 16kHz Mono 16-bit WAV header', () => {
    const pcmData = Buffer.alloc(3200); // 100ms at 16kHz
    const wav = whisperRuntime.createWav16kBuffer(pcmData);

    assert.equal(wav.length, pcmData.length + 44);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
    assert.equal(wav.readUInt16LE(20), 1); // PCM format
    assert.equal(wav.readUInt16LE(22), 1); // Mono (1 channel)
    assert.equal(wav.readUInt32LE(24), 16000); // Sample rate (16000)
    assert.equal(wav.readUInt16LE(34), 16); // 16 bits per sample
    assert.equal(wav.toString('ascii', 36, 40), 'data');
    assert.equal(wav.readUInt32LE(40), pcmData.length);
});

test('deleteWhisperModel prevents path traversal and validates model key', async () => {
    await assert.rejects(
        async () => {
            await whisperRuntime.deleteWhisperModel('../../../evil.bin');
        },
        /Invalid model key/,
        'Path traversal model keys must be rejected'
    );
});

test('deleteWhisperModel deletes existing model and reports status', async () => {
    // Non-existent valid model key should return removed: false
    const res = await whisperRuntime.deleteWhisperModel('tiny.en');
    assert.equal(res.success, true);
    assert.equal(typeof res.removed, 'boolean');
});

test('downloadToPartAndPromote skips download when destination is already valid', async () => {
    const tempDir = createTempDir();
    try {
        const dest = path.join(tempDir, 'test-binary');
        const content = Buffer.from('already-valid-binary-content');
        fs.writeFileSync(dest, content);
        const validSha256 = crypto.createHash('sha256').update(content).digest('hex');

        let fetchCalled = false;
        const originalFetch = global.fetch;
        global.fetch = async () => {
            fetchCalled = true;
            throw new Error('Should not fetch');
        };

        try {
            const result = await whisperRuntime.downloadToPartAndPromote({
                url: 'https://example.com/fake-bin',
                destinationPath: dest,
                expectedSha256: validSha256,
                executable: false,
            });
            assert.equal(result, dest);
            assert.equal(fetchCalled, false, 'Fetch must not be called when file is already valid');
        } finally {
            global.fetch = originalFetch;
        }
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('downloadToPartAndPromote reports accurate progress with known content length', async () => {
    const tempDir = createTempDir();
    try {
        const dest = path.join(tempDir, 'model.bin');
        const chunk1 = Buffer.from('chunk1-data-');
        const chunk2 = Buffer.from('chunk2-data');
        const fullContent = Buffer.concat([chunk1, chunk2]);
        const expectedSha256 = crypto.createHash('sha256').update(fullContent).digest('hex');

        const progressReports = [];
        const originalFetch = global.fetch;
        global.fetch = async () => {
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(chunk1);
                    controller.enqueue(chunk2);
                    controller.close();
                },
            });
            return new Response(stream, {
                status: 200,
                headers: { 'content-length': String(fullContent.length) },
            });
        };

        try {
            const result = await whisperRuntime.downloadToPartAndPromote({
                url: 'https://example.com/model.bin',
                destinationPath: dest,
                expectedSha256,
                executable: false,
                onProgress: p => progressReports.push(p),
            });

            assert.equal(result, dest);
            assert.equal(fs.existsSync(dest), true);
            assert.equal(fs.readFileSync(dest).toString(), fullContent.toString());
            assert.ok(progressReports.length >= 2);
            assert.equal(progressReports[progressReports.length - 1].downloadedBytes, fullContent.length);
            assert.equal(progressReports[progressReports.length - 1].percentage, 100);
        } finally {
            global.fetch = originalFetch;
        }
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('downloadToPartAndPromote handles indeterminate/chunked progress when content-length is missing', async () => {
    const tempDir = createTempDir();
    try {
        const dest = path.join(tempDir, 'chunked.bin');
        const data = Buffer.from('chunked-stream-data');
        const expectedSha256 = crypto.createHash('sha256').update(data).digest('hex');

        const progressReports = [];
        const originalFetch = global.fetch;
        global.fetch = async () => {
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            return new Response(stream, {
                status: 200,
                // No content-length header
            });
        };

        try {
            await whisperRuntime.downloadToPartAndPromote({
                url: 'https://example.com/chunked.bin',
                destinationPath: dest,
                expectedSha256,
                onProgress: p => progressReports.push(p),
            });

            assert.equal(fs.existsSync(dest), true);
            assert.equal(progressReports[0].percentage, null, 'Percentage should be null when total bytes is unknown');
            assert.equal(progressReports[0].downloadedBytes, data.length);
        } finally {
            global.fetch = originalFetch;
        }
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('downloadToPartAndPromote deletes partial file and rejects on checksum mismatch', async () => {
    const tempDir = createTempDir();
    try {
        const dest = path.join(tempDir, 'corrupt.bin');
        const data = Buffer.from('tampered-or-incomplete-data');
        const mismatchingSha256 = '1111111111111111111111111111111111111111111111111111111111111111';

        const originalFetch = global.fetch;
        global.fetch = async () => {
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            return new Response(stream, { status: 200 });
        };

        try {
            await assert.rejects(
                async () => {
                    await whisperRuntime.downloadToPartAndPromote({
                        url: 'https://example.com/corrupt.bin',
                        destinationPath: dest,
                        expectedSha256: mismatchingSha256,
                    });
                },
                /Checksum verification failed/,
                'Should fail on checksum mismatch'
            );

            assert.equal(fs.existsSync(dest), false, 'Corrupt destination file must not be promoted');
            const files = fs.readdirSync(tempDir);
            assert.equal(files.filter(f => f.includes('.part')).length, 0, 'Temporary .part file must be removed');
        } finally {
            global.fetch = originalFetch;
        }
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('downloadToPartAndPromote cancels cleanly on abort signal', async () => {
    const tempDir = createTempDir();
    try {
        const dest = path.join(tempDir, 'aborted.bin');
        const controller = new AbortController();

        const originalFetch = global.fetch;
        global.fetch = async (url, opts) => {
            if (opts?.signal?.aborted) {
                throw new Error('AbortError: The operation was aborted');
            }
            return new Promise((_, reject) => {
                opts?.signal?.addEventListener('abort', () => {
                    reject(new Error('AbortError: The operation was aborted'));
                });
            });
        };

        try {
            const downloadPromise = whisperRuntime.downloadToPartAndPromote({
                url: 'https://example.com/aborted.bin',
                destinationPath: dest,
                expectedSha256: 'somehash',
                signal: controller.signal,
            });

            // Trigger cancellation
            controller.abort();

            await assert.rejects(downloadPromise, /aborted/i);
            assert.equal(fs.existsSync(dest), false, 'Cancelled file must not be created');
        } finally {
            global.fetch = originalFetch;
        }
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('cancelWhisperDownload returns false when no download is active', () => {
    assert.equal(whisperRuntime.cancelWhisperDownload(), false);
});

test('whisper runtime is independent and does not require or spawn llama.cpp', () => {
    const runtimeSource = fs.readFileSync(path.join(__dirname, '../src/utils/whisper-runtime.js'), 'utf8');
    assert.ok(!runtimeSource.includes('llama-server'), 'whisper-runtime should not reference llama-server');
    assert.ok(!runtimeSource.includes('native-ai-runtime'), 'whisper-runtime should be independent from combined native-ai-runtime');
});

test('WHISPER_MODELS uses verified upstream Hugging Face URLs and pinned SHA256 checksums', () => {
    const models = whisperRuntime.WHISPER_MODELS;
    assert.ok(models['tiny.en'], 'tiny.en should be defined');
    assert.ok(models['base.en'], 'base.en should be defined');
    assert.ok(models['small.en'], 'small.en should be defined');

    assert.equal(models['tiny.en'].url, 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin');
    assert.equal(models['tiny.en'].sha256, '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f');

    assert.equal(models['base.en'].url, 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin');
    assert.equal(models['base.en'].sha256, 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002');

    assert.equal(models['small.en'].url, 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin');
    assert.equal(models['small.en'].sha256, 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d');
});

test('getWhisperStatus returns detailed engine and model status without crashing', async () => {
    const status = await whisperRuntime.getWhisperStatus('tiny.en');
    assert.ok(status.engine, 'Engine status should be present');
    assert.ok(['ready', 'not_downloaded', 'unsupported'].includes(status.engine.status));
    assert.ok(status.model, 'Model status should be present');
    assert.equal(status.model.modelKey, 'tiny.en');
    assert.ok(['ready', 'not_downloaded', 'needs_repair', 'downloading'].includes(status.model.status));
});
