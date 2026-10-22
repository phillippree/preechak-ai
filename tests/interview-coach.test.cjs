const test = require('node:test');
const assert = require('node:assert/strict');
const { InterviewCoach } = require('../src/utils/interview-coach');

function reply(action = 'quiet', output = '', extra = {}) {
    return {
        text: JSON.stringify({
            action,
            newProblem: false,
            output,
            summary: 'Reading app: offline support.',
            contribution: 'clarification',
            problem: {
                title: 'Reading app',
                requirements: ['Offline support'],
                assumptions: [],
                openQuestions: ['Concurrent edits?'],
                covered: [],
                evidenceTurnIds: ['mic-1'],
            },
            ...extra,
        }),
    };
}
function harness(t, generate = async () => reply(), getImages = () => []) {
    const requests = [],
        events = [],
        saved = [];
    const coach = new InterviewCoach({
        ai: {
            models: {
                generateContent: request => {
                    requests.push(request);
                    return generate(request);
                },
            },
        },
        model: 'test-model',
        emit: (...event) => events.push(event),
        saveTurn: (...turn) => saved.push(turn),
        getImages,
        delayMs: 100000,
    });
    t.after(() => coach.close());
    return { coach, requests, events, saved };
}
const speech = (id, source, text, startedAt = 1000) => ({ id, source, text, startedAt, endedAt: startedAt + 200, final: true });

test('separate drafts do not become facts; final turns are merged by audio time', async t => {
    const h = harness(t);
    h.coach.transcript({ ...speech('mic-1', 'You', 'Can two devices edit?'), final: false });
    h.coach.transcript({ ...speech('sys-1', 'Interviewer', 'Yes.', 1400), final: false });
    assert.equal(h.coach.lastState.drafts.length, 2);
    assert.equal(h.coach.turns.length, 0);
    h.coach.transcript(speech('sys-1', 'Interviewer', 'Yes.', 1400));
    h.coach.transcript(speech('mic-1', 'You', 'Can two devices edit?'));
    await h.coach.evaluate();
    const context = JSON.parse(h.requests[0].contents[0].parts[0].text);
    assert.deepEqual(
        context.recentConversation.map(v => v.source),
        ['You', 'Interviewer']
    );
    assert.equal(h.saved.length, 2);
    assert.equal(h.events.filter(v => v[0] === 'new-response').length, 0);
});

test('a quiet decision updates shared state without producing an answer', async t => {
    const h = harness(t);
    h.coach.transcript(speech('mic-1', 'You', 'Can two devices edit?'));
    await h.coach.evaluate();
    assert.equal(h.coach.problem.openQuestions[0], 'Concurrent edits?');
    assert.equal(h.coach.solutions.length, 0);
    assert.equal(h.coach.card, '');
    await h.coach.evaluate();
    assert.equal(h.requests.length, 1, 'unchanged context should not be evaluated repeatedly');
});

test('explanations become brief coaching rather than generated solution versions', async t => {
    const h = harness(t, async () => reply('explain', 'A map avoids scanning previous elements.'));
    h.coach.transcript(speech('mic-1', 'You', 'Why is the map faster?'));
    await h.coach.evaluate();
    assert.match(h.coach.card, /map/);
    assert.equal(h.coach.solutions.length, 0);
    assert.equal(h.events.filter(v => v[0] === 'new-response').length, 0);
});

test('explicit screen analysis includes the conversation, preferences, and both selected images', async t => {
    const h = harness(
        t,
        async () => reply('solutions', 'Basic: nested loops. Optimized: hash map.'),
        ids => ids.map(id => ({ id, label: id, data: `data-${id}` }))
    );
    h.coach.transcript(speech('sys-1', 'Interviewer', 'Use constant extra space.'));
    const resultPromise = h.coach.request('Analyze current code', { screenshotPrompt: 'Explain both approaches.', imageIds: ['statement', 'code'] });
    await h.coach.evaluate();
    assert.equal((await resultPromise).success, true);
    const request = h.requests[0];
    const context = JSON.parse(request.contents[0].parts[0].text);
    assert.equal(context.recentConversation[0].text, 'Use constant extra space.');
    assert.equal(context.request.screenshotPreferences, 'Explain both approaches.');
    assert.equal(request.contents[0].parts.length, 3);
    assert.match(request.config.systemInstruction, /TWO solutions/);
    assert.equal(h.coach.solutions.length, 1);
    assert.ok(h.saved.some(v => v[0].startsWith('[AI task]')));
    assert.ok(!h.coach.turns.some(v => v.text.includes('Basic: nested loops')));
});

