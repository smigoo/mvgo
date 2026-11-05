export type DirectionTruth = 'row' | 'column' | 'grid' | '?';
export interface DirectionTruthCase {
    id: string;
    comp: string;
    parent: [number, number, number, number];
    kids: [number, number, number, number][];
    truth: DirectionTruth;
    why: string;
}
export declare const DIRECTION_TRUTH_CASES: DirectionTruthCase[];
