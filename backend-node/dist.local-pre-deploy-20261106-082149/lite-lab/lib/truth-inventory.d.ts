import { type TruthInventory } from './truth-matcher';
export interface BuildTruthInventoryInput {
    nodeData: any;
    downloadedAssets: any[];
}
export interface TruthInventoryFeedStats {
    downloaded: number;
    fed: number;
    aligned: number;
    unmatched: number;
}
export interface TruthInventoryResult {
    truth: TruthInventory;
    feed: TruthInventoryFeedStats;
}
export declare function buildTruthInventory(nodeData: any, downloadedAssets: any[]): TruthInventoryResult;
