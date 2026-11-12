import type { Response } from 'express';
import { ApifoxService } from './apifox.service';
import { ApifoxGeneratorService } from './apifox-generator.service';
import { ApifoxMcpService } from './apifox-mcp.service';
import { RecordApifoxDto } from './dto/record-apifox.dto';
import { GenerateApifoxDto } from './dto/generate-apifox.dto';
import { GenerateFullApifoxDto } from './dto/generate-full-apifox.dto';
import { ListApifoxPathsDto } from './dto/list-apifox-paths.dto';
import { McpListApifoxDto } from './dto/mcp-list-apifox.dto';
import { McpAddApifoxDto } from './dto/mcp-add-apifox.dto';
export declare class ApifoxController {
    private readonly apifoxService;
    private readonly generatorService;
    private readonly mcpService;
    constructor(apifoxService: ApifoxService, generatorService: ApifoxGeneratorService, mcpService: ApifoxMcpService);
    generate(dto: GenerateApifoxDto, userId: string): Promise<{
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
    listPaths(dto: ListApifoxPathsDto): Promise<{
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
    generateFull(dto: GenerateFullApifoxDto, userId: string): Promise<{
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
    mcpList(dto: McpListApifoxDto): Promise<{
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
        apis: import("./apifox-mcp.service").FlatApiItem[];
        unresolvedRefs: string[];
    }>;
    mcpAdd(dto: McpAddApifoxDto, userId: string): Promise<{
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
    getCatalog(catalogId: string, userId: string): import("./apifox.service").ApiCatalog;
    listCatalogs(userId: string): {
        success: boolean;
        items: {
            catalogId: string;
            apifoxProjectId: string;
            projectName?: string;
            generatedAt: string;
            totalApiCount: number;
            totalModuleCount: number;
        }[];
    };
    record(dto: RecordApifoxDto, sessionUserId?: string, skillKey?: string): {
        success: boolean;
        taskId: string;
        downloadUrl: string | undefined;
        ownerId: string | null;
    };
    mine(userId: string): {
        success: boolean;
        items: import("./apifox.service").ApifoxTask[];
    };
    deleteTask(taskId: string, userId: string): {
        success: boolean;
    };
    download(taskId: string, userId: string, res: Response): Promise<void>;
}
