const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { shell } = require('electron');
const { getConfigDir } = require('../storage');

// Upstream Official Model Sources from https://huggingface.co/ggerganov/whisper.cpp
const WHISPER_MODELS = {
    'tiny.en': {
        name: 'Tiny English',
        filename: 'ggml-tiny.en.bin',
        sizeFormatted: '75 MB',
        approxBytes: 77700000,
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
        sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f',
    },
    'base.en': {
        name: 'Base English',
        filename: 'ggml-base.en.bin',
        sizeFormatted: '142 MB',
        approxBytes: 148000000,
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
        sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
    },
    'small.en': {
        name: 'Small English',
        filename: 'ggml-small.en.bin',
        sizeFormatted: '466 MB',
        approxBytes: 488000000,
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
        sha256: 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d',
    },
};

// In-memory verification cache to avoid repeated expensive sha256 calculations
// key: filePath -> { mtimeMs, size, sha256 }
const fileVerificationCache = new Map();

// Active server process state
let whisperProcess = null;
let whisperBaseUrl = null;
let activeWhisperModel = null;
let serverStartingPromise = null;

// Download concurrency control
let activeDownloadPromise = null;
let activeDownloadController = null;
let activeDownloadType = null; // 'model'
let activeDownloadModel = null;

function normalizeWhisperModel(modelName) {
    const legacy = {
        'Xenova/whisper-tiny': 'tiny.en',
        'Xenova/whisper-base': 'base.en',
        'Xenova/whisper-small': 'small.en',
    };
    return legacy[modelName] || modelName || 'base.en';
}

function getBinariesDirectory() {
    return path.join(getConfigDir(), 'binaries');
}

function getWhisperModelsDirectory() {
    return path.join(getConfigDir(), 'models', 'whisper');
}

function findEngineBinary() {
    const binariesDir = getBinariesDirectory();
    const candidateNames =
        process.platform === 'win32'
            ? ['whisper-server.exe', 'server.exe']
            : ['whisper-server', 'server', 'whisper-server-macos-arm64', 'whisper-server-macos-x86_64'];

    for (const name of candidateNames) {
        const fullPath = path.join(binariesDir, name);
        if (fs.existsSync(fullPath)) {
            try {
                fs.accessSync(fullPath, fs.constants.X_OK);
                return fullPath;
            } catch {
                if (process.platform !== 'win32') {
                    try {
                        fs.chmodSync(fullPath, 0o755);
                        return fullPath;
                    } catch {}
                }
            }
        }
    }

    // Check system PATH and common installation directories
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(path.delimiter);
    if (process.platform !== 'win32') {
        pathDirs.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin');
    }

    for (const dir of pathDirs) {
        for (const name of candidateNames) {
            const candidate = path.join(dir, name);
            if (fs.existsSync(candidate)) {
                try {
                    fs.accessSync(candidate, fs.constants.X_OK);
                    return candidate;
                } catch {}
            }
        }
    }

    return null;
}

function getModelFilePath(modelKey) {
    const key = normalizeWhisperModel(modelKey);
    const model = WHISPER_MODELS[key];
    if (!model) return null;
    return path.join(getWhisperModelsDirectory(), model.filename);
}

async function calculateSha256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const input = fs.createReadStream(filePath);
        input.on('error', reject);
        input.on('data', chunk => hash.update(chunk));
        input.on('end', () => resolve(hash.digest('hex')));
    });
}

async function checkFileIntegrity(filePath, expectedSha256) {
    if (!filePath || !fs.existsSync(filePath)) {
        return false;
    }

    try {
        const stats = fs.statSync(filePath);
        if (stats.size === 0) return false;

        const cached = fileVerificationCache.get(filePath);
        let actualSha256;
        if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
            actualSha256 = cached.sha256;
        } else {
            actualSha256 = await calculateSha256(filePath);
            fileVerificationCache.set(filePath, {
                mtimeMs: stats.mtimeMs,
                size: stats.size,
                sha256: actualSha256,
            });
        }

        return actualSha256.toLowerCase() === expectedSha256.toLowerCase();
    } catch (err) {
        console.warn(`[WhisperRuntime] Integrity check failed for ${filePath}:`, err.message);
        return false;
    }
}

