"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDACTED_PLACEHOLDER = void 0;
exports.redactSecrets = redactSecrets;
exports.stripRedactedPlaceholders = stripRedactedPlaceholders;
exports.safeJsonStringify = safeJsonStringify;
const SECRET_KEY_REGEX = /(token|apikey|secret|password|authorization|access[_-]?token)/i;
exports.REDACTED_PLACEHOLDER = '***REDACTED***';
const CIRCULAR = '[Circular]';
function makeContainer(src) {
    return Array.isArray(src) ? new Array(src.length) : {};
}
function redactSecrets(value, replacement = exports.REDACTED_PLACEHOLDER) {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    const path = new WeakSet();
    const result = makeContainer(value);
    const stack = [
        { src: value, dst: result, keys: Object.keys(value), idx: 0 },
    ];
    path.add(value);
    while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        if (frame.idx >= frame.keys.length) {
            path.delete(frame.src);
            stack.pop();
            continue;
        }
        const key = frame.keys[frame.idx++];
        const child = frame.src[key];
        if (child === null || typeof child !== 'object') {
            frame.dst[key] =
                SECRET_KEY_REGEX.test(key) && typeof child === 'string' ? replacement : child;
            continue;
        }
        if (path.has(child)) {
            frame.dst[key] = CIRCULAR;
            continue;
        }
        const childOut = makeContainer(child);
        frame.dst[key] = childOut;
        path.add(child);
        stack.push({ src: child, dst: childOut, keys: Object.keys(child), idx: 0 });
    }
    return result;
}
function stripRedactedPlaceholders(value, placeholder = exports.REDACTED_PLACEHOLDER) {
    const isPlaceholder = (v) => typeof v === 'string' && v === placeholder;
    if (isPlaceholder(value))
        return undefined;
    if (value === null || value === undefined || typeof value !== 'object')
        return value;
    const root = Array.isArray(value) ? [] : {};
    const path = new WeakSet();
    const stack = [
        { src: value, dst: root, keys: Object.keys(value), idx: 0 },
    ];
    path.add(value);
    while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        if (frame.idx >= frame.keys.length) {
            path.delete(frame.src);
            stack.pop();
            continue;
        }
        const key = frame.keys[frame.idx++];
        const child = frame.src[key];
        const dstIsArray = Array.isArray(frame.dst);
        if (isPlaceholder(child))
            continue;
        if (child === null || typeof child !== 'object') {
            if (dstIsArray)
                frame.dst.push(child);
            else
                frame.dst[key] = child;
            continue;
        }
        if (path.has(child))
            continue;
        const childDst = Array.isArray(child) ? [] : {};
        if (dstIsArray)
            frame.dst.push(childDst);
        else
            frame.dst[key] = childDst;
        path.add(child);
        stack.push({ src: child, dst: childDst, keys: Object.keys(child), idx: 0 });
    }
    return root;
}
function safeJsonStringify(value, space) {
    const ancestors = [];
    return (JSON.stringify(value, function (_key, val) {
        if (typeof val !== 'object' || val === null)
            return val;
        while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
            ancestors.pop();
        }
        if (ancestors.includes(val))
            return CIRCULAR;
        ancestors.push(val);
        return val;
    }, space) ?? '');
}
//# sourceMappingURL=redact.js.map