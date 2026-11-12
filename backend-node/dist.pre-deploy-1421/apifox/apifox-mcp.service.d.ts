import { ApifoxService } from './apifox.service';
import { ApifoxGeneratorService, OasSpec } from './apifox-generator.service';
import { McpListApifoxDto } from './dto/mcp-list-apifox.dto';
import { McpAddApifoxDto } from './dto/mcp-add-apifox.dto';
export interface FlatApiItem {
    path: string;
    method: string;
    summary: string;
    functionName: string;
    moduleName: string;
    isNew: boolean;
    paramNames: string[];
}
export interface LoadedOas {
    spec: OasSpec;
    unresolvedRefs: string[];
}
export declare class ApifoxMcpService {
    private readonly apifoxService;
    private readonly generator;
    private readonly logger;
    constructor(apifoxService: ApifoxService, generator: ApifoxGeneratorService);
    listMcpApis(dto: McpListApifoxDto): Promise<{
        success: boolean;
        source: string;
        apifoxProjectId: string;
        projectTitle: string;
        totalPaths: number;
        totalApis: number;
        newCount: number;
        baselineCatalogId: string | null;
        modules: {
            moduleName: string;
            count: number;
            newCount: number;
        }[];
        apis: FlatApiItem[];
        unresolvedRefs: string[];
    }>;
    addMcpApis(dto: McpAddApifoxDto): Promise<{
        success: boolean;
        source: string;
        catalogId: string;
        moduleName: string;
        service: string;
        addedApiCount: number;
        moduleFunctionCount: number;
        previousModuleFunctionCount: number;
        totalApiCount: number;
        totalModuleCount: number;
        files: string[];
        replacedZipEntries: number;
        downloadUrl: string;
    }>;
    private replaceModuleInZip;
    private knownKeysOf;
    private apiKey;
    private resolveServerEntry;
    private loadOas;
    private expandRefs;
    private safeJsonParse;
    private callToolJson;
}
