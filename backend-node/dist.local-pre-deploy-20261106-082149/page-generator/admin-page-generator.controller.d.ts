import type { Response } from 'express';
import { AdminPageGeneratorService } from './admin-page-generator.service';
import { AdminPageConfigDto } from './dto/admin-page.dto';
export declare class AdminPageGeneratorController {
    private readonly adminPageGeneratorService;
    constructor(adminPageGeneratorService: AdminPageGeneratorService);
    generateAdminPage(config: AdminPageConfigDto): {
        success: boolean;
        message: string;
        files: {
            [x: string]: string;
        };
    };
    downloadAdminPage(config: AdminPageConfigDto, res: Response): void;
}
