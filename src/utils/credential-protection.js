function codec() {
    try {
        const { safeStorage } = require('electron');
        return safeStorage?.isEncryptionAvailable() ? safeStorage : null;
    } catch {
        return null;
    }
}
const prefix = 'os-encrypted:';
function protect(value) {
    if (typeof value !== 'string') throw new Error('Invalid API key');
    if (!value || value.startsWith(prefix)) return value;
    const safe = codec();
    return safe ? prefix + safe.encryptString(value).toString('base64') : value;
}
function reveal(value) {
    if (typeof value !== 'string') throw new Error('Invalid stored API key');
    if (!value.startsWith(prefix)) return value;
    const safe = codec();
    if (!safe) throw new Error('API key cannot be unlocked on this device. Re-enter it in Settings.');
    return safe.decryptString(Buffer.from(value.slice(prefix.length), 'base64'));
}
module.exports = { protect, reveal };
