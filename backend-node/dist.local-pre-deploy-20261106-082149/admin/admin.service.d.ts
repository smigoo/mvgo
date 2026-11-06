import { Model } from 'mongoose';
import { UserDocument } from '../schemas/user.schema';
import { ComponentDocument } from '../schemas/component.schema';
import { UserAiConfigService } from '../config/user-ai-config.service';
import { ComponentService } from '../component/component.service';
import { PermissionAdapter } from '../auth/permission-adapter.interface';
import { QuotaService } from '../quota/quota.service';
export interface UserStat {
    componentCount: number;
    taskCount: number;
    apiTaskCount: number;
    apiCount: number;
    componentByType: Record<string, number>;
    durationSampleCount: number;
    durationP50Ms: number | null;
    durationP90Ms: number | null;
    durationMs: number[];
    usedTextModels: Record<string, number>;
    usedVisionModels: Record<string, number>;
}
export declare class AdminService {
    private readonly userAiConfigService;
    private readonly componentService;
    private readonly permissionAdapter;
    private readonly userModel;
    private readonly quotaService;
    private readonly groupModel;
    private readonly groupMemberModel;
    private readonly joinRequestModel;
    private readonly gitCredentialModel;
    private readonly documentModel;
    private readonly sessionModel;
    private readonly projectModel;
    private readonly skillModel;
    private readonly docModel;
    private readonly componentModel;
    private readonly logger;
    constructor(userAiConfigService: UserAiConfigService, componentService: ComponentService, permissionAdapter: PermissionAdapter, userModel: Model<UserDocument>, quotaService: QuotaService, groupModel: Model<any>, groupMemberModel: Model<any>, joinRequestModel: Model<any>, gitCredentialModel: Model<any>, documentModel: Model<any>, sessionModel: Model<any>, projectModel: Model<any>, skillModel: Model<any>, docModel: Model<any>, componentModel: Model<ComponentDocument>);
    assertAdmin(userId: string): Promise<void>;
    setUserAdmin(id: string, isAdmin: boolean): Promise<void>;
    listUserConfigs(): Promise<any[]>;
    listUsers(): Promise<any[]>;
    listUserStats(): Promise<Record<string, UserStat>>;
    buildUsageExport(query: {
        preset?: string;
        from?: string;
        to?: string;
        dept?: string;
        format?: string;
    }): Promise<{
        filename: string;
        contentType: string;
        body: string;
    }>;
    listComponents(query: any): Promise<{
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
    }>;
    deleteUser(operatorId: string, targetId: string): Promise<{
        deletedComponents: number;
        cleanedCollections: string[];
    }>;
    buildDeptReport(): Promise<{
        filename: string;
        contentType: string;
        body: string;
    }>;
}
