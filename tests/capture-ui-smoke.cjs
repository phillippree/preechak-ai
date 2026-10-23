const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'preechak-capture-ui-'));
const projectRoot = path.join(__dirname, '..');
app.setPath('userData', temporaryDirectory);
const prefs = { theme: 'windowsblue', backgroundTransparency: 0.4, audioMode: 'both', conversationCoaching: true, selectedProfile: 'interview' };
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
ipcMain.handle('get-audio-mute-state', () => ({ isMicMuted: false, isSpeakerMuted: false }));
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
  view._layoutLoading=false;view.coachExpanded=true;
  view._coachEventReceived=true;view.coachState={active:true,sources:{},problem:{title:'Multiply strings'},recentTurns:[],drafts:[],capture:{id:'capture-test',intent:'ambiguous',reason:'Is this starter code or your partial implementation?',needsChoice:true,pending:false}};
  await view.updateComplete;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  await new Promise(r=>setTimeout(r,450));
  window.__captureView=view;const button=view.shadowRoot.querySelectorAll('.capture-buttons button')[1];button.scrollIntoView();
  const rect=button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
 })()`);
        win.webContents.debugger.attach('1.3');
        for (let index = 0; index < 3; index++) {
            await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
            const button = await win.webContents.executeJavaScript(`(()=>{
                const b=window.__captureView.shadowRoot.querySelectorAll('.coach-toolbar button')[${index}];
                b.scrollIntoView();const r=b.getBoundingClientRect();
                return {x:r.x+r.width/2,y:r.y+r.height/2,background:getComputedStyle(b).backgroundColor};
            })()`);
            await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: button.x, y: button.y });
            const hovered = await win.webContents.executeJavaScript(
                `(()=>{const s=getComputedStyle(window.__captureView.shadowRoot.querySelectorAll('.coach-toolbar button')[${index}]);return {background:s.backgroundColor,cursor:s.cursor};})()`
            );
            await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: button.x,
                y: button.y,
                button: 'left',
                clickCount: 1,
            });
            const active = await win.webContents.executeJavaScript(
                `(()=>{const s=getComputedStyle(window.__captureView.shadowRoot.querySelectorAll('.coach-toolbar button')[${index}]);return {background:s.backgroundColor,cursor:s.cursor};})()`
            );
            // Release outside the button to check appearance without triggering its action.
            await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1, button: 'left', buttons: 1 });
            await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: 1,
                y: 1,
                button: 'left',
                clickCount: 1,
            });
            if (
                hovered.background === button.background ||
                active.background === hovered.background ||
                hovered.cursor !== 'default' ||
                active.cursor !== 'default'
            )
                throw new Error('Toolbar button states failed');
        }

        const normal = await win.webContents.executeJavaScript(
            `getComputedStyle(window.__captureView.shadowRoot.querySelectorAll('.capture-buttons button')[1]).backgroundColor`
        );
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
        const hover = await win.webContents.executeJavaScript(
            `(()=>{const b=window.__captureView.shadowRoot.querySelectorAll('.capture-buttons button')[1];return {background:getComputedStyle(b).backgroundColor,cursor:getComputedStyle(b).cursor,hover:b.matches(':hover')};})()`
        );
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: rect.x,
            y: rect.y,
            button: 'left',
            clickCount: 1,
        });
        const pressed = await win.webContents.executeJavaScript(
            `(()=>{const b=window.__captureView.shadowRoot.querySelectorAll('.capture-buttons button')[1];return {background:getComputedStyle(b).backgroundColor,cursor:getComputedStyle(b).cursor,active:b.matches(':active')};})()`
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
  const sectionHost=document.createElement('div');
  sectionHost.innerHTML=v.renderProtectedMarkdown('## What the question is asking\\nStart at index 0; reach the last index.\\n\\n\\x60\\x60\\x60text\\n[2,3,1] start -> goal\\n\\x60\\x60\\x60\\n\\n## Chalkboard Walkthrough: Solution 1\\nExample trace\\n\\n## Solution 1: Basic\\n### Code\\n\\x60\\x60\\x60python\\nreturn 2\\n\\x60\\x60\\x60\\n\\n## Chalkboard Walkthrough: Solution 2\\nOptimized trace\\n\\n## Solution 2: Optimized\\nOptimized code\\n\\n## What to Say / Edge Cases\\nOne-element input');
  const sections=[...sectionHost.querySelectorAll('details.answer-section')];
  if(sections.length!==6 || sections.some(s=>!s.open))throw new Error('Answer sections missing or not expanded');
  const expected=['What the question is asking','Chalkboard Walkthrough: Solution 1','Solution 1: Basic','Chalkboard Walkthrough: Solution 2','Solution 2: Optimized','What to Say / Edge Cases'];
  if(sections.map(s=>s.querySelector('summary').textContent).join('|')!==expected.join('|'))throw new Error('Section order incorrect');
  sections[3].querySelector('summary').click();
  if(sections[3].open || !sections[1].open || !sections[4].open)throw new Error('Walkthroughs do not collapse independently');
  sections[0].querySelector('summary').click();
  if(sections[0].open || !sections[1].open)throw new Error('Independent section collapse failed');
  if(!sections[2].querySelector('.code-block-copy-btn') || !sections[2].textContent.includes('return 2'))throw new Error('Code or copy button lost');
  if(sectionHost.querySelectorAll('details.answer-section details.answer-section').length)throw new Error('Nested solution sections');
  if(v.renderProtectedMarkdown('A short coaching hint').includes('answer-section'))throw new Error('Short hints should stay unchanged');

  v.coachState={...v.coachState,capture:{id:'capture-test',intent:'review_code',reason:'Reviewing your implementation against the problem.',needsChoice:false,pending:false}};
  await v.updateComplete;
  v.coachExpanded=false;await v.updateComplete;
  const assertFrame=()=>{
    const panel=v.shadowRoot.querySelector('.coach-panel');
    const divider=v.shadowRoot.querySelector('.coach-resizer');
    const chat=v.shadowRoot.querySelector('.chat-container');
    const p=panel.getBoundingClientRect(),d=divider.getBoundingClientRect(),c=chat.getBoundingClientRect();
    if(Math.abs(p.top-d.bottom)>1 || Math.abs(d.top-c.bottom)>1)throw new Error('Gap in conversation frame');
    if(getComputedStyle(panel).margin!=='0px' || getComputedStyle(panel).borderRadius!=='0px')throw new Error('Detached Coach frame');
    if(getComputedStyle(divider).backgroundColor==='rgba(0, 0, 0, 0)')throw new Error('Transparent divider gap');
    if(getComputedStyle(panel,'::-webkit-scrollbar').width!=='6px')throw new Error('Coach scrollbar theme missing');
  };
  assertFrame();
  if(!v.shadowRoot.querySelector('.coach-extra').hidden)throw new Error('Compact coach shows extra controls');
  v.coachExpanded=true;v.coachHeight=300;await v.updateComplete;
  assertFrame();
  if(v.shadowRoot.querySelector('.coach-extra').hidden)throw new Error('Expanded controls hidden');
  if(v.shadowRoot.querySelector('.coach-panel').getBoundingClientRect().height<290)throw new Error('Coach height not applied');
  const slider=v.shadowRoot.querySelector('.readability-control input');
  const chat=v.shadowRoot.querySelector('.chat-container');
  const answer=v.shadowRoot.querySelector('.bubble-ai');
  const coach=v.shadowRoot.querySelector('.coach-panel');
  if(getComputedStyle(document.querySelector('preechak-ai-app')).backgroundColor!=='rgba(0, 0, 0, 0)')throw new Error('App shell blocks conversation transparency');
  const before={answer:getComputedStyle(answer).backgroundColor,coach:getComputedStyle(coach).backgroundColor};
  for(const value of ['10','100']) {
    slider.value=value;slider.dispatchEvent(new Event('input',{bubbles:true}));await v.updateComplete;
    const expected=Number(value)/100;
    const color=getComputedStyle(chat).backgroundColor;
    if(expected===0.1 ? !color.endsWith(', 0.1)') : color!=='rgb(11, 23, 41)')throw new Error('Conversation background did not change: '+color);
    if(getComputedStyle(answer).backgroundColor!==before.answer || getComputedStyle(coach).backgroundColor!==before.coach)throw new Error('Slider changed content surfaces');
  }
  slider.dispatchEvent(new Event('change',{bubbles:true}));
  if(v.shadowRoot.querySelector('.coach-captions').open)throw new Error('Captions should start collapsed');
  if(v.scrollWidth>v.clientWidth)throw new Error('Assistant layout overflows');
  const buttons=[...v.shadowRoot.querySelectorAll('.capture-buttons button')];
  buttons.find(b=>b.textContent.includes('Show full')).click();await new Promise(r=>setTimeout(r,30));
  buttons.find(b=>b.textContent.includes('Explain visually')).click();await new Promise(r=>setTimeout(r,30));
  const copy=v.shadowRoot.querySelector('.code-block-copy-btn');
  const link=v.shadowRoot.querySelector('.protected-coach-response a');
  const result={titles:v.shadowRoot.querySelectorAll('[title]').length,headerTitles:document.querySelector('preechak-ai-app').shadowRoot.querySelectorAll('[title]').length,copyCursor:copy?getComputedStyle(copy).cursor:null,linkEnabled:!!link?.getAttribute('href'),labels:buttons.map(b=>b.textContent.trim())};
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return result;
 })()`);
        if (
            hover.background === normal ||
            pressed.background === hover.background ||
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
        console.log('Preview: ' + path.join(temporaryDirectory, 'capture-ui.png'));
        await win.setSize(780, 700);
        const overflow = await win.webContents.executeJavaScript(`window.__captureView.scrollWidth > window.__captureView.clientWidth`);
        if (overflow) throw new Error('Narrow layout overflows');
        console.log(
            'Capture UI passed: distinct hover/pressed colors; arrow cursor on hover/press; mouse review/full-code/visual actions; no native titles or additional windows.'
        );
        clearTimeout(timeout);
        app.exit(0);
    } catch (error) {
        console.error(error.message);
        clearTimeout(timeout);
        app.exit(1);
    }
});
