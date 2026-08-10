import type { Response } from 'express';
export declare class PreviewController {
    serveComponentFile(groupId: string, componentId: string, filePath: string, exists: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
