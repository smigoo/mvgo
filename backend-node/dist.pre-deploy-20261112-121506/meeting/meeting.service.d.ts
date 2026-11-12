import { RunStatus } from './meeting-state';
import { AttachAudioDto, ComposeDto, ConsentDecisionsDto, CreateRunDto, DeclareConsentDto, PatchFieldDto, PurgeRetentionDto, SetRetentionDto, WithdrawConsentDto } from './dto/meeting.dto';
export declare const DEFAULT_RETENTION_DAYS = 90;
export declare const MEETING_BLOCKING_DEPS: readonly {
    id: string;
    name: string;
}[];
export interface FieldOverlay {
    value?: any;
    confirmState?: string;
    note?: string;
    reason?: string;
    updatedAt: string;
    updatedBy: string;
}
export interface ConsentRecord {
    participantId: string;
    decision: 'declare' | 'accepted' | 'declined' | 'withdraw';
    disclosureVersion: string | null;
    at: string;
    reason?: string;
}
export interface MeetingRun {
    runId: string;
    ownerId: string;
    title: string;
    meetingType: string;
    template: {
        id: string;
        version: string;
        label: string;
    };
    outputLanguage: string;
    detectedLanguages: string[];
    participants: string[];
    inputs: Record<string, any>;
    status: RunStatus;
    draftAi: {
        fields: any[];
        warnings: string[];
        injectionEvents: any[];
        truncatedRatio: number;
    } | null;
    fieldOverlay: Record<string, FieldOverlay>;
    frozen: {
        publishedAt: string;
        snapshot: any;
    } | null;
    audioRef: string | null;
    consent: {
        status: string;
        disclosure: {
            version: string;
            summary: string;
            declaredAt: string;
            participants: string[];
        } | null;
        records: ConsentRecord[];
    };
    createdAt: string;
    updatedAt: string;
}
export interface RetentionPolicy {
    days: number;
    source: 'default' | 'admin';
    updatedBy?: string;
    updatedAt?: string;
}
export interface RetentionAuditEntry {
    id: string;
    kind: 'expire_purge' | 'user_delete';
    runId: string | null;
    counts: {
        audio: number;
        utterances: number;
        artifacts: number;
        embeddings: number;
    };
    at: string;
    actor: string;
}
export declare class MeetingService {
    private readonly logger;
    private readonly store;
    private requireOwner;
    private pickOwned;
    assertRunAccess(runId: string, userId?: string): MeetingRun;
    private updateRun;
    private loadRuns;
    private saveRuns;
    private appendAudit;
    private notFound;
    private badState;
    private depNotReady;
    private viewOf;
    createRun(dto: CreateRunDto, userId?: string): {
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
    attachAudio(runId: string, _dto: AttachAudioDto, userId?: string): void;
    getRun(runId: string, userId?: string): {
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
    retryRun(runId: string, userId?: string): void;
    getDraft(runId: string, userId?: string): {
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
    patchField(runId: string, fieldId: string, dto: PatchFieldDto, userId?: string): {
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
    publishRun(runId: string, userId?: string): {
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
    exportRun(runId: string, format: string, userId?: string): {
        runId: string;
        format: string;
        publishedAt: string;
        content: string;
        notice: string;
    };
    composeRun(runId: string, _dto: ComposeDto, userId?: string): void;
    declareConsent(runId: string, dto: DeclareConsentDto, userId?: string): {
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
    submitConsentDecisions(runId: string, dto: ConsentDecisionsDto, userId?: string): {
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
    getConsent(runId: string, userId?: string): {
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
    withdrawConsent(runId: string, dto: WithdrawConsentDto, userId?: string): {
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
    getConsentAudit(runId: string, userId?: string): {
        runId: string;
        disclosure: {
            version: string;
            summary: string;
            declaredAt: string;
            participants: string[];
        } | null;
        records: ConsentRecord[];
    };
    getRetentionPolicy(): RetentionPolicy;
    setRetentionPolicy(dto: SetRetentionDto, userId?: string): RetentionPolicy;
    purgeRetention(dto: PurgeRetentionDto, userId?: string): {
        dryRun: boolean;
        policyDays: number;
        purged: string[];
        counts: {
            audio: number;
            utterances: number;
            artifacts: number;
            embeddings: number;
        };
        audit: RetentionAuditEntry | null;
    };
    getRetentionAudit(userId?: string): {
        entries: RetentionAuditEntry[];
    };
    ingestDraft(runId: string, draft: any, userId?: string): {
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
    private evaluateConsent;
    private consentView;
    private mergeDraft;
    private renderExport;
}
