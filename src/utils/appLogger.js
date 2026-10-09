const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;

function toBuffer(chunk, encoding) {
    if (Buffer.isBuffer(chunk)) return chunk;
    if (ArrayBuffer.isView(chunk)) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    return Buffer.from(String(chunk), encoding || 'utf8');
}

function createRotatingWriter(logsDirectory, streamName, maxBytes, now = () => new Date()) {
    const activePath = path.join(logsDirectory, `${streamName}.log`);
    let currentSize = 0;

    try {
        currentSize = fs.statSync(activePath).size;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    function rotate() {
        const timestamp = now().toISOString().replace(/[:.]/g, '-');
        let archivePath = path.join(logsDirectory, `${streamName}-${timestamp}.log`);
        let suffix = 1;
        while (fs.existsSync(archivePath)) {
            archivePath = path.join(logsDirectory, `${streamName}-${timestamp}-${suffix}.log`);
            suffix += 1;
        }

        if (currentSize > 0 && fs.existsSync(activePath)) fs.renameSync(activePath, archivePath);
        currentSize = 0;
    }

    return {
        write(chunk, encoding) {
            const data = toBuffer(chunk, encoding);
            if (currentSize > 0 && currentSize + data.length > maxBytes) rotate();
            fs.appendFileSync(activePath, data);
            currentSize += data.length;
        },
    };
}

function startStreamLogging({
    logsDirectory,
    stdout = process.stdout,
    stderr = process.stderr,
    maxBytes = DEFAULT_MAX_LOG_SIZE_BYTES,
    now,
}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new RangeError('maxBytes must be a positive safe integer');
    }

    fs.mkdirSync(logsDirectory, { recursive: true });
    const stdoutWriter = createRotatingWriter(logsDirectory, 'stdout', maxBytes, now);
    const stderrWriter = createRotatingWriter(logsDirectory, 'stderr', maxBytes, now);
    const originalStdoutWrite = stdout.write;
    const originalStderrWrite = stderr.write;
    let loggerFailureReported = false;

    function reportLoggerFailure(error) {
        if (loggerFailureReported) return;
        loggerFailureReported = true;
        try {
            originalStderrWrite.call(stderr, `App file logging failed: ${error.message}\n`);
        } catch {}
    }

    stdout.write = function (chunk, encoding, callback) {
        try {
            stdoutWriter.write(chunk, typeof encoding === 'string' ? encoding : undefined);
        } catch (error) {
            reportLoggerFailure(error);
        }
        return originalStdoutWrite.apply(this, arguments);
    };

    stderr.write = function (chunk, encoding, callback) {
        try {
            stderrWriter.write(chunk, typeof encoding === 'string' ? encoding : undefined);
        } catch (error) {
            reportLoggerFailure(error);
        }
        return originalStderrWrite.apply(this, arguments);
    };

    return function stopStreamLogging() {
        stdout.write = originalStdoutWrite;
        stderr.write = originalStderrWrite;
    };
}

module.exports = { DEFAULT_MAX_LOG_SIZE_BYTES, startStreamLogging };