function invalidateFileCache(filePath) {
    if (filePath) fileVerificationCache.delete(filePath);
}

// Active build process state for cancellation
let activeBuildProcess = null;

function findExecutable(names, extraDirs = []) {
    const list = Array.isArray(names) ? names : [names];
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    if (process.platform === 'darwin') {
        pathDirs.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin');
    }
    pathDirs.push(...extraDirs);

    for (const dir of pathDirs) {
        for (const name of list) {
            const fullPath = path.join(dir, name);
            if (fs.existsSync(fullPath)) {
                try {
                    fs.accessSync(fullPath, fs.constants.X_OK);
                    return fullPath;
                } catch {}
            }
        }
    }
    return null;
}

function runCommandAsync(executable, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(executable, args, {
            cwd: options.cwd || process.cwd(),
            env: { ...process.env, ...(options.env || {}) },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        activeBuildProcess = proc;

        let stdoutData = '';
        let stderrData = '';

        proc.stdout?.on('data', chunk => {
            stdoutData += chunk.toString();
        });

        proc.stderr?.on('data', chunk => {
            stderrData += chunk.toString();
        });

        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                try {
                    proc.kill('SIGKILL');
                } catch {}
                reject(new Error('Operation aborted'));
            });
        }

        proc.on('error', err => {
            activeBuildProcess = null;
            reject(err);
        });

        proc.on('exit', (code, signal) => {
            activeBuildProcess = null;
            if (code === 0) {
                resolve({ stdout: stdoutData, stderr: stderrData });
            } else {
                reject(
                    new Error(
                        `Command "${path.basename(executable)} ${args.join(' ')}" failed with code ${code || signal}:\n${stderrData || stdoutData}`
                    )
                );
            }
        });
    });
}

/**
 * Builds the whisper-server binary directly from the official whisper.cpp GitHub repository.
 */
