const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/components/views/AssistantView.js'), 'utf8');
const context = {
    LitElement: class {},
    css: () => '',
    markdownStyles: '',
    customElements: { define() {} },
};
vm.createContext(context);
vm.runInContext(source.replace(/^import .*;\n/gm, '').replace('export class AssistantView', 'class AssistantView') + '\nglobalThis.View = AssistantView;', context);

function createView() {
    const view = new context.View();
    let focused = -1;
    const items = view._modeOptions().map((option, index) => ({ focus: () => { focused = index; } }));
    let triggerFocused = false;
    view.shadowRoot = {
        querySelectorAll: () => items,
        querySelector: () => ({ focus: () => { triggerFocused = true; } }),
        activeElement: items[0],
    };
    view.updateComplete = Promise.resolve();
    return { view, items, focused: () => focused, triggerFocused: () => triggerFocused };
}

function key(value) {
    return { key: value, preventDefault() {}, stopPropagation() {} };
}

test('opening the in-window picker focuses the current mode or last option', async () => {
    const state = createView();
    state.view.selectedProfile = 'sales';
    await state.view._openModeMenu();
    assert.equal(state.view.showModeMenu, true);
    assert.equal(state.focused(), 2);
    await state.view._openModeMenu(true);
    assert.equal(state.focused(), 6);
    assert.equal(state.items.length, 7);
});

test('keyboard navigation wraps and Escape closes and restores focus', () => {
    const state = createView();
    state.view.showModeMenu = true;
    state.view._handleModeMenuKeydown(key('ArrowUp'));
    assert.equal(state.focused(), 6);
    state.view._handleModeMenuKeydown(key('Home'));
    assert.equal(state.focused(), 0);
    state.view._handleModeMenuKeydown(key('End'));
    assert.equal(state.focused(), 6);
    state.view._handleModeMenuKeydown(key('Escape'));
    assert.equal(state.view.showModeMenu, false);
    assert.equal(state.triggerFocused(), true);
});

test('selecting a new mode invokes session switching once and closes the picker', () => {
    const { view } = createView();
    const changes = [];
    view.onProfileChange = profile => changes.push(profile);
    view.showModeMenu = true;
    view._handleProfileSelect('meeting');
    assert.equal(view.selectedProfile, 'meeting');
    assert.equal(view.showModeMenu, false);
    view._handleProfileSelect('meeting');
    assert.deepEqual(changes, ['meeting']);
});

test('focus leaving the menu dismisses it without cancelling normal Tab behavior', () => {
    const { view } = createView();
    view.showModeMenu = true;
    view._handleModeFocusOut({ currentTarget: { contains: () => true }, relatedTarget: {} });
    assert.equal(view.showModeMenu, true);
    view._handleModeFocusOut({ currentTarget: { contains: () => false }, relatedTarget: null });
    assert.equal(view.showModeMenu, false);
});
