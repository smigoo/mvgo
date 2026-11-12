import { type UnitContract } from './unit-contract';
export declare function readProjectFigmaUrl(s0: any): string | null;
export declare function figmaLinkAbsenceNote(s0: any): string;
export interface FigmaUnitSplitDeps {
    getNode: (fileKey: string, nodeId: string) => Promise<any>;
}
export interface FigmaUnitSplitParams {
    runId: string;
    inputKey: string;
    figmaUrl?: string | null;
    figmaUrlAbsenceNote?: string;
    features?: string[];
    tokenAvailable?: boolean;
    builtAt?: string;
    onLog?: (payload: Record<string, any>) => void;
}
export declare function splitFigmaUnits(params: FigmaUnitSplitParams, deps: FigmaUnitSplitDeps): Promise<UnitContract>;
