import { type FigmaTokenSlot } from '../config/figma-token-projection';
export declare const FIGMA_PROBE_TIMEOUT_MS = 5000;
export declare const FIGMA_API_BASE = "https://api.figma.com/v1";
export interface FigmaProbeResult {
    status: number | null;
    nodeFound: boolean;
}
export type FigmaAccessProber = (token: string, fileKey: string, nodeId: string) => Promise<FigmaProbeResult>;
export type FigmaAccountResolver = (token: string) => Promise<string | null>;
export interface FigmaAccessProbeRecord {
    slotId: string;
    slotLabel: string;
    status: number | null;
    nodeFound: boolean;
}
export interface FigmaAccessDiagnosis {
    kind: 'figma-not-found';
    fileKey: string;
    nodeId: string;
    activeSlotId: string;
    activeSlotLabel: string;
    candidateSlotIds: string[];
    candidateSlotLabels: string[];
    candidateAccounts: Array<string | null>;
    probes: FigmaAccessProbeRecord[];
    message: string;
}
export declare function isFigmaNotFoundError(error: unknown): boolean;
export declare function figmaTokenSlotLabel(slot: Pick<FigmaTokenSlot, 'name'> | null | undefined, index: number): string;
export declare function createFigmaNodeProber(options?: {
    timeoutMs?: number;
    baseUrl?: string;
}): FigmaAccessProber;
export declare function createFigmaAccountResolver(options?: {
    timeoutMs?: number;
    baseUrl?: string;
}): FigmaAccountResolver;
export interface DiagnoseFigmaNotFoundOptions {
    fileKey: string;
    nodeId: string;
    config?: Record<string, any> | null;
    probe?: FigmaAccessProber;
    resolveAccount?: FigmaAccountResolver;
}
export declare function diagnoseFigmaNotFoundAccess(options: DiagnoseFigmaNotFoundOptions): Promise<FigmaAccessDiagnosis>;