async function buildWhisperEngineFromSource(onProgress = null, signal = null) {
    const binariesDir = getBinariesDirectory();
    fs.mkdirSync(binariesDir, { recursive: true });

    let cmakePath = findExecutable(['cmake']);
    const brewPath = findExecutable(['brew']);
    const gitPath = findExecutable(['git']);

    if (!gitPath) {
        throw new Error('Git was not found on your system. Please install Git to build whisper.cpp.');
    }

    if (!cmakePath && brewPath) {
        onProgress?.({
            step: 1,
            totalSteps: 4,
            label: 'Installing CMake via Homebrew...',
            component: 'engine',
            downloadedBytes: 0,
            expectedBytes: 0,
            percentage: 20,
        });

        await runCommandAsync(brewPath, ['install', 'cmake'], { signal });
        cmakePath = findExecutable(['cmake']);
    }

    if (!cmakePath) {
        throw new Error('CMake is required to build whisper.cpp. Please install it using `brew install cmake` or install Xcode Command Line Tools.');
    }

    const tempBuildDir = path.join(getConfigDir(), `temp-whisper-build-${process.pid}-${Date.now()}`);
    fs.mkdirSync(tempBuildDir, { recursive: true });

    try {
        onProgress?.({
            step: 2,
            totalSteps: 4,
            label: 'Cloning official whisper.cpp repository...',
            component: 'engine',
            downloadedBytes: 0,
            expectedBytes: 0,
            percentage: 40,
        });

        await runCommandAsync(gitPath, ['clone', '--depth', '1', 'https://github.com/ggml-org/whisper.cpp.git', tempBuildDir], {
            signal,
        });

        onProgress?.({
            step: 3,
            totalSteps: 4,
            label: 'Configuring whisper.cpp build with Apple Metal acceleration...',
            component: 'engine',
            downloadedBytes: 0,
            expectedBytes: 0,
            percentage: 60,
        });

        await runCommandAsync(cmakePath, ['-B', 'build', '-DBUILD_SHARED_LIBS=OFF', '-DWHISPER_BUILD_SERVER=ON', '-DCMAKE_BUILD_TYPE=Release'], {
            cwd: tempBuildDir,
            signal,
        });

        onProgress?.({
            step: 4,
            totalSteps: 4,
            label: 'Compiling whisper-server executable...',
            component: 'engine',
            downloadedBytes: 0,
            expectedBytes: 0,
            percentage: 80,
        });

        await runCommandAsync(cmakePath, ['--build', 'build', '--config', 'Release', '--target', 'whisper-server', '-j4'], {
            cwd: tempBuildDir,
            signal,
        });

        const candidates = [
            path.join(tempBuildDir, 'build', 'bin', 'whisper-server'),
            path.join(tempBuildDir, 'build', 'bin', 'server'),
            path.join(tempBuildDir, 'build', 'whisper-server'),
            path.join(tempBuildDir, 'whisper-server'),
            path.join(tempBuildDir, 'server'),
        ];

        let builtBinaryPath = null;
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                builtBinaryPath = candidate;
                break;
            }
        }

        if (!builtBinaryPath) {
            throw new Error('Compiled whisper-server binary was not found in build directory.');
        }

        const destinationPath = path.join(binariesDir, 'whisper-server');
        fs.copyFileSync(builtBinaryPath, destinationPath);
        fs.chmodSync(destinationPath, 0o755);

        // Copy any auxiliary .dylib or .metallib files into binaries folder
        const searchDirs = [path.join(tempBuildDir, 'build', 'bin'), path.join(tempBuildDir, 'build'), tempBuildDir];
        for (const sDir of searchDirs) {
            if (fs.existsSync(sDir)) {
                try {
                    const entries = fs.readdirSync(sDir);
                    for (const entry of entries) {
                        if (entry.endsWith('.dylib') || entry.endsWith('.metallib') || entry.endsWith('.metal')) {
                            fs.copyFileSync(path.join(sDir, entry), path.join(binariesDir, entry));
                        }
                    }
                } catch {}
            }
        }

        onProgress?.({
            step: 4,
            totalSteps: 4,
            label: 'Whisper server engine successfully installed',
            component: 'engine',
            downloadedBytes: 0,
            expectedBytes: 0,
            percentage: 100,
        });

        return destinationPath;
    } finally {
        fs.rmSync(tempBuildDir, { recursive: true, force: true });
    }
}

/**
 * Inspect installation status of engine and a given model.
 * Returns: {
 *   engine: { status: 'ready'|'not_downloaded'|'unsupported'|'downloading', filename, path, size, note? },
 *   model: { status: 'ready'|'not_downloaded'|'needs_repair'|'downloading', modelKey, name, filename, path, size, error? },
 *   isServerRunning: boolean,
 *   activeModel: string|null
 * }
 */
