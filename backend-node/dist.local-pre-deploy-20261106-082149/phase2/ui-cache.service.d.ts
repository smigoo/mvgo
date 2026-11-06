export interface UiCacheHit {
    hit: boolean;
    figmaNodeData?: any;
    previewAnalysis?: any;
    figmaAssets?: any;
    resourceDomMapping?: any;
    source: 'cache' | 'none';
    staleReason?: string;
}
export interface UiCacheSaveInput {
    figmaNodeData: any;
    previewAnalysis?: any;
    assets?: any;
    resourceDomMapping?: any;
    fileKey?: string;
    nodeId?: string;
}
export declare class UiCacheService {
    private readonly logger;
    private loadFigmaRoot;
    check(componentDir: string, expected?: {
        fileKey?: string;
        nodeId?: string;
    }): UiCacheHit;
    save(componentDir: string, input: UiCacheSaveInput): void;
}
