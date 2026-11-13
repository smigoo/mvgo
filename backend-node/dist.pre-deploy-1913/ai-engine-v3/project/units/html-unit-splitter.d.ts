import { type UnitContract } from './unit-contract';
export interface HtmlUnitSplitParams {
    runId: string;
    inputKey: string;
    pages: string[];
    features: string[];
    onLog?: (payload: Record<string, any>) => void;
}
export declare function splitHtmlUnits(p: HtmlUnitSplitParams): UnitContract;
