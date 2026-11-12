import { StreamableFile } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ListComponentsDto } from '../component/dto/list-components.dto';
import { SetUserAdminDto } from './dto/set-user-admin.dto';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    listAiConfigs(userId: string): Promise<{
        success: boolean;
        list: any[];
        total: number;
    }>;
    listUsers(userId: string): Promise<{
        success: boolean;
        list: any[];
        total: number;
    }>;
    setUserAdmin(userId: string, id: string, body: SetUserAdminDto): Promise<{
        success: boolean;
    }>;
    deleteUser(userId: string, id: string): Promise<{
        deletedComponents: number;
        cleanedCollections: string[];
        success: boolean;
    }>;
    listComponents(userId: string, query: ListComponentsDto): Promise<{
        components: {
            _id: any;
            componentId: any;
            taskId: any;
            target: any;
            name: any;
            groupId: any;
            groupName: any;
            creatorId: any;
            visibility: any;
            sharedAt: any;
            sharedBy: any;
            qualityGate: any;
            qualityScore: any;
            runtimePass: any;
            visualPass: any;
            previewUrl: string | undefined;
            metadata: {
                figmaHeight?: number | undefined;
                figmaWidth?: number | undefined;
                componentId: any;
                sessionId: any;
                target: any;
                type: any;
            };
            createdAt: any;
            updatedAt: any;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        success: boolean;
    }>;
    usageExport(userId: string, preset?: string, from?: string, to?: string, dept?: string, format?: string): Promise<StreamableFile>;
    deptReport(userId: string): Promise<StreamableFile>;
}
