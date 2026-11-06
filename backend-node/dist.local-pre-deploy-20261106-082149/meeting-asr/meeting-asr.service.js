"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MeetingAsrService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingAsrService = exports.MeetingAsrError = exports.MEETING_ASR_ERROR_CODES = void 0;
exports.parseWavDurationMs = parseWavDurationMs;
const common_1 = require("@nestjs/common");
const meeting_asr_config_1 = require("./meeting-asr.config");
exports.MEETING_ASR_ERROR_CODES = {
    CONFIG_MISSING: 'asr_config_missing',
    BAD_AUDIO: 'asr_bad_audio',
    AUDIO_TOO_LARGE: 'asr_audio_too_large',
    AUTH_FAILED: 'asr_auth_failed',
    RATE_LIMITED: 'asr_rate_limited',
    TIMEOUT: 'asr_timeout',
    UPSTREAM_ERROR: 'asr_upstream_error',
    NETWORK_ERROR: 'asr_network_error',
    BAD_RESPONSE: 'asr_bad_response',
};
class MeetingAsrError extends Error {
    code;
    httpStatus;
    upstream;
    constructor(code, message, httpStatus, upstream) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.upstream = upstream;
        this.name = 'MeetingAsrError';
    }
}
exports.MeetingAsrError = MeetingAsrError;
function parseWavDurationMs(buffer) {
    try {
        if (buffer.length < 44)
            return null;
        if (buffer.toString('ascii', 0, 4) !== 'RIFF')
            return null;
        if (buffer.toString('ascii', 8, 12) !== 'WAVE')
            return null;
        let offset = 12;
        let byteRate = 0;
        let dataSize = 0;
        while (offset + 8 <= buffer.length) {
            const chunkId = buffer.toString('ascii', offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);
            const body = offset + 8;
            if (chunkId === 'fmt ') {
                if (body + 16 > buffer.length)
                    return null;
                byteRate = buffer.readUInt32LE(body + 8);
            }
            else if (chunkId === 'data') {
                dataSize = Math.min(chunkSize, buffer.length - body);
                break;
            }
            offset = body + chunkSize + (chunkSize % 2);
        }
        if (!byteRate || !dataSize)
            return null;
        return Math.round((dataSize / byteRate) * 1000);
    }
    catch {
        return null;
    }
}
let MeetingAsrService = MeetingAsrService_1 = class MeetingAsrService {
    logger = new common_1.Logger(MeetingAsrService_1.name);
    describe() {
        return (0, meeting_asr_config_1.resolveMeetingAsrConfig)();
    }
    async transcribe(buffer, opts = {}) {
        const cfg = (0, meeting_asr_config_1.resolveMeetingAsrConfig)();
        const startedAt = Date.now();
        if (!cfg.apiKey) {
            throw new MeetingAsrError(exports.MEETING_ASR_ERROR_CODES.CONFIG_MISSING, '服务端未配置语音转写密钥（MEETING_ASR_API_KEY 或 data/meeting-asr-config.json），无法转写', 503);
        }
        if (!buffer?.length) {
            throw new MeetingAsrError(exports.MEETING_ASR_ERROR_CODES.BAD_AUDIO, '音频内容为空', 400);
        }
        if (buffer.length > cfg.maxBytes) {
            throw new MeetingAsrError(exports.MEETING_ASR_ERROR_CODES.AUDIO_TOO_LARGE, `音频体积 ${buffer.length} 字节超过上限 ${cfg.maxBytes} 字节`, 413);
        }
        const durationMs = parseWavDurationMs(buffer);
        if (durationMs === null) {
            throw new MeetingAsrError(exports.MEETING_ASR_ERROR_CODES.BAD_AUDIO, '音频不是可解析的 WAV（RIFF/WAVE 头缺失或损坏）', 400);
        }
        const mime = opts.mime || 'audio/wav';
        const language = (opts.language || cfg.language || '').trim();
        const body = this.buildRequestBody(cfg, buffer, mime, language);
        const url = `${cfg.baseURL}/chat/completions`;
        let res;
        try {
            res = await this.fetchWithTimeout(url, cfg.apiKey, body, cfg.timeoutMs);
        }
        catch (err) {
            if (err?.name === 'AbortError') {
                throw new MeetingAsrError(exports.MEETING_ASR_ERROR_CODES.TIMEOUT, `上游转写超时（>${cfg.timeoutMs}ms）`, 504);
            }
            throw new MeetingAsrError(exports.MEETING_ASR_ERROR_CODES.NETWORK_ERROR, `无法连接上游转写服务：${err?.message || String(err)}`, 502);
        }
        const rawText = await res.text();
        if (!res.ok) {
            const code = this.classifyUpstreamStatus(res.status);
            throw new MeetingAsrError(code, `上游转写失败（HTTP ${res.status}）`, res.status === 429 ? 429 : 502, rawText.slice(0, 500));
        }
        let json;
        try {
            json = JSON.parse(rawText);
        }
        catch {
            throw new MeetingAsrError(exports.MEETING_ASR_ERROR_CODES.BAD_RESPONSE, '上游返回体不是合法 JSON', 502, rawText.slice(0, 500));
        }
        const text = this.extractText(json, cfg).trim();
        const requestId = String(json?.request_id || json?.id || '');
        if (!text) {
            this.logger.log(`[meeting-asr] 上游返回空文本 model=${cfg.model} durationMs=${durationMs} file=${opts.fileName || '-'}`);
        }
        return {
            text,
            segments: [],
            granularity: 'none',
            durationMs,
            model: cfg.model,
            requestId,
            elapsedMs: Date.now() - startedAt,
        };
    }
    buildRequestBody(cfg, buffer, mime, language) {
        const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
        const payload = {
            model: cfg.model,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            input_audio: { data: dataUrl },
                        },
                    ],
                },
            ],
            stream: false,
        };
        if (language) {
            payload.asr_options = { language };
        }
        return payload;
    }
    async fetchWithTimeout(url, apiKey, body, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        }
        finally {
            clearTimeout(timer);
        }
    }
    classifyUpstreamStatus(status) {
        if (status === 401 || status === 403)
            return exports.MEETING_ASR_ERROR_CODES.AUTH_FAILED;
        if (status === 429)
            return exports.MEETING_ASR_ERROR_CODES.RATE_LIMITED;
        if (status === 413)
            return exports.MEETING_ASR_ERROR_CODES.AUDIO_TOO_LARGE;
        return exports.MEETING_ASR_ERROR_CODES.UPSTREAM_ERROR;
    }
    extractText(json, cfg) {
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content === 'string')
            return content;
        if (Array.isArray(content)) {
            return content
                .map((part) => (typeof part === 'string' ? part : String(part?.text || '')))
                .join('');
        }
        const legacy = json?.output?.text ?? json?.output?.output?.sentence?.text;
        if (typeof legacy === 'string')
            return legacy;
        if (cfg.providerKind === 'dashscope')
            return '';
        return '';
    }
};
exports.MeetingAsrService = MeetingAsrService;
exports.MeetingAsrService = MeetingAsrService = MeetingAsrService_1 = __decorate([
    (0, common_1.Injectable)()
], MeetingAsrService);
//# sourceMappingURL=meeting-asr.service.js.map