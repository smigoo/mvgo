export declare const EXCLUDED_PACKAGE_DIRS: readonly string[];
export declare function isExcludedPackageEntry(entryName: string): boolean;
export declare function packageEntryFilter(): (entry: {
    name?: string;
}) => false | {
    name?: string;
};
