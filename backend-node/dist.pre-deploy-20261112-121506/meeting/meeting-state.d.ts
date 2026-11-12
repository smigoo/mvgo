export declare const RUN_STATUS: readonly ["排队中", "处理中", "待确认", "已定稿", "失败"];
export type RunStatus = (typeof RUN_STATUS)[number];
export declare const RUN_TRANSITIONS: Record<string, readonly string[]>;
export declare function canTransition(from: string, to: string): boolean;
export declare const CONSENT_STATUS: readonly ["未发起", "征集中", "已通过", "已阻断", "已撤回"];
export type ConsentStatus = (typeof CONSENT_STATUS)[number];
export declare const CONSENT_TRANSITIONS: Record<string, readonly string[]>;
export declare function canConsentTransition(from: string, to: string): boolean;
export declare const TEMPLATE_SCHEMAS: Readonly<{
    progress_review: {
        id: string;
        version: string;
        label: string;
        required: readonly string[];
    };
    requirement_review: {
        id: string;
        version: string;
        label: string;
        required: readonly string[];
    };
    other: {
        id: string;
        version: string;
        label: string;
        required: readonly string[];
    };
}>;
export declare function requiredFieldsOf(meetingType: string): readonly string[];
export declare function schemaOf(meetingType: string): {
    id: string;
    version: string;
    label: string;
};
export declare const CONFIRM_STATES: readonly ["未确认", "编辑中", "已确认", "已驳回"];
export declare const SOURCE_STATES: readonly ["from_meeting", "from_background", "unconfirmed"];
