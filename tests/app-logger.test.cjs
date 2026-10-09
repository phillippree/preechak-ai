const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');
const test = require('node:test');
const { DEFAULT_MAX_LOG_SIZE_BYTES, startStreamLogging } = require('../src/utils/appLogger');

function createCaptureStream() {
    const chunks = [];
    const stream = new Writable({
        write(chunk, encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
        },
    });
    return { stream, output: () => Buffer.concat(chunks).toString('utf8') };
}

function createLogDirectory() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'preechak-app-logs-'));
}

test('tees stdout and stderr to separate files while preserving stream output', () => {
    const logsDirectory = createLogDirectory();
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const stop = startStreamLogging({ logsDirectory, stdout: stdout.stream, stderr: stderr.stream });

    try {
        stdout.stream.write('normal output\n');
        stderr.stream.write('error output\n');

        assert.equal(stdout.output(), 'normal output\n');
        assert.equal(stderr.output(), 'error output\n');
        assert.equal(fs.readFileSync(path.join(logsDirectory, 'stdout.log'), 'utf8'), 'normal output\n');
        assert.equal(fs.readFileSync(path.join(logsDirectory, 'stderr.log'), 'utf8'), 'error output\n');
    } finally {
        stop();
        fs.rmSync(logsDirectory, { recursive: true, force: true });
    }
});

test('starts a new log file at the configured size limit', () => {
    const logsDirectory = createLogDirectory();
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const stop = startStreamLogging({ logsDirectory, stdout: stdout.stream, stderr: stderr.stream, maxBytes: 5 });

    try {
        stdout.stream.write('12345');
        stdout.stream.write('678');

        const archivedLogs = fs.readdirSync(logsDirectory).filter(file => /^stdout-.*\.log$/.test(file));
        assert.equal(archivedLogs.length, 1);
        assert.equal(fs.readFileSync(path.join(logsDirectory, archivedLogs[0]), 'utf8'), '12345');
        assert.equal(fs.readFileSync(path.join(logsDirectory, 'stdout.log'), 'utf8'), '678');
        assert.equal(stdout.output(), '12345678');
    } finally {
        stop();
        fs.rmSync(logsDirectory, { recursive: true, force: true });
    }
});

test('keeps UTF-8 output intact when a stream rotates', () => {
    const logsDirectory = createLogDirectory();
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const stop = startStreamLogging({ logsDirectory, stdout: stdout.stream, stderr: stderr.stream, maxBytes: 5 });

    try {
        stdout.stream.write('1234');
        stdout.stream.write('é');

        const archivedLogs = fs.readdirSync(logsDirectory).filter(file => /^stdout-.*\.log$/.test(file));
        assert.equal(archivedLogs.length, 1);
        assert.equal(fs.readFileSync(path.join(logsDirectory, archivedLogs[0]), 'utf8'), '1234');
        assert.equal(fs.readFileSync(path.join(logsDirectory, 'stdout.log'), 'utf8'), 'é');
        assert.equal(stdout.output(), '1234é');
    } finally {
        stop();
        fs.rmSync(logsDirectory, { recursive: true, force: true });
    }
});

test('uses a 5 MB default rotation limit', () => {
    assert.equal(DEFAULT_MAX_LOG_SIZE_BYTES, 5 * 1024 * 1024);
});