async function getWhisperStatus(modelKey = 'base.en') {
    const normalizedKey = normalizeWhisperModel(modelKey);
    const modelDef = WHISPER_MODELS[normalizedKey] || WHISPER_MODELS['base.en'];

    let engineStatus = 'not_downloaded';
    let enginePath = findEngineBinary();
    let engineFilename = enginePath ? path.basename(enginePath) : 'whisper-server';
    let engineSize = 0;
    let engineNote = null;

    if (enginePath && fs.existsSync(enginePath)) {
        try {
            const stats = fs.statSync(enginePath);
            engineSize = stats.size;
            engineStatus = 'ready';
        } catch {
            engineStatus = 'ready';
        }
    } else {
        const hasGit = Boolean(findExecutable(['git']));
        const hasBuildTool = Boolean(findExecutable(['cmake', 'make', 'brew']));
        if (hasGit && hasBuildTool) {
            engineStatus = 'not_downloaded';
            engineNote = 'Click "Download missing files" to build whisper-server directly from the official whisper.cpp repository.';
        } else {
            engineStatus = 'unsupported';
            engineNote = 'Git and CMake / Homebrew are required to compile whisper-server. Please install via Homebrew or Xcode Command Line Tools.';
        }
    }

    if (activeDownloadController && activeDownloadType === 'engine') {
        engineStatus = 'downloading';
    }

    let modelStatus = 'not_downloaded';
    let modelPath = null;
    let modelSize = 0;

    if (modelDef) {
        modelPath = path.join(getWhisperModelsDirectory(), modelDef.filename);
        if (activeDownloadController && activeDownloadModel === normalizedKey && activeDownloadType === 'model') {
            modelStatus = 'downloading';
        } else if (fs.existsSync(modelPath)) {
            const stats = fs.statSync(modelPath);
            modelSize = stats.size;
            const valid = await checkFileIntegrity(modelPath, modelDef.sha256);
            modelStatus = valid ? 'ready' : 'needs_repair';
        } else {
            modelStatus = 'not_downloaded';
        }
    }

    return {
        engine: {
            status: engineStatus,
            filename: engineFilename,
            path: enginePath,
            size: engineSize,
            note: engineNote,
        },
        model: {
            status: modelStatus,
            modelKey: normalizedKey,
            name: modelDef?.name || normalizedKey,
            filename: modelDef?.filename || '',
            path: modelPath,
            size: modelSize,
            sizeFormatted: modelDef?.sizeFormatted || '',
        },
        isServerRunning: isWhisperServerRunning(),
        activeModel: activeWhisperModel,
    };
}

/**
 * Safe download of a file to temporary .part file with checksum verification.
 */
async function downloadToPartAndPromote({ url, destinationPath, expectedSha256, executable, onProgress, signal }) {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

    // If existing file is already verified, skip download
    if (await checkFileIntegrity(destinationPath, expectedSha256)) {
        if (executable && process.platform !== 'win32') {
            try {
                fs.chmodSync(destinationPath, 0o755);
            } catch {}
        }
        return destinationPath;
    }

    const temporaryPath = `${destinationPath}.part-${process.pid}-${Date.now()}`;
    const response = await fetch(url, { redirect: 'follow', signal });

    if (!response.ok || !response.body) {
        throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
    }

    const expectedBytes = Number(response.headers.get('content-length')) || 0;
    let downloadedBytes = 0;

    try {
        const input = Readable.fromWeb(response.body);
        const progressStream = new Transform({
            transform(chunk, encoding, callback) {
                downloadedBytes += chunk.length;
                onProgress?.({
                    downloadedBytes,
                    expectedBytes,
                    percentage: expectedBytes > 0 ? Math.min(100, Math.floor((downloadedBytes / expectedBytes) * 100)) : null,
                });
                callback(null, chunk);
            },
        });

        await pipeline(input, progressStream, fs.createWriteStream(temporaryPath, { flags: 'wx' }));

        // Verify SHA256 before promoting
        const downloadedSha256 = await calculateSha256(temporaryPath);
        if (downloadedSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
            fs.rmSync(temporaryPath, { force: true });
            throw new Error(`Checksum verification failed for ${path.basename(destinationPath)}`);
        }

        // Promote .part file to final destination
        fs.rmSync(destinationPath, { force: true });
        fs.renameSync(temporaryPath, destinationPath);

        if (executable && process.platform !== 'win32') {
            fs.chmodSync(destinationPath, 0o755);
        }

        invalidateFileCache(destinationPath);
        return destinationPath;
    } catch (err) {
        fs.rmSync(temporaryPath, { force: true });
        throw err;
    }
}

/**
 * Downloads missing Whisper components (compiling engine if missing, then downloading model) with progress callback.
 * Prevents duplicate concurrent downloads.
 */
async function downloadWhisperComponents(modelKey = 'base.en', onProgress = null) {
    if (activeDownloadPromise) {
        return activeDownloadPromise;
    }

    const normalizedKey = normalizeWhisperModel(modelKey);
    const modelDef = WHISPER_MODELS[normalizedKey];
    if (!modelDef) {
        throw new Error(`Unsupported Whisper model: ${modelKey}`);
    }

    let enginePath = findEngineBinary();
    const modelPath = path.join(getWhisperModelsDirectory(), modelDef.filename);
    const modelValid = await checkFileIntegrity(modelPath, modelDef.sha256);

    if (enginePath && modelValid) {
        return { enginePath, modelPath, downloaded: false };
    }

    activeDownloadController = new AbortController();
    activeDownloadType = !enginePath ? 'engine' : 'model';
    activeDownloadModel = normalizedKey;

    activeDownloadPromise = (async () => {
        try {
            // 1. If engine is missing, build it from official source
            if (!enginePath) {
                activeDownloadType = 'engine';
                enginePath = await buildWhisperEngineFromSource(onProgress, activeDownloadController.signal);
            }

            // 2. If model is missing, download it from Hugging Face
            let installedModelPath = modelPath;
            if (!modelValid) {
                activeDownloadType = 'model';
                const stepLabel = `Downloading ${modelDef.name}`;
                onProgress?.({
                    step: 1,
                    totalSteps: 1,
                    label: stepLabel,
                    component: 'model',
                    downloadedBytes: 0,
                    expectedBytes: 0,
                    percentage: 0,
                });

                installedModelPath = await downloadToPartAndPromote({
                    url: modelDef.url,
                    destinationPath: modelPath,
                    expectedSha256: modelDef.sha256,
                    executable: false,
                    onProgress: p =>
                        onProgress?.({
                            step: 1,
                            totalSteps: 1,
                            label: stepLabel,
                            component: 'model',
                            ...p,
                        }),
                    signal: activeDownloadController.signal,
                });
            }

            return { enginePath: findEngineBinary() || enginePath, modelPath: installedModelPath, downloaded: true };
        } finally {
            activeDownloadPromise = null;
            activeDownloadController = null;
            activeDownloadType = null;
            activeDownloadModel = null;
        }
    })();

    return activeDownloadPromise;
}

function cancelWhisperDownload() {
    let cancelled = false;
    if (activeBuildProcess) {
        try {
            activeBuildProcess.kill('SIGKILL');
        } catch {}
        activeBuildProcess = null;
        cancelled = true;
    }
    if (activeDownloadController) {
        activeDownloadController.abort();
        activeDownloadController = null;
        activeDownloadPromise = null;
        activeDownloadType = null;
        activeDownloadModel = null;
        cancelled = true;
    }
    return cancelled;
}

/**
 * Remove a downloaded Whisper model file safely.
 */
async function deleteWhisperModel(modelKey) {
    const normalizedKey = normalizeWhisperModel(modelKey);
    const modelDef = WHISPER_MODELS[normalizedKey];
    if (!modelDef) {
        throw new Error(`Invalid model key: ${modelKey}`);
    }

    if (isWhisperServerRunning() && activeWhisperModel === normalizedKey) {
        throw new Error(`Cannot remove model "${modelDef.name}" while it is currently in use`);
    }

    const modelsDir = getWhisperModelsDirectory();
    const filePath = path.join(modelsDir, modelDef.filename);

    // Verify containment to prevent path traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(modelsDir);
    if (!resolvedPath.startsWith(resolvedDir)) {
        throw new Error('Access denied: target path is outside models directory');
    }

    if (fs.existsSync(resolvedPath)) {
        fs.rmSync(resolvedPath, { force: true });
        invalidateFileCache(resolvedPath);
        console.log(`[WhisperRuntime] Removed model file: ${resolvedPath}`);
        return { success: true, removed: true };
    }

    return { success: true, removed: false };
}

