const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/utils/gemini'), 'utf8');
const reset = source.match(/function resetAudioBuffers\(\) \{[\s\S]*?\n\}/)[0];
for (const mic of [true, false]) {
    for (const system of [true, false]) {
        test(`capture resets preserve microphone=${mic}, system=${system} mute settings`, () => {
            const context = vm.createContext({ isMicMuted: mic, isSpeakerMuted: system, userMicTimer: 1, systemSilenceTimer: 2, clearTimeout() {} });
            vm.runInContext(`${reset}; resetAudioBuffers(); resetAudioBuffers();`, context);
            assert.equal(context.isMicMuted, mic);
            assert.equal(context.isSpeakerMuted, system);
            assert.equal(context.userMicTimer, null);
            assert.equal(context.systemSilenceTimer, null);
        });
    }
}
