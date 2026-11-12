import type { Response } from 'express';
import { ComponentService } from './component.service';
import { GitlabPushService } from './gitlab-push.service';
import { ComponentAnalysisService } from './component-analysis.service';
import { Phase2Service } from '../phase2/phase2.service';
import { ListComponentsDto } from './dto/list-components.dto';
export declare class ComponentController {
    private readonly componentService;
    private readonly componentAnalysisService;
    private readonly phase2Service;
    private readonly gitlabPushService;
    private readonly logger;
    constructor(componentService: ComponentService, componentAnalysisService: ComponentAnalysisService, phase2Service: Phase2Service, gitlabPushService: GitlabPushService);
    createComponent(body: {
        name: string;
        description?: string;
        groupId: string;
        metadata?: any;
    }, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
        component: import("../schemas/component.schema").Component;
    }>;
    listComponents(query: ListComponentsDto, userId: string): Promise<{
        success: boolean;
        data: {
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
        };
    }>;
    getGroupComponents(groupId: string, userId: string): Promise<{
        success: boolean;
        components: import("../schemas/component.schema").Component[];
    }>;
    getComponentBySessionId(sessionId: string, userId: string | undefined): Promise<{
        success: boolean;
        component: import("../schemas/component.schema").Component;
    }>;
    listGitLabProjects(body: {
        accessToken: string;
    }): Promise<{
        success: boolean;
        data: {
            id: number;
            name: string;
            pathWithNamespace: string;
            httpUrlToRepo: string;
        }[];
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data: null;
    }>;
    listGitLabBranches(body: {
        accessToken: string;
        repoUrl: string;
    }): Promise<{
        success: boolean;
        data: {
            name: string;
            isDefault: boolean;
        }[];
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data: null;
    }>;
    proxyGitLabProjects(body: {
        accessToken: string;
        endpoint: string;
    }): Promise<any>;
    pushComponentToGitLab(body: {
        componentId: string;
        repoUrl: string;
        branch: string;
        accessToken: string;
        commitMessage?: string;
        commit?: {
            code: string;
            reqcode: string;
            type: 'feat' | 'fix' | 'refactor' | 'test' | 'word' | 'conf';
            note: string;
            aiCoding?: boolean;
        };
    }, userId: string): Promise<{
        success: boolean;
        message: string;
        data: {
            projectPath: string;
            branch: string;
            componentId: string;
            files: number;
            commitId: string;
            commitMessage: string;
            webUrl: string;
        };
    }>;
    getComponentById(componentId: string, userId: string): Promise<{
        success: boolean;
        component: import("../schemas/component.schema").Component;
    }>;
    updateComponent(componentId: string, body: {
        name: string;
        description?: string;
        metadata?: any;
    }, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
        component: import("../schemas/component.schema").Component;
    }>;
    deleteComponent(componentId: string, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
    }>;
    publishComponent(componentId: string, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
        data: {
            _id: any;
            visibility: "private" | "public" | undefined;
            sharedAt: Date | undefined;
        };
    }>;
    unpublishComponent(componentId: string, session: Record<string, any>): Promise<{
        success: boolean;
        message: string;
        data: {
            _id: any;
            visibility: "private" | "public" | undefined;
        };
    }>;
    batchDeleteComponents(body: {
        componentIds: string[];
    }, session: Record<string, any>): Promise<{
        deleted: number;
        failed: number;
        success: boolean;
        message: string;
    }>;
    getComponentFiles(componentId: string, userId: string | undefined): Promise<{
        success: boolean;
        files: any[];
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        files?: undefined;
    }>;
    getComponentDeclare(componentId: string, userId: string | undefined): Promise<{
        success: boolean;
        declare: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        declare?: undefined;
    }>;
    analyzeComponentVisual(componentId: string, userId: string, body: {
        visionApiKey?: string;
        visionBaseURL?: string;
        visionModel?: string;
    }): Promise<{
        success: boolean;
        component: {
            id: string;
            componentId: string;
            name: string;
            target: string;
            groupId: string;
        };
        figma: {
            fileKey: any;
            nodeId: any;
            previewPath: string;
        };
        runtime: {
            status: any;
            pass: boolean;
            summary: string;
            issues: any;
            previewUrl: any;
        };
        visual: {
            available: boolean;
            overallSimilarity: any;
            pass: boolean;
            summary: string;
            issues: {
                severity: "high" | "medium" | "low";
                category: string;
                region: string;
                description: string;
                suggestion: string;
            }[];
        };
        recommendation: {
            nextStep: string;
            rationale: string;
        };
    }>;
    getFileContent(componentId: string, filePath: string, raw: string, session: Record<string, any>, res: Response): Promise<void | Response<any, Record<string, any>>>;
    saveFileContent(componentId: string, filePath: string, content: string, userId: string): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
    }>;
    deleteComponentFile(componentId: string, filePath: string, userId: string): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
    }>;
    renameComponentFile(componentId: string, oldPath: string, newPath: string, userId: string): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
    }>;
    createComponentFolder(componentId: string, folderPath: string, userId: string): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
    }>;
    downloadComponent(componentId: string, userId: string | undefined, res: Response): Promise<void>;
}
