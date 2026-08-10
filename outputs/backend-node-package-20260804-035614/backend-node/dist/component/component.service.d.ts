import { Model } from 'mongoose';
import { Component, ComponentDocument } from '../schemas/component.schema';
import { GroupMemberDocument } from '../schemas/group-member.schema';
import { ListComponentsDto } from './dto/list-components.dto';
import { TasksService } from '../tasks/tasks.service';
export declare class ComponentService {
    private componentModel;
    private groupMemberModel;
    private readonly tasksService;
    constructor(componentModel: Model<ComponentDocument>, groupMemberModel: Model<GroupMemberDocument>, tasksService: TasksService);
    createComponent(name: string, description: string, groupId: string, creatorId: string, metadata: any): Promise<Component>;
    getGroupComponents(groupId: string, userId?: string): Promise<Component[]>;
    listComponents(query: ListComponentsDto, userId?: string): Promise<{
        components: {
            _id: any;
            componentId: any;
            taskId: any;
            target: any;
            name: any;
            groupId: any;
            creatorId: any;
            qualityGate: any;
            qualityScore: any;
            runtimePass: any;
            visualPass: any;
            previewUrl: string | undefined;
            metadata: {
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
    private toLibraryListItem;
    private extractComponentQuality;
    private buildStandardPreviewUrl;
    getComponentById(componentId: string, userId?: string): Promise<Component>;
    getComponentBySessionId(sessionId: string, userId?: string): Promise<Component>;
    private resolveAuthorizedComponent;
    authorizeWorkspaceComponent(identifier: string, userId: string, mode?: 'read' | 'write'): Promise<{
        component?: ComponentDocument;
        componentId: string;
        groupId?: string;
        target?: string;
    }>;
    updateComponent(componentId: string, name: string, description: string, metadata: any, userId: string): Promise<Component>;
    deleteComponent(componentId: string, userId: string): Promise<void>;
    batchDeleteComponents(componentIds: string[], userId: string): Promise<{
        deleted: number;
        failed: number;
    }>;
    private checkGroupMembership;
    private checkComponentPermission;
    private checkComponentAccess;
    private resolveComponentBaseDirs;
    private resolveSafeFilePath;
    getComponentFiles(componentId: string, userId?: string): Promise<any[]>;
    private traverseDirectory;
    private normalizeVue3Entry;
    resolveComponentFilePath(componentId: string, filePath: string, userId?: string): Promise<string>;
    getFileContent(componentId: string, filePath: string, userId?: string): Promise<string>;
    saveFileContent(componentId: string, filePath: string, content: string, userId?: string): Promise<void>;
    getComponentDeclare(componentId: string, userId?: string): Promise<any>;
}
