import { RecordApifoxDto } from './dto/record-apifox.dto';
export declare function normalizeOwnerId(candidate?: unknown): string | undefined;
export type RecordTaskInput = RecordApifoxDto & {
    ownerId?: string;
    projectName?: string;
    apifoxProjectId?: string;
    taskType?: 'full' | 'single';
};
export declare function mergeTaskRecord(existing: ApifoxTask | undefined, incoming: RecordTaskInput, now: string): ApifoxTask;
export interface ApifoxTask {
    taskId: string;
    moduleName: string;
    projectName?: string;
    apifoxProjectId?: string;
    taskType?: 'full' | 'single';
    ownerId?: string;
    fileNames?: string[];
    apiCount?: number;
    zipPath?: string;
    downloadUrl?: string;
    createdAt: string;
}
export interface ApiCatalogFunction {
    name: string;
    method: string;
    path: string;
    summary: string;
    tags: string[];
    params: {
        name: string;
        in: string;
        required: boolean;
        type: string;
        description: string;
        enumValues?: (string | number)[];
        example?: any;
    }[];
    hasBody: boolean;
    responsePreview: string;
}
export interface ApiCatalogModule {
    moduleName: string;
    service: string;
    functions: ApiCatalogFunction[];
}
export interface ApiCatalog {
    catalogId: string;
    apifoxProjectId: string;
    projectName?: string;
    generatedAt: string;
    zipPath: string;
    totalApiCount: number;
    totalModuleCount: number;
    modules: ApiCatalogModule[];
}
export declare class ApifoxService {
    private readonly logger;
    private readonly storePath;
    private readonly catalogDir;
    private readonly catalogIndexPath;
    private assertSafeId;
    private assertZipInsideDir;
    private assertTaskOwner;
    private readTasks;
    private writeTasks;
    recordTask(dto: RecordTaskInput): ApifoxTask;
    listMine(ownerId?: string): ApifoxTask[];
    deleteTask(taskId: string, ownerId?: string): void;
    getZipPath(taskId: string, ownerId?: string): string;
    saveCatalog(catalog: ApiCatalog, ownerId?: string): void;
    getCatalog(catalogId: string, ownerId?: string): ApiCatalog;
    listCatalogs(ownerId?: string): {
        catalogId: string;
        apifoxProjectId: string;
        projectName?: string;
        generatedAt: string;
        totalApiCount: number;
        totalModuleCount: number;
    }[];
    private readCatalogIndex;
}
