"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskSecretFingerprint = exports.DESCRIPTION_MAX_CHARS = exports.DEFAULT_LOG_TAIL_LINES = exports.DEFAULT_LOG_MAX_BYTES = exports.REDACTED = void 0;
exports.redactTextSecrets = redactTextSecrets;
exports.truncateLogText = truncateLogText;
exports.sanitizeDescription = sanitizeDescription;
const secret_fingerprint_1 = require("../common/utils/secret-fingerprint");
Object.defineProperty(exports, "maskSecretFingerprint", { enumerable: true, get: function () { return secret_fingerprint_1.maskSecretFingerprint; } });
exports.REDACTED = '***REDACTED***';
exports.DEFAULT_LOG_MAX_BYTES = 512 * 1024;
exports.DEFAULT_LOG_TAIL_LINES = 120;
const DEFAULT_HEAD_BYTES = 16 * 1024;
exports.DESCRIPTION_MAX_CHARS = 2000;
const PREFIX_TOKEN_RULES = [
    { label: 'figma', pattern: /figd_[A-Za-z0-9_-]{10,}/g },
    { label: 'gitlab', pattern: /glpat-[A-Za-z0-9_-]{10,}/g },
    { label: 'sk', pattern: /sk-[A-Za-z0-9_-]{16,}/g },
    { label: 'github', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
    { label: 'github', pattern: /github_pat_[A-Za-z0-9_]{20,}/g },
    { label: 'apifox', pattern: /apk-[A-Za-z0-9_-]{16,}/g },
];
function isAlreadyMasked(value) {
    return value.includes('*');
}
function redactTextSecrets(input) {
    if (!input || typeof input !== 'string')
        return '';
    let out = input;
    for (const rule of PREFIX_TOKEN_RULES) {
        out = out.replace(rule.pattern, (m) => (0, secret_fingerprint_1.maskSecretFingerprint)(m) ?? '****');
    }
    out = out.replace(/\b(Bearer)\s+([A-Za-z0-9._\-+/=]{12,})/gi, (m, name, value) => isAlreadyMasked(value) ? m : `${name} ${exports.REDACTED}`);
    out = out.replace(/\b(X-Figma-Token|PRIVATE-TOKEN|X-Api-Key|x-api-key|Authorization|Token)\b(\s*[:=]\s*)(["']?)([^\s"',;}\]]{8,})\3/gi, (m, name, sep, quote, value) => isAlreadyMasked(value) ? m : `${name}${sep}${quote}${exports.REDACTED}${quote}`);
    out = out.replace(/\b(access_token|refresh_token|api_key|apikey|api-key|secret|password|passwd|pwd|token)\b(\s*=\s*)([^&\s"',;}\]]{6,})/gi, (m, key, sep, value) => (isAlreadyMasked(value) ? m : `${key}${sep}${exports.REDACTED}`));
    out = out.replace(/("(?:[A-Za-z0-9_]*(?:[Tt]oken|[Ss]ecret|[Pp]assword|[Aa]pi[_-]?[Kk]ey)[A-Za-z0-9_]*)"\s*:\s*")([^"]{6,})(")/g, (m, prefix, value, suffix) => isAlreadyMasked(value) ? m : `${prefix}${exports.REDACTED}${suffix}`);
    return out;
}
function sliceByBytes(input, maxBytes) {
    if (maxBytes <= 0)
        return '';
    if (Buffer.byteLength(input, 'utf8') <= maxBytes)
        return input;
    const buf = Buffer.from(input, 'utf8').subarray(0, maxBytes);
    return buf.toString('utf8').replace(/\uFFFD+$/, '');
}
function truncateLogText(input, options = {}) {
    const text = typeof input === 'string' ? input : '';
    const originalBytes = Buffer.byteLength(text, 'utf8');
    const maxBytes = options.maxBytes ?? exports.DEFAULT_LOG_MAX_BYTES;
    const tailLines = options.tailLines ?? exports.DEFAULT_LOG_TAIL_LINES;
    const headBytes = Math.min(options.headBytes ?? DEFAULT_HEAD_BYTES, Math.floor(maxBytes / 4));
    if (originalBytes <= maxBytes) {
        return { text, bytes: originalBytes, originalBytes, truncated: false, keptTailLines: 0 };
    }
    const tailBudget = Math.max(0, Math.min(Math.floor(maxBytes * 0.6), maxBytes - headBytes - 256));
    const allLines = text.split('\n');
    const tailChunk = [];
    let tailBytes = 0;
    for (let i = allLines.length - 1; i >= 0; i -= 1) {
        const line = allLines[i];
        const lineBytes = Buffer.byteLength(line, 'utf8') + 1;
        if (tailChunk.length >= tailLines)
            break;
        if (tailBytes + lineBytes > tailBudget)
            break;
        tailChunk.unshift(line);
        tailBytes += lineBytes;
    }
    const head = sliceByBytes(text, headBytes);
    const marker = `\n\n... [日志已截断：原始 ${originalBytes} 字节 / ${allLines.length} 行，` +
        `这里保留首部 ${Buffer.byteLength(head, 'utf8')} 字节 + 尾部 ${tailChunk.length} 行] ...\n\n`;
    const merged = `${head}${marker}${tailChunk.join('\n')}`;
    const finalText = sliceByBytes(merged, maxBytes);
    return {
        text: finalText,
        bytes: Buffer.byteLength(finalText, 'utf8'),
        originalBytes,
        truncated: true,
        keptTailLines: tailChunk.length,
    };
}
function sanitizeDescription(input) {
    const cleaned = redactTextSecrets(typeof input === 'string' ? input : '').trim();
    if (cleaned.length <= exports.DESCRIPTION_MAX_CHARS)
        return cleaned;
    return `${cleaned.slice(0, exports.DESCRIPTION_MAX_CHARS)}…[已截断]`;
}
//# sourceMappingURL=feedback-redact.util.js.map