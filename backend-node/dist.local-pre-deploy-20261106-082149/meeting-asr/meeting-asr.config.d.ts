export declare const MEETING_ASR_CONFIG_FILE: string;
export type MeetingAsrProviderKind = 'openai-compatible' | 'dashscope';
export interface MeetingAsrRuntimeConfig {
    apiKey: string;
    baseURL: string;
    model: string;
    providerKind: MeetingAsrProviderKind;
    language: string;
    timeoutMs: number;
    maxBytes: number;
    source: 'env' | 'file' | 'none';
}
export declare function resolveMeetingAsrConfig(): MeetingAsrRuntimeConfig;
export declare function describeMeetingAsrConfig(): {
    configured: boolean;
    baseURL: string;
    model: string;
    providerKind: MeetingAsrProviderKind;
    language: string | null;
    timeoutMs: number;
    maxBytes: number;
    keySource: "none" | "file" | "env";
    granularity: "none";
    configFile: string;
};
