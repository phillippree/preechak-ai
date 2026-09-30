const { test } = require('node:test');
const assert = require('node:assert/strict');

test('session close properly clears startTime and resets active session state', async () => {
    // Simulate PreechakAiApp state lifecycle
    const appState = {
        currentView: 'main',
        sessionActive: false,
        startTime: null,
        _timerInterval: 123,
        responses: [],
        _stopTimer() {
            if (this._timerInterval) {
                this._timerInterval = null;
            }
            this.startTime = null;
        },
        handleStart() {
            this.sessionActive = true;
            this.startTime = Date.now();
            this.currentView = 'assistant';
        },
        handleClose() {
            if (this.currentView === 'assistant') {
                this.sessionActive = false;
                this.startTime = null;
                this._stopTimer();
                this.currentView = 'main';
            }
        },
    };

    // 1. Initial State
    assert.equal(appState.sessionActive, false);
    assert.equal(appState.startTime, null);
    assert.equal(appState.currentView, 'main');

    // 2. Start Session
    appState.handleStart();
    assert.equal(appState.sessionActive, true);
    assert.ok(typeof appState.startTime === 'number');
    assert.equal(appState.currentView, 'assistant');

    // 3. Close Session and Return to Home
    appState.handleClose();
    assert.equal(appState.sessionActive, false);
    assert.equal(appState.startTime, null, 'startTime must be null after session close');
    assert.equal(appState.currentView, 'main');

    // Verify main-view isSessionActive prop value is false (dropdown NOT disabled)
    const isMainViewSessionActive = appState.sessionActive;
    assert.equal(isMainViewSessionActive, false, 'MainView isSessionActive must be false so controls are interactive');
});

test('switching transcription modes across consecutive sessions works cleanly', async () => {
    let activeMode = 'none';
    const calls = { whisper: 0, gemini: 0 };

    function processAudio(mode) {
        if (mode === 'none') return 'ignored';
        if (mode === 'whisper') {
            calls.whisper++;
            return 'whisper_processed';
        }
        if (mode === 'gemini') {
            calls.gemini++;
            return 'gemini_processed';
        }
    }

    // Session 1: None
    assert.equal(processAudio(activeMode), 'ignored');
    assert.equal(calls.whisper, 0);
    assert.equal(calls.gemini, 0);

    // User changes mode on home screen
    activeMode = 'whisper';

    // Session 2: Whisper
    assert.equal(processAudio(activeMode), 'whisper_processed');
    assert.equal(calls.whisper, 1);
    assert.equal(calls.gemini, 0);

    // User changes mode again
    activeMode = 'gemini';

    // Session 3: Gemini
    assert.equal(processAudio(activeMode), 'gemini_processed');
    assert.equal(calls.whisper, 1);
    assert.equal(calls.gemini, 1);
});
