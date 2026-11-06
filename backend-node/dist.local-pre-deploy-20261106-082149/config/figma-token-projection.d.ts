export declare const MAX_FIGMA_TOKENS = 2;
export declare const LEGACY_FIGMA_TOKEN_SLOT_ID = "figma-1";
export interface FigmaTokenSlot {
    id: string;
    name?: string;
    token?: string;
}
export declare function isUsableFigmaTokenSlot(value: unknown): value is FigmaTokenSlot;
export declare function normalizeFigmaTokenSlots(value: unknown): FigmaTokenSlot[];
export declare function pickActiveFigmaTokenSlot(config: Record<string, any> | null | undefined, slots: FigmaTokenSlot[]): FigmaTokenSlot | null;
export declare function applyFigmaTokenProjection<T extends Record<string, any>>(config: T): T;
export declare function materializeFigmaTokenSlots<T extends Record<string, any>>(config: T): T;