/**
 * Open download folder in system file explorer.
 */
async function openWhisperFolder() {
    const modelsDir = getWhisperModelsDirectory();
    fs.mkdirSync(modelsDir, { recursive: true });
    if (shell && typeof shell.openPath === 'function') {
        await shell.openPath(modelsDir);
        return true;
    }
    return false;
}

async function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => resolve(address.port));
        });
    });
}

function isWhisperServerRunning() {
    return whisperProcess !== null && whisperProcess.exitCode === null && whisperBaseUrl !== null;
}

function getWhisperServerUrl() {
    return whisperBaseUrl;
}

/**
 * Start the native Whisper server for the specified model.
 */
async function startWhisperServer(modelKey = 'base.en', onProgress = null) {
    const normalizedKey = normalizeWhisperModel(modelKey);

    if (serverStartingPromise) {
        return serverStartingPromise;
    }

    if (isWhisperServerRunning() && activeWhisperModel === normalizedKey) {
        return whisperBaseUrl;
    }

    // If server is running with a different model, stop it first
    if (whisperProcess) {
        stopWhisperServer();
    }

    serverStartingPromise = (async () => {
        try {
            const enginePath = findEngineBinary();
            if (!enginePath || !fs.existsSync(enginePath)) {
                const instructions =
                    process.platform === 'darwin'
                        ? `Official whisper.cpp releases do not provide prebuilt macOS server binaries.\nPlease compile whisper-server from source (https://github.com/ggml-org/whisper.cpp) or install via Homebrew (\`brew install whisper-cpp\`), and place the executable in: ${getBinariesDirectory()}`
                        : `Whisper server executable not found. Please place whisper-server in: ${getBinariesDirectory()}`;
                throw new Error(instructions);
            }

            // Ensure model is installed and verified
            const { modelPath } = await downloadWhisperComponents(normalizedKey, onProgress);

            if (!fs.existsSync(modelPath)) {
                throw new Error(`Whisper model not found at: ${modelPath}`);
            }

            const port = await getAvailablePort();
            whisperBaseUrl = `http://127.0.0.1:${port}`;
            activeWhisperModel = normalizedKey;

            console.log(`[WhisperRuntime] Spawning whisper-server at ${enginePath} on port ${port} with model ${normalizedKey}...`);

            const binariesDir = getBinariesDirectory();
            const dyldPath = process.env.DYLD_LIBRARY_PATH ? `${binariesDir}:${process.env.DYLD_LIBRARY_PATH}` : binariesDir;

            whisperProcess = spawn(enginePath, ['-m', modelPath, '--host', '127.0.0.1', '--port', String(port)], {
                env: {
                    ...process.env,
                    DYLD_LIBRARY_PATH: dyldPath,
                },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });

            whisperProcess.stdout.on('data', data => {
                process.stdout.write(`[Whisper] ${data}`);
            });
            whisperProcess.stderr.on('data', data => {
                process.stderr.write(`[Whisper] ${data}`);
            });

            whisperProcess.on('exit', code => {
                console.log(`[WhisperRuntime] Whisper server exited with code ${code}`);
                whisperProcess = null;
                whisperBaseUrl = null;
                activeWhisperModel = null;
            });

            // Wait for server health / ready check
            const startedAt = Date.now();
            const timeoutMs = 120000;
            let isReady = false;

            while (Date.now() - startedAt < timeoutMs) {
                if (!whisperProcess || whisperProcess.exitCode !== null) {
                    throw new Error(`Whisper server process terminated unexpectedly with code ${whisperProcess?.exitCode}`);
                }

                try {
                    const response = await fetch(`${whisperBaseUrl}/`);
                    if (response.ok || response.status === 200 || response.status === 404 || response.status === 405) {
                        isReady = true;
                        break;
                    }
                } catch {
                    // Waiting for server socket
                }

                await new Promise(resolve => setTimeout(resolve, 250));
            }

            if (!isReady) {
                stopWhisperServer();
                throw new Error(`Whisper server did not become ready within ${timeoutMs / 1000}s`);
            }

            console.log(`[WhisperRuntime] Whisper server ready at ${whisperBaseUrl}`);
            return whisperBaseUrl;
        } finally {
            serverStartingPromise = null;
        }
    })();

    return serverStartingPromise;
}