test('new speech invalidates an in-flight suggestion and preserves the next turn', async t => {
    let finish;
    const h = harness(
        t,
        () =>
            new Promise(resolve => {
                finish = resolve;
            })
    );
    h.coach.transcript(speech('sys-1', 'Interviewer', 'Support concurrent writes.'));
    const evaluating = h.coach.evaluate();
    h.coach.transcript(speech('sys-2', 'Interviewer', 'Actually, only one device.', 2000));
    assert.equal(h.requests[0].config.abortSignal.aborted, true);
    finish(reply('hint', 'Handle simultaneous writes.'));
    await evaluating;
    assert.equal(h.coach.card, '');
    assert.equal(h.coach.turns.length, 2);
    assert.equal(h.events.filter(v => v[0] === 'new-response').length, 0);
});

test('new problem clears solution context and cancels pending explicit work', async t => {
    const h = harness(t);
    h.coach.transcript(speech('sys-1', 'Interviewer', 'Reading app.'));
    h.coach.solutions.push({ text: 'Old solution' });
    const pending = h.coach.request('Analyze');
    h.coach.newProblem();
    assert.equal((await pending).success, false);
    assert.equal(h.coach.problemId, 2);
    assert.ok(h.coach.turns.some(turn => turn.id === 'sys-1' && turn.problemId === 1));
    assert.ok(h.coach.turns.some(turn => turn.kind === 'problem-boundary' && turn.problemId === 2));
    assert.equal(h.coach.solutions.length, 0);
});

test('duplicates and likely long acoustic echoes are ignored; short replies survive', t => {
    const h = harness(t);
    const question = speech('sys-1', 'Interviewer', 'Could you please explain how you would handle failures?');
    h.coach.transcript(question);
    h.coach.transcript(question);
    h.coach.transcript({ ...question, id: 'mic-echo', source: 'You' });
    h.coach.transcript(speech('mic-yes', 'You', 'Yes.', 2000));
    h.coach.transcript(speech('sys-yes', 'Interviewer', 'Yes.', 2200));
    assert.equal(h.coach.turns.length, 3);
});

test('malformed model output is visible and explicit requests do not hang', async t => {
    const h = harness(t, async () => ({ text: 'not json' }));
    const pending = h.coach.request('Review my code');
    await h.coach.evaluate();
    assert.equal((await pending).success, false);
    assert.match(h.coach.card, /unavailable/);
});

test('session closure suppresses late model results and resolves pending requests', async t => {
    let finish;
    const h = harness(
        t,
        () =>
            new Promise(resolve => {
                finish = resolve;
            })
    );
    const pending = h.coach.request('Review my code');
    const evaluating = h.coach.evaluate();
    h.coach.close();
    assert.equal((await pending).success, false);
    finish(reply('solutions', 'Stale solution'));
    await evaluating;
    assert.equal(h.events.filter(v => v[0] === 'new-response').length, 0);
});

test('patch history retains the complete solution it modifies', async t => {
    let action = 'solutions';
    const h = harness(t, async () => reply(action, action === 'solutions' ? 'Full basic and optimized solutions' : 'Changed the bounds check'));
    h.coach.transcript(speech('sys-0', 'Interviewer', 'Solve this problem.'));
    await h.coach.evaluate();
    action = 'patch';
    for (let i = 1; i <= 6; i++) {
        h.coach.transcript(speech(`sys-${i}`, 'Interviewer', `Requirement ${i}`, 1000 + i * 1000));
        await h.coach.evaluate();
    }
    assert.equal(h.coach.solutions.length, 5);
    assert.equal(h.coach.solutions[0].action, 'solutions');
    assert.equal(h.coach.solutions[0].text, 'Full basic and optimized solutions');
});

