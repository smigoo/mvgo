import type { Response } from 'express';
import { ApifoxService } from './apifox.service';
import { ApifoxGeneratorService } from './apifox-generator.service';
import { RecordApifoxDto } from './dto/record-apifox.dto';
import { GenerateApifoxDto } from './dto/generate-apifox.dto';
import { GenerateFullApifoxDto } from './dto/generate-full-apifox.dto';
export declare class ApifoxController {
    private readonly apifoxService;
    private readonly generatorService;
    constructor(apifoxService: ApifoxService, generatorService: ApifoxGeneratorService);
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
    getCatalog(catalogId: string): import("./apifox.service").ApiCatalog;
    listCatalogs(): {
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
    record(dto: RecordApifoxDto): {
        success: boolean;
        taskId: string;
        downloadUrl: string | undefined;
    };
    mine(userId: string): {
        success: boolean;
        items: import("./apifox.service").ApifoxTask[];
    };
    deleteTask(taskId: string, userId: string): {
        success: boolean;
    };
    download(taskId: string, res: Response): Promise<void>;
}
