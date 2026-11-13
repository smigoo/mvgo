export interface DownloadedAssetLike {
    name?: string;
    ref?: string;
    localPath?: string | null;
    deduplicatedFrom?: string;
}
export declare function isFedAssetFileName(fileName: string): boolean;
export declare function trailingNumericSuffix(fileName: string): string | undefined;
export declare function resolveFeedNodeId(a: DownloadedAssetLike, isKnownNode: (id: string) => boolean, idBySuffix: (suffix: string) => string | undefined): string | undefined;
