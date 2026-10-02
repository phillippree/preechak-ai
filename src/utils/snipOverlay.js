const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFile } = require('child_process');

/**
 * Normalizes two drag points into a top-left x, y and positive width, height.
 */
function normalizeSelection(start, end) {
    const x1 = Number(start?.x || 0);
    const y1 = Number(start?.y || 0);
    const x2 = Number(end?.x || 0);
    const y2 = Number(end?.y || 0);
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
    };
}

/**
 * Validates that the selection meets a minimum size threshold to prevent accidental 1px clicks.
 */
function validateCropDimensions(rect, minDimension = 10) {
    if (!rect) return false;
    return (rect.width || 0) >= minDimension && (rect.height || 0) >= minDimension;
}

/**
 * Determines the appropriate cursor style based on stealth mode.
 * When stealth mode is ON, standard mouse arrow ('default') is used so screen share observers see nothing unusual.
 * When stealth mode is OFF, crosshair cursor ('crosshair') is used for precision snipping.
 */
function getSnipCursor(stealthModeEnabled = false) {
    return stealthModeEnabled ? 'default' : 'crosshair';
}

/**
 * Calculates pixel-accurate crop coordinates matching device pixel ratio / native screen resolution.
 */
function calculateCropBounds(selectionRect, displayBounds, imageSize) {
    const dWidth = Math.max(1, Number(displayBounds?.width || 1));
    const dHeight = Math.max(1, Number(displayBounds?.height || 1));
    const imgWidth = Math.max(1, Number(imageSize?.width || dWidth));
    const imgHeight = Math.max(1, Number(imageSize?.height || dHeight));

    const scaleX = imgWidth / dWidth;
    const scaleY = imgHeight / dHeight;

    let cropX = Math.round((selectionRect?.x || 0) * scaleX);
    let cropY = Math.round((selectionRect?.y || 0) * scaleY);
    let cropW = Math.round((selectionRect?.width || 0) * scaleX);
    let cropH = Math.round((selectionRect?.height || 0) * scaleY);

    cropX = Math.max(0, Math.min(imgWidth - 1, cropX));
    cropY = Math.max(0, Math.min(imgHeight - 1, cropY));
    cropW = Math.max(1, Math.min(imgWidth - cropX, cropW));
    cropH = Math.max(1, Math.min(imgHeight - cropY, cropH));

    return { x: cropX, y: cropY, width: cropW, height: cropH };
}

/**
 * Captures clean background screenshot buffer excluding the main app window.
 */
async function captureDisplayBuffer(currentDisplay, mainWindow) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setOpacity(0);
    }
    // Allow OS compositor to composite desktop without the floating window
    await new Promise(resolve => setTimeout(resolve, 80));

    let buffer = null;

    if (process.platform === 'darwin') {
        const tmpFile = path.join(os.tmpdir(), `cd_snip_${Date.now()}.jpg`);
        try {
            const { screen } = require('electron');
            const allDisplays = screen.getAllDisplays();
            const displayIndex = allDisplays.findIndex(d => d.id === currentDisplay.id);
            const args = ['-x', '-C', '-t', 'jpg'];
            if (displayIndex >= 0 && allDisplays.length > 1) {
                args.push('-D', String(displayIndex + 1));
            }
            args.push(tmpFile);

            await new Promise((resolve, reject) => {
                execFile('screencapture', args, err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            if (fs.existsSync(tmpFile)) {
                buffer = fs.readFileSync(tmpFile);
                fs.unlink(tmpFile, () => {});
            }
        } catch (err) {
            console.error('[SnipOverlay] macOS display capture error:', err);
        }
    } else {
        try {
            const { desktopCapturer } = require('electron');
            const targetW = Math.min(2560, Math.round(currentDisplay.bounds.width * (currentDisplay.scaleFactor || 1)));
            const targetH = Math.min(1440, Math.round(currentDisplay.bounds.height * (currentDisplay.scaleFactor || 1)));
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: targetW, height: targetH },
            });
            const matched = sources.find(s => String(s.display_id) === String(currentDisplay.id)) || sources[0];
            if (matched && matched.thumbnail) {
                buffer = matched.thumbnail.toJPEG(90);
            }
        } catch (err) {
            console.error('[SnipOverlay] DesktopCapturer error:', err);
        }
    }

    return buffer;
}

/**
 * Spawns the interactive snipping overlay window and returns cropped base64 or cancelled.
 */
