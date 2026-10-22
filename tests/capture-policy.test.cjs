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
