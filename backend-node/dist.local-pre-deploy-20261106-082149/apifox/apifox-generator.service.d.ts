import { ApifoxService, ApiCatalogFunction } from './apifox.service';
import { GenerateApifoxDto } from './dto/generate-apifox.dto';
import { GenerateFullApifoxDto } from './dto/generate-full-apifox.dto';
export interface OasSchema {
    type?: string;
    properties?: Record<string, OasSchema>;
    items?: OasSchema;
    $ref?: string;
    enum?: (string | number)[];
    description?: string;
    format?: string;
    example?: any;
    required?: string[];
}
export interface OasParameter {
    name: string;
    in: string;
    required?: boolean;
    schema?: OasSchema;
    description?: string;
}
export interface OasOperation {
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: OasParameter[];
    requestBody?: {
        content?: Record<string, {
            schema?: OasSchema;
        }>;
    };
    responses?: Record<string, {
        content?: Record<string, {
            schema?: OasSchema;
        }>;
        description?: string;
    }>;
    operationId?: string;
}
export interface OasSpec {
    openapi: string;
    info?: {
        title?: string;
        description?: string;
        version?: string;
    };
    paths?: Record<string, Record<string, OasOperation>>;
    components?: {
        schemas?: Record<string, OasSchema>;
    };
    servers?: {
        url: string;
    }[];
}
export interface ParsedApi {
    path: string;
    method: string;
    summary: string;
    description: string;
    functionName: string;
    parameters: OasParameter[];
    hasBody: boolean;
    bodySchema?: OasSchema;
    responseSchema?: OasSchema;
}
export declare class ApifoxGeneratorService {
    private readonly apifoxService;
    private readonly logger;
    constructor(apifoxService: ApifoxService);
    generate(dto: GenerateApifoxDto): Promise<{
        success: boolean;
        taskId: string;
        downloadUrl: string | undefined;
        apiCount: number;
        files: string[];
        fileContents: {
            filename: string;
            content: string;
        }[];
    }>;
    generateFull(dto: GenerateFullApifoxDto): Promise<{
        success: boolean;
        catalogId: string;
        totalApiCount: number;
        totalModuleCount: number;
        modules: {
            moduleName: string;
            functionCount: number;
        }[];
        downloadUrl: string;
    }>;
    private toParsedApi;
    moduleNameOf(path: string, op: OasOperation): string;
    serviceOf(apis: ParsedApi[]): string;
    parseAllAndGroup(spec: OasSpec): Map<string, ParsedApi[]>;
    toCatalogFunction(api: ParsedApi, spec: OasSpec): ApiCatalogFunction;
    private inferDefaultValue;
    private buildResponsePreview;
    private createFullZip;
    private parseAndFilter;
    generateFiles(apis: ParsedApi[], spec: OasSpec, moduleName: string, projectId: string, date: string): {
        filename: string;
        content: string;
    }[];
    private createZip;
    private generateApiJs;
    private generateMockJs;
    private generateEnumsJs;
    private generateUsageMd;
    listPaths(dto: {
        apifoxProjectId: string;
        apifoxToken: string;
        apifoxBaseUrl?: string;
    }): Promise<{
        success: boolean;
        totalPaths: number;
        modules: {
            methods: string[];
            prefix: string;
            count: number;
            sample: string;
        }[];
        projectTitle: string;
    }>;
}
