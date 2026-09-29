const { BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('node:path');
const storage = require('../storage');

let mouseEventsIgnored = false;
let stealthModeEnabled = true;

const DEFAULT_MAIN_WINDOW_SIZE = { width: 1100, height: 800 };
const MIN_WINDOW_SIZE = { width: 700, height: 320 };

function applyStealthMode(mainWindow, enabled) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    stealthModeEnabled = enabled;
    mainWindow.setContentProtection(enabled);

    if (process.platform === 'win32') {
        try {
            mainWindow.setSkipTaskbar(enabled);
        } catch (error) {
            console.warn('Could not hide from taskbar:', error.message);
        }
    }

    if (process.platform === 'darwin') {
        try {
            mainWindow.setHiddenInMissionControl(enabled);
        } catch (error) {
            console.warn('Could not hide from Mission Control:', error.message);
        }
    }
}

function createWindow(sendToRenderer, geminiSessionRef) {
    let windowWidth = DEFAULT_MAIN_WINDOW_SIZE.width;
    let windowHeight = DEFAULT_MAIN_WINDOW_SIZE.height;

    const mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        minWidth: MIN_WINDOW_SIZE.width,
        minHeight: MIN_WINDOW_SIZE.height,
        resizable: true,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: process.platform === 'win32',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // TODO: change to true
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        backgroundColor: '#00000000',
    });

    const { session, desktopCapturer } = require('electron');
    session.defaultSession.setDisplayMediaRequestHandler(
        (request, callback) => {
            desktopCapturer
                .getSources({ types: ['screen'] })
                .then(sources => {
                    if (!sources || sources.length === 0) {
                        callback({});
                        return;
                    }

                    try {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
                            if (currentDisplay) {
                                const matched = sources.find(s => String(s.display_id) === String(currentDisplay.id));
                                if (matched) {
                                    console.log(
                                        `[DisplayMedia] Capturing monitor matching window: ${matched.name} (id: ${matched.id}, display_id: ${matched.display_id})`
                                    );
                                    callback({ video: matched, audio: 'loopback' });
                                    return;
                                }
                            }
                        }
                    } catch (err) {
                        console.warn('[DisplayMedia] Error matching display for window:', err);
                    }

                    console.log(`[DisplayMedia] Defaulting to primary screen: ${sources[0].name}`);
                    callback({ video: sources[0], audio: 'loopback' });
                })
                .catch(err => {
                    console.error('[DisplayMedia] Failed to get desktop sources:', err);
                    callback({});
                });
        },
        { useSystemPicker: true }
    );

    try {
        const prefs = storage.getPreferences();
        stealthModeEnabled = prefs && prefs.stealthMode !== undefined ? prefs.stealthMode : true;
    } catch (e) {
        stealthModeEnabled = true;
    }

    applyStealthMode(mainWindow, stealthModeEnabled);

    if (process.platform === 'win32') {
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // After window is created, initialize keybinds
    mainWindow.webContents.once('dom-ready', () => {
        setTimeout(() => {
            const defaultKeybinds = getDefaultKeybinds();
            let keybinds = defaultKeybinds;

            // Load keybinds from storage
            const savedKeybinds = storage.getKeybinds();
            if (savedKeybinds) {
                keybinds = { ...defaultKeybinds, ...savedKeybinds };
            }

            updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }, 150);
    });

    setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef);

    return mainWindow;
}

function getDefaultKeybinds() {
    const isMac = process.platform === 'darwin';
    return {
        moveUp: isMac ? 'Alt+Up' : 'Ctrl+Up',
        moveDown: isMac ? 'Alt+Down' : 'Ctrl+Down',
        moveLeft: isMac ? 'Alt+Left' : 'Ctrl+Left',
        moveRight: isMac ? 'Alt+Right' : 'Ctrl+Right',
        toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
        toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
        toggleStealthMode: isMac ? 'Cmd+Shift+H' : 'Ctrl+Shift+H',
        nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
        previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
        nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
        scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
        scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
        increaseOpacity: 'Alt+.',
        decreaseOpacity: 'Alt+,',
        emergencyErase: isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E',
    };
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    console.log('Updating global shortcuts with:', keybinds);

    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const moveIncrement = Math.floor(Math.min(width, height) * 0.1);

    const movementActions = {
        moveUp: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY - moveIncrement);
        },
        moveDown: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY + moveIncrement);
        },
        moveLeft: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX - moveIncrement, currentY);
        },
        moveRight: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX + moveIncrement, currentY);
        },
    };

    Object.keys(movementActions).forEach(action => {
        const keybind = keybinds[action];
        if (keybind) {
            try {
                globalShortcut.register(keybind, movementActions[action]);
                console.log(`Registered ${action}: ${keybind}`);
            } catch (error) {
                console.error(`Failed to register ${action} (${keybind}):`, error);
            }
        }
    });

    // Register toggle visibility shortcut
    if (keybinds.toggleVisibility) {
        try {
            globalShortcut.register(keybinds.toggleVisibility, () => {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.showInactive();
                }
            });
            console.log(`Registered toggleVisibility: ${keybinds.toggleVisibility}`);
        } catch (error) {
            console.error(`Failed to register toggleVisibility (${keybinds.toggleVisibility}):`, error);
        }
    }

    // Register toggle click-through shortcut
    if (keybinds.toggleClickThrough) {
        try {
            globalShortcut.register(keybinds.toggleClickThrough, () => {
                mouseEventsIgnored = !mouseEventsIgnored;
                if (mouseEventsIgnored) {
                    mainWindow.setIgnoreMouseEvents(true, { forward: true });
                    console.log('Mouse events ignored');
                } else {
                    mainWindow.setIgnoreMouseEvents(false);
                    console.log('Mouse events enabled');
                }
                mainWindow.webContents.send('click-through-toggled', mouseEventsIgnored);
            });
            console.log(`Registered toggleClickThrough: ${keybinds.toggleClickThrough}`);
        } catch (error) {
            console.error(`Failed to register toggleClickThrough (${keybinds.toggleClickThrough}):`, error);
        }
    }

    // Register toggle stealth mode shortcut
    if (keybinds.toggleStealthMode) {
        try {
            globalShortcut.register(keybinds.toggleStealthMode, () => {
                stealthModeEnabled = !stealthModeEnabled;
                applyStealthMode(mainWindow, stealthModeEnabled);
                storage.updatePreference('stealthMode', stealthModeEnabled);
                mainWindow.webContents.send('stealth-mode-changed', stealthModeEnabled);
                console.log(`Stealth mode toggled: ${stealthModeEnabled}`);
            });
            console.log(`Registered toggleStealthMode: ${keybinds.toggleStealthMode}`);
        } catch (error) {
            console.error(`Failed to register toggleStealthMode (${keybinds.toggleStealthMode}):`, error);
        }
    }

    // Register next step shortcut (either starts session or takes screenshot based on view)
    if (keybinds.nextStep) {
        try {
            globalShortcut.register(keybinds.nextStep, async () => {
                console.log('Next step shortcut triggered');
                try {
                    // Determine the shortcut key format
                    const isMac = process.platform === 'darwin';
                    const shortcutKey = isMac ? 'cmd+enter' : 'ctrl+enter';

                    // Use the new handleShortcut function
                    mainWindow.webContents.executeJavaScript(`
                        preechakAi.handleShortcut('${shortcutKey}');
                    `);
                } catch (error) {
                    console.error('Error handling next step shortcut:', error);
                }
            });
            console.log(`Registered nextStep: ${keybinds.nextStep}`);
        } catch (error) {
            console.error(`Failed to register nextStep (${keybinds.nextStep}):`, error);
        }
    }

    // Register previous response shortcut
    if (keybinds.previousResponse) {
        try {
            globalShortcut.register(keybinds.previousResponse, () => {
                console.log('Previous response shortcut triggered');
                sendToRenderer('navigate-previous-response');
            });
            console.log(`Registered previousResponse: ${keybinds.previousResponse}`);
        } catch (error) {
            console.error(`Failed to register previousResponse (${keybinds.previousResponse}):`, error);
        }
    }

    // Register next response shortcut
    if (keybinds.nextResponse) {
        try {
            globalShortcut.register(keybinds.nextResponse, () => {
                console.log('Next response shortcut triggered');
                sendToRenderer('navigate-next-response');
            });
            console.log(`Registered nextResponse: ${keybinds.nextResponse}`);
        } catch (error) {
            console.error(`Failed to register nextResponse (${keybinds.nextResponse}):`, error);
        }
    }

    // Register scroll up shortcut
    if (keybinds.scrollUp) {
        try {
            globalShortcut.register(keybinds.scrollUp, () => {
                console.log('Scroll up shortcut triggered');
                sendToRenderer('scroll-response-up');
            });
            console.log(`Registered scrollUp: ${keybinds.scrollUp}`);
        } catch (error) {
            console.error(`Failed to register scrollUp (${keybinds.scrollUp}):`, error);
        }
    }

    // Register scroll down shortcut
    if (keybinds.scrollDown) {
        try {
            globalShortcut.register(keybinds.scrollDown, () => {
                console.log('Scroll down shortcut triggered');
                sendToRenderer('scroll-response-down');
            });
            console.log(`Registered scrollDown: ${keybinds.scrollDown}`);
        } catch (error) {
            console.error(`Failed to register scrollDown (${keybinds.scrollDown}):`, error);
        }
    }

    // Register opacity adjustment shortcuts
    if (keybinds.increaseOpacity) {
        try {
            globalShortcut.register(keybinds.increaseOpacity, () => {
                console.log('Increase opacity triggered');
                sendToRenderer('change-opacity', 0.1);
            });
            console.log(`Registered increaseOpacity: ${keybinds.increaseOpacity}`);
        } catch (error) {
            console.error(`Failed to register increaseOpacity (${keybinds.increaseOpacity}):`, error);
        }
    }

    if (keybinds.decreaseOpacity) {
        try {
            globalShortcut.register(keybinds.decreaseOpacity, () => {
                console.log('Decrease opacity triggered');
                sendToRenderer('change-opacity', -0.1);
            });
            console.log(`Registered decreaseOpacity: ${keybinds.decreaseOpacity}`);
        } catch (error) {
            console.error(`Failed to register decreaseOpacity (${keybinds.decreaseOpacity}):`, error);
        }
    }

    // Register emergency erase shortcut
    if (keybinds.emergencyErase) {
        try {
            globalShortcut.register(keybinds.emergencyErase, () => {
                console.log('Emergency Erase triggered!');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.hide();

                    if (geminiSessionRef.current) {
                        geminiSessionRef.current.close();
                        geminiSessionRef.current = null;
                    }

                    sendToRenderer('clear-sensitive-data');

                    setTimeout(() => {
                        const { app } = require('electron');
                        app.quit();
                    }, 300);
                }
            });
            console.log(`Registered emergencyErase: ${keybinds.emergencyErase}`);
        } catch (error) {
            console.error(`Failed to register emergencyErase (${keybinds.emergencyErase}):`, error);
        }
    }
}

function setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef) {
    ipcMain.on('view-changed', (event, view) => {
        if (!mainWindow.isDestroyed()) {
            const isLiveMode = view === 'assistant';

            if (process.platform !== 'win32') {
                mainWindow.setAlwaysOnTop(isLiveMode);
                mainWindow.setVisibleOnAllWorkspaces(isLiveMode, { visibleOnFullScreen: isLiveMode });
            }

            if (!isLiveMode) {
                mainWindow.setIgnoreMouseEvents(false);
            }
        }
    });

    ipcMain.handle('window-minimize', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (!mainWindow.isDestroyed()) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('set-stealth-mode', (event, enabled) => {
        applyStealthMode(mainWindow, enabled);
        storage.updatePreference('stealthMode', enabled);
        mainWindow.webContents.send('stealth-mode-changed', enabled);
        return { success: true, stealthMode: stealthModeEnabled };
    });

    ipcMain.handle('get-stealth-mode', () => {
        return stealthModeEnabled;
    });

    ipcMain.handle('toggle-window-visibility', async event => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.showInactive();
            }
            return { success: true };
        } catch (error) {
            console.error('Error toggling window visibility:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-current-display', () => {
        try {
            if (!mainWindow || mainWindow.isDestroyed()) return null;
            const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
            return {
                id: currentDisplay.id,
                bounds: currentDisplay.bounds,
            };
        } catch (e) {
            return null;
        }
    });

    ipcMain.handle('capture-clean-screenshot', async () => {
        try {
            if (!mainWindow || mainWindow.isDestroyed()) {
                return { success: false, error: 'Main window unavailable' };
            }

            // Temporarily make the window 100% transparent so it is NOT captured in the screenshot
            mainWindow.setOpacity(0);

            // Allow the OS window compositor a brief moment (~70ms) to composite the desktop without this window
            await new Promise(resolve => setTimeout(resolve, 70));

            let base64Data = null;
            const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());

            if (process.platform === 'darwin') {
                const fs = require('fs');
                const os = require('os');
                const { execFile } = require('child_process');
                const tmpFile = path.join(os.tmpdir(), `cd_screen_${Date.now()}.jpg`);

                await new Promise((resolve, reject) => {
                    const allDisplays = screen.getAllDisplays();
                    const displayIndex = allDisplays.findIndex(d => d.id === currentDisplay.id);
                    const args = ['-x', '-C', '-t', 'jpg'];
                    if (displayIndex >= 0 && allDisplays.length > 1) {
                        args.push('-D', String(displayIndex + 1));
                    }
                    args.push(tmpFile);
                    execFile('screencapture', args, err => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                if (fs.existsSync(tmpFile)) {
                    const buf = fs.readFileSync(tmpFile);
                    base64Data = buf.toString('base64');
                    fs.unlink(tmpFile, () => {});
                }
            } else {
                const { desktopCapturer } = require('electron');
                const targetW = Math.min(1920, Math.round(currentDisplay.bounds.width));
                const targetH = Math.min(1080, Math.round(currentDisplay.bounds.height));
                const sources = await desktopCapturer.getSources({
                    types: ['screen'],
                    thumbnailSize: { width: targetW, height: targetH },
                });
                const matched = sources.find(s => String(s.display_id) === String(currentDisplay.id)) || sources[0];
                if (matched && matched.thumbnail) {
                    const jpegBuf = matched.thumbnail.toJPEG(80);
                    base64Data = jpegBuf.toString('base64');
                }
            }

            // Immediately restore the window opacity
            mainWindow.setOpacity(1);

            if (base64Data) {
                return { success: true, data: base64Data };
            }
            return { success: false, error: 'Failed to obtain screenshot data' };
        } catch (error) {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setOpacity(1);
            }
            console.error('Error capturing clean screenshot:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    createWindow,
    getDefaultKeybinds,
    updateGlobalShortcuts,
    setupWindowIpcHandlers,
};
