export declare const FIGMA_CREDENTIAL_REF_FIELDS: {
    readonly fp: "figmaCredentialFp";
    readonly slotId: "figmaCredentialSlotId";
    readonly slotName: "figmaCredentialSlotName";
};
export interface FigmaCredentialRef {
    fp: string;
    slotId: string | null;
    slotName: string | null;
}
export type FigmaCredentialRefFields = {
    figmaCredentialFp: string;
    figmaCredentialSlotId?: string;
    figmaCredentialSlotName?: string;
};
export type FigmaCredentialResolveReason = 'no-ref' | 'fingerprint-unusable' | 'no-slots' | 'not-found' | 'slot-overwritten';
export interface FigmaCredentialResolution {
    token: string | null;
    slotId: string | null;
    slotName: string | null;
    reason: FigmaCredentialResolveReason | 'matched';
    overwrittenSlotId?: string;
}
export declare function isFigmaFingerprintUsable(fp?: string | null): boolean;
export declare function listFigmaCredentialCandidates(config?: Record<string, any> | null): Array<{
    slotId: string | null;
    slotName: string | null;
    token: string;
}>;
export declare function buildFigmaCredentialRefForToken(token?: string | null, config?: Record<string, any> | null): FigmaCredentialRef | null;
export declare function buildFigmaCredentialRef(config?: Record<string, any> | null): FigmaCredentialRef | null;
export declare function toFigmaCredentialRefFields(ref?: FigmaCredentialRef | null): FigmaCredentialRefFields | null;
export declare function readFigmaCredentialRef(source?: Record<string, any> | null): FigmaCredentialRef | null;
export declare function readTaskFigmaCredentialRef(task?: Record<string, any> | null): {
    ref: FigmaCredentialRef | null;
    source: 'pipeline' | 'create' | null;
};
export declare function resolveFigmaTokenByRef(ref?: FigmaCredentialRef | null, config?: Record<string, any> | null): FigmaCredentialResolution;
export interface FigmaCredentialDrift {
    hasRef: boolean;
    changed: boolean | undefined;
    reason: FigmaCredentialResolveReason | 'matched' | 'no-ref';
}
export declare function assessFigmaCredentialDrift(task?: Record<string, any> | null, currentConfig?: Record<string, any> | null): FigmaCredentialDrift;
export type FigmaTokenSource = 'ref' | 'request' | 'active' | 'probe' | 'env' | 'none';
export type ExecutionFigmaTokenReason = FigmaCredentialResolveReason | 'matched' | 'probe-selected' | 'probe-failed' | 'probe-unavailable';
export interface ExecutionFigmaTokenInput {
    task?: Record<string, any> | null;
    requestConfig?: Record<string, any> | null;
    requestToken?: string | null;
    activeConfig?: Record<string, any> | null;
    envToken?: string | null;
}
export interface ExecutionFigmaTokenResult {
    token: string | null;
    source: FigmaTokenSource;
    reason: ExecutionFigmaTokenReason;
    ref: FigmaCredentialRef | null;
    refSource: 'pipeline' | 'create' | 'request' | null;
    requestOverridden: boolean;
    overwrittenSlotId?: string;
    note: string;
    refFields: FigmaCredentialRefFields | null;
}
export declare function isRedactedPlaceholder(value?: string | null): boolean;
export declare function describeFigmaCredentialReason(reason: FigmaCredentialResolveReason, ref?: FigmaCredentialRef | null, overwrittenSlotId?: string): string;
export declare function resolveExecutionFigmaToken(input?: ExecutionFigmaTokenInput): ExecutionFigmaTokenResult;
