import type { Response } from 'express';
export declare class PreviewController {
    servePageFile(groupId: string, pageId: string, filePath: string, exists: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    serveComponentFile(groupId: string, componentId: string, filePath: string, exists: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
