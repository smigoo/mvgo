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
var Vue3Service_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vue3Service = void 0;
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("../tasks/tasks.service");
const progress_service_1 = require("../progress/progress.service");
const component_service_1 = require("../component/component.service");
const token_tracker_service_1 = require("../token-usage/token-tracker.service");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const mongoose_1 = require("@nestjs/mongoose");
const workspace_config_1 = require("../config/workspace.config");
const config_service_1 = require("../config/config.service");
const mongoose_2 = require("mongoose");
const group_member_schema_1 = require("../schemas/group-member.schema");
const mongoose_3 = require("mongoose");
const quota_service_1 = require("../quota/quota.service");
let Vue3Service = Vue3Service_1 = class Vue3Service {
    tasksService;
    progressService;
    componentService;
    tokenTrackerService;
    aiConfigService;
    quotaService;
    groupMemberModel;
    logger = new common_1.Logger(Vue3Service_1.name);
    constructor(tasksService, progressService, componentService, tokenTrackerService, aiConfigService, quotaService, groupMemberModel) {
        this.tasksService = tasksService;
        this.progressService = progressService;
        this.componentService = componentService;
        this.tokenTrackerService = tokenTrackerService;
        this.aiConfigService = aiConfigService;
        this.quotaService = quotaService;
        this.groupMemberModel = groupMemberModel;
    }
    async startGeneration(sessionId, dto, groupId, userId) {
        const { componentName, fileKey, nodeId, componentId, config = {}, panelType, requirementDoc, docAnalysis, } = dto;
        const finalComponentName = componentName || sessionId;
        const folderName = componentName && componentName !== sessionId
            ? `${sessionId}-${finalComponentName}`
            : sessionId;
        const tempRoot = (0, path_1.join)(process.cwd(), '..', 'temp-components', groupId, folderName);
        const outputPath = config.outputPath || tempRoot;
        const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
            ...config,
            outputPath,
            target: 'vue3',
            panelType: panelType || 'default-panel',
        });
        this.tasksService.createTask(sessionId, {
            configSnapshot,
            componentId: sessionId,
            groupId,
            componentName: finalComponentName,
            nodeId,
            fileKey,
            target: 'vue3',
            outputPath,
            checkpointStatus: 'none',
            panelKey: panelType || 'default-panel',
            taskType: 'component',
            userId,
        });
        this.executeGeneration(sessionId, {
            componentName: finalComponentName,
            fileKey,
            nodeId,
            outputPath,
            config,
            groupId,
            userId,
            panelType,
            requirementDoc,
            docAnalysis,
        }).catch((error) => {
            this.logger.error(`Vue3 generation failed: ${error.message}`, error.stack);
            this.progressService.sendError(sessionId, {
                message: error.message,
                stack: error.stack,
            });
        });
    }
    async executeGeneration(sessionId, params) {
        let outputPath;
        let componentName;
        let genResult;
        let genError;
        try {
            const { componentName: name, fileKey, nodeId, outputPath: path, config, panelType, } = params;
            outputPath = path;
            componentName = name;
            const graphModule = await import('../ai-engine/graphs/mc-component-graph-vue3.js');
            const { runVue3Generation } = graphModule;
            const aiDefaultsModule = await import('../ai-engine/utils/ai-defaults.js');
            const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;
            this.logger.log(`Starting Vue3 generation for session ${sessionId}`);
            const effectiveFigmaToken = this.resolveFigmaToken(config?.figmaToken);
            genResult = await runVue3Generation({
                componentName,
                fileKey,
                nodeId,
                outputPath,
                panelType: panelType || 'default-panel',
                figmaToken: effectiveFigmaToken,
                visionAIConfig: resolveVisionConfig(config),
                textAIConfig: resolveTextConfig(config),
                aiConfig: {
                    apiKey: config.aiApiKey || process.env.ANTHROPIC_API_KEY,
                    baseURL: config.aiBaseURL || process.env.ANTHROPIC_BASE_URL,
                    model: config.aiModel || process.env.ANTHROPIC_MODEL,
                },
                sessionId,
                groupId: params.groupId,
                onProgress: (data) => {
                    this.progressService.sendProgress(sessionId, data);
                },
                onTokenUsageRecord: (data) => {
                    this.tokenTrackerService.recordUsage(data);
                },
                pauseChecker: async () => {
                    const task = this.tasksService.getTask(sessionId);
                    return task?.status || 'running';
                },
            });
            await this.ensurePreviewImage(outputPath, fileKey, nodeId, effectiveFigmaToken);
        }
        catch (error) {
            this.logger.error(`Vue3 generation failed for session ${sessionId}: ${error.message}`);
            genError = error;
        }
        finally {
            if (genError) {
                this.progressService.sendError(sessionId, genError);
            }
            else {
                this.progressService.sendComplete(sessionId, {
                    ...genResult,
                    taskId: sessionId,
                    componentId: sessionId,
                    groupId: params.groupId,
                    target: 'vue3',
                });
                if (params.userId) {
                    this.quotaService.recordSuccess(params.userId, 'vue3');
                }
            }
            ;
            (async () => {
                if (genError)
                    return;
                const hasEntry = !!outputPath && (0, fs_1.existsSync)((0, path_1.join)(outputPath, 'package', 'index.vue'));
                if (!outputPath || !componentName || !hasEntry) {
                    this.logger.warn(`Skip preview artifacts for ${sessionId}: package/index.vue not found (generation incomplete)`);
                    return;
                }
                try {
                    await this.copyToWorkspaceVue3(outputPath, sessionId, params.groupId);
                    if (params.requirementDoc || params.docAnalysis) {
                        await this.saveComponentMeta(sessionId, params.groupId, params.requirementDoc, params.docAnalysis);
                    }
                }
                catch (postErr) {
                    this.logger.warn(`Preview post-processing failed for ${sessionId}: ${postErr.message}`);
                }
                try {
                    let resolvedCreatorId = params.userId;
                    let resolvedGroupId = params.groupId;
                    if (!resolvedCreatorId && resolvedGroupId) {
                        const firstMember = await this.groupMemberModel
                            .findOne({ groupId: resolvedGroupId })
                            .exec();
                        if (firstMember) {
                            resolvedCreatorId = firstMember.userId.toString();
                            this.logger.log(`Resolved creatorId to ${resolvedCreatorId} from group membership`);
                        }
                    }
                    if (!mongoose_3.Types.ObjectId.isValid(resolvedGroupId)) {
                        this.logger.warn(`groupId "${resolvedGroupId}" is not a valid ObjectId, resolving from user memberships...`);
                        if (resolvedCreatorId) {
                            const membership = await this.groupMemberModel
                                .findOne({ userId: resolvedCreatorId })
                                .exec();
                            if (membership) {
                                resolvedGroupId = membership.groupId.toString();
                                this.logger.log(`Resolved groupId to ${resolvedGroupId} from user membership`);
                            }
                        }
                    }
                    if (!mongoose_3.Types.ObjectId.isValid(resolvedGroupId)) {
                        throw new Error(`Cannot resolve groupId "${resolvedGroupId}" — no valid group found`);
                    }
                    if (!resolvedCreatorId) {
                        this.logger.warn(`No creator found for ${sessionId}, using groupId as fallback`);
                        resolvedCreatorId = resolvedGroupId;
                    }
                    let figmaWidth;
                    let figmaHeight;
                    try {
                        const cachePath = (0, path_1.join)(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
                        if ((0, fs_1.existsSync)(cachePath)) {
                            const cacheRaw = await (0, promises_1.readFile)(cachePath, 'utf-8');
                            const cacheData = JSON.parse(cacheRaw);
                            const doc = cacheData.document || cacheData;
                            const bbox = doc?.absoluteBoundingBox;
                            if (bbox?.width && bbox?.height) {
                                figmaWidth = Math.round(bbox.width);
                                figmaHeight = Math.round(bbox.height);
                            }
                        }
                    }
                    catch {
                    }
                    await this.componentService.createComponent(componentName, componentName || 'Vue3 生成组件', resolvedGroupId, resolvedCreatorId, {
                        type: 'vue3',
                        target: 'vue3',
                        taskId: sessionId,
                        componentId: sessionId,
                        sessionId,
                        figmaFileKey: params.fileKey,
                        figmaNodeId: params.nodeId,
                        ...(figmaWidth ? { figmaWidth } : {}),
                        ...(figmaHeight ? { figmaHeight } : {}),
                    });
                    this.logger.log(`Component record saved to database: ${componentName} (sessionId: ${sessionId})`);
                }
                catch (error) {
                    this.logger.warn(`Failed to save component to database: ${error.message}`);
                }
            })().catch((err) => {
                this.logger.error(`Post-processing unhandled error for ${sessionId}: ${err.message}`, err.stack);
            });
        }
    }
    async copyToWorkspaceVue3(outputPath, sessionId, groupId) {
        try {
            const packageDir = (0, path_1.join)(outputPath, 'package');
            const resourcesDir = (0, path_1.join)(outputPath, 'resources');
            const backendWsPath = (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', groupId, sessionId);
            const frontendWsPath = (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, sessionId);
            if (!(0, fs_1.existsSync)((0, path_1.join)(packageDir, 'index.vue'))) {
                this.logger.error(`Vue3 入口缺失: ${(0, path_1.join)(packageDir, 'index.vue')}`);
                return;
            }
            for (const targetPath of [backendWsPath, frontendWsPath]) {
                await (0, promises_1.mkdir)(targetPath, { recursive: true });
                for (const legacy of [
                    (0, path_1.join)(targetPath, 'index.vue'),
                    (0, path_1.join)(targetPath, 'components'),
                    (0, path_1.join)(targetPath, 'package', 'resources'),
                ]) {
                    if ((0, fs_1.existsSync)(legacy)) {
                        try {
                            const { rm } = await import('fs/promises');
                            await rm(legacy, { recursive: true, force: true });
                        }
                        catch { }
                    }
                }
                await (0, promises_1.cp)(packageDir, (0, path_1.join)(targetPath, 'package'), { recursive: true });
                if ((0, fs_1.existsSync)(resourcesDir)) {
                    await (0, promises_1.cp)(resourcesDir, (0, path_1.join)(targetPath, 'resources'), { recursive: true });
                }
            }
            this.logger.log(`Vue3 component copied to workspace: ${groupId}/${sessionId} (package/index.vue + resources)`);
        }
        catch (error) {
            this.logger.error(`Failed to copy vue3 component to workspace: ${error.message}`, error.stack);
        }
    }
    resolveFigmaToken(figmaToken) {
        const directToken = typeof figmaToken === 'string' ? figmaToken.trim() : '';
        if (directToken) {
            return directToken;
        }
        const savedToken = this.aiConfigService.getAiConfig()?.figmaToken;
        const persistedToken = typeof savedToken === 'string' ? savedToken.trim() : '';
        if (persistedToken) {
            return persistedToken;
        }
        throw new Error('缺少 Figma Token：当前请求未传入，且服务端已保存配置中也不存在');
    }
    async ensurePreviewImage(outputPath, fileKey, nodeId, figmaToken) {
        const previewPath = (0, path_1.join)(outputPath, 'resources', 'images', 'mc-preview.png');
        if ((0, fs_1.existsSync)(previewPath)) {
            return;
        }
        this.logger.warn(`Missing standardized preview image for ${outputPath}, trying to re-download from Figma`);
        const effectiveFigmaToken = this.resolveFigmaToken(figmaToken);
        const figmaModule = await import('../ai-engine/roles/figma-connector.js');
        const { FigmaConnector } = figmaModule;
        const connector = new FigmaConnector({
            figmaToken: effectiveFigmaToken,
        });
        await connector.downloadPreviewImage(fileKey, nodeId, previewPath);
        if (!(0, fs_1.existsSync)(previewPath)) {
            throw new Error(`Figma 预览图缺失，且补下载失败: resources/images/mc-preview.png (${outputPath})`);
        }
    }
    async saveComponentMeta(sessionId, groupId, requirementDoc, docAnalysis) {
        try {
            const metaContent = JSON.stringify({
                requirementDoc: requirementDoc || '',
                docAnalysis: docAnalysis || null,
                generatedAt: new Date().toISOString(),
            }, null, 2);
            const targets = [
                (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', groupId, sessionId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, sessionId),
            ];
            for (const targetPath of targets) {
                if (!(0, fs_1.existsSync)(targetPath)) {
                    await (0, promises_1.mkdir)(targetPath, { recursive: true });
                }
                await (0, promises_1.writeFile)((0, path_1.join)(targetPath, 'component-meta.json'), metaContent);
            }
            this.logger.log(`component-meta.json saved for ${groupId}/${sessionId}`);
        }
        catch (error) {
            this.logger.warn(`Failed to save component-meta.json: ${error.message}`);
        }
    }
};
exports.Vue3Service = Vue3Service;
exports.Vue3Service = Vue3Service = Vue3Service_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(6, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        progress_service_1.ProgressService,
        component_service_1.ComponentService,
        token_tracker_service_1.TokenTrackerService,
        config_service_1.AiConfigService,
        quota_service_1.QuotaService,
        mongoose_2.Model])
], Vue3Service);
//# sourceMappingURL=vue3.service.js.map