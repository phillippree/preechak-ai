const { test } = require('node:test');
const assert = require('node:assert/strict');

// Import or instantiate AssistantView logic for turn detection and alignment
function getTurnSpeaker(promptText, item) {
    if (item && item.speaker) {
        if (/^(You|Candidate|Me)$/i.test(item.speaker)) return 'you';
        if (/^(Speaker|Interviewer)$/i.test(item.speaker)) return 'interviewer';
    }

    const candidateText = promptText || (item && item.prompt) || (typeof item === 'string' ? item : '') || '';
    if (candidateText && typeof candidateText === 'string') {
        const speakerRegex = /\[(Speaker|Interviewer|You|Candidate|Me)\]:\s*([\s\S]*?)(?=(?:\[(?:Speaker|Interviewer|You|Candidate|Me)\]:|$))/gi;
        const matches = [...candidateText.matchAll(speakerRegex)];
        if (matches.length > 0) {
            const lastSpeaker = matches[matches.length - 1][1];
            if (/^(You|Candidate|Me)$/i.test(lastSpeaker)) {
                return 'you';
            }
            return 'interviewer';
        }
    }

    return 'you';
}

test('getTurnSpeaker identifies speaker tags correctly', () => {
    // Explicit speaker property
    assert.equal(getTurnSpeaker(null, { speaker: 'Candidate' }), 'you');
    assert.equal(getTurnSpeaker(null, { speaker: 'You' }), 'you');
    assert.equal(getTurnSpeaker(null, { speaker: 'Me' }), 'you');
    assert.equal(getTurnSpeaker(null, { speaker: 'Speaker' }), 'interviewer');
    assert.equal(getTurnSpeaker(null, { speaker: 'Interviewer' }), 'interviewer');

    // Prompt tags single speaker
    assert.equal(getTurnSpeaker('[Speaker]: Can you describe your background?'), 'interviewer');
    assert.equal(getTurnSpeaker('[Interviewer]: What is your favorite design pattern?'), 'interviewer');
    assert.equal(getTurnSpeaker('[Candidate]: I prefer factory patterns.'), 'you');
    assert.equal(getTurnSpeaker('[You]: How do we scale this?'), 'you');

    // Multi-turn transcript - resolves to last active speaker
    const conversation = '[Interviewer]: Where do you see yourself in 5 years?\n[Candidate]: Leading engineering teams.';
    assert.equal(getTurnSpeaker(conversation), 'you');

    const conversation2 = '[Candidate]: Does the team use TypeScript?\n[Interviewer]: Yes, exclusively in all frontends.';
    assert.equal(getTurnSpeaker(conversation2), 'interviewer');

    // Untagged user typed prompt defaults to 'you' (left)
    assert.equal(getTurnSpeaker('Explain Dijkstra algorithm'), 'you');
    assert.equal(getTurnSpeaker(''), 'you');
    assert.equal(getTurnSpeaker(null, {}), 'you');
});

test('Assistant responses follow speaker alignment', () => {
    const candidateItem = {
        prompt: '[Candidate]: Tell me about concurrency in Node.js',
        text: 'Node.js uses an event loop with libuv...',
    };
    const interviewerItem = {
        prompt: '[Speaker]: Tell me about concurrency in Node.js',
        text: 'Node.js uses an event loop with libuv...',
    };

    assert.equal(getTurnSpeaker(null, candidateItem), 'you');
    assert.equal(getTurnSpeaker(null, interviewerItem), 'interviewer');
});

test('Live thinking indicator inherits speaker alignment from pending prompt', () => {
    const liveThinkingCandidate = {
        isThinking: true,
        prompt: '[You]: Should I use WebSockets or WebRTC?',
    };
    const liveThinkingInterviewer = {
        isThinking: true,
        prompt: '[Interviewer]: Can you explain why you chose WebSockets?',
    };

    assert.equal(getTurnSpeaker(liveThinkingCandidate.prompt, liveThinkingCandidate), 'you');
    assert.equal(getTurnSpeaker(liveThinkingInterviewer.prompt, liveThinkingInterviewer), 'interviewer');
});
