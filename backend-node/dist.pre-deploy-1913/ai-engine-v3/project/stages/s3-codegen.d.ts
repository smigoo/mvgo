export interface GenFile {
    rel: string;
    content: string;
}
export interface CodeGenOptions {
    runId: string;
    projectRoot?: string;
    generatedAt: string;
}
export interface CodeGenSummary {
    endpointTotal: number;
    backendControllers: number;
    frontendApis: number;
    tags: string[];
    byConfidence: Record<string, number>;
    verbDefaultedCount: number;
    outsidePrefixCount: number;
}
export interface CodeGenResult {
    files: GenFile[];
    summary: CodeGenSummary;
    notes: string[];
}
interface OasParam {
    name?: string;
    in?: string;
    required?: boolean;
    schema?: {
        type?: string;
    };
}
interface OasOperation {
    operationId?: string;
    summary?: string;
    tags?: string[];
    parameters?: OasParam[];
    'x-mvgo-response-data'?: string;
    'x-mvgo-confidence'?: string;
    'x-mvgo-sources'?: string[];
    'x-mvgo-verb-declared'?: string;
    'x-mvgo-verb-inferred'?: boolean;
    'x-mvgo-flags'?: string[];
}
interface OasPathItem {
    get?: OasOperation;
    post?: OasOperation;
    put?: OasOperation;
    delete?: OasOperation;
    patch?: OasOperation;
    options?: OasOperation;
    head?: OasOperation;
}
export interface OasContract {
    openapi?: string;
    info?: {
        title?: string;
        version?: string;
    };
    servers?: {
        url: string;
    }[];
    tags?: {
        name: string;
        description?: string;
    }[];
    paths?: Record<string, OasPathItem>;
    components?: {
        schemas?: Record<string, unknown>;
    };
    'x-mvgo-freeze'?: Record<string, unknown>;
}
export declare function buildCodeGen(contract: OasContract, opts: CodeGenOptions): CodeGenResult;
export {};
