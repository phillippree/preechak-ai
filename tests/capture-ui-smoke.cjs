const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'preechak-capture-ui-'));
const projectRoot = path.join(__dirname, '..');
app.setPath('userData', temporaryDirectory);
const prefs = { theme: 'deepteal', backgroundTransparency: 1, audioMode: 'both', conversationCoaching: true, selectedProfile: 'interview' };
for (const [name, data] of Object.entries({
    'storage:get-config': { onboarded: true },
    'storage:get-preferences': prefs,
    'storage:get-credentials': {},
    'storage:get-api-key': '',
    'storage:get-groq-api-key': '',
    'storage:get-keybinds': null,
    'storage:get-all-sessions': [],
    'storage:get-today-limits': {},
}))
    ipcMain.handle(name, () => ({ success: true, data }));
ipcMain.handle('storage:update-preference', () => ({ success: true }));
ipcMain.handle('whisper:get-status', () => ({ engineInstalled: false, models: {} }));
ipcMain.handle('get-app-version', () => '0.2.1');
ipcMain.handle('coach:get-state', () => ({ active: false }));
ipcMain.handle('gemini-http:get-attachments', () => ({ activeAttachmentIds: [], activeAttachments: [], screenshots: [] }));
const actions = [];
ipcMain.handle('coach:capture-action', (_, payload) => {
    actions.push(payload);
    return { success: true, text: 'Focused correction' };
});
const timeout = setTimeout(() => {
    console.error('Capture UI check timed out');
    app.exit(1);
}, 20000);
app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 1100,
        height: 850,
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
    });
    win.setContentProtection(true);
    const errors = [];
    win.webContents.on('console-message', (_, level, message) => {
        if (level >= 3) errors.push(message);
    });
    try {
        await win.loadFile(path.join(projectRoot, 'src/index.html'));
        const rect = await win.webContents.executeJavaScript(`(async()=>{
  await customElements.whenDefined('preechak-ai-app');const app=document.querySelector('preechak-ai-app');
  for(let i=0;i<100&&!app._storageLoaded;i++)await new Promise(r=>setTimeout(r,20));
  app.currentView='assistant';app.sessionActive=true;app._stealthMode=true;
  app.responses=[{prompt:'Review my code',text:'Carry is lost after the loop.\\n\\n\`\`\`python\\nif carry:\\n    digits.append(str(carry))\\n\`\`\`\\n\\n[Reference](https://example.com "Do not open a native tooltip")'}];
  await app.updateComplete;const view=app.shadowRoot.querySelector('assistant-view');await view.updateComplete;
  view._coachEventReceived=true;view.coachState={active:true,sources:{},problem:{title:'Multiply strings'},recentTurns:[],drafts:[],capture:{id:'capture-test',intent:'ambiguous',reason:'Is this starter code or your partial implementation?',needsChoice:true,pending:false}};
  await view.updateComplete;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  await new Promise(r=>setTimeout(r,450));
  window.__captureView=view;const button=view.shadowRoot.querySelectorAll('.capture-buttons button')[1];button.scrollIntoView();
  const rect=button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
 })()`);
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
        const hover = await win.webContents.executeJavaScript(
            `(()=>{const b=window.__captureView.shadowRoot.querySelectorAll('.capture-buttons button')[1];return {cursor:getComputedStyle(b).cursor,hover:b.matches(':hover')};})()`
        );
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: rect.x,
            y: rect.y,
            button: 'left',
            clickCount: 1,
        });
        const pressed = await win.webContents.executeJavaScript(
            `(()=>{const b=window.__captureView.shadowRoot.querySelectorAll('.capture-buttons button')[1];return {cursor:getComputedStyle(b).cursor,active:b.matches(':active')};})()`
        );
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: rect.x,
            y: rect.y,
            button: 'left',
            clickCount: 1,
        });
        await new Promise(r => setTimeout(r, 100));
        const result = await win.webContents.executeJavaScript(`(async()=>{
  const v=window.__captureView;
  v.coachState={...v.coachState,capture:{id:'capture-test',intent:'review_code',reason:'Reviewing your implementation against the problem.',needsChoice:false,pending:false}};
  await v.updateComplete;
  const buttons=[...v.shadowRoot.querySelectorAll('.capture-buttons button')];
  buttons.find(b=>b.textContent.includes('Show full')).click();await new Promise(r=>setTimeout(r,30));
  buttons.find(b=>b.textContent.includes('Explain visually')).click();await new Promise(r=>setTimeout(r,30));
  const copy=v.shadowRoot.querySelector('.code-block-copy-btn');
  const link=v.shadowRoot.querySelector('.protected-coach-response a');
  const result={titles:v.shadowRoot.querySelectorAll('[title]').length,headerTitles:document.querySelector('preechak-ai-app').shadowRoot.querySelectorAll('[title]').length,copyCursor:copy?getComputedStyle(copy).cursor:null,linkEnabled:!!link?.getAttribute('href'),labels:buttons.map(b=>b.textContent.trim())};
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return result;
 })()`);
        if (
            hover.cursor !== 'default' ||
            pressed.cursor !== 'default' ||
            !hover.hover ||
            !pressed.active ||
            result.titles ||
            result.headerTitles ||
            result.copyCursor !== 'default' ||
            result.linkEnabled ||
            actions.map(a => a.action).join(',') !== 'review_code,full_code,explain_visual' ||
            BrowserWindow.getAllWindows().length !== 1 ||
            errors.length
        )
            throw new Error(JSON.stringify({ hover, pressed, result, actions, errors, windows: BrowserWindow.getAllWindows().length }));
        fs.writeFileSync(path.join(temporaryDirectory, 'capture-ui.png'), (await win.webContents.capturePage()).toPNG());
        console.log('Capture UI passed: arrow cursor on hover/press; mouse review/full-code/visual actions; no native titles or additional windows.');
        clearTimeout(timeout);
        app.exit(0);
    } catch (error) {
        console.error(error.message);
        clearTimeout(timeout);
        app.exit(1);
    }
});
