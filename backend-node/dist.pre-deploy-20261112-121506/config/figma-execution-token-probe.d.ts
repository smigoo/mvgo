import { type ExecutionFigmaTokenInput, type ExecutionFigmaTokenResult } from './figma-credential-ref';
import { type FigmaAccessProber } from '../lite/figma-access-diagnosis';
export interface ExecutionFigmaProbeTrace {
    slotId: string | null;
    slotLabel: string;
    status: number | null;
    nodeFound: boolean;
    isBaseToken: boolean;
}
export interface ProbeExecutionFigmaTokenInput extends ExecutionFigmaTokenInput {
    fileKey?: string | null;
    nodeId?: string | null;
    probe?: FigmaAccessProber;
    probeTimeoutMs?: number;
    forceProbe?: boolean;
    disableProbe?: boolean;
}
export interface ProbeExecutionFigmaTokenResult extends ExecutionFigmaTokenResult {
    probes: ExecutionFigmaProbeTrace[];
}
export declare function resolveExecutionFigmaTokenWithProbe(input?: ProbeExecutionFigmaTokenInput): Promise<ProbeExecutionFigmaTokenResult>;
