export interface S4ComponentSpec {
    name: string;
    tag: string;
    props: string[];
    slots: string[];
    deps: string[];
    source: 'builtin' | 'prototype' | 'observed';
    make: (ctx: S4ComponentCtx) => string;
}
export interface PrototypeAssets {
    registered: Map<string, {
        name: string;
        tag: string;
    }>;
    icons: Record<string, string>;
    modules: {
        key: string;
        label: string;
        file?: string;
        icon?: string;
    }[];
    files: string[];
}
export interface S4ComponentCtx {
    projectRoot: string;
    commonCss: string;
    assets: PrototypeAssets;
}
export declare function componentRel(name: string): string;
export declare function pascalizeTag(tag: string): string;
export declare function kebabizeName(name: string): string;
export declare function findCommonCss(root: string): string;
export declare function scanPrototypeAssets(root: string): PrototypeAssets;
export declare function classesInTemplate(tpl: string): string[];
export declare function extractCssRules(css: string, classes: string[]): string;
export declare function findTagGt(raw: string, start: number): number;
export declare function findCustomTags(tpl: string): string[];
export declare function rewriteComponentTags(tpl: string, specs: S4ComponentSpec[]): {
    tpl: string;
    used: string[];
};
export interface S4RegistryResult {
    specs: S4ComponentSpec[];
    notes: string[];
    ctx: S4ComponentCtx;
}
export declare function buildComponentRegistry(root: string, commonCss: string, observedTags: string[]): S4RegistryResult;
