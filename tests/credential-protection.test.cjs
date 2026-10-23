const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function load(safeStorage) {
    const context = { require: () => ({ safeStorage }), Buffer, module: { exports: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/credential-protection.js'), 'utf8'), context);
    return context.module.exports;
}
test('OS-backed credentials round-trip and are not double-encrypted', () => {
    const safe = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from('encrypted-' + value),
        decryptString: value => value.toString().replace('encrypted-', ''),
    };
    const codec = load(safe);
    const stored = codec.protect('private');
    assert.notEqual(stored, 'private');
    assert.equal(codec.reveal(stored), 'private');
    assert.equal(codec.protect(stored), stored);
});
test('legacy plaintext survives when OS encryption is unavailable, encrypted secrets fail closed', () => {
    const codec = load(undefined);
    assert.equal(codec.reveal('legacy'), 'legacy');
    assert.equal(codec.protect('legacy'), 'legacy');
    assert.throws(() => codec.reveal('os-encrypted:data'), /cannot be unlocked/);
});
