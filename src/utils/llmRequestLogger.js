// Log request content without changing the payload passed to the provider.
function sanitize(value, key = '', seen = new WeakSet()) {
    if (/^(api[-_]?key|authorization|password|secret|access[-_]?token|refresh[-_]?token|token)$/i.test(key)) return '[REDACTED]';
    if (typeof value === 'function') return undefined;
    if (typeof value === 'string') {
        if (key === 'data') return `[media omitted: ${value.length} encoded characters]`;
        return value
            .replace(/data:([^;,]+);base64,[A-Za-z0-9+/=]+/g, (_, mime) => `[${mime} payload omitted]`)
            .replace(/AIza[\w-]{30,}|gsk_[\w-]{20,}|sk-(?:proj-|svcacct-)?[\w-]{20,}/g, '[REDACTED]')
            .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
            .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, '$1[REDACTED]');
    }
    if (Buffer.isBuffer(value)) return `[binary omitted: ${value.length} bytes]`;
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const result = Array.isArray(value)
        ? value.map(item => sanitize(item, '', seen))
        : Object.fromEntries(
              Object.entries(value)
                  .filter(([name]) => name !== 'callbacks')
                  .map(([name, item]) => [name, sanitize(item, name, seen)])
          );
    seen.delete(value);
    return result;
}

function logLlmRequest(label, payload) {
    if (process.env.LLM_LOG_REQUESTS === '0') return payload;
    // Live PCM arrives many times per second; enable summaries separately.
    if (payload.audio && process.env.LLM_LOG_AUDIO !== '1') return payload;
    try {
        console.log(`[LLM REQUEST] ${new Date().toISOString()} ${label}\n${JSON.stringify(sanitize(payload), null, 2)}`);
    } catch {
        // Logging must never interrupt a provider request.
    }
    return payload;
}

module.exports = { logLlmRequest, sanitize };
