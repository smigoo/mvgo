import { WorkbenchService } from './workbench.service';
export declare class WorkbenchController {
    private readonly workbenchService;
    constructor(workbenchService: WorkbenchService);
    createConversation(userId: string, body: {
        title?: string;
    }): Promise<{
        success: boolean;
        data: import("./conversation.schema").Conversation;
    }>;
    listConversations(userId: string, limit?: string): Promise<{
        success: boolean;
        data: import("./conversation.schema").Conversation[];
        count: number;
    }>;
    getConversation(conversationId: string, userId: string): Promise<{
        success: boolean;
        data: import("./conversation.schema").Conversation;
    }>;
    sendMessage(conversationId: string, userId: string, body: {
        content: string;
        attachments?: any[];
        pendingToolCall?: any;
    }): Promise<{
        success: boolean;
        data: {
            userMessage: import("./conversation.schema").Message;
            assistantMessage: import("./conversation.schema").Message;
            conversation: {
                conversationId: string;
                title: string;
                messageCount: number;
                lastActiveAt: Date;
                currentComponentId: string | undefined;
            };
        };
    }>;
    deleteConversation(conversationId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    updateContext(conversationId: string, userId: string, context: Record<string, any>): Promise<{
        success: boolean;
        data: import("./conversation.schema").Conversation;
    }>;
    searchConversations(userId: string, query: string, limit?: string): Promise<{
        success: boolean;
        data: import("./conversation.schema").Conversation[];
        count: number;
    }>;
    getStats(userId: string): Promise<{
        success: boolean;
        data: {
            totalConversations: number;
            totalMessages: number;
            avgMessagesPerConversation: number;
            mostActiveDay: string;
        };
    }>;
    renameConversation(conversationId: string, userId: string, body: {
        title: string;
    }): Promise<{
        success: boolean;
        data: import("./conversation.schema").Conversation;
    }>;
    batchDeleteConversations(userId: string, body: {
        conversationIds: string[];
    }): Promise<{
        success: boolean;
        data: {
            deletedCount: number;
        };
        message: string;
    }>;
    moveToGroup(userId: string, body: {
        conversationIds: string[];
        group: string | null;
    }): Promise<{
        success: boolean;
        data: {
            modifiedCount: number;
        };
        message: string;
    }>;
    getGroups(userId: string): Promise<{
        success: boolean;
        data: {
            name: string;
            count: number;
        }[];
    }>;
    createGroup(userId: string, body: {
        name: string;
    }): Promise<{
        success: boolean;
        data: {
            name: string;
            count: number;
        };
        message: string;
    }>;
    renameGroup(userId: string, name: string, body: {
        newName: string;
    }): Promise<{
        success: boolean;
        data: {
            modifiedCount: number;
        };
        message: string;
    }>;
    deleteGroup(userId: string, name: string, force?: string): Promise<{
        success: boolean;
        data: {
            deletedConversations: number;
        };
        message: string;
    }>;
    getToolCredentials(conversationId: string, userId: string): Promise<{
        success: boolean;
        data: {
            figmaToken: boolean;
            apifoxToken: boolean;
            gitlabToken: boolean;
            gitlabProjectUrl: boolean;
        };
    }>;
    updateToolCredentials(conversationId: string, userId: string, body: {
        figmaToken?: string;
        apifoxToken?: string;
        gitlabToken?: string;
        gitlabProjectUrl?: string;
    }): Promise<{
        success: boolean;
        data: {
            figmaToken: boolean;
            apifoxToken: boolean;
            gitlabToken: boolean;
            gitlabProjectUrl: boolean;
        };
        message: string;
    }>;
    submitFeedback(userId: string, body: {
        sessionId?: string;
        componentName?: string;
        rating?: 'up' | 'down';
        comment?: string;
    }): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    clearComponentAnchor(conversationId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getFeedbackStats(userId: string, months?: string): Promise<{
        success: boolean;
        data: {
            total: number;
            up: number;
            down: number;
            upRate: number;
            months: number;
        };
    }>;
}
