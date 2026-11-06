import { Model } from 'mongoose';
import { Conversation, ConversationDocument, Message } from './conversation.schema';
import { WorkbenchGroupDocument } from './group.schema';
import { TasksService } from '../tasks/tasks.service';
import { ComponentService } from '../component/component.service';
import { TaskStatsService } from '../task-stats/task-stats.service';
import { DemoService } from '../demo/demo.service';
import { ApiBindingService } from '../vue3/api-binding.service';
import { SlotAnalyzerService } from '../vue3/slot-analyzer.service';
import { ApifoxService } from '../apifox/apifox.service';
import { WorkflowService } from '../workflow/workflow.service';
import { GitlabPushService } from '../component/gitlab-push.service';
import { UserAiConfigService } from '../config/user-ai-config.service';
import { Phase2Service } from '../phase2/phase2.service';
import { LiteService } from '../lite/lite.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { ProgressService } from '../progress/progress.service';
import { ComponentAnalysisService } from '../component/component-analysis.service';
import { TaskCodeSnapshotService } from '../tasks/task-code-snapshot.service';
export declare class WorkbenchService {
    private readonly conversationModel;
    private readonly groupModel;
    private readonly tasksService;
    private readonly componentService;
    private readonly taskStatsService;
    private readonly demoService;
    private readonly apiBindingService;
    private readonly slotAnalyzer;
    private readonly apifoxService;
    private readonly workflowService;
    private readonly gitlabPushService;
    private readonly userAiConfigService;
    private readonly phase2Service;
    private readonly liteService;
    private readonly queueService;
    private readonly progressService;
    private readonly componentAnalysisService;
    private readonly taskCodeSnapshotService;
    private readonly logger;
    constructor(conversationModel: Model<ConversationDocument>, groupModel: Model<WorkbenchGroupDocument>, tasksService: TasksService, componentService: ComponentService, taskStatsService: TaskStatsService, demoService: DemoService, apiBindingService: ApiBindingService, slotAnalyzer: SlotAnalyzerService, apifoxService: ApifoxService, workflowService: WorkflowService, gitlabPushService: GitlabPushService, userAiConfigService: UserAiConfigService, phase2Service: Phase2Service, liteService: LiteService, queueService: TaskQueueService, progressService: ProgressService, componentAnalysisService: ComponentAnalysisService, taskCodeSnapshotService: TaskCodeSnapshotService);
    createConversation(userId: string, title?: string): Promise<Conversation>;
    listConversations(userId: string, limit?: number): Promise<Conversation[]>;
    getConversation(conversationId: string, userId: string): Promise<Conversation | null>;
    sendMessage(conversationId: string, userId: string, content: string, attachments?: any[], pendingToolCall?: any): Promise<{
        userMessage: Message;
        assistantMessage: Message;
        conversation: Conversation;
    }>;
    deleteConversation(conversationId: string, userId: string): Promise<boolean>;
    updateContext(conversationId: string, userId: string, context: Record<string, any>): Promise<Conversation | null>;
    searchConversations(userId: string, query: string, limit?: number): Promise<Conversation[]>;
    getConversationStats(userId: string): Promise<{
        totalConversations: number;
        totalMessages: number;
        avgMessagesPerConversation: number;
        mostActiveDay: string;
    }>;
    renameConversation(conversationId: string, userId: string, title: string): Promise<Conversation | null>;
    batchDeleteConversations(conversationIds: string[], userId: string): Promise<{
        deletedCount: number;
    }>;
    moveToGroup(conversationIds: string[], userId: string, group: string | null): Promise<{
        modifiedCount: number;
    }>;
    getGroups(userId: string): Promise<{
        name: string;
        count: number;
    }[]>;
    createGroup(userId: string, name: string): Promise<{
        name: string;
        count: number;
    }>;
    renameGroup(userId: string, oldName: string, newName: string): Promise<{
        modifiedCount: number;
    }>;
    deleteGroup(userId: string, name: string, force?: boolean): Promise<{
        deletedConversations: number;
    }>;
    getToolCredentials(conversationId: string, userId: string): Promise<{
        figmaToken: boolean;
        apifoxToken: boolean;
        gitlabToken: boolean;
        gitlabProjectUrl: boolean;
    } | null>;
    updateToolCredentials(conversationId: string, userId: string, credentials: {
        figmaToken?: string;
        apifoxToken?: string;
        gitlabToken?: string;
        gitlabProjectUrl?: string;
    }): Promise<{
        figmaToken: boolean;
        apifoxToken: boolean;
        gitlabToken: boolean;
        gitlabProjectUrl: boolean;
    } | null>;
    submitFeedback(body: {
        sessionId?: string;
        componentName?: string;
        rating?: 'up' | 'down';
        comment?: string;
    }, userId?: string): Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;
    clearComponentAnchor(conversationId: string, userId: string): Promise<Conversation | null>;
    getFeedbackStats(userId: string, months?: number): Promise<{
        total: number;
        up: number;
        down: number;
        upRate: number;
        months: number;
    }>;
}
