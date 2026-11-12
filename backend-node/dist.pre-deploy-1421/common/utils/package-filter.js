"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXCLUDED_PACKAGE_DIRS = void 0;
exports.isExcludedPackageEntry = isExcludedPackageEntry;
exports.packageEntryFilter = packageEntryFilter;
exports.EXCLUDED_PACKAGE_DIRS = [
    '.snapshots',
    '.backups',
    '.cache',
    '.checkpoint',
    '.mc-gen',
    'node_modules',
    '.git',
];
function isExcludedPackageEntry(entryName) {
    const parts = String(entryName || '').split(/[\\/]/);
    return parts.some((part) => exports.EXCLUDED_PACKAGE_DIRS.includes(part));
}
function packageEntryFilter() {
    return (entry) => (isExcludedPackageEntry(entry?.name || '') ? false : entry);
}
//# sourceMappingURL=package-filter.js.map