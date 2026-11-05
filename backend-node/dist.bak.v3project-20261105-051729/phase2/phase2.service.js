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
var Phase2Service_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Phase2Service = void 0;
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("../tasks/tasks.service");
const task_code_snapshot_service_1 = require("../tasks/task-code-snapshot.service");
const progress_service_1 = require("../progress/progress.service");
const component_service_1 = require("../component/component.service");
const token_tracker_service_1 = require("../token-usage/token-tracker.service");
const doc_analyzer_service_1 = require("./doc/doc-analyzer.service");
const ui_cache_service_1 = require("./ui-cache.service");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const workspace_config_1 = require("../config/workspace.config");
const backend_root_1 = require("../config/backend-root");
const config_service_1 = require("../config/config.service");
const figma_token_projection_1 = require("../config/figma-token-projection");
const user_ai_config_service_1 = require("../config/user-ai-config.service");
const quota_service_1 = require("../quota/quota.service");
const fs_1 = require("fs");
const { ZipArchive } = require('archiver');
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const css_sanitizer_js_1 = require("../ai-engine/utils/css-sanitizer.js");
const error_humanizer_js_1 = require("../ai-engine/utils/error-humanizer.js");
const group_resolver_1 = require("../common/group-resolver");
const package_filter_1 = require("../common/utils/package-filter");
const sfc_syntax_validation_js_1 = require("../ai-engine/utils/sfc-syntax-validation.js");
const component_resolver_js_1 = require("../ai-engine/utils/component-resolver.js");
const component_naming_js_1 = require("../ai-engine/utils/component-naming.js");
const less_variable_checker_js_1 = require("../ai-engine/validators/less-variable-checker.js");
const refine_target_js_1 = require("./refine-target.js");
const promotion_gate_1 = require("./promotion-gate");
const loadPreviewPublisher = () => import('../ai-engine/utils/workspace-preview-publisher.js');
const group_member_schema_1 = require("../schemas/group-member.schema");
const mongoose_3 = require("mongoose");
async function readDualTruthMeta(outputPath) {
    if (!outputPath)
        return {};
    try {
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const raw = await readFile(join(outputPath, 'declare.json'), 'utf-8');
        const declare = JSON.parse(raw);
        const theme = declare?.themeConfig;
        if (!theme || theme.dualTruth !== true)
            return {};
        return {
            dualTruth: true,
            primaryBrightness: theme.primaryBrightness || null,
            secondaryBrightness: theme.secondaryBrightness || null,
        };
    }
    catch {
        return {};
    }
}
let Phase2Service = Phase2Service_1 = class Phase2Service {
    tasksService;
    taskCodeSnapshotService;
    progressService;
    componentService;
    tokenTrackerService;
    aiConfigService;
    docAnalyzerService;
    uiCacheService;
    quotaService;
    userAiConfigService;
    groupMemberModel;
    logger = new common_1.Logger(Phase2Service_1.name);
    _previewCache = new Map();
    _previewCacheDir = (0, path_1.join)(backend_root_1.backendRoot, 'temp-preview-images');
    _previewCacheIndexFile = (0, path_1.join)(backend_root_1.backendRoot, 'temp-preview-images', '_cache-index.json');
    _loadPreviewCacheFromDisk() {
        try {
            if (!(0, fs_1.existsSync)(this._previewCacheIndexFile))
                return;
            const raw = (0, fs_1.readFileSync)(this._previewCacheIndexFile, 'utf-8');
            const idx = JSON.parse(raw || '{}');
            if (!idx || typeof idx !== 'object')
                return;
            const ttlMs = Math.max(1, Number(process.env.FIGMA_PREVIEW_CACHE_TTL_HOURS ?? 24)) * 3600 * 1000;
            const now = Date.now();
            let restored = 0;
            for (const [key, v] of Object.entries(idx)) {
                if (!v || typeof v !== 'object' || !v.previewToken)
                    continue;
                if (!(0, fs_1.existsSync)((0, path_1.join)(this._previewCacheDir, `${v.previewToken}.png`)))
                    continue;
                if (now - (Number(v.cachedAt) || 0) > ttlMs)
                    continue;
                this._previewCache.set(key, {
                    previewToken: v.previewToken,
                    nodeName: v.nodeName || 'Unknown',
                    width: Number(v.width) || 0,
                    height: Number(v.height) || 0,
                    cachedAt: Number(v.cachedAt) || now,
                });
                restored++;
            }
            if (restored > 0) {
                this.logger.log(`figma-preview 磁盘索引恢复: ${restored} 个缓存条目`);
            }
        }
        catch (e) {
            this.logger.warn(`figma-preview 磁盘索引加载失败（非阻断）: ${e.message}`);
        }
    }
    _persistPreviewCache() {
        try {
            (0, fs_1.mkdirSync)(this._previewCacheDir, { recursive: true });
            const idx = {};
            for (const [key, v] of this._previewCache.entries()) {
                idx[key] = {
                    previewToken: v.previewToken,
                    nodeName: v.nodeName,
                    width: v.width,
                    height: v.height,
                    cachedAt: v.cachedAt,
                };
            }
            (0, fs_1.writeFileSync)(this._previewCacheIndexFile, JSON.stringify(idx), 'utf-8');
        }
        catch (e) {
            this.logger.warn(`figma-preview 磁盘索引持久化失败（非阻断）: ${e.message}`);
        }
    }
    sendSseLog(sessionId, level, message) {
        try {
            this.progressService.sendLog(sessionId, level, message, { logger: 'Phase2Service' });
        }
        catch {
        }
    }
    constructor(tasksService, taskCodeSnapshotService, progressService, componentService, tokenTrackerService, aiConfigService, docAnalyzerService, uiCacheService, quotaService, userAiConfigService, groupMemberModel) {
        this.tasksService = tasksService;
        this.taskCodeSnapshotService = taskCodeSnapshotService;
        this.progressService = progressService;
        this.componentService = componentService;
        this.tokenTrackerService = tokenTrackerService;
        this.aiConfigService = aiConfigService;
        this.docAnalyzerService = docAnalyzerService;
        this.uiCacheService = uiCacheService;
        this.quotaService = quotaService;
        this.userAiConfigService = userAiConfigService;
        this.groupMemberModel = groupMemberModel;
        global.__phase2ServiceInstance = this;
        this._loadPreviewCacheFromDisk();
    }
    async buildMergedAiConfig(config, userId) {
        const backendCfg = await this.aiConfigService.getMergedAiConfig(userId);
        return {
            ...config,
            ...backendCfg,
        };
    }
    async startGeneration(sessionId, dto, groupId, userId) {
        groupId = await (0, group_resolver_1.resolvePrivateGroupId)(groupId, userId, this.groupMemberModel);
        const { createLogger } = await import('../ai-engine/logger/index.js');
        const { Logger: CustomLogger } = await import('../ai-engine/logger/logger.js');
        CustomLogger.setSessionContext(sessionId, this.progressService);
        const { componentName, fileKey, nodeId, componentId, userComponentId, extraPrompt, requirementDocText, config = {}, panelType, target = 'microcode', requirementDoc, docAnalysis, previewToken, reuseCache, secondaryNode, themeNodes, primaryRole, businessTextRules, } = dto;
        if (!fileKey || !nodeId) {
            throw new Error(`Phase2 生成缺少 fileKey/nodeId（fileKey=${JSON.stringify(fileKey)}, nodeId=${JSON.stringify(nodeId)}），` +
                `疑似 lite 任务被错误路由到 max 管线。请检查任务来源与管线路由。`);
        }
        const componentNameIsTaskId = (0, component_naming_js_1.isTaskIdLikeName)(componentName);
        if (componentNameIsTaskId) {
            this.logger.warn(`[Phase2] componentName 疑似任务号污染，已忽略并回退为 sessionId: ${componentName}`);
        }
        const safeComponentName = componentNameIsTaskId
            ? ''
            : String(componentName || '').trim();
        const finalComponentName = safeComponentName || sessionId;
        const folderName = (0, component_naming_js_1.resolveTaskFolderName)(sessionId, componentName);
        const tempRoot = (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, folderName);
        const outputPath = config.outputPath || tempRoot;
        const userAiCfg = userId
            ? await this.userAiConfigService.getUserConfig(userId)
            : null;
        const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
            ...(0, figma_token_projection_1.applyFigmaTokenProjection)(userAiCfg || {}),
            ...config,
            outputPath,
            target,
            panelType,
        });
        this.tasksService.createTask(sessionId, {
            configSnapshot,
            componentId: sessionId,
            groupId,
            componentName: finalComponentName,
            nodeId,
            fileKey,
            themeNodes,
            target,
            outputPath,
            checkpointStatus: 'none',
            panelKey: panelType,
            taskType: 'component',
            userId,
            generationTier: 'max',
            sourceType: 'figma',
            extraPrompt,
            requirementDocText,
            userComponentId,
        });
        this.sendSseLog(sessionId, 'info', `任务已创建: ${finalComponentName}`);
        if (previewToken) {
            const { copyFile, mkdir } = await import('fs/promises');
            const cacheDir = (0, path_1.join)(backend_root_1.backendRoot, 'temp-preview-images');
            const cachedPath = (0, path_1.join)(cacheDir, `${previewToken}.png`);
            if ((0, fs_1.existsSync)(cachedPath)) {
                const previewDir = (0, path_1.join)(outputPath, 'resources', 'images');
                await mkdir(previewDir, { recursive: true });
                await copyFile(cachedPath, (0, path_1.join)(previewDir, 'mc-preview.png'));
                this.sendSseLog(sessionId, 'info', `Preview image reused: ${previewToken}`);
            }
            else {
                this.sendSseLog(sessionId, 'warn', `Preview token not found in cache: ${previewToken}`);
            }
        }
        let sharedUiCache;
        if (reuseCache) {
            try {
                const { loadSharedCache } = await import('../ai-engine/utils/shared-cache.js');
                const shared = loadSharedCache(outputPath, fileKey, nodeId);
                if (shared && (shared.figmaNodeData || shared.previewAnalysis)) {
                    sharedUiCache = {
                        figmaNodeData: shared.figmaNodeData || undefined,
                        previewAnalysis: shared.previewAnalysis || undefined,
                        resourceDomMapping: shared.resourceDomMapping || undefined,
                    };
                    this.sendSseLog(sessionId, 'info', `🗃️ 续跑命中全局缓存（同源设计稿），跳过 Figma 拉取${shared.previewAnalysis ? '与视觉分析' : ''}`);
                }
                else {
                    this.sendSseLog(sessionId, 'info', '🗃️ 续跑未命中缓存，按全新生成');
                }
            }
            catch { }
        }
        CustomLogger.runInSessionContext(sessionId, this.progressService, () => {
            this.executeGeneration(sessionId, {
                componentName: finalComponentName,
                fileKey,
                nodeId,
                outputPath,
                config,
                groupId,
                userId,
                panelType,
                target,
                requirementDoc,
                docAnalysis,
                userComponentId,
                extraPrompt,
                requirementDocText,
                uiCache: sharedUiCache,
                secondaryNode,
                primaryRole,
                themeNodes,
                businessTextRules,
            }).catch((error) => {
                this.logger.error(`Phase 1 generation failed: ${error.message}`, error.stack);
                this.progressService.sendError(sessionId, {
                    message: error.message,
                    stack: error.stack,
                });
            });
        });
    }
    async regenerateWithDoc(sessionId, params) {
        const { componentId, requirementDoc, config, userId, panelType } = params;
        const effectiveGroupId = await (0, group_resolver_1.resolvePrivateGroupId)(params.groupId, userId, this.groupMemberModel);
        const candidates = [
            (0, path_1.join)(backend_root_1.customComponentsDir, componentId),
        ];
        const componentDir = candidates.find((p) => (0, fs_1.existsSync)(p));
        if (!componentDir) {
            throw new Error(`组件目录不存在: ${componentId}`);
        }
        let expectedMeta = {};
        try {
            const cacheMetaRaw = require('fs').readFileSync((0, path_1.join)(componentDir, '.mc-gen', 'cache', 'figma-node-data.json'), 'utf-8');
            const cacheMetaParsed = JSON.parse(cacheMetaRaw);
            expectedMeta = {
                fileKey: cacheMetaParsed.fileKey || undefined,
                nodeId: cacheMetaParsed.nodeId || undefined,
            };
        }
        catch {
        }
        const cacheHit = this.uiCacheService.check(componentDir, expectedMeta);
        if (!cacheHit.hit) {
            throw new Error(`UI 缓存未命中（${cacheHit.staleReason}）。该组件无法走快速路径，请使用完整重生成。`);
        }
        this.logger.log(`🗃️ 路径B UI 缓存命中: ${componentId}`);
        let docAnalysis = params.docAnalysis || undefined;
        if (!docAnalysis) {
            const analyzed = await this.docAnalyzerService.analyzeDocument({
                document: requirementDoc,
                source: 'paste',
                aiConfig: config?.textApiKey
                    ? { textApiKey: config.textApiKey, textBaseURL: config.textBaseURL, textModel: config.textModel }
                    : undefined,
            });
            docAnalysis = analyzed.analysis;
        }
        const figmaNodeData = cacheHit.figmaNodeData || {};
        const cacheRaw = (() => {
            try {
                return require('fs').readFileSync((0, path_1.join)(componentDir, '.mc-gen', 'cache', 'figma-node-data.json'), 'utf-8');
            }
            catch {
                return '{}';
            }
        })();
        const cacheMeta = JSON.parse(cacheRaw);
        const fileKey = cacheMeta.fileKey || '';
        const nodeId = cacheMeta.nodeId || '';
        const outputPath = (0, path_1.join)(backend_root_1.tempComponentsDir, effectiveGroupId, `${sessionId}-${componentId}-doc-regen`);
        const userAiCfg = userId
            ? await this.userAiConfigService.getUserConfig(userId)
            : null;
        const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
            ...(0, figma_token_projection_1.applyFigmaTokenProjection)(userAiCfg || {}),
            ...config,
            outputPath,
            target: 'microcode',
            panelType,
        });
        this.tasksService.createTask(sessionId, {
            configSnapshot,
            componentId: sessionId,
            groupId: effectiveGroupId,
            componentName: `${componentId}(文档纠偏)`,
            nodeId,
            fileKey,
            target: 'microcode',
            outputPath,
            checkpointStatus: 'none',
            panelKey: panelType,
            taskType: 'component',
            userId,
            generationTier: 'max',
            sourceType: 'figma',
        });
        this.executeGeneration(sessionId, {
            componentName: componentId,
            fileKey,
            nodeId,
            outputPath,
            config,
            groupId: effectiveGroupId,
            userId,
            panelType,
            target: 'microcode',
            requirementDoc,
            docAnalysis,
            uiCache: {
                figmaNodeData: cacheHit.figmaNodeData,
                previewAnalysis: cacheHit.previewAnalysis,
                resourceDomMapping: cacheHit.resourceDomMapping,
            },
        }).catch((error) => {
            this.logger.error(`路径B 再生成失败: ${error.message}`, error.stack);
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
        let genTarget;
        let visionModelUsed = null;
        let textModelUsed = null;
        const actualVisionModels = new Set();
        const actualTextModels = new Set();
        let candidateRevision = null;
        let candidateValidation = {
            semantics: 'pending',
            sfc: 'pending',
            less: 'pending',
            runtime: 'pending',
        };
        const controller = new AbortController();
        this.tasksService.registerAbortController(sessionId, controller);
        try {
            const { componentName: name, fileKey, nodeId, outputPath: path, config, panelType, target, requirementDoc, docAnalysis, userComponentId, extraPrompt, requirementDocText, uiCache, resumeData, } = params;
            outputPath = path;
            componentName = name;
            genTarget = target || 'microcode';
            let effectiveUiCache = uiCache;
            let effectiveResumeData = resumeData;
            if (!effectiveUiCache && !effectiveResumeData && outputPath) {
                try {
                    const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
                    const cp = loadCheckpoint(outputPath);
                    if (cp.stage !== 'none' && cp.stage !== 'code-generated') {
                        effectiveUiCache = cp.uiCache || undefined;
                        effectiveResumeData = cp.resumeData || undefined;
                        this.logger.log(`🔄 自动断点复用: ${outputPath} (stage=${cp.stage})`);
                    }
                }
                catch (err) {
                    this.logger.warn(`自动断点检测失败（忽略）: ${err.message}`);
                }
            }
            const graphTarget = params.target || 'microcode';
            let runGeneration;
            if (graphTarget === 'vue3') {
                const vue3Module = await import('../ai-engine/graphs/mc-component-graph-vue3.js');
                runGeneration = vue3Module.runVue3Generation;
            }
            else {
                const phase2Module = await import('../ai-engine/graphs/mc-component-graph-phase2.js');
                runGeneration = phase2Module.runPhase2Generation;
            }
            const aiDefaultsModule = await import('../ai-engine/utils/ai-defaults.js');
            const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;
            const { resolveVisionCapability } = await import('../ai-engine/utils/model-config.js');
            const mergedAiConfig = await this.buildMergedAiConfig(config, params.userId);
            console.log('[Phase2] 原始 config:', JSON.stringify(config).substring(0, 400));
            const visionCfg = resolveVisionConfig(mergedAiConfig);
            const textCfg = resolveTextConfig(mergedAiConfig);
            visionModelUsed = visionCfg?.model || null;
            textModelUsed = textCfg?.model || null;
            console.log('[Phase2] visionCfg:', JSON.stringify(visionCfg));
            console.log('[Phase2] textCfg:', JSON.stringify(textCfg));
            const visionModelName = String(visionCfg?.model || '').trim();
            if (!visionModelName) {
                throw new Error('未配置视觉模型，无法进行组件生成（截图 / Figma 识别依赖图像理解），请到「设置 - 模型配置」中选择支持视觉的模型并保存');
            }
            const visionCap = resolveVisionCapability(visionModelName);
            if (visionCap.vision === false) {
                throw new Error(`模型「${visionModelName}」不支持视觉输入，无法进行组件生成。` +
                    `组件生成需要先识别截图 / Figma 设计图，请到「设置 - 模型配置」更换为支持视觉的模型（并点击「检测」确认）后重试`);
            }
            if (visionCap.vision !== true) {
                throw new Error(`模型「${visionModelName}」的视觉能力尚未检测，无法确认其能否识别设计图。` +
                    `请到「设置 - 模型配置」点击「检测」完成能力识别后重试（未检测不支持直接生成，避免产出与设计图无关的结果）`);
            }
            const effectiveFigmaToken = this.resolveFigmaToken(config?.figmaToken || mergedAiConfig?.figmaToken);
            genResult = await runGeneration({
                componentName,
                componentId: String(componentName || '').replace(/^c-/, ''),
                fileKey,
                nodeId,
                outputPath,
                panelType: panelType || 'default-panel',
                target,
                figmaToken: effectiveFigmaToken,
                visionAIConfig: visionCfg,
                textAIConfig: textCfg,
                aiConfig: {
                    apiKey: config.aiApiKey,
                    baseURL: config.aiBaseURL,
                    model: config.aiModel,
                },
                sessionId,
                userComponentId,
                extraPrompt,
                requirementDocText,
                groupId: params.groupId,
                signal: controller.signal,
                skipNodes: Array.isArray(config.skipNodes) ? config.skipNodes : undefined,
                requirementDoc,
                docAnalysis,
                uiCache: effectiveUiCache,
                _resumeData: effectiveResumeData || null,
                failureGuidance: params.failureGuidance,
                secondaryNode: params.secondaryNode,
                primaryRole: params.primaryRole,
                themeNodes: params.themeNodes,
                businessTextRules: params.businessTextRules,
                onProgress: (data) => {
                    if (data && data.fileLifecycle) {
                        this.progressService.sendFileLifecycle(sessionId, data.fileLifecycle);
                        return;
                    }
                    if (data?.displayName && typeof data.displayName === 'string') {
                        const t = this.tasksService.getTask(sessionId);
                        if (t && t.displayName !== data.displayName) {
                            t.displayName = data.displayName;
                            this.logger.log(`[displayName] 早提取中文名: ${data.displayName} (${sessionId})`);
                        }
                    }
                    if (data?.meta?.type === 'agent-model' && data?.meta?.model) {
                        const agentName = data.meta.agent || '';
                        if (agentName === 'vision-agent') {
                            actualVisionModels.add(data.meta.model);
                        }
                        else {
                            actualTextModels.add(data.meta.model);
                        }
                    }
                    this.progressService.sendProgress(sessionId, data);
                },
                onFilesReady: async (data) => {
                    const files = { ...data.files };
                    if (outputPath) {
                        const mergeFromDisk = (absDir, relPrefix) => {
                            const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm', '.pdf']);
                            if (!(0, fs_1.existsSync)(absDir))
                                return;
                            for (const name of (0, fs_1.readdirSync)(absDir)) {
                                const abs = (0, path_1.join)(absDir, name);
                                const st = (0, fs_1.statSync)(abs);
                                if (st.isFile()) {
                                    const rel = `${relPrefix}/${name}`;
                                    if (!(rel in files)) {
                                        files[rel] = BINARY_EXTS.has((0, path_1.extname)(name).toLowerCase())
                                            ? (0, fs_1.readFileSync)(abs)
                                            : (0, fs_1.readFileSync)(abs, 'utf-8');
                                    }
                                }
                                else if (st.isDirectory()) {
                                    mergeFromDisk(abs, `${relPrefix}/${name}`);
                                }
                            }
                        };
                        mergeFromDisk((0, path_1.join)(outputPath, 'resources', 'images'), 'resources/images');
                        mergeFromDisk((0, path_1.join)(outputPath, 'resources', 'styles'), 'resources/styles');
                        if (!('_figma-size.json' in files)) {
                            try {
                                const cachePath = (0, path_1.join)(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
                                if ((0, fs_1.existsSync)(cachePath)) {
                                    const cached = JSON.parse((0, fs_1.readFileSync)(cachePath, 'utf-8'));
                                    const bbox = (cached?.document || cached)?.absoluteBoundingBox;
                                    if (bbox?.width && bbox?.height) {
                                        files['_figma-size.json'] = JSON.stringify({ document: { absoluteBoundingBox: { width: bbox.width, height: bbox.height } } }, null, 2);
                                    }
                                }
                            }
                            catch (sizeError) {
                                this.logger.warn(`[Phase2] 快照补齐 Figma 尺寸失败: ${sizeError.message}`);
                            }
                        }
                        for (const top of ['component.js', 'declare.js', 'declare.json', '_figma-size.json', 'component-meta.json']) {
                            const abs = (0, path_1.join)(outputPath, top);
                            if ((0, fs_1.existsSync)(abs) && !(top in files))
                                files[top] = (0, fs_1.readFileSync)(abs, 'utf-8');
                        }
                        try {
                            await less_variable_checker_js_1.LessVariableChecker.check(outputPath);
                        }
                        catch (lessCheckErr) {
                            this.logger.warn(`[Phase2] 预发布 Less 变量检查跳过: ${lessCheckErr?.message}`);
                        }
                        const _themeVarsRel = 'resources/styles/themes/theme-vars.less';
                        const _themeVarsAbs = (0, path_1.join)(outputPath, 'resources', 'styles', 'themes', 'theme-vars.less');
                        if ((0, fs_1.existsSync)(_themeVarsAbs)) {
                            files[_themeVarsRel] = (0, fs_1.readFileSync)(_themeVarsAbs, 'utf-8');
                        }
                    }
                    const manifest = this.taskCodeSnapshotService.createCandidate({
                        sessionId,
                        componentId: sessionId,
                        groupId: params.groupId,
                        target: graphTarget === 'vue3' ? 'vue3' : 'microcode',
                        stage: data.stage,
                        files,
                    });
                    candidateRevision = manifest.revision;
                    candidateValidation = {
                        semantics: 'passed',
                        sfc: 'passed',
                        less: 'passed',
                        runtime: 'pending',
                    };
                    this.taskCodeSnapshotService.markValidating(sessionId, manifest.revision, candidateValidation);
                    this.progressService.sendCodeSnapshot(sessionId, {
                        revision: manifest.revision,
                        status: 'validating',
                        stage: manifest.stage,
                        fileCount: manifest.files.length,
                        changedFiles: manifest.files.map((file) => file.path),
                        lastGoodRevision: manifest.lastGoodRevision,
                    });
                    return manifest;
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
            let figmaNode = genResult?.figmaNodeData?.document
                || genResult?.figmaNodeData
                || genResult?.figmaData?.document
                || genResult?.figmaData;
            if (!figmaNode) {
                try {
                    const cachePath = (0, path_1.join)(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
                    if ((0, fs_1.existsSync)(cachePath)) {
                        const cached = JSON.parse((0, fs_1.readFileSync)(cachePath, 'utf-8'));
                        figmaNode = cached?.document || cached;
                    }
                }
                catch (sizeError) {
                    this.logger.warn(`[Phase2] 读取 Figma 尺寸缓存失败: ${sizeError.message}`);
                }
            }
            const figmaBox = figmaNode?.absoluteBoundingBox;
            if (figmaBox?.width && figmaBox?.height) {
                await (0, promises_1.writeFile)((0, path_1.join)(outputPath, '_figma-size.json'), JSON.stringify({ document: { absoluteBoundingBox: {
                            width: figmaBox.width,
                            height: figmaBox.height,
                        } } }, null, 2), 'utf-8');
            }
            try {
                let declareRaw = null;
                if (outputPath) {
                    const declPath = (0, path_1.join)(outputPath, 'declare.json');
                    if ((0, fs_1.existsSync)(declPath))
                        declareRaw = (0, fs_1.readFileSync)(declPath, 'utf-8');
                }
                if (!declareRaw && typeof genResult?.files?.['declare.json'] === 'string') {
                    declareRaw = genResult.files['declare.json'];
                }
                if (declareRaw) {
                    const decl = JSON.parse(declareRaw);
                    const zhName = typeof decl?.componentName === 'string' ? decl.componentName.trim() : '';
                    if (zhName && /[\u4e00-\u9fa5]/.test(zhName)) {
                        const t = this.tasksService.getTask(sessionId);
                        if (t && t.displayName !== zhName) {
                            t.displayName = zhName;
                            this.logger.log(`[displayName] 权威中文名（declare）: ${zhName} (${sessionId})`);
                        }
                    }
                }
            }
            catch { }
            this.logger.log(`Phase 1 generation completed for session ${sessionId}`);
        }
        catch (error) {
            this.logger.error(`Phase 1 generation failed for session ${sessionId}: ${error.message}`);
            genError = error;
        }
        finally {
            this.tasksService.removeAbortController(sessionId);
            try {
                const { Logger: _CL } = await import('../ai-engine/logger/logger.js');
                _CL.clearSessionContext();
            }
            catch { }
            const runtimeStatus = genResult?.runtimeGate?.status || null;
            const qualityGateSkipped = genResult?._v3Mode === 'generate';
            const qualityPassed = qualityGateSkipped || runtimeStatus === 'PASS';
            const structureGate = (0, promotion_gate_1.evalStructureGateForPromotion)(genResult);
            if (structureGate.blocked) {
                this.logger.warn(`[Phase2] 结构 BLOCK ${structureGate.blockCount} 项，禁止晋升 last-good：${structureGate.reason}`);
            }
            const qualityFailureMessage = genResult?.runtimeGate?.warning?.message
                || (runtimeStatus ? `运行时质量门禁未通过（${runtimeStatus}）` : '运行时质量门禁结果缺失');
            let terminalError = genError || (!qualityPassed ? new Error(qualityFailureMessage) : null);
            if (!terminalError && outputPath && (0, fs_1.existsSync)((0, path_1.join)(outputPath, 'package', 'index.vue'))) {
                try {
                    await this.precompileCss(outputPath);
                    candidateValidation = { ...candidateValidation, less: 'passed' };
                    if (candidateRevision) {
                        try {
                            const stylesRoot = (0, path_1.join)(outputPath, 'resources', 'styles');
                            const relPaths = [];
                            const walkStyles = (absDir, relPrefix) => {
                                if (!(0, fs_1.existsSync)(absDir))
                                    return;
                                for (const name of (0, fs_1.readdirSync)(absDir)) {
                                    const abs = (0, path_1.join)(absDir, name);
                                    if ((0, fs_1.statSync)(abs).isDirectory()) {
                                        walkStyles(abs, `${relPrefix}/${name}`);
                                    }
                                    else if (/\.(less|css)$/i.test(name)) {
                                        relPaths.push(`${relPrefix}/${name}`);
                                    }
                                }
                            };
                            walkStyles(stylesRoot, 'resources/styles');
                            if (relPaths.length > 0) {
                                this.taskCodeSnapshotService.refreshRevisionFilesFromDisk(sessionId, candidateRevision, outputPath, relPaths);
                            }
                        }
                        catch (refreshErr) {
                            this.logger.warn(`[Phase2] 快照 styles 终态同源刷新失败（非阻断）: ${refreshErr?.message || refreshErr}`);
                        }
                    }
                }
                catch (cssErr) {
                    terminalError = cssErr;
                    candidateValidation = { ...candidateValidation, less: 'blocked' };
                    this.logger.error(`Final LESS compile gate blocked task ${sessionId}: ${cssErr.message}`);
                }
            }
            else if (terminalError) {
                const errLike = terminalError;
                const l0bIssues = errLike?.codeValidationResult?.issues || [];
                const lessBlocked = errLike?.code === 'LESS_COMPILE_GATE_BLOCKED' ||
                    errLike?.lessCompileGate?.pass === false ||
                    (errLike?.code === 'L0B_BLOCK_EXHAUSTED' &&
                        l0bIssues.some((i) => i?.id === 'LESS-COMPILE-001'));
                const fallback = candidateValidation.less === 'passed' ? 'pending' : candidateValidation.less;
                candidateValidation = { ...candidateValidation, less: lessBlocked ? 'blocked' : fallback };
                this.logger.warn(`[Phase2] 终态错误已存在，跳过最终 LESS 预编译；less 校验状态回写为 ${candidateValidation.less}` +
                    ` (${errLike?.code || 'NO_CODE'}) session=${sessionId}`);
            }
            const snapshotTarget = genTarget === 'vue3' ? 'vue3' : 'microcode';
            const publisher = await loadPreviewPublisher();
            const hasPreviewEntry = !!outputPath && (0, fs_1.existsSync)((0, path_1.join)(outputPath, 'package', 'index.vue'));
            const resolvedComponentId = hasPreviewEntry
                ? publisher.resolveWorkspaceComponentId(outputPath, sessionId)
                : sessionId;
            if (resolvedComponentId !== sessionId) {
                const task = this.tasksService.getTask(sessionId);
                if (task && task.componentId !== resolvedComponentId) {
                    task.componentId = resolvedComponentId;
                    this.logger.log(`[Phase2] 任务 componentId 按 declare.json 归一: ${sessionId} -> ${resolvedComponentId}`);
                }
            }
            const previewContext = {
                componentId: resolvedComponentId,
                groupId: params.groupId,
                target: snapshotTarget,
            };
            let previewTransactionCommitted = false;
            let candidatePublishError = null;
            let publishContext = { ...previewContext };
            if (hasPreviewEntry) {
                try {
                    const publishResult = await publisher.publishQualityPreview({
                        outputPath,
                        componentId: resolvedComponentId,
                        groupId: params.groupId,
                        target: snapshotTarget,
                    });
                    const publishedComponentId = publishResult?.componentId || resolvedComponentId;
                    if (publishedComponentId !== resolvedComponentId) {
                        this.logger.warn(`[Phase2] 组件重名，实际落名 ${publishedComponentId}（原 ${resolvedComponentId}），事务上下文同步修正`);
                    }
                    publishContext = { ...previewContext, componentId: publishedComponentId };
                    previewTransactionCommitted = publisher.commitQualityPreviewTransaction(publishContext);
                    if (!previewTransactionCommitted) {
                        throw new Error('候选预览发布事务提交失败');
                    }
                    this.logger.log(`[Phase2] candidate 预览已确认发布: ${sessionId} -> ${publishedComponentId} (${snapshotTarget})`);
                }
                catch (publishErr) {
                    candidatePublishError = publishErr instanceof Error
                        ? publishErr
                        : new Error(String(publishErr?.message || publishErr));
                    publisher.rollbackQualityPreviewTransaction({
                        ...publishContext,
                        reason: candidatePublishError.message,
                    });
                    this.logger.error(`[Phase2] candidate 预览发布失败: ${sessionId}: ${candidatePublishError.message}`, candidatePublishError.stack);
                }
            }
            else {
                publisher.rollbackQualityPreviewTransaction({
                    ...previewContext,
                    reason: '缺少 package/index.vue，无法发布候选预览',
                });
            }
            if (candidatePublishError) {
                terminalError = new Error(`候选预览发布失败: ${candidatePublishError.message}`);
                terminalError.code = 'PREVIEW_PUBLISH_FAILED';
            }
            else if (!hasPreviewEntry && !terminalError) {
                terminalError = new Error('生成产物缺少 package/index.vue，无法提供预览');
                terminalError.code = 'PREVIEW_ENTRY_MISSING';
            }
            if (candidateRevision) {
                candidateValidation = {
                    ...candidateValidation,
                    runtime: runtimeStatus === 'PASS' ? 'passed' : runtimeStatus === 'WARN' ? 'warning' : 'blocked',
                    structure: structureGate.blocked ? 'blocked' : 'passed',
                };
                let snapshot;
                if (!genError && qualityPassed && !structureGate.blocked && !candidatePublishError && hasPreviewEntry) {
                    snapshot = this.taskCodeSnapshotService.publishLastGood(sessionId, candidateRevision, candidateValidation);
                }
                else if (genError) {
                    snapshot = this.taskCodeSnapshotService.markPartial(sessionId, candidateRevision, terminalError?.message || '生成失败（部分文件已生成，可进入编辑器手动补全）', { ...candidateValidation, runtime: 'blocked' });
                }
                else if (!candidatePublishError && hasPreviewEntry) {
                    snapshot = this.taskCodeSnapshotService.markCandidateDegraded(sessionId, candidateRevision, terminalError?.message || structureGate.reason || '质量门禁未通过，已保留候选版本供人工审查', candidateValidation);
                }
                else {
                    snapshot = this.taskCodeSnapshotService.rejectCandidate(sessionId, candidateRevision, terminalError?.message || '候选预览发布失败', { ...candidateValidation, runtime: 'blocked' });
                }
                this.progressService.sendCodeSnapshot(sessionId, {
                    revision: snapshot.revision,
                    status: snapshot.status,
                    stage: snapshot.stage,
                    fileCount: snapshot.files.length,
                    changedFiles: snapshot.files.map((file) => file.path),
                    lastGoodRevision: snapshot.lastGoodRevision,
                });
            }
            if (terminalError && outputPath) {
                try {
                    const chunkMetaPath = (0, path_1.join)(outputPath, '.mc-gen', 'cache', 'code-chunks', 'chunk-meta.json');
                    if ((0, fs_1.existsSync)(chunkMetaPath)) {
                        const meta = JSON.parse((0, fs_1.readFileSync)(chunkMetaPath, 'utf-8'));
                        const completed = Array.isArray(meta?.completed) ? meta.completed : [];
                        const note = completed.length > 0
                            ? `已完成分块：${completed.join('、')}`
                            : '未生成任何完整分块';
                        terminalError.message = `${terminalError.message}\n${note}（半成品已保留，可进入编辑器手动补全）`;
                    }
                }
                catch { }
                try {
                    const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
                    const cp = loadCheckpoint(outputPath);
                    if (cp?.stage && cp.stage !== 'none') {
                        this.tasksService.updateTask(sessionId, { checkpointStatus: cp.stage });
                    }
                }
                catch { }
            }
            let completePayload = null;
            if (terminalError) {
                const t = this.tasksService.getTask(sessionId);
                if (t?.userApproved) {
                    this.logger.log(`[Phase2] 任务 ${sessionId} 用户已极速通过，跳过失败广播`);
                }
                else {
                    const friendly = (0, error_humanizer_js_1.humanizeGenerationError)(terminalError?.message);
                    if (friendly && terminalError && friendly !== terminalError.message) {
                        terminalError.friendlyMessage = friendly;
                    }
                    this.progressService.sendError(sessionId, terminalError);
                }
            }
            else {
                completePayload = {
                    ...genResult,
                    taskId: sessionId,
                    componentId: resolvedComponentId,
                    groupId: params.groupId,
                    target: genTarget || 'microcode',
                    _completionModels: {
                        visionModel: actualVisionModels.size
                            ? [...actualVisionModels].join(', ')
                            : (visionModelUsed || ''),
                        textModel: actualTextModels.size
                            ? [...actualTextModels].join(', ')
                            : (textModelUsed || ''),
                    },
                };
            }
            await (async () => {
                if (terminalError || !qualityPassed)
                    return;
                const hasEntry = !!outputPath && (0, fs_1.existsSync)((0, path_1.join)(outputPath, 'package', 'index.vue'));
                if (!outputPath || !componentName || !hasEntry) {
                    return;
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
                    await this.componentService.createComponent(componentName, componentName || '微码生成组件', resolvedGroupId, resolvedCreatorId, {
                        type: genTarget === 'vue3' ? 'vue3' : 'phase2',
                        target: genTarget || 'microcode',
                        taskId: sessionId,
                        componentId: resolvedComponentId,
                        sessionId,
                        figmaFileKey: params.fileKey,
                        figmaNodeId: params.nodeId,
                        ...(await readDualTruthMeta(outputPath)),
                        ...(figmaWidth ? { figmaWidth } : {}),
                        ...(figmaHeight ? { figmaHeight } : {}),
                    });
                    const dualMeta = await readDualTruthMeta(outputPath);
                    if (dualMeta.dualTruth) {
                        this.tasksService.updateTask(sessionId, {
                            dualTruth: true,
                            primaryBrightness: dualMeta.primaryBrightness,
                            secondaryBrightness: dualMeta.secondaryBrightness,
                        });
                    }
                    this.logger.log(`Component record saved to database: ${componentName} (sessionId: ${sessionId})`);
                }
                catch (error) {
                    this.logger.warn(`Failed to save component to database: ${error.message}`);
                }
            })().catch((err) => {
                this.logger.error(`Post-processing unhandled error for ${sessionId}: ${err.message}`, err.stack);
            });
            if (completePayload) {
                this.progressService.sendComplete(sessionId, completePayload);
                if (params.userId && qualityPassed) {
                    this.quotaService.recordSuccess(params.userId, sessionId);
                }
            }
        }
    }
    async resumeFromCheckpoint(sessionId, params) {
        try {
            const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
            const cp = loadCheckpoint(params.outputPath);
            if (cp.stage === 'code-generated') {
                return { success: false, error: '代码已生成，无需续跑' };
            }
            if (cp.stage === 'none') {
                return { success: false, error: '未找到可用的 checkpoint 缓存' };
            }
            this.logger.log(`🔄 断点续跑: ${sessionId} (stage=${cp.stage})`);
            const task = this.tasksService.getTask(sessionId);
            const config = task?.configSnapshot || {};
            const genInputs = {
                extraPrompt: task?.extraPrompt,
                requirementDocText: task?.requirementDocText,
                userComponentId: task?.userComponentId,
            };
            this.executeGeneration(sessionId, {
                componentName: params.componentName,
                fileKey: params.fileKey,
                nodeId: params.nodeId,
                outputPath: params.outputPath,
                config,
                groupId: params.groupId,
                userId: params.userId,
                panelType: params.panelType,
                target: params.target,
                ...genInputs,
                failureGuidance: params.failureGuidance,
                uiCache: cp.uiCache || undefined,
                resumeData: cp.resumeData || undefined,
            }).catch((error) => {
                this.logger.error(`断点续跑失败: ${sessionId}: ${error.message}`);
                this.progressService.sendError(sessionId, { message: error.message });
            });
            return {
                success: true,
                message: `已从断点继续生成（跳过已完成的分析阶段）`,
            };
        }
        catch (error) {
            this.logger.error(`resumeFromCheckpoint 失败: ${sessionId}: ${error.message}`);
            return { success: false, error: `断点续跑启动失败: ${error.message}` };
        }
    }
    async refineComponent(sessionId, params) {
        const { componentId, refineType = 'both', userId } = params;
        const task = this.tasksService.getTask(componentId);
        const outputPath = task?.outputPath;
        if (!outputPath || !(0, fs_1.existsSync)((0, path_1.join)(outputPath, 'package', 'index.vue'))) {
            throw new Error('任务产物不存在，无法精修（需先完成一次生成）');
        }
        const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
        const cp = loadCheckpoint(outputPath);
        const figmaNodeData = cp?.uiCache?.figmaNodeData || null;
        const previewAnalysis = cp?.uiCache?.previewAnalysis || null;
        const layoutStructure = previewAnalysis?.layoutStructure || null;
        const visualElements = previewAnalysis?.visualElements || null;
        const styleMappings = cp?.resumeData?.cachedStyleMappings || null;
        if (!figmaNodeData || !layoutStructure) {
            throw new Error('缺少分析缓存（checkpoint），无法精修。请重新生成一次以建立缓存');
        }
        const target = task.target || 'microcode';
        const groupId = task.groupId || 'default-group';
        const componentName = task.componentName || componentId;
        const generatedFiles = this.scanComponentFiles(outputPath);
        this.tasksService.createTask(sessionId, {
            configSnapshot: task.configSnapshot || {},
            componentId: componentId,
            groupId,
            componentName,
            nodeId: task.nodeId,
            fileKey: task.fileKey,
            target,
            outputPath,
            panelKey: task.panelKey || 'default-panel',
            taskType: 'component',
            userId,
            generationTier: 'max',
            sourceType: task.sourceType || 'figma',
        });
        const { Logger: CustomLogger } = await import('../ai-engine/logger/logger.js');
        CustomLogger.setSessionContext(sessionId, this.progressService);
        this.sendSseLog(sessionId, 'info', `人工精修已开始（${refineType === 'both' ? '布局 + 样式' : refineType}）`);
        CustomLogger.runInSessionContext(sessionId, this.progressService, () => {
            this.executeRefine(sessionId, {
                componentName,
                outputPath,
                target,
                groupId,
                userId,
                refineType,
                figmaNodeData,
                layoutStructure,
                visualElements,
                styleMappings,
                generatedFiles,
                config: task.configSnapshot || {},
            }).catch((error) => {
                this.logger.error(`精修失败: ${sessionId}: ${error.message}`, error.stack);
                this.progressService.sendError(sessionId, { message: error.message, stack: error.stack });
            });
        });
    }
    async executeRefine(sessionId, params) {
        const mergedAiConfig = await this.buildMergedAiConfig(params.config, params.userId);
        const { resolveTextConfig } = await import('../ai-engine/utils/ai-defaults.js');
        const textCfg = resolveTextConfig(mergedAiConfig);
        const onProgress = (data) => this.progressService.sendProgress(sessionId, data);
        const reviseTarget = (0, refine_target_js_1.resolveRefineTarget)(params.refineType);
        this.logger.log(`精修范围: refineType=${params.refineType} → _reviseTarget=${reviseTarget}`);
        if (params.refineType === 'layout' || params.refineType === 'both') {
            const { LayoutRefiner } = await import('../ai-engine/roles/layout-refiner.js');
            const refiner = new LayoutRefiner({
                apiKey: textCfg.apiKey,
                model: textCfg.model,
                baseURL: textCfg.baseURL,
            });
            const result = await refiner.execute({
                figmaNodeData: params.figmaNodeData,
                layoutStructure: params.layoutStructure,
                outputPath: params.outputPath,
                generatedFiles: params.generatedFiles,
                target: params.target,
                onProgress,
                _reviseTarget: reviseTarget,
            });
            this.sendSseLog(sessionId, 'info', result.refined
                ? `✅ 布局精修完成（修改 ${result.modifiedFiles?.length || 0} 个文件）`
                : `⚠️ 布局精修跳过: ${result.reason || '无修改'}`);
        }
        if (params.refineType === 'style' || params.refineType === 'both') {
            const { StyleRefiner } = await import('../ai-engine/roles/style-refiner.js');
            const refiner = new StyleRefiner({
                apiKey: textCfg.apiKey,
                model: textCfg.model,
                baseURL: textCfg.baseURL,
            });
            const result = await refiner.execute({
                figmaNodeData: params.figmaNodeData,
                styleMappings: params.styleMappings,
                visualElements: params.visualElements,
                outputPath: params.outputPath,
                generatedFiles: params.generatedFiles,
                target: params.target,
                onProgress,
                _reviseTarget: reviseTarget,
            });
            this.sendSseLog(sessionId, 'info', result.refined
                ? `✅ 样式精修完成（修改 ${result.modifiedFiles?.length || 0} 个文件）`
                : `⚠️ 样式精修跳过: ${result.reason || '无修改'}`);
        }
        await this.precompileCss(params.outputPath);
        await this.copyToWorkspace(params.outputPath, params.componentName, params.target, params.groupId);
        this.progressService.sendComplete(sessionId, {
            taskId: sessionId,
            componentId: sessionId,
            groupId: params.groupId,
            target: params.target,
            _completionModels: { visionModel: null, textModel: textCfg?.model || null },
        });
    }
    scanComponentFiles(outputPath) {
        const results = [];
        const walk = (dir, base) => {
            if (!(0, fs_1.existsSync)(dir))
                return;
            for (const name of (0, fs_1.readdirSync)(dir)) {
                const full = (0, path_1.join)(dir, name);
                const rel = base ? `${base}/${name}` : name;
                const st = (0, fs_1.statSync)(full);
                if (st.isDirectory()) {
                    if (name === '.checkpoint' || name === '.mc-gen' || name === '.cache' || name === 'node_modules')
                        continue;
                    walk(full, rel);
                }
                else if (name.endsWith('.vue') || name.endsWith('.less')) {
                    results.push(rel);
                }
            }
        };
        walk(outputPath, '');
        return results;
    }
    async precompileCss(outputPath) {
        try {
            const stylesDir = (0, path_1.join)(outputPath, 'resources', 'styles');
            const lessEntry = (0, path_1.join)(stylesDir, 'index.less');
            if (!(0, fs_1.existsSync)(lessEntry)) {
                this.logger.warn(`No index.less found at ${lessEntry}, skip CSS precompile`);
                return;
            }
            const sanitizeLess = (raw, fileName) => {
                let cleaned = (0, css_sanitizer_js_1.sanitizeCssContent)(raw, { isLessFile: true });
                if (fileName === 'theme-vars.less') {
                    const mixinCallPattern = /^\.(common|theme-dark|theme-light)\(\);\s*$/gm;
                    const hasRootMixin = mixinCallPattern.test(cleaned);
                    mixinCallPattern.lastIndex = 0;
                    if (hasRootMixin) {
                        const rootMixins = [];
                        let match;
                        while ((match = mixinCallPattern.exec(cleaned)) !== null) {
                            rootMixins.push(match[0].trim());
                        }
                        cleaned = cleaned.replace(mixinCallPattern, '');
                        if (/:root\s*\{/.test(cleaned)) {
                            cleaned = cleaned.replace(/(:root\s*\{)/, `$1\n${rootMixins.map((m) => `  ${m}`).join('\n')}`);
                        }
                        else {
                            cleaned += `\n:root {\n${rootMixins.map((m) => `  ${m}`).join('\n')}\n}`;
                        }
                        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
                    }
                }
                return cleaned;
            };
            const lessFiles = (await (0, promises_1.readdir)(stylesDir)).filter((f) => f.endsWith('.less'));
            for (const f of lessFiles) {
                const fp = (0, path_1.join)(stylesDir, f);
                const raw = await (0, promises_1.readFile)(fp, 'utf-8');
                const cleaned = sanitizeLess(raw, f);
                if (cleaned !== raw) {
                    await (0, promises_1.writeFile)(fp, cleaned, 'utf-8');
                    this.logger.warn(`Sanitized LESS file: ${f}`);
                }
            }
            const themesDir = (0, path_1.join)(stylesDir, 'themes');
            if ((0, fs_1.existsSync)(themesDir)) {
                const themeFiles = (await (0, promises_1.readdir)(themesDir)).filter((f) => f.endsWith('.less'));
                for (const f of themeFiles) {
                    const fp = (0, path_1.join)(themesDir, f);
                    const raw = await (0, promises_1.readFile)(fp, 'utf-8');
                    const cleaned = sanitizeLess(raw, f);
                    if (cleaned !== raw) {
                        await (0, promises_1.writeFile)(fp, cleaned, 'utf-8');
                        this.logger.warn(`Sanitized LESS file: themes/${f}`);
                    }
                }
            }
            const less = require('less');
            const lessSource = await (0, promises_1.readFile)(lessEntry, 'utf-8');
            try {
                const result = await less.render(lessSource, {
                    filename: lessEntry,
                    paths: [stylesDir],
                });
                const cssPath = (0, path_1.join)(outputPath, 'resources', 'styles', 'index.css');
                await (0, promises_1.writeFile)(cssPath, result.css, 'utf-8');
                const ruleCount = (result.css.match(/\{/g) || []).length;
                if (ruleCount === 0) {
                    const emptyError = new Error('LESS 编译产物无 CSS 规则（0 个选择器），源文件可能存在语法错误（如缺少分号）');
                    emptyError.code = 'LESS_EMPTY_OUTPUT';
                    throw emptyError;
                }
                this.logger.log(`Precompiled CSS written to ${cssPath} (${ruleCount} rules)`);
            }
            catch (firstError) {
                this.logger.warn(`First LESS compile failed (${firstError.message}), trying aggressive fix...`);
                const allLessFiles = [...lessFiles.map(f => ({ f, dir: stylesDir }))];
                if ((0, fs_1.existsSync)(themesDir)) {
                    const themeFiles = (await (0, promises_1.readdir)(themesDir)).filter((f) => f.endsWith('.less'));
                    themeFiles.forEach(f => allLessFiles.push({ f, dir: themesDir }));
                }
                for (const { f, dir } of allLessFiles) {
                    const fp = (0, path_1.join)(dir, f);
                    const content = await (0, promises_1.readFile)(fp, 'utf-8');
                    try {
                        await less.render(content, { filename: fp, paths: [stylesDir] });
                    }
                    catch (fileErr) {
                        this.logger.warn(`LESS file ${f} has errors: ${fileErr.message}, applying aggressive cleanup`);
                        const fixed = (0, css_sanitizer_js_1.aggressiveCleanCss)(content);
                        await (0, promises_1.writeFile)(fp, fixed, 'utf-8');
                        this.logger.warn(`Aggressively cleaned ${f}`);
                    }
                }
                try {
                    const themeVarsPath = (0, path_1.join)(themesDir, 'theme-vars.less');
                    if ((0, fs_1.existsSync)(themeVarsPath) && firstError?.message) {
                        const missingMatch = String(firstError.message).match(/variable\s+@([\w-]+)\s+is\s+undefined/i);
                        if (missingMatch) {
                            const missingVar = `@${missingMatch[1]}`;
                            const tv = await (0, promises_1.readFile)(themeVarsPath, 'utf-8');
                            const esc = missingVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const defRe = new RegExp(`^\\s*${esc}\\s*:\\s*([^;]+);`, 'm');
                            const defMatch = tv.match(defRe);
                            if (defMatch && !new RegExp(`^${esc}\\s*:\\s*[^;]+;\\s*$`, 'm').test(tv)) {
                                await (0, promises_1.writeFile)(themeVarsPath, `\n${missingVar}: ${defMatch[1].trim()};\n${tv}`, 'utf-8');
                                this.logger.warn(`已将缺失变量 ${missingVar} 从 mixin 复制到根级别（作用域修复）`);
                            }
                        }
                    }
                }
                catch (scopeErr) {
                    this.logger.warn(`变量作用域修复失败（非致命）: ${scopeErr.message}`);
                }
                try {
                    const retrySource = await (0, promises_1.readFile)(lessEntry, 'utf-8');
                    const result = await less.render(retrySource, {
                        filename: lessEntry,
                        paths: [stylesDir],
                    });
                    const cssPath = (0, path_1.join)(outputPath, 'resources', 'styles', 'index.css');
                    await (0, promises_1.writeFile)(cssPath, result.css, 'utf-8');
                    this.logger.log(`Precompiled CSS written to ${cssPath} (after retry)`);
                }
                catch (retryError) {
                    this.logger.error(`Failed to precompile CSS after retry: ${retryError.message}`);
                    const compileError = new Error(`共享 LESS 编译门禁阻断: ${retryError.message}`);
                    compileError.code = 'LESS_COMPILE_GATE_BLOCKED';
                    compileError.lessCompileGate = {
                        pass: false,
                        blockCount: 1,
                        diagnostics: [{
                                id: 'LESS-COMPILE-001',
                                severity: 'BLOCK',
                                sourceType: 'shared-less',
                                file: 'resources/styles/index.less',
                                line: retryError.line || 1,
                                column: (retryError.column ?? 0) + 1,
                                message: retryError.message,
                                extract: retryError.extract || [],
                            }],
                    };
                    throw compileError;
                }
            }
        }
        catch (error) {
            this.logger.error(`Failed to precompile CSS: ${error.message}`, error.stack);
            throw error;
        }
    }
    async fixPackageImagePaths(outputPath) {
        try {
            const { readFile, writeFile, readdir, stat } = await import('fs/promises');
            const packageDir = (0, path_1.join)(outputPath, 'package');
            if (!(0, fs_1.existsSync)(packageDir))
                return;
            const files = await this.collectVueFiles(packageDir);
            let fixedCount = 0;
            for (const filePath of files) {
                const content = await readFile(filePath, 'utf-8');
                const fixed = content.replace(/['"]\.\/resources\//g, (m) => m.replace('./', '../'));
                if (fixed !== content) {
                    await writeFile(filePath, fixed, 'utf-8');
                    fixedCount++;
                }
            }
            if (fixedCount > 0) {
                this.logger.log(`[路径修正] package/ 中 ${fixedCount} 个文件已修正图片路径（./resources/ → ../resources/）`);
            }
        }
        catch (err) {
            this.logger.warn(`[路径修正] 跳过：${err.message}`);
        }
    }
    resolveFigmaToken(figmaToken) {
        const directToken = typeof figmaToken === 'string' ? figmaToken.trim() : '';
        if (directToken) {
            return directToken;
        }
        throw new Error('缺少 Figma Token：当前请求未传入，请在配置面板配置 Figma Token');
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
    async collectVueFiles(dir) {
        const { readdir, stat } = await import('fs/promises');
        const result = [];
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = (0, path_1.join)(dir, entry.name);
            if (entry.isDirectory()) {
                result.push(...(await this.collectVueFiles(fullPath)));
            }
            else if (entry.name.endsWith('.vue')) {
                result.push(fullPath);
            }
        }
        return result;
    }
    async copyToWorkspace(outputPath, sessionId, target = 'microcode', groupId = 'default-group') {
        try {
            const publisher = await loadPreviewPublisher();
            let resolvedComponentId = publisher.resolveWorkspaceComponentId(outputPath, sessionId);
            if (resolvedComponentId !== sessionId) {
                this.logger.log(`[copyToWorkspace] workspace 目录名按 declare.json 归一: ${sessionId} -> ${resolvedComponentId}`);
            }
            const backendProbe = target === 'vue3'
                ? (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, resolvedComponentId)
                : (0, path_1.join)(backend_root_1.customComponentsDir, resolvedComponentId);
            const uniqueComponentId = publisher.resolveUniqueComponentId(backendProbe, resolvedComponentId, sessionId, this.logger);
            if (uniqueComponentId !== resolvedComponentId) {
                this.logger.warn(`[copyToWorkspace] 组件重名保护：${resolvedComponentId} 已被其他任务占用，改用 ${uniqueComponentId}`);
                resolvedComponentId = uniqueComponentId;
            }
            await this.fixPackageImagePaths(outputPath);
            const packageDir = (0, path_1.join)(outputPath, 'package');
            const syntaxErrors = (0, sfc_syntax_validation_js_1.validateVueSfcDirectory)(packageDir);
            if (!(0, fs_1.existsSync)(packageDir)) {
                throw new Error(`产物目录不存在: ${packageDir}`);
            }
            if (syntaxErrors.length > 0) {
                this.logger.warn(`[copyToWorkspace] SFC 校验有 ${syntaxErrors.length} 条警告（不阻断预览复制）: ${syntaxErrors.slice(0, 5).join('; ')}`);
            }
            const compDir = target === 'vue3' ? 'vue3-components' : 'custom-components';
            const backendPath = target === 'vue3'
                ? (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, resolvedComponentId)
                : (0, path_1.join)(backend_root_1.customComponentsDir, resolvedComponentId);
            const frontendPath = target === 'vue3'
                ? (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), compDir, groupId, resolvedComponentId)
                : (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), compDir, resolvedComponentId);
            for (const targetPath of [backendPath, frontendPath]) {
                if (!(0, fs_1.existsSync)(targetPath)) {
                    await (0, promises_1.mkdir)(targetPath, { recursive: true });
                }
                if (target === 'vue3') {
                    const packageDir = (0, path_1.join)(outputPath, 'package');
                    if (!(0, fs_1.existsSync)((0, path_1.join)(packageDir, 'index.vue'))) {
                        this.logger.error(`Vue3 入口缺失，跳过发布: ${packageDir}`);
                        continue;
                    }
                    await (0, promises_1.cp)(packageDir, (0, path_1.join)(targetPath, 'package'), { recursive: true });
                    const resourcesDir = (0, path_1.join)(outputPath, 'resources');
                    if ((0, fs_1.existsSync)(resourcesDir)) {
                        await (0, promises_1.cp)(resourcesDir, (0, path_1.join)(targetPath, 'resources'), { recursive: true });
                    }
                    this.logger.log(`Vue3 组件已复制到 ${targetPath}（package/ + resources/）`);
                }
                else {
                    await (0, promises_1.cp)(outputPath, targetPath, {
                        recursive: true,
                        filter: (src) => !src.endsWith('index.html'),
                    });
                    const cssPath = (0, path_1.join)(outputPath, 'resources', 'styles', 'index.css');
                    const lessPath = (0, path_1.join)(outputPath, 'resources', 'styles', 'index.less');
                    const hasCss = (0, fs_1.existsSync)(cssPath);
                    const hasLess = (0, fs_1.existsSync)(lessPath);
                    const styleImport = hasCss
                        ? "import './resources/styles/index.css'"
                        : hasLess
                            ? "import './resources/styles/index.less'"
                            : '// No CSS/LESS file found';
                    const componentJs = `import component from './package/index.vue'
${styleImport}
export default component
`;
                    await (0, promises_1.writeFile)((0, path_1.join)(targetPath, 'component.js'), componentJs, 'utf-8');
                }
                const generatedSizeSource = (0, path_1.join)(outputPath, '_figma-size.json');
                const figmaCacheSource = (0, path_1.join)(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
                const sizeSource = (0, fs_1.existsSync)(generatedSizeSource)
                    ? generatedSizeSource
                    : (0, fs_1.existsSync)(figmaCacheSource)
                        ? figmaCacheSource
                        : null;
                if (sizeSource) {
                    const targetSizePath = (0, path_1.join)(targetPath, '_figma-size.json');
                    await (0, promises_1.cp)(sizeSource, targetSizePath);
                    this.logger.debug(`[copyToWorkspace] 已复制 Figma 尺寸文件: ${targetSizePath}`);
                }
                publisher.writePreviewSourceMarker(targetPath, sessionId);
            }
            this.logger.log(`Component copied to workspace: ${resolvedComponentId} (${target}, backend + frontend)`);
        }
        catch (error) {
            this.logger.error(`Failed to copy component to workspace: ${error.message}`, error.stack);
            throw error;
        }
    }
    async packageComponent(componentId, target, groupId) {
        const workspacePath = await (0, component_resolver_js_1.resolveComponentDirStrict)(componentId);
        if (!workspacePath || !(0, fs_1.existsSync)(workspacePath)) {
            throw new Error(`组件不存在: ${componentId}`);
        }
        return new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const chunks = [];
            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(err));
            archive.directory(workspacePath, componentId, (0, package_filter_1.packageEntryFilter)());
            archive.finalize();
        });
    }
    async getFigmaPreview(figmaUrl, figmaToken, config, userId) {
        const { parseFigmaUrl } = await import('../ai-engine/utils/figma-url-parser.js');
        const { FigmaClient } = await import('../ai-engine/tools/figma/figma-client.js');
        const { getFigmaPreviewRateLimiter } = await import('../ai-engine/utils/figma-rate-limiter.js');
        const parsed = parseFigmaUrl(figmaUrl);
        if (!parsed.fileKey) {
            return { success: false, error: '无效的 Figma URL，缺少 fileKey' };
        }
        let userSavedToken = '';
        if (userId) {
            try {
                userSavedToken =
                    (await this.aiConfigService.getMergedAiConfig(userId))?.figmaToken || '';
            }
            catch {
            }
        }
        const token = figmaToken || config?.figmaToken || userSavedToken || process.env.FIGMA_ACCESS_TOKEN;
        if (!token) {
            return { success: false, error: '缺少 Figma Token' };
        }
        try {
            const client = new FigmaClient({ token, timeout: 30000, rateLimiter: getFigmaPreviewRateLimiter() });
            let nodeId = parsed.nodeId;
            if (!nodeId) {
                this.logger.log(`URL 未提供 node-id，自动获取文件第一个可用节点`);
                const fileData = await client.getFile(parsed.fileKey);
                nodeId = this._findFirstNodeId(fileData?.document);
                if (!nodeId) {
                    return { success: false, error: '无法从文件中找到可用节点，请在 URL 中添加 node-id 参数' };
                }
                this.logger.log(`自动找到节点: ${nodeId}`);
            }
            const apiNodeId = nodeId.replace(/-/g, ':');
            const previewScale = Math.min(Math.max(Number(process.env.FIGMA_PREVIEW_SCALE ?? 1.0) || 1.0, 0.5), 4);
            const { createHash } = await import('crypto');
            const tokenHash = createHash('sha256').update(token).digest('hex').slice(0, 8);
            const cacheKey = `${parsed.fileKey}:${apiNodeId}:${previewScale}:${tokenHash}`;
            const cacheTtlMs = Math.max(1, Number(process.env.FIGMA_PREVIEW_CACHE_TTL_HOURS ?? 24)) * 3600 * 1000;
            const cached = this._previewCache.get(cacheKey);
            if (cached && Date.now() - cached.cachedAt < cacheTtlMs) {
                if ((0, fs_1.existsSync)((0, path_1.join)(this._previewCacheDir, `${cached.previewToken}.png`))) {
                    this.logger.log(`figma-preview 缓存命中: ${cacheKey}`);
                    return {
                        success: true,
                        imageUrl: `/api/phase2/preview-image/${cached.previewToken}?raw=1`,
                        previewToken: cached.previewToken,
                        nodeName: cached.nodeName,
                        width: cached.width,
                        height: cached.height,
                    };
                }
                this._previewCache.delete(cacheKey);
                this.logger.warn(`figma-preview 缓存条目磁盘图缺失，已剔除: ${cacheKey} (token=${cached.previewToken})`);
            }
            this.logger.log(`figma-preview 缓存未命中: ${cacheKey}`);
            const fetchWithTimeout = async (url, timeoutMs = 25000) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const res = await fetch(url, { signal: controller.signal });
                    return res;
                }
                finally {
                    clearTimeout(timer);
                }
            };
            const [node, buffer] = await Promise.all([
                client.getNode(parsed.fileKey, nodeId, { depth: 1 }),
                (async () => {
                    const imgUrl = await client.exportImage(parsed.fileKey, apiNodeId, { format: 'png', scale: previewScale });
                    const response = await fetchWithTimeout(imgUrl);
                    if (!response.ok) {
                        throw new Error(`Failed to download preview image: ${response.status}`);
                    }
                    return Buffer.from(await response.arrayBuffer());
                })(),
            ]);
            const nodeName = node?.name || 'Unknown';
            const width = node?.absoluteBoundingBox?.width || 0;
            const height = node?.absoluteBoundingBox?.height || 0;
            const { randomUUID } = await import('crypto');
            const { mkdir, writeFile, readdir, stat, unlink } = await import('fs/promises');
            const previewToken = randomUUID();
            const cacheDir = (0, path_1.join)(backend_root_1.backendRoot, 'temp-preview-images');
            await mkdir(cacheDir, { recursive: true });
            await writeFile((0, path_1.join)(cacheDir, `${previewToken}.png`), buffer);
            this.logger.log(`Preview image cached: ${previewToken}.png (${buffer.length} bytes)`);
            this._previewCache.set(cacheKey, {
                previewToken,
                nodeName: node?.name || 'Unknown',
                width: Math.round(node?.absoluteBoundingBox?.width || 0),
                height: Math.round(node?.absoluteBoundingBox?.height || 0),
                cachedAt: Date.now(),
            });
            this._persistPreviewCache();
            const ttlMs = Math.max(1, Number(process.env.FIGMA_PREVIEW_CACHE_TTL_HOURS ?? 24)) * 3600 * 1000;
            try {
                const files = await readdir(cacheDir);
                const now = Date.now();
                const deletedTokens = new Set();
                for (const f of files) {
                    if (!f.endsWith('.png'))
                        continue;
                    const fp = (0, path_1.join)(cacheDir, f);
                    const st = await stat(fp).catch(() => null);
                    if (st && st.isFile() && now - st.mtimeMs > ttlMs) {
                        await unlink(fp).catch(() => { });
                        deletedTokens.add(f.replace(/\.png$/, ''));
                    }
                }
                if (deletedTokens.size > 0) {
                    let evicted = 0;
                    for (const [key, v] of [...this._previewCache.entries()]) {
                        if (deletedTokens.has(v.previewToken)) {
                            this._previewCache.delete(key);
                            evicted++;
                        }
                    }
                    if (evicted > 0) {
                        this._persistPreviewCache();
                        this.logger.log(`figma-preview TTL 清理: 删 ${deletedTokens.size} 张图, 驱逐 ${evicted} 个缓存条目并回写索引`);
                    }
                }
            }
            catch (e) {
            }
            return {
                success: true,
                imageUrl: `/api/phase2/preview-image/${previewToken}?raw=1`,
                previewToken,
                nodeName,
                width: Math.round(width),
                height: Math.round(height),
            };
        }
        catch (err) {
            this.logger.error(`Figma 预览获取失败: ${err.message}`);
            return { success: false, error: err.message };
        }
    }
    _findFirstNodeId(node) {
        if (!node)
            return null;
        const targetTypes = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);
        if (node.id && targetTypes.has(node.type)) {
            return node.id;
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                const found = this._findFirstNodeId(child);
                if (found)
                    return found;
            }
        }
        return null;
    }
};
exports.Phase2Service = Phase2Service;
exports.Phase2Service = Phase2Service = Phase2Service_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(10, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        task_code_snapshot_service_1.TaskCodeSnapshotService,
        progress_service_1.ProgressService,
        component_service_1.ComponentService,
        token_tracker_service_1.TokenTrackerService,
        config_service_1.AiConfigService,
        doc_analyzer_service_1.DocAnalyzerService,
        ui_cache_service_1.UiCacheService,
        quota_service_1.QuotaService,
        user_ai_config_service_1.UserAiConfigService,
        mongoose_2.Model])
], Phase2Service);
//# sourceMappingURL=phase2.service.js.map