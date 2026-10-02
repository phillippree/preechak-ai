const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSelection, validateCropDimensions, calculateCropBounds, getSnipCursor } = require('../src/utils/snipOverlay');
const { getDefaultKeybinds } = require('../src/utils/window');

test('normalizeSelection handles all drag directions correctly', () => {
    // 1. Drag top-left to bottom-right
    const downRight = normalizeSelection({ x: 10, y: 20 }, { x: 110, y: 220 });
    assert.deepEqual(downRight, { x: 10, y: 20, width: 100, height: 200 });

    // 2. Drag bottom-right to top-left (reverse drag)
    const upLeft = normalizeSelection({ x: 110, y: 220 }, { x: 10, y: 20 });
    assert.deepEqual(upLeft, { x: 10, y: 20, width: 100, height: 200 });

    // 3. Drag top-right to bottom-left
    const downLeft = normalizeSelection({ x: 150, y: 50 }, { x: 50, y: 150 });
    assert.deepEqual(downLeft, { x: 50, y: 50, width: 100, height: 100 });

    // 4. Fallback for undefined/null
    const nullSafe = normalizeSelection(null, null);
    assert.deepEqual(nullSafe, { x: 0, y: 0, width: 0, height: 0 });
});

test('validateCropDimensions rejects accidental clicks and permits valid regions', () => {
    // Normal rectangle
    assert.equal(validateCropDimensions({ width: 120, height: 80 }), true);
    assert.equal(validateCropDimensions({ width: 10, height: 10 }), true);

    // Accidental 1-pixel click or tiny jitter
    assert.equal(validateCropDimensions({ width: 2, height: 2 }), false);
    assert.equal(validateCropDimensions({ width: 5, height: 100 }), false);
    assert.equal(validateCropDimensions({ width: 100, height: 8 }), false);
    assert.equal(validateCropDimensions(null), false);
});

test('calculateCropBounds scales accurately across standard and Retina / HiDPI displays', () => {
    // 1x Standard Display: Display (1920x1080) -> Image (1920x1080)
    const standardDisplay = { width: 1920, height: 1080 };
    const standardImage = { width: 1920, height: 1080 };
    const selection = { x: 100, y: 200, width: 400, height: 300 };

    const cropStandard = calculateCropBounds(selection, standardDisplay, standardImage);
    assert.deepEqual(cropStandard, { x: 100, y: 200, width: 400, height: 300 });

    // 2x Retina Display: Display (1440x900) -> Native Image (2880x1800)
    const retinaDisplay = { width: 1440, height: 900 };
    const retinaImage = { width: 2880, height: 1800 };
    const retinaSelection = { x: 50, y: 100, width: 300, height: 200 };

    const cropRetina = calculateCropBounds(retinaSelection, retinaDisplay, retinaImage);
    assert.deepEqual(cropRetina, { x: 100, y: 200, width: 600, height: 400 });
});

test('calculateCropBounds clamps out-of-bounds coordinates cleanly', () => {
    const display = { width: 1000, height: 800 };
    const image = { width: 1000, height: 800 };

    // Selection extending beyond right/bottom edge
    const oversized = { x: 900, y: 700, width: 300, height: 300 };
    const clamped = calculateCropBounds(oversized, display, image);

    assert.equal(clamped.x, 900);
    assert.equal(clamped.y, 700);
    assert.equal(clamped.width, 100); // 1000 - 900
    assert.equal(clamped.height, 100); // 800 - 700
});

test('getDefaultKeybinds includes snipArea shortcut', () => {
    const isMac = process.platform === 'darwin';
    const keybinds = getDefaultKeybinds();

    assert.ok(keybinds.snipArea, 'snipArea keybind should exist');
    assert.equal(keybinds.snipArea, isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S');
});

test('getSnipCursor adapts cursor based on stealth mode', () => {
    // Stealth mode ON -> default standard mouse arrow so screen share observers see nothing unusual
    assert.equal(getSnipCursor(true), 'default');

    // Stealth mode OFF -> crosshair cursor for precision snipping
    assert.equal(getSnipCursor(false), 'crosshair');
    assert.equal(getSnipCursor(undefined), 'crosshair');
});
