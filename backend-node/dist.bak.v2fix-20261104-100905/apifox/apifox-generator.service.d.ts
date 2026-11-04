import { ApifoxService } from './apifox.service';
import { GenerateApifoxDto } from './dto/generate-apifox.dto';
import { GenerateFullApifoxDto } from './dto/generate-full-apifox.dto';
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
    private parseAllAndGroup;
    private toCatalogFunction;
    private inferDefaultValue;
    private buildResponsePreview;
    private createFullZip;
    private parseAndFilter;
    private generateFiles;
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
