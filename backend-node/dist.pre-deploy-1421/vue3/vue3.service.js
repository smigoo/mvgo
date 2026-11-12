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
const component_meta_util_1 = require("../component/component-meta.util");
const token_tracker_service_1 = require("../token-usage/token-tracker.service");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const sfc_syntax_validation_js_1 = require("../ai-engine/utils/sfc-syntax-validation.js");
const mongoose_1 = require("@nestjs/mongoose");
const workspace_config_1 = require("../config/workspace.config");
const backend_root_1 = require("../config/backend-root");
const config_service_1 = require("../config/config.service");
const figma_execution_token_probe_1 = require("../config/figma-execution-token-probe");
const mongoose_2 = require("mongoose");
const group_member_schema_1 = require("../schemas/group-member.schema");
const group_resolver_1 = require("../common/group-resolver");
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
        groupId = await (0, group_resolver_1.resolvePrivateGroupId)(groupId, userId, this.groupMemberModel);
        const { componentName, fileKey, nodeId, componentId, config = {}, panelType, requirementDoc, docAnalysis, extraPrompt, requirementDocText, } = dto;
        const finalComponentName = componentName || sessionId;
        const folderName = componentName && componentName !== sessionId
            ? `${sessionId}-${finalComponentName}`
            : sessionId;
        const tempRoot = (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, folderName);
        const outputPath = config.outputPath || tempRoot;
        const userAiCfg = userId
            ? await this.aiConfigService.getMergedAiConfig(userId)
            : null;
        const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
            ...(userAiCfg || {}),
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
            generationTier: 'max',
            sourceType: 'figma',
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
            extraPrompt,
            requirementDocText,
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
        let visionModelUsed = null;
        let textModelUsed = null;
        const controller = new AbortController();
        this.tasksService.registerAbortController(sessionId, controller);
        try {
            const { componentName: name, fileKey, nodeId, outputPath: path, config, panelType, extraPrompt, requirementDocText, } = params;
            outputPath = path;
            componentName = name;
            const graphModule = await import('../ai-engine/graphs/mc-component-graph-vue3.js');
            const { runVue3Generation } = graphModule;
            const aiDefaultsModule = await import('../ai-engine/utils/ai-defaults.js');
            const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;
            this.logger.log(`Starting Vue3 generation for session ${sessionId}`);
            const mergedAiConfig = params.userId
                ? await this.aiConfigService.getMergedAiConfig(params.userId)
                : {};
            const finalAiConfig = { ...mergedAiConfig, ...config };
            const figmaCredTask = this.tasksService.getTask(sessionId) || null;
            const figmaTokenRes = await (0, figma_execution_token_probe_1.resolveExecutionFigmaTokenWithProbe)({
                task: figmaCredTask,
                requestConfig: config,
                activeConfig: mergedAiConfig,
                fileKey,
                nodeId,
            });
            if (figmaTokenRes.reason === 'probe-failed') {
                throw new Error(`缺少可读取该设计稿的 Figma Token：${figmaTokenRes.note}`);
            }
            const effectiveFigmaToken = figmaTokenRes.token
                ? figmaTokenRes.token
                : await this.resolveFigmaToken(undefined, params.userId);
            this.logger.log(`[figma-cred] vue3 session=${sessionId} source=${figmaTokenRes.source} ` +
                `reason=${figmaTokenRes.reason} ref=${figmaTokenRes.refSource || '-'} ` +
                `request-overridden=${figmaTokenRes.requestOverridden} ` +
                `probed=${figmaTokenRes.probes.length} :: ${figmaTokenRes.note}`);
            if (figmaTokenRes.refFields) {
                this.tasksService.updateTask(sessionId, figmaTokenRes.refFields);
            }
            const resolvedVisionCfg = resolveVisionConfig(finalAiConfig);
            const resolvedTextCfg = resolveTextConfig(finalAiConfig);
            visionModelUsed = resolvedVisionCfg?.model || null;
            textModelUsed = resolvedTextCfg?.model || null;
            genResult = await runVue3Generation({
                componentName,
                fileKey,
                nodeId,
                outputPath,
                panelType: panelType || 'default-panel',
                extraPrompt: extraPrompt || undefined,
                requirementDocText: requirementDocText || undefined,
                figmaToken: effectiveFigmaToken,
                visionAIConfig: resolvedVisionCfg,
                textAIConfig: resolvedTextCfg,
                aiConfig: {
                    apiKey: config.aiApiKey,
                    baseURL: config.aiBaseURL,
                    model: config.aiModel,
                },
                sessionId,
                groupId: params.groupId,
                signal: controller.signal,
                onProgress: (data) => {
                    this.progressService.sendProgress(sessionId, data);
                },
                onTokenUsageRecord: (data) => {
                    this.tokenTrackerService.recordUsage({
                        ...data,
                        userId: params.userId,
                        baseURL: config.aiBaseURL,
                    });
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
            this.tasksService.removeAbortController(sessionId);
            if (!genError && outputPath && componentName) {
                const hasEntry = (0, fs_1.existsSync)((0, path_1.join)(outputPath, 'package', 'index.vue'));
                if (hasEntry) {
                    try {
                        await this.copyToWorkspaceVue3(outputPath, componentName, params.groupId);
                    }
                    catch (syncErr) {
                        this.logger.warn(`Workspace sync failed before broadcast for ${sessionId}: ${syncErr.message}`);
                    }
                }
            }
            if (genError) {
                const t = this.tasksService.getTask(sessionId);
                if (t?.userApproved) {
                    this.logger.log(`[Vue3] 任务 ${sessionId} 用户已极速通过，跳过失败广播`);
                }
                else {
                    this.progressService.sendError(sessionId, genError);
                }
            }
            else {
                this.progressService.sendComplete(sessionId, {
                    ...genResult,
                    taskId: sessionId,
                    componentId: sessionId,
                    groupId: params.groupId,
                    target: 'vue3',
                    _completionModels: { visionModel: visionModelUsed, textModel: textModelUsed },
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
                    return;
                }
                try {
                    await this.validateVue3Less(outputPath, sessionId);
                    await (0, component_meta_util_1.saveComponentMeta)(params.groupId, sessionId, 'vue3', params.requirementDoc, params.docAnalysis, {
                        degraded: !!genResult?._visualDegraded,
                        layoutSource: genResult?._visualLayoutSource || undefined,
                        degradeReason: genResult?._visualDegradeReason || undefined,
                    }, genResult?.patchHitReport ?? null);
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
            const figmaCacheFile = (0, path_1.join)(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
            const backendWsPath = (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, sessionId);
            const frontendWsPath = (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, sessionId);
            if (!(0, fs_1.existsSync)((0, path_1.join)(packageDir, 'index.vue'))) {
                this.logger.error(`Vue3 入口缺失: ${(0, path_1.join)(packageDir, 'index.vue')}`);
                return;
            }
            const syntaxErrors = (0, sfc_syntax_validation_js_1.validateVueSfcDirectory)(packageDir);
            if (syntaxErrors.length > 0) {
                this.logger.warn(`[copyToWorkspaceVue3] SFC 校验有 ${syntaxErrors.length} 条警告（不阻断复制）: ${syntaxErrors.slice(0, 5).join('; ')}`);
            }
            for (const targetPath of [backendWsPath, frontendWsPath]) {
                await (0, promises_1.mkdir)(targetPath, { recursive: true });
                for (const legacy of [
                    (0, path_1.join)(targetPath, 'index.vue'),
                    (0, path_1.join)(targetPath, 'components'),
                    (0, path_1.join)(targetPath, 'package', 'resources'),
                    (0, path_1.join)(targetPath, '_figma-size.json'),
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
                if ((0, fs_1.existsSync)(figmaCacheFile)) {
                    await (0, promises_1.cp)(figmaCacheFile, (0, path_1.join)(targetPath, '_figma-size.json'));
                }
            }
            this.logger.log(`Vue3 component copied to workspace: ${groupId}/${sessionId} (package/index.vue + resources + _figma-size.json)`);
        }
        catch (error) {
            this.logger.error(`Failed to copy vue3 component to workspace: ${error.message}`, error.stack);
        }
    }
    async resolveFigmaToken(figmaToken, userId) {
        const directToken = typeof figmaToken === 'string' ? figmaToken.trim() : '';
        if (directToken) {
            return directToken;
        }
        const cfg = userId
            ? await this.aiConfigService.getMergedAiConfig(userId)
            : {};
        const savedToken = cfg?.figmaToken;
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
    async validateVue3Less(outputPath, sessionId) {
        const { readdir, stat } = await import('fs/promises');
        const packageDir = (0, path_1.join)(outputPath, 'package');
        if (!(0, fs_1.existsSync)(packageDir))
            return;
        const less = require('less');
        const vueFiles = [];
        async function collectVue(dir) {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = (0, path_1.join)(dir, entry.name);
                if (entry.isDirectory()) {
                    await collectVue(full);
                }
                else if (entry.name.endsWith('.vue')) {
                    vueFiles.push(full);
                }
            }
        }
        await collectVue(packageDir);
        if (vueFiles.length === 0)
            return;
        const hasError = false;
        for (const vuePath of vueFiles) {
            const content = await (0, promises_1.readFile)(vuePath, 'utf-8');
            const styleRegex = /<style[^>]*lang="less"[^>]*>([\s\S]*?)<\/style>/gi;
            let match;
            let fileHasError = false;
            let modified = content;
            while ((match = styleRegex.exec(content)) !== null) {
                const lessCode = match[1];
                try {
                    await less.render(lessCode, { filename: vuePath });
                }
                catch (err) {
                    fileHasError = true;
                    this.logger.warn(`[LESS门禁] ${vuePath} 编译失败: ${err.message} (line ${err.line || '?'})`);
                }
            }
            if (fileHasError) {
                const fixed = modified.replace(/([a-z-]+:\s*[^;{}]+)(\n\s+[a-z-]+:)/gi, '$1;$2');
                const reStyleRegex = /<style[^>]*lang="less"[^>]*>([\s\S]*?)<\/style>/gi;
                let reMatch;
                let allPassed = true;
                while ((reMatch = reStyleRegex.exec(fixed)) !== null) {
                    try {
                        await less.render(reMatch[1], { filename: vuePath });
                    }
                    catch {
                        allPassed = false;
                        break;
                    }
                }
                if (allPassed) {
                    await (0, promises_1.writeFile)(vuePath, fixed, 'utf-8');
                    this.logger.log(`[LESS门禁] ${vuePath} 自动修复成功（补分号）`);
                }
                else {
                    this.logger.error(`[LESS门禁] ${vuePath} 修复失败，阻断发布`);
                    throw new Error(`LESS 编译失败且无法自动修复: ${vuePath}。AI 生成的样式存在语法错误，请重新生成。`);
                }
            }
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