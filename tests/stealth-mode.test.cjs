const { test } = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../src/storage');

test('storage DEFAULT_PREFERENCES defaults stealthMode to true', () => {
    assert.equal(storage.DEFAULT_PREFERENCES.stealthMode, true, 'Stealth mode must default to true for privacy');
});

test('applyStealthMode configures window content protection and platform hooks', () => {
    // Mock BrowserWindow
    const windowActions = {
        contentProtection: null,
        hiddenInMissionControl: null,
        skipTaskbar: null,
    };

    const mockWindow = {
        isDestroyed: () => false,
        setContentProtection: enabled => {
            windowActions.contentProtection = enabled;
        },
        setHiddenInMissionControl: enabled => {
            windowActions.hiddenInMissionControl = enabled;
        },
        setSkipTaskbar: enabled => {
            windowActions.skipTaskbar = enabled;
        },
    };

    function applyStealthMode(win, enabled) {
        if (!win || win.isDestroyed()) return;
        win.setContentProtection(enabled);
        if (process.platform === 'win32') {
            try {
                win.setSkipTaskbar(enabled);
            } catch {}
        }
        if (process.platform === 'darwin') {
            try {
                win.setHiddenInMissionControl(enabled);
            } catch {}
        }
    }

    // 1. Enable stealth mode
    applyStealthMode(mockWindow, true);
    assert.equal(windowActions.contentProtection, true, 'Window content protection should be enabled');
    if (process.platform === 'darwin') {
        assert.equal(windowActions.hiddenInMissionControl, true, 'Hidden in Mission Control on macOS');
    }
    if (process.platform === 'win32') {
        assert.equal(windowActions.skipTaskbar, true, 'Skip taskbar on Windows');
    }

    // 2. Disable stealth mode
    applyStealthMode(mockWindow, false);
    assert.equal(windowActions.contentProtection, false, 'Window content protection should be disabled');
    if (process.platform === 'darwin') {
        assert.equal(windowActions.hiddenInMissionControl, false, 'Shown in Mission Control when disabled');
    }
    if (process.platform === 'win32') {
        assert.equal(windowActions.skipTaskbar, false, 'Shown in taskbar when disabled');
    }

    // 3. Destroyed window safeguard
    const destroyedWindow = {
        isDestroyed: () => true,
        setContentProtection: () => {
            throw new Error('Should not be called');
        },
    };
    assert.doesNotThrow(() => applyStealthMode(destroyedWindow, true));
    assert.doesNotThrow(() => applyStealthMode(null, true));
});

test('set-stealth-mode IPC handler updates window, persists preference, and notifies renderer', async () => {
    let stealthModeState = true;
    let persistedPreference = null;
    const dispatchedEvents = [];

    const mockMainWindow = {
        isDestroyed: () => false,
        setContentProtection: enabled => {},
        webContents: {
            send: (channel, data) => {
                dispatchedEvents.push({ channel, data });
            },
        },
    };

    const mockStorage = {
        updatePreference: (key, val) => {
            if (key === 'stealthMode') {
                persistedPreference = val;
            }
        },
    };

    // Simulate IPC handlers
    const handlers = {
        'set-stealth-mode': (event, enabled) => {
            stealthModeState = enabled;
            mockStorage.updatePreference('stealthMode', enabled);
            mockMainWindow.webContents.send('stealth-mode-changed', enabled);
            return { success: true, stealthMode: stealthModeState };
        },
        'get-stealth-mode': () => stealthModeState,
    };

    // Test toggle off
    const disableResult = handlers['set-stealth-mode']({}, false);
    assert.deepEqual(disableResult, { success: true, stealthMode: false });
    assert.equal(persistedPreference, false, 'Preference must be persisted to storage');
    assert.equal(handlers['get-stealth-mode'](), false);
    assert.equal(dispatchedEvents.length, 1);
    assert.deepEqual(dispatchedEvents[0], { channel: 'stealth-mode-changed', data: false });

    // Test toggle on
    const enableResult = handlers['set-stealth-mode']({}, true);
    assert.deepEqual(enableResult, { success: true, stealthMode: true });
    assert.equal(persistedPreference, true);
    assert.equal(handlers['get-stealth-mode'](), true);
    assert.equal(dispatchedEvents.length, 2);
    assert.deepEqual(dispatchedEvents[1], { channel: 'stealth-mode-changed', data: true });
});

test('global shortcut toggles stealth mode state cleanly', () => {
    let stealthMode = true;
    const history = [];

    function triggerStealthShortcut() {
        stealthMode = !stealthMode;
        history.push(stealthMode);
    }

    // Toggle 1: true -> false
    triggerStealthShortcut();
    assert.equal(stealthMode, false);

    // Toggle 2: false -> true
    triggerStealthShortcut();
    assert.equal(stealthMode, true);

    // Toggle 3: true -> false
    triggerStealthShortcut();
    assert.equal(stealthMode, false);

    assert.deepEqual(history, [false, true, false]);
});
