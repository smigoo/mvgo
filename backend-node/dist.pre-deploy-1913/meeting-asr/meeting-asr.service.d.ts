import { type MeetingAsrRuntimeConfig } from './meeting-asr.config';
export declare const MEETING_ASR_ERROR_CODES: {
    readonly CONFIG_MISSING: "asr_config_missing";
    readonly BAD_AUDIO: "asr_bad_audio";
    readonly AUDIO_TOO_LARGE: "asr_audio_too_large";
    readonly AUTH_FAILED: "asr_auth_failed";
    readonly RATE_LIMITED: "asr_rate_limited";
    readonly TIMEOUT: "asr_timeout";
    readonly UPSTREAM_ERROR: "asr_upstream_error";
    readonly NETWORK_ERROR: "asr_network_error";
    readonly BAD_RESPONSE: "asr_bad_response";
};
export type MeetingAsrErrorCode = (typeof MEETING_ASR_ERROR_CODES)[keyof typeof MEETING_ASR_ERROR_CODES];
export declare class MeetingAsrError extends Error {
    readonly code: MeetingAsrErrorCode;
    readonly httpStatus: number;
    readonly upstream?: string | undefined;
    constructor(code: MeetingAsrErrorCode, message: string, httpStatus: number, upstream?: string | undefined);
}
export declare function parseWavDurationMs(buffer: Buffer): number | null;
export interface MeetingAsrTranscribeResult {
    text: string;
    segments: Array<{
        text: string;
        startMs: number;
        endMs: number;
    }>;
    granularity: 'none';
    durationMs: number | null;
    model: string;
    requestId: string;
    elapsedMs: number;
}
export declare class MeetingAsrService {
    private readonly logger;
    describe(): MeetingAsrRuntimeConfig;
    transcribe(buffer: Buffer, opts?: {
        mime?: string;
        language?: string;
        fileName?: string;
    }): Promise<MeetingAsrTranscribeResult>;
    private buildRequestBody;
    private fetchWithTimeout;
    private classifyUpstreamStatus;
    private extractText;
}