test('a confirmed topic change resets old solution associations', async t => {
    let cleared = false;
    const h = harness(t, async () => reply('hint', 'Use a concrete incident example.', { newProblem: true }));
    h.coach.onNewProblem = () => {
        cleared = true;
    };
    h.coach.problem.title = 'Previous coding problem';
    h.coach.solutions = [{ action: 'solutions', text: 'Old coding solution' }];
    h.coach.transcript(speech('sys-1', 'Interviewer', 'Now tell me about a production incident.'));
    await h.coach.evaluate();
    assert.equal(h.coach.problemId, 2);
    assert.equal(h.coach.solutions.length, 0);
    assert.equal(cleared, true);
});

test('a coaching timeout ends the request and shows a retryable error', async t => {
    const h = harness(
        t,
        request =>
            new Promise((resolve, reject) => {
                request.config.abortSignal.addEventListener('abort', () => reject(new Error('Aborted')));
            })
    );
    h.coach.timeoutMs = 5;
    const pending = h.coach.request('Review this code');
    await h.coach.evaluate();
    const result = await pending;
    assert.equal(result.success, false);
    assert.match(result.error, /timed out/);
    assert.match(h.coach.card, /Please retry/);
    assert.equal(h.coach.busy, false);
});

test('ambiguous captures wait for a mouse choice without modifying the current problem or producing code', async t => {
    const h = harness(t, async () => reply('wait', '', { captureIntent: 'ambiguous', captureReason: 'Only a signature is visible.' }));
    h.coach.problem.title = 'Multiply strings';
    h.coach.problem.requirements = ['No full integer conversion'];
    const pending = h.coach.request('Analyze this screen', { kind: 'screen-request', imageIds: ['code'], previewPath: '/fake/code.jpg' });
    await h.coach.evaluate();
    assert.equal((await pending).needsChoice, true);
    assert.equal(h.coach.problem.title, 'Multiply strings');
    assert.equal(h.coach.solutions.length, 0);
    assert.equal(h.coach.lastState.capture.needsChoice, true);
    assert.equal(h.coach.lastState.capture.previewPath, '/fake/code.jpg');
    assert.equal(h.events.filter(event => event[0] === 'new-response').length, 0);
    h.coach.transcript(speech('sys-2', 'Interviewer', 'Please continue explaining.', 2000));
    await h.coach.evaluate();
    assert.equal(h.requests.length, 1, 'automatic coaching must not guess the unresolved screen intent');
});

test('a mouse review choice reuses the original images and asks for a focused review', async t => {
    let count = 0;
    const h = harness(
        t,
        async () =>
            ++count === 1
                ? reply('wait', '', { captureIntent: 'ambiguous', captureReason: 'Review or starter code?' })
                : reply('patch', 'Carry 8 is discarded. Add the carry after the loop.', {
                      captureIntent: 'review_code',
                      captureReason: 'Existing implementation.',
                  }),
        ids => (ids || []).map(id => ({ id, label: id, data: `pixels-${id}` }))
    );
    const first = h.coach.request('Analyze', { kind: 'screen-request', imageIds: ['original-code'] });
    await h.coach.evaluate();
    await first;
    const captureId = h.coach.lastState.capture.id;
    const review = h.coach.captureAction(captureId, 'review_code');
    await h.coach.evaluate();
    assert.equal((await review).success, true);
    const context = JSON.parse(h.requests[1].contents[0].parts[0].text);
    assert.equal(context.request.captureAction, 'review_code');
    assert.deepEqual(
        context.images.map(image => image.id),
        ['original-code']
    );
    assert.equal(h.coach.lastState.capture.intent, 'review_code');
    assert.equal(h.coach.lastState.capture.needsChoice, false);
});

test('new coding problems request chalkboard explanations without dropping complete solutions', async t => {
    const h = harness(t, async () =>
        reply('solutions', 'Visual walkthrough, basic code, optimized code, complexity.', {
            captureIntent: 'new_problem',
            captureReason: 'Readable statement and starter signature.',
        })
    );
    const pending = h.coach.request('Analyze', { kind: 'screen-request', imageIds: ['statement'] });
    await h.coach.evaluate();
    assert.equal((await pending).success, true);
    assert.equal(h.coach.solutions[0].action, 'solutions');
    assert.match(h.requests[0].config.systemInstruction, /Chalkboard walkthrough/);
    assert.match(h.requests[0].config.systemInstruction, /Keep both solutions and complete code/);
    assert.match(h.requests[0].config.systemInstruction, /signature is not a bug/);
});

test('a review cannot silently become two replacement solutions', async t => {
    const h = harness(t, async () =>
        reply('solutions', 'Replacement implementation', { captureIntent: 'review_code', captureReason: 'Existing code' })
    );
    const pending = h.coach.request('Analyze', { kind: 'screen-request', imageIds: ['code'] });
    await h.coach.evaluate();
    assert.equal((await pending).success, false);
    assert.equal(h.coach.solutions.length, 0);
    assert.equal(h.events.filter(event => event[0] === 'new-response').length, 0);
});

test('full corrected code is an explicit mouse action tied to the reviewed implementation', async t => {
    let count = 0;
    const h = harness(t, async () =>
        ++count === 1
            ? reply('patch', 'Change the bounds check.', { captureIntent: 'review_code', captureReason: 'Incorrect loop bound.' })
            : reply('solutions', 'Complete corrected implementation in your structure.', {
                  captureIntent: 'review_code',
                  captureReason: 'Full corrected code requested.',
              })
    );
    const first = h.coach.request('Analyze', { kind: 'screen-request', imageIds: ['code'] });
    await h.coach.evaluate();
    await first;
    const second = h.coach.captureAction(h.coach.lastState.capture.id, 'full_code');
    await h.coach.evaluate();
    assert.equal((await second).success, true);
    const context = JSON.parse(h.requests[1].contents[0].parts[0].text);
    assert.equal(context.request.captureAction, 'full_code');
    assert.equal(context.capture.previousReview, 'Change the bounds check.');
});

test('incomplete visible work receives a continuation instead of being treated as a new question', async t => {
    const h = harness(t, async () =>
        reply('patch', 'Your loops are present. Next, append the remaining carry.', {
            captureIntent: 'continue_code',
            captureReason: 'Partial implementation of the same problem.',
        })
    );
    h.coach.problem.title = 'Multiply strings';
    const pending = h.coach.request('Analyze', { kind: 'screen-request', imageIds: ['partial-code'] });
    await h.coach.evaluate();
    assert.equal((await pending).success, true);
    assert.equal(h.coach.problemId, 1);
    assert.equal(h.coach.lastState.capture.intent, 'continue_code');
});

test('capture actions are rejected after an explicit problem reset', async t => {
    const h = harness(t, async () => reply('patch', 'A correction', { captureIntent: 'review_code', captureReason: '' }));
    const pending = h.coach.request('Analyze', { kind: 'screen-request', imageIds: ['code'] });
    await h.coach.evaluate();
    await pending;
    const id = h.coach.lastState.capture.id;
    h.coach.newProblem();
    assert.equal((await h.coach.captureAction(id, 'full_code')).success, false);
    assert.equal((await h.coach.captureAction(id, 'arbitrary-action')).success, false);
});

test('missing visual context requests specific information without erasing the known problem', async t => {
    const h = harness(t, async () =>
        reply('wait', 'Capture the problem statement and the body below the visible signature.', {
            captureIntent: 'missing_context',
            captureReason: 'Only a signature is visible.',
            problem: { title: 'Guessed problem' },
        })
    );
    h.coach.problem.title = 'Known problem';
    h.coach.summary = 'Earlier interview context';
    const pending = h.coach.request('Analyze', { kind: 'screen-request', imageIds: ['signature'] });
    await h.coach.evaluate();
    assert.equal((await pending).success, true);
    assert.equal(h.coach.problem.title, 'Known problem');
    assert.equal(h.coach.summary, 'Earlier interview context');
    assert.equal(h.coach.solutions.length, 0);
});
