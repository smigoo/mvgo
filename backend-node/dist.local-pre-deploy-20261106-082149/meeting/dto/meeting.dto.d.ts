export declare class CreateRunDto {
    meetingType?: string;
    title?: string;
    outputLanguage?: string;
    participants?: string[];
    inputs?: Record<string, any>;
}
export declare class AttachAudioDto {
    audioRef?: string;
    durationMs?: number;
    participants?: string[];
}
export declare class PatchFieldDto {
    value?: any;
    confirmState?: string;
    note?: string;
    reason?: string;
}
export declare class ConsentDecisionDto {
    participantId: string;
    decision: 'accepted' | 'declined';
}
export declare class DeclareConsentDto {
    participants?: string[];
    disclosureVersion?: string;
    summary?: string;
}
export declare class ConsentDecisionsDto {
    decisions: ConsentDecisionDto[];
    disclosureVersion?: string;
}
export declare class WithdrawConsentDto {
    participantId?: string;
    reason?: string;
}
export declare class ComposeDto {
    outputLanguage?: string;
    lengthTarget?: string;
}
export declare class SetRetentionDto {
    days: number;
}
export declare class PurgeRetentionDto {
    runIds?: string[];
    dryRun?: boolean;
}