async function startSnipCapture(mainWindow, stealthModeEnabled = true) {
    const { BrowserWindow, screen, ipcMain, nativeImage } = require('electron');
    if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window unavailable' };
    }

    const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
    const displayBounds = currentDisplay.bounds;

    // 1. Capture clean desktop background buffer
    const rawBuffer = await captureDisplayBuffer(currentDisplay, mainWindow);
    if (!rawBuffer) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(1);
        return { success: false, error: 'Failed to capture display background' };
    }

    const fullImage = nativeImage.createFromBuffer(rawBuffer);
    const imgSize = fullImage.getSize();

    return new Promise(resolve => {
        let snipWindow = new BrowserWindow({
            x: displayBounds.x,
            y: displayBounds.y,
            width: displayBounds.width,
            height: displayBounds.height,
            transparent: true,
            frame: false,
            hasShadow: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            enableLargerThanScreen: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
            backgroundColor: '#00000000',
        });

        // Apply stealth mode protection so overlay is excluded from screen shares
        if (stealthModeEnabled && typeof snipWindow.setContentProtection === 'function') {
            snipWindow.setContentProtection(true);
        }

        const cleanup = () => {
            ipcMain.removeHandler('snip-finish');
            ipcMain.removeHandler('snip-cancel');
            if (snipWindow && !snipWindow.isDestroyed()) {
                snipWindow.close();
                snipWindow = null;
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setOpacity(1);
            }
        };

        ipcMain.handle('snip-finish', async (event, selection) => {
            try {
                if (!validateCropDimensions(selection)) {
                    cleanup();
                    return resolve({ success: false, cancelled: true });
                }

                const cropBounds = calculateCropBounds(selection, displayBounds, imgSize);
                const cropped = fullImage.crop(cropBounds);
                const base64Data = cropped.toJPEG(88).toString('base64');

                cleanup();
                resolve({
                    success: true,
                    data: base64Data,
                    bounds: cropBounds,
                    width: cropBounds.width,
                    height: cropBounds.height,
                });
            } catch (err) {
                console.error('[SnipOverlay] Crop error:', err);
                cleanup();
                resolve({ success: false, error: err.message });
            }
        });

        ipcMain.handle('snip-cancel', async () => {
            cleanup();
            resolve({ success: false, cancelled: true });
        });

        snipWindow.on('closed', () => {
            cleanup();
            resolve({ success: false, cancelled: true });
        });

        const cursorStyle = getSnipCursor(stealthModeEnabled);
        const overlayHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
  body, html { width: 100vw; height: 100vh; overflow: hidden; background: transparent; cursor: ${cursorStyle}; }
  #canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: ${cursorStyle}; }
  #banner {
    position: absolute;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 17, 23, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 18px;
    border-radius: 9999px;
    pointer-events: none;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
    letter-spacing: 0.01em;
  }
  #badge {
    position: absolute;
    display: none;
    background: #2563eb;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "SF Mono", monospace;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 7px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
</style>
</head>
<body>
  <div id="banner">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
    Click & drag to select region • Press <span style="background:rgba(255,255,255,0.15);padding:1px 6px;border-radius:4px;">ESC</span> or Right-Click to cancel
  </div>
  <div id="badge">0 × 0</div>
  <canvas id="canvas"></canvas>
  <script>
    const { ipcRenderer } = require('electron');
    const canvas = document.getElementById('canvas');
    const badge = document.getElementById('badge');
    const ctx = canvas.getContext('2d');

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let currX = 0;
    let currY = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      draw();
    }

    window.addEventListener('resize', resize);

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Dim background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, w, h);

      if (isDrawing) {
        const x = Math.min(startX, currX);
        const y = Math.min(startY, currY);
        const width = Math.abs(currX - startX);
        const height = Math.abs(currY - startY);

        if (width > 0 && height > 0) {
          // Clear cut-out region
          ctx.clearRect(x, y, width, height);

          // Glowing border
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);

          // Dimensions badge
          badge.style.display = 'block';
          badge.textContent = Math.round(width) + ' × ' + Math.round(height);
          badge.style.left = (x + 8) + 'px';
          badge.style.top = (y + height + 8 > h - 30 ? y - 26 : y + height + 8) + 'px';
        }
      }
    }

    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) { // Right click
        ipcRenderer.invoke('snip-cancel');
        return;
      }
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
      currX = e.clientX;
      currY = e.clientY;
      draw();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      currX = e.clientX;
      currY = e.clientY;
      draw();
    });

    window.addEventListener('mouseup', (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      const x = Math.min(startX, currX);
      const y = Math.min(startY, currY);
      const width = Math.abs(currX - startX);
      const height = Math.abs(currY - startY);

      if (width >= 10 && height >= 10) {
        ipcRenderer.invoke('snip-finish', { x, y, width, height });
      } else {
        ipcRenderer.invoke('snip-cancel');
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ipcRenderer.invoke('snip-cancel');
      }
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ipcRenderer.invoke('snip-cancel');
    });

    resize();
  </script>
</body>
</html>`;

        snipWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`);
    });
}

module.exports = {
    normalizeSelection,
    validateCropDimensions,
    calculateCropBounds,
    getSnipCursor,
    captureDisplayBuffer,
    startSnipCapture,
};
