"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEETING_ASR_CONFIG_FILE = void 0;
exports.resolveMeetingAsrConfig = resolveMeetingAsrConfig;
exports.describeMeetingAsrConfig = describeMeetingAsrConfig;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const backend_root_1 = require("../config/backend-root");
exports.MEETING_ASR_CONFIG_FILE = path.join(backend_root_1.dataDir, 'meeting-asr-config.json');
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3-asr-flash';
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
function readFileConfig() {
    try {
        if (!fs.existsSync(exports.MEETING_ASR_CONFIG_FILE))
            return {};
        const raw = fs.readFileSync(exports.MEETING_ASR_CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
}
function pickString(...values) {
    for (const v of values) {
        if (typeof v === 'string' && v.trim())
            return v.trim();
    }
    return '';
}
function pickNumber(fallback, ...values) {
    for (const v of values) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0)
            return v;
        if (typeof v === 'string' && v.trim()) {
            const n = Number(v.trim());
            if (Number.isFinite(n) && n > 0)
                return n;
        }
    }
    return fallback;
}
function normalizeBaseURL(url) {
    return url.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
}
function resolveMeetingAsrConfig() {
    const file = readFileConfig();
    const envKey = pickString(process.env.MEETING_ASR_API_KEY, process.env.DASHSCOPE_API_KEY);
    const fileKey = pickString(file.apiKey);
    const apiKey = envKey || fileKey;
    const baseURL = normalizeBaseURL(pickString(process.env.MEETING_ASR_BASE_URL, file.baseURL, DEFAULT_BASE_URL));
    const model = pickString(process.env.MEETING_ASR_MODEL, file.model, DEFAULT_MODEL);
    const kindRaw = pickString(process.env.MEETING_ASR_PROVIDER, file.providerKind).toLowerCase();
    const providerKind = kindRaw === 'dashscope' ? 'dashscope' : 'openai-compatible';
    return {
        apiKey,
        baseURL,
        model,
        providerKind,
        language: pickString(process.env.MEETING_ASR_LANGUAGE, file.language),
        timeoutMs: pickNumber(DEFAULT_TIMEOUT_MS, process.env.MEETING_ASR_TIMEOUT_MS, file.timeoutMs),
        maxBytes: pickNumber(DEFAULT_MAX_BYTES, process.env.MEETING_ASR_MAX_BYTES, file.maxBytes),
        source: envKey ? 'env' : fileKey ? 'file' : 'none',
    };
}
function describeMeetingAsrConfig() {
    const cfg = resolveMeetingAsrConfig();
    return {
        configured: Boolean(cfg.apiKey),
        baseURL: cfg.baseURL,
        model: cfg.model,
        providerKind: cfg.providerKind,
        language: cfg.language || null,
        timeoutMs: cfg.timeoutMs,
        maxBytes: cfg.maxBytes,
        keySource: cfg.source,
        granularity: 'none',
        configFile: exports.MEETING_ASR_CONFIG_FILE,
    };
}
//# sourceMappingURL=meeting-asr.config.js.map