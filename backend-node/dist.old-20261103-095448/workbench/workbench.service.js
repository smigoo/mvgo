"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WorkbenchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkbenchService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const backend_root_1 = require("../config/backend-root");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const conversation_schema_1 = require("./conversation.schema");
const group_schema_1 = require("./group.schema");
const workbench_agent_1 = require("./workbench-agent");
const tasks_service_1 = require("../tasks/tasks.service");
const component_service_1 = require("../component/component.service");
const task_stats_service_1 = require("../task-stats/task-stats.service");
const demo_service_1 = require("../demo/demo.service");
const api_binding_service_1 = require("../vue3/api-binding.service");
const slot_analyzer_service_1 = require("../vue3/slot-analyzer.service");
const apifox_service_1 = require("../apifox/apifox.service");
const workflow_service_1 = require("../workflow/workflow.service");
const gitlab_push_service_1 = require("../component/gitlab-push.service");
const user_ai_config_service_1 = require("../config/user-ai-config.service");
const figma_token_projection_1 = require("../config/figma-token-projection");
const phase2_service_1 = require("../phase2/phase2.service");
const lite_service_1 = require("../lite/lite.service");
const task_queue_service_1 = require("../queue/task-queue.service");
const progress_service_1 = require("../progress/progress.service");
const component_analysis_service_1 = require("../component/component-analysis.service");
const task_code_snapshot_service_1 = require("../tasks/task-code-snapshot.service");
let WorkbenchService = WorkbenchService_1 = class WorkbenchService {
    conversationModel;
    groupModel;
    tasksService;
    componentService;
    taskStatsService;
    demoService;
    apiBindingService;
    slotAnalyzer;
    apifoxService;
    workflowService;
    gitlabPushService;
    userAiConfigService;
    phase2Service;
    liteService;
    queueService;
    progressService;
    componentAnalysisService;
    taskCodeSnapshotService;
    logger = new common_1.Logger(WorkbenchService_1.name);
    constructor(conversationModel, groupModel, tasksService, componentService, taskStatsService, demoService, apiBindingService, slotAnalyzer, apifoxService, workflowService, gitlabPushService, userAiConfigService, phase2Service, liteService, queueService, progressService, componentAnalysisService, taskCodeSnapshotService) {
        this.conversationModel = conversationModel;
        this.groupModel = groupModel;
        this.tasksService = tasksService;
        this.componentService = componentService;
        this.taskStatsService = taskStatsService;
        this.demoService = demoService;
        this.apiBindingService = apiBindingService;
        this.slotAnalyzer = slotAnalyzer;
        this.apifoxService = apifoxService;
        this.workflowService = workflowService;
        this.gitlabPushService = gitlabPushService;
        this.userAiConfigService = userAiConfigService;
        this.phase2Service = phase2Service;
        this.liteService = liteService;
        this.queueService = queueService;
        this.progressService = progressService;
        this.componentAnalysisService = componentAnalysisService;
        this.taskCodeSnapshotService = taskCodeSnapshotService;
    }
    async createConversation(userId, title) {
        const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const conversation = new this.conversationModel({
            conversationId,
            userId: new mongoose_2.Types.ObjectId(userId),
            title: title || '新对话',
            messages: [],
            context: {},
            lastActiveAt: new Date(),
            messageCount: 0,
        });
        await conversation.save();
        this.logger.log(`Created conversation: ${conversationId}`);
        return conversation;
    }
    async listConversations(userId, limit = 20) {
        return this.conversationModel
            .find({
            $or: [
                { userId: new mongoose_2.Types.ObjectId(userId) },
            ],
        })
            .sort({ lastActiveAt: -1 })
            .limit(limit)
            .select('-messages')
            .lean();
    }
    async getConversation(conversationId, userId) {
        return this.conversationModel
            .findOne({
            conversationId,
            $or: [
                { userId: new mongoose_2.Types.ObjectId(userId) },
            ],
        })
            .lean();
    }
    async sendMessage(conversationId, userId, content, attachments, pendingToolCall) {
        const conversation = await this.conversationModel.findOne({
            conversationId,
            userId: new mongoose_2.Types.ObjectId(userId),
        });
        if (!conversation) {
            throw new Error('对话不存在或无权访问');
        }
        const userMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role: 'user',
            content,
            cards: [],
            createdAt: new Date(),
            metadata: { attachments, pendingToolCall },
        };
        conversation.messages.push(userMessage);
        conversation.messageCount++;
        conversation.lastActiveAt = new Date();
        let gitlabToken;
        let gitlabProjectUrl;
        let userAiConfig = {};
        try {
            const creds = conversation.toolCredentials || {};
            const userConfig = await this.userAiConfigService.getUserConfig(userId);
            userAiConfig = userConfig || {};
            const userCfg = userAiConfig;
            gitlabToken = creds.gitlabToken || userCfg.gitlabToken;
            gitlabProjectUrl = creds.gitlabProjectUrl || userCfg.gitlabProjectUrl;
        }
        catch (err) {
            this.logger.warn(`读取用户 AI 配置失败（降级为未配置）: ${err?.message}`);
        }
        const toolContext = {
            userId,
            tasksService: this.tasksService,
            componentService: this.componentService,
            taskStatsService: this.taskStatsService,
            demoService: this.demoService,
            apiBindingService: this.apiBindingService,
            slotAnalyzer: this.slotAnalyzer,
            apifoxService: this.apifoxService,
            workflowService: this.workflowService,
            gitlabPushService: this.gitlabPushService,
            phase2Service: this.phase2Service,
            liteService: this.liteService,
            queueService: this.queueService,
            progressService: this.progressService,
            componentAnalysisService: this.componentAnalysisService,
            taskCodeSnapshotService: this.taskCodeSnapshotService,
            gitlabToken: gitlabToken || undefined,
            gitlabProjectUrl: gitlabProjectUrl || undefined,
        };
        this.logger.log(`Running agent for conversation=${conversationId}`);
        const agentMessages = conversation.messages.map(m => ({
            role: m.role,
            content: m.content,
            cards: m.cards,
            metadata: m.metadata,
        }));
        const agentResult = await (0, workbench_agent_1.runWorkbenchAgent)({
            conversationId,
            userId,
            messages: agentMessages,
            currentComponentId: conversation.currentComponentId,
            toolContext,
            llmConfig: userAiConfig,
        });
        if (agentResult.currentComponentId) {
            conversation.currentComponentId = agentResult.currentComponentId;
        }
        const assistantMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            content: agentResult.response,
            cards: agentResult.cards,
            createdAt: new Date(),
        };
        conversation.messages.push(assistantMessage);
        conversation.messageCount++;
        if (conversation.messageCount <= 2) {
            conversation.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
        }
        await conversation.save();
        this.logger.log(`Message sent, conversation=${conversationId}, messageCount=${conversation.messageCount}`);
        const updatedConversation = await this.getConversation(conversationId, userId);
        if (!updatedConversation) {
            throw new Error('对话保存后无法读取，请重试');
        }
        return {
            userMessage,
            assistantMessage,
            conversation: updatedConversation,
        };
    }
    async deleteConversation(conversationId, userId) {
        const result = await this.conversationModel.deleteOne({
            conversationId,
            userId: new mongoose_2.Types.ObjectId(userId),
        });
        return result.deletedCount > 0;
    }
    async updateContext(conversationId, userId, context) {
        return this.conversationModel
            .findOneAndUpdate({
            conversationId,
            userId: new mongoose_2.Types.ObjectId(userId),
        }, {
            $set: {
                context,
                lastActiveAt: new Date(),
            },
        }, { new: true })
            .lean();
    }
    async searchConversations(userId, query, limit = 10) {
        return this.conversationModel
            .find({
            userId: new mongoose_2.Types.ObjectId(userId),
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { 'messages.content': { $regex: query, $options: 'i' } },
            ],
        })
            .sort({ lastActiveAt: -1 })
            .limit(limit)
            .select('-messages')
            .lean();
    }
    async getConversationStats(userId) {
        const conversations = await this.conversationModel
            .find({ userId: new mongoose_2.Types.ObjectId(userId) })
            .lean();
        const totalConversations = conversations.length;
        const totalMessages = conversations.reduce((sum, c) => sum + (c.messageCount || 0), 0);
        const avgMessagesPerConversation = totalConversations > 0 ? totalMessages / totalConversations : 0;
        const dayCounts = {};
        for (const conv of conversations) {
            const day = new Date(conv.lastActiveAt).toISOString().split('T')[0];
            dayCounts[day] = (dayCounts[day] || 0) + (conv.messageCount || 0);
        }
        const mostActiveDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        return {
            totalConversations,
            totalMessages,
            avgMessagesPerConversation: Math.round(avgMessagesPerConversation * 10) / 10,
            mostActiveDay,
        };
    }
    async renameConversation(conversationId, userId, title) {
        return this.conversationModel
            .findOneAndUpdate({
            conversationId,
            userId: new mongoose_2.Types.ObjectId(userId),
        }, {
            $set: {
                title,
                lastActiveAt: new Date(),
            },
        }, { new: true })
            .lean();
    }
    async batchDeleteConversations(conversationIds, userId) {
        const result = await this.conversationModel.deleteMany({
            conversationId: { $in: conversationIds },
            userId: new mongoose_2.Types.ObjectId(userId),
        });
        this.logger.log(`Batch deleted ${result.deletedCount} conversations for user ${userId}`);
        return { deletedCount: result.deletedCount };
    }
    async moveToGroup(conversationIds, userId, group) {
        const result = await this.conversationModel.updateMany({
            conversationId: { $in: conversationIds },
            userId: new mongoose_2.Types.ObjectId(userId),
        }, {
            $set: {
                group: group || undefined,
                lastActiveAt: new Date(),
            },
        });
        this.logger.log(`Moved ${result.modifiedCount} conversations to group "${group}" for user ${userId}`);
        return { modifiedCount: result.modifiedCount };
    }
    async getGroups(userId) {
        const uid = new mongoose_2.Types.ObjectId(userId);
        const groupDocs = await this.groupModel.find({ userId: uid }).lean();
        const usedGroups = await this.conversationModel.aggregate([
            { $match: { userId: uid, group: { $ne: null } } },
            { $group: { _id: '$group', count: { $sum: 1 } } },
        ]);
        const counts = new Map();
        for (const g of usedGroups) {
            if (g._id)
                counts.set(g._id, g.count);
        }
        const names = new Set();
        for (const doc of groupDocs)
            names.add(doc.name);
        for (const name of counts.keys())
            names.add(name);
        return [...names]
            .map(name => ({ name, count: counts.get(name) ?? 0 }))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    }
    async createGroup(userId, name) {
        const uid = new mongoose_2.Types.ObjectId(userId);
        const trimmed = (name || '').trim();
        if (!trimmed) {
            throw new Error('分组名称不能为空');
        }
        const existing = await this.groupModel.findOne({ userId: uid, name: trimmed }).lean();
        if (existing) {
            throw new Error(`分组「${trimmed}」已存在`);
        }
        await this.groupModel.create({ userId: uid, name: trimmed, order: 0 });
        this.logger.log(`Created group "${trimmed}" for user ${userId}`);
        return { name: trimmed, count: 0 };
    }
    async renameGroup(userId, oldName, newName) {
        const uid = new mongoose_2.Types.ObjectId(userId);
        const trimmed = (newName || '').trim();
        if (!trimmed) {
            throw new Error('分组名称不能为空');
        }
        if (trimmed === oldName) {
            return { modifiedCount: 0 };
        }
        const conflict = await this.groupModel.findOne({ userId: uid, name: trimmed }).lean();
        if (conflict) {
            throw new Error(`分组「${trimmed}」已存在`);
        }
        await this.groupModel.updateOne({ userId: uid, name: oldName }, { $set: { name: trimmed } });
        const result = await this.conversationModel.updateMany({ userId: uid, group: oldName }, { $set: { group: trimmed } });
        this.logger.log(`Renamed group "${oldName}" -> "${trimmed}" for user ${userId}, moved ${result.modifiedCount} conversations`);
        return { modifiedCount: result.modifiedCount };
    }
    async deleteGroup(userId, name, force = false) {
        const uid = new mongoose_2.Types.ObjectId(userId);
        const conversationCount = await this.conversationModel.countDocuments({
            userId: uid,
            group: name,
        });
        if (conversationCount > 0 && !force) {
            throw new Error(`分组「${name}」内还有 ${conversationCount} 个对话，不能删除。请先把对话移出分组。`);
        }
        await this.groupModel.deleteOne({ userId: uid, name });
        this.logger.log(`Deleted group "${name}" for user ${userId} (conversations=${conversationCount}, force=${force})`);
        return { deletedConversations: conversationCount };
    }
    async getToolCredentials(conversationId, userId) {
        const conversation = await this.conversationModel
            .findOne({
            conversationId,
            userId: new mongoose_2.Types.ObjectId(userId),
        })
            .select('toolCredentials')
            .lean();
        if (!conversation)
            return null;
        const creds = conversation.toolCredentials || {};
        const userConfig = await this.userAiConfigService.getUserConfig(userId);
        const userCfg = (0, figma_token_projection_1.applyFigmaTokenProjection)(userConfig || {});
        const figmaToken = creds.figmaToken || userCfg.figmaToken;
        const apifoxToken = creds.apifoxToken || userCfg.apifoxToken;
        const gitlabToken = creds.gitlabToken || userCfg.gitlabToken;
        const gitlabProjectUrl = creds.gitlabProjectUrl || userCfg.gitlabProjectUrl;
        return {
            figmaToken: !!figmaToken,
            apifoxToken: !!apifoxToken,
            gitlabToken: !!gitlabToken,
            gitlabProjectUrl: !!gitlabProjectUrl,
        };
    }
    async updateToolCredentials(conversationId, userId, credentials) {
        const conversation = await this.conversationModel.findOne({
            conversationId,
            userId: new mongoose_2.Types.ObjectId(userId),
        });
        if (!conversation)
            return null;
        const current = conversation.toolCredentials || {};
        const updated = { ...current };
        if (credentials.figmaToken !== undefined) {
            updated.figmaToken = credentials.figmaToken || undefined;
        }
        if (credentials.apifoxToken !== undefined) {
            updated.apifoxToken = credentials.apifoxToken || undefined;
        }
        if (credentials.gitlabToken !== undefined) {
            updated.gitlabToken = credentials.gitlabToken || undefined;
        }
        if (credentials.gitlabProjectUrl !== undefined) {
            updated.gitlabProjectUrl = credentials.gitlabProjectUrl || undefined;
        }
        conversation.toolCredentials = updated;
        conversation.lastActiveAt = new Date();
        await conversation.save();
        this.logger.log(`Updated tool credentials for conversation ${conversationId}`);
        return {
            figmaToken: !!updated.figmaToken,
            apifoxToken: !!updated.apifoxToken,
            gitlabToken: !!updated.gitlabToken,
            gitlabProjectUrl: !!updated.gitlabProjectUrl,
        };
    }
    async submitFeedback(body, userId) {
        const rating = body?.rating;
        if (rating !== 'up' && rating !== 'down') {
            return { success: false, error: '无效的反馈类型' };
        }
        const feedbackDir = (0, path_1.join)(backend_root_1.configDir, 'component-feedback');
        if (!(0, fs_1.existsSync)(feedbackDir))
            (0, fs_1.mkdirSync)(feedbackDir, { recursive: true });
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const filePath = (0, path_1.join)(feedbackDir, `feedback-${monthKey}.json`);
        let list = [];
        try {
            list = JSON.parse(await (0, promises_1.readFile)(filePath, 'utf-8'));
            if (!Array.isArray(list))
                list = [];
        }
        catch {
        }
        list.push({
            sessionId: String(body?.sessionId || '').slice(0, 200),
            componentName: String(body?.componentName || '').slice(0, 200),
            rating,
            comment: String(body?.comment || '').slice(0, 500),
            author: userId || 'anonymous',
            ts: Date.now(),
        });
        await (0, promises_1.writeFile)(filePath, JSON.stringify(list, null, 2), 'utf-8');
        this.logger.log(`📊 结果反馈 ${rating === 'up' ? '👍' : '👎'} #${list.length}: ${body?.componentName || body?.sessionId || '(匿名)'}`);
        return { success: true, data: { total: list.length } };
    }
    async clearComponentAnchor(conversationId, userId) {
        return this.conversationModel
            .findOneAndUpdate({
            conversationId,
            userId: new mongoose_2.Types.ObjectId(userId),
        }, {
            $set: {
                currentComponentId: undefined,
                lastActiveAt: new Date(),
            },
        }, { new: true })
            .lean();
    }
    async getFeedbackStats(userId, months = 1) {
        const feedbackDir = (0, path_1.join)(backend_root_1.configDir, 'component-feedback');
        const list = [];
        const now = new Date();
        for (let i = 0; i < Math.max(1, Math.min(months, 12)); i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const filePath = (0, path_1.join)(feedbackDir, `feedback-${monthKey}.json`);
            try {
                const parsed = JSON.parse(await (0, promises_1.readFile)(filePath, 'utf-8'));
                if (Array.isArray(parsed))
                    list.push(...parsed);
            }
            catch {
            }
        }
        const total = list.length;
        const up = list.filter((f) => f.rating === 'up').length;
        const down = list.filter((f) => f.rating === 'down').length;
        return {
            total,
            up,
            down,
            upRate: total > 0 ? Math.round((up / total) * 100) : 0,
            months,
        };
    }
};
exports.WorkbenchService = WorkbenchService;
exports.WorkbenchService = WorkbenchService = WorkbenchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(conversation_schema_1.Conversation.name)),
    __param(1, (0, mongoose_1.InjectModel)(group_schema_1.WorkbenchGroup.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        tasks_service_1.TasksService,
        component_service_1.ComponentService,
        task_stats_service_1.TaskStatsService,
        demo_service_1.DemoService,
        api_binding_service_1.ApiBindingService,
        slot_analyzer_service_1.SlotAnalyzerService,
        apifox_service_1.ApifoxService,
        workflow_service_1.WorkflowService,
        gitlab_push_service_1.GitlabPushService,
        user_ai_config_service_1.UserAiConfigService,
        phase2_service_1.Phase2Service,
        lite_service_1.LiteService,
        task_queue_service_1.TaskQueueService,
        progress_service_1.ProgressService,
        component_analysis_service_1.ComponentAnalysisService,
        task_code_snapshot_service_1.TaskCodeSnapshotService])
], WorkbenchService);
//# sourceMappingURL=workbench.service.js.map