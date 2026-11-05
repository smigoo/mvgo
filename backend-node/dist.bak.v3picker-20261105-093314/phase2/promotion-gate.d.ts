export interface StructureGateDecision {
    blocked: boolean;
    blockCount: number;
    reason: string | null;
}
export declare function evalStructureGateForPromotion(genResult: any): StructureGateDecision;
