const test = require('node:test');
const assert = require('node:assert/strict');
const { validCaptureAction } = require('../src/utils/capture-policy');

test('capture action IPC accepts only bounded identifiers and supported mouse actions', () => {
    for (const action of ['new_problem', 'review_code', 'continue_code', 'full_code', 'explain_visual']) {
        assert.equal(validCaptureAction({ captureId: 'request-1', action }), true);
    }
    for (const payload of [
        null,
        [],
        'review_code',
        {},
        { captureId: '', action: 'review_code' },
        { captureId: 'x'.repeat(81), action: 'review_code' },
        { captureId: {}, action: 'review_code' },
        { captureId: 'request-1', action: 'execute-code' },
        { captureId: 'request-1', action: { toString: () => 'review_code' } },
    ]) {
        assert.equal(validCaptureAction(payload), false);
    }
});

test('full solutions begin with task understanding and a diagram without solution reasoning', () => {
    const { VISUAL_POLICY } = require('../src/utils/capture-policy');
    const headings = [...VISUAL_POLICY.matchAll(/^## (.+)$/gm)].map(match => match[1]);
    assert.deepEqual(headings, [
        'What the question is asking',
        'Chalkboard Walkthrough: Solution 1',
        'Solution 1: Basic',
        'Chalkboard Walkthrough: Solution 2',
        'Solution 2: Optimized',
        'What to Say / Edge Cases',
    ]);
    const understanding = VISUAL_POLICY.split('## What the question is asking')[1].split('## Chalkboard Walkthrough: Solution 1')[0];
    assert.match(understanding, /labeled diagram/);
    assert.match(understanding, /MUST contain NO solution/);
    assert.match(understanding, /no algorithm/);
    assert.match(VISUAL_POLICY, /retain focused bug reviews/);
});

test('each solution requires a separate trace matching its own implementation', () => {
    const { VISUAL_POLICY } = require('../src/utils/capture-policy');
    const basic = VISUAL_POLICY.split('## Chalkboard Walkthrough: Solution 1')[1].split('## Solution 1: Basic')[0];
    const optimized = VISUAL_POLICY.split('## Chalkboard Walkthrough: Solution 2')[1].split('## Solution 2: Optimized')[0];
    assert.match(basic, /ONLY the basic solution/);
    assert.match(basic, /exact variable/);
    assert.match(basic, /DP table/);
    assert.match(optimized, /ONLY the optimized solution/);
    assert.match(optimized, /exact variable names/);
    assert.match(optimized, /Do not skip this separate walkthrough/);
});
