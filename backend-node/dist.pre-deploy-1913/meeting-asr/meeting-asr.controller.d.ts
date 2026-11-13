import { MeetingAsrService, type MeetingAsrTranscribeResult } from './meeting-asr.service';
export declare class MeetingAsrController {
    private readonly svc;
    constructor(svc: MeetingAsrService);
    status(): {
        configured: boolean;
        baseURL: string;
        model: string;
        providerKind: import("./meeting-asr.config").MeetingAsrProviderKind;
        language: string | null;
        timeoutMs: number;
        maxBytes: number;
        keySource: "none" | "env" | "file";
        granularity: "none";
        configFile: string;
    };
    transcribe(file: any, body: Record<string, any>): Promise<MeetingAsrTranscribeResult>;
    private toHttpException;
}
