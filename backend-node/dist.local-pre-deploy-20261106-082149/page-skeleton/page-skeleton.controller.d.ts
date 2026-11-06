import type { Response } from 'express';
import { PageSkeletonService } from './page-skeleton.service';
export declare class PageSkeletonController {
    private readonly svc;
    constructor(svc: PageSkeletonService);
    create(userId: string, file: any, body: {
        groupId?: string;
        name?: string;
        figmaUrl?: string;
    }): Promise<any>;
    list(userId: string, groupId?: string): Promise<any>;
    getOne(userId: string, groupId: string, id: string): Promise<any>;
    update(userId: string, groupId: string, id: string, body: any): Promise<any>;
    download(userId: string, groupId: string, id: string, res: Response): Promise<void>;
    remove(userId: string, groupId: string, id: string): Promise<any>;
    retry(userId: string, groupId: string, id: string): Promise<any>;
    files(userId: string, groupId: string, id: string): Promise<any>;
    readFile(groupId: string, id: string, filePath: string, raw: string, res: Response): Promise<void | Response<any, Record<string, any>> | {
        success: boolean;
        code: number;
        message: string;
        data: null;
        source: string;
    }>;
    writeFile(userId: string, groupId: string, id: string, body: {
        path?: string;
        content?: string;
    }): Promise<any>;
    createFolder(userId: string, groupId: string, id: string, body: {
        path?: string;
    }): Promise<any>;
    renameFile(userId: string, groupId: string, id: string, body: {
        oldPath?: string;
        newPath?: string;
    }): Promise<any>;
    deleteFile(userId: string, groupId: string, id: string, filePath: string): Promise<any>;
}
