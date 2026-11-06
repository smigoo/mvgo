export interface UiExtract {
    pageName: string;
    viewName: string;
    title: string;
    textTokens: string[];
    sectionHeadings: string[];
    tables: {
        columns: string[];
        dataSource: string;
    }[];
    icons: string[];
    usesTopBar: boolean;
    dataRefs: string[];
}
export interface S4Binding {
    tag: string;
    fn: string;
    params?: Record<string, any>;
    target: string;
}
export interface S4Embed {
    view: string;
    componentId: string;
    groupId?: string;
    slotKey: string;
    pos?: number;
}
export interface EmbedBlockHint {
    index: number;
    tag: string;
    hint: string;
}
export interface VueGenFile {
    rel: string;
    content: string;
}
export interface VueGenResult {
    files: VueGenFile[];
    extracts: UiExtract[];
    notes: string[];
}
export interface VueGenOptions {
    runId: string;
    projectRoot: string;
    generatedAt: string;
    generatedRoot?: string;
    binding?: S4Binding;
    embeds?: S4Embed[];
}
export interface TemplateRepairLog {
    impliedClose: number;
    strayClose: number;
    tailClose: number;
    elseIfDowngrade: number;
    changed: boolean;
}
export declare function repairTemplateStructure(tpl: string): {
    tpl: string;
    log: TemplateRepairLog;
};
export declare function normalizeInlineHandlers(tpl: string): {
    tpl: string;
    normalized: number;
    skipped: number;
};
export declare function stripTags(tpl: string): string;
export interface ApiFnExport {
    name: string;
    method: string;
    url: string;
    hasPathParam: boolean;
}
export interface ApiModuleExports {
    tag: string;
    functions: ApiFnExport[];
}
export declare function readApiModules(generatedRoot?: string): ApiModuleExports[];
export interface S4AutoBinding {
    tag: string;
    fn: string;
    target: string;
    params: Record<string, any>;
}
export declare function autoWireBindings(dataRefs: string[], modules: ApiModuleExports[]): S4AutoBinding[];
export declare function buildVueGen(opts: VueGenOptions): VueGenResult;
export declare function verifyVueGen(result: VueGenResult, builtFiles: Record<string, string>): {
    pass: boolean;
    missingText: string[];
    missingHeadings: string[];
};
