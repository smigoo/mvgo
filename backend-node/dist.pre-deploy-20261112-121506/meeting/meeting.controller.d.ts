import { MeetingService } from './meeting.service';
import { AttachAudioDto, ComposeDto, ConsentDecisionsDto, CreateRunDto, DeclareConsentDto, PatchFieldDto, PurgeRetentionDto, SetRetentionDto, WithdrawConsentDto } from './dto/meeting.dto';
export declare class MeetingController {
    private readonly service;
    constructor(service: MeetingService);
    createRun(dto: CreateRunDto, req: any): {
        runId: string;
        title: string;
        meetingType: string;
        template: {
            id: string;
            version: string;
            label: string;
        };
        status: "排队中" | "处理中" | "待确认" | "已定稿" | "失败";
        outputLanguage: string;
        detectedLanguages: string[];
        participants: string[];
        consentStatus: string;
        canRecord: boolean;
        draftReady: boolean;
        frozen: boolean;
        audioRef: string | null;
        createdAt: string;
        updatedAt: string;
    };
    attachAudio(id: string, dto: AttachAudioDto, req: any): void;
    getRun(id: string, req: any): {
        runId: string;
        title: string;
        meetingType: string;
        template: {
            id: string;
            version: string;
            label: string;
        };
        status: "排队中" | "处理中" | "待确认" | "已定稿" | "失败";
        outputLanguage: string;
        detectedLanguages: string[];
        participants: string[];
        consentStatus: string;
        canRecord: boolean;
        draftReady: boolean;
        frozen: boolean;
        audioRef: string | null;
        createdAt: string;
        updatedAt: string;
    };
    retryRun(id: string, req: any): void;
    getDraft(id: string, req: any): {
        runVersion: string;
        template: {
            id: string;
            version: string;
            label: string;
        };
        detectedLanguages: string[];
        outputLanguage: string;
        warnings: string[];
        truncatedRatio: number;
        injectionEvents: any[];
        fields: any[];
        frozen: boolean;
        consentStatus: string;
    };
    patchField(id: string, fieldId: string, dto: PatchFieldDto, req: any): {
        runVersion: string;
        template: {
            id: string;
            version: string;
            label: string;
        };
        detectedLanguages: string[];
        outputLanguage: string;
        warnings: string[];
        truncatedRatio: number;
        injectionEvents: any[];
        fields: any[];
        frozen: boolean;
        consentStatus: string;
    };
    publishRun(id: string, req: any): {
        frozenFields: number;
        runId: string;
        title: string;
        meetingType: string;
        template: {
            id: string;
            version: string;
            label: string;
        };
        status: "排队中" | "处理中" | "待确认" | "已定稿" | "失败";
        outputLanguage: string;
        detectedLanguages: string[];
        participants: string[];
        consentStatus: string;
        canRecord: boolean;
        draftReady: boolean;
        frozen: boolean;
        audioRef: string | null;
        createdAt: string;
        updatedAt: string;
    };
    exportRun(id: string, format: string, req: any): {
        runId: string;
        format: string;
        publishedAt: string;
        content: string;
        notice: string;
    };
    composeRun(id: string, dto: ComposeDto, req: any): void;
    declareConsent(id: string, dto: DeclareConsentDto, req: any): {
        runId: string;
        status: string;
        canRecord: boolean;
        blocking: boolean;
        blockers: string[];
        pending: string[];
        disclosure: {
            version: string;
            summary: string;
            declaredAt: string;
            participants: string[];
        } | null;
        withdrawn: boolean;
    };
    submitConsentDecisions(id: string, dto: ConsentDecisionsDto, req: any): {
        runId: string;
        status: string;
        canRecord: boolean;
        blocking: boolean;
        blockers: string[];
        pending: string[];
        disclosure: {
            version: string;
            summary: string;
            declaredAt: string;
            participants: string[];
        } | null;
        withdrawn: boolean;
    };
    getConsent(id: string, req: any): {
        runId: string;
        status: string;
        canRecord: boolean;
        blocking: boolean;
        blockers: string[];
        pending: string[];
        disclosure: {
            version: string;
            summary: string;
            declaredAt: string;
            participants: string[];
        } | null;
        withdrawn: boolean;
    };
    withdrawConsent(id: string, dto: WithdrawConsentDto, req: any): {
        runId: string;
        status: string;
        canRecord: boolean;
        blocking: boolean;
        blockers: string[];
        pending: string[];
        disclosure: {
            version: string;
            summary: string;
            declaredAt: string;
            participants: string[];
        } | null;
        withdrawn: boolean;
    };
    getConsentAudit(id: string, req: any): {
        runId: string;
        disclosure: {
            version: string;
            summary: string;
            declaredAt: string;
            participants: string[];
        } | null;
        records: import("./meeting.service").ConsentRecord[];
    };
    getRetentionPolicy(): import("./meeting.service").RetentionPolicy;
    setRetentionPolicy(dto: SetRetentionDto, req: any): import("./meeting.service").RetentionPolicy;
    purgeRetention(dto: PurgeRetentionDto, req: any): {
        dryRun: boolean;
        policyDays: number;
        purged: string[];
        counts: {
            audio: number;
            utterances: number;
            artifacts: number;
            embeddings: number;
        };
        audit: import("./meeting.service").RetentionAuditEntry | null;
    };
    getRetentionAudit(req: any): {
        entries: import("./meeting.service").RetentionAuditEntry[];
    };
}