function stopWhisperServer() {
    if (whisperProcess && whisperProcess.exitCode === null) {
        try {
            whisperProcess.kill();
        } catch (e) {
            console.warn('[WhisperRuntime] Error killing whisper server process:', e.message);
        }
    }
    whisperProcess = null;
    whisperBaseUrl = null;
    activeWhisperModel = null;
    console.log('[WhisperRuntime] Whisper server stopped');
}

/**
 * Resample 24kHz 16-bit PCM audio to 16kHz 16-bit PCM audio using linear interpolation.
 */
function resample24kTo16k(inputBuffer) {
    if (!inputBuffer || inputBuffer.length < 2) return Buffer.alloc(0);
    const inputSamples = Math.floor(inputBuffer.length / 2);
    const outputSamples = Math.floor((inputSamples * 2) / 3);
    const outputBuffer = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
        const sourcePosition = (i * 3) / 2;
        const sourceIndex = Math.floor(sourcePosition);
        const fraction = sourcePosition - sourceIndex;
        const firstSample = inputBuffer.readInt16LE(sourceIndex * 2);
        const secondSample = sourceIndex + 1 < inputSamples ? inputBuffer.readInt16LE((sourceIndex + 1) * 2) : firstSample;
        const interpolated = Math.round(firstSample + fraction * (secondSample - firstSample));
        outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
    }

    return outputBuffer;
}

/**
 * Create 16kHz 16-bit Mono WAV buffer from PCM data.
 */
function createWav16kBuffer(pcm16kBuffer) {
    const header = Buffer.alloc(44);
    const byteRate = 16000 * 2;

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm16kBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // Mono
    header.writeUInt32LE(16000, 24); // 16kHz
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(2, 32); // Block align
    header.writeUInt16LE(16, 34); // 16 bits
    header.write('data', 36);
    header.writeUInt32LE(pcm16kBuffer.length, 40);

    return Buffer.concat([header, pcm16kBuffer]);
}

/**
 * Transcribe 16kHz PCM audio buffer using local Whisper HTTP inference endpoint.
 */
async function transcribeAudio(pcm16kBuffer) {
    if (!whisperBaseUrl) {
        throw new Error('Local Whisper server is not running');
    }

    const wavBuffer = createWav16kBuffer(pcm16kBuffer);
    const formData = new FormData();
    formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('response_format', 'json');
    formData.append('temperature', '0.0');
    formData.append('language', 'en');

    const response = await fetch(`${whisperBaseUrl}/inference`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Whisper server returned HTTP ${response.status}`);
    }

    const result = await response.json();
    const text = (result.text || '').trim();
    return text;
}

module.exports = {
    WHISPER_MODELS,
    findEngineBinary,
    normalizeWhisperModel,
    getWhisperStatus,
    buildWhisperEngineFromSource,
    downloadWhisperComponents,
    downloadToPartAndPromote,
    cancelWhisperDownload,
    deleteWhisperModel,
    openWhisperFolder,
    startWhisperServer,
    stopWhisperServer,
    isWhisperServerRunning,
    getWhisperServerUrl,
    transcribeAudio,
    resample24kTo16k,
    createWav16kBuffer,
    checkFileIntegrity,
    calculateSha256,
};
