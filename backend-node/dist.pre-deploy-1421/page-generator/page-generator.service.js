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
var PageGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("../tasks/tasks.service");
const progress_service_1 = require("../progress/progress.service");
const component_service_1 = require("../component/component.service");
const path_1 = require("path");
const fs_1 = require("fs");
const workspace_config_1 = require("../config/workspace.config");
const backend_root_1 = require("../config/backend-root");
const sfc_syntax_validation_js_1 = require("../ai-engine/utils/sfc-syntax-validation.js");
const config_service_1 = require("../config/config.service");
let PageGeneratorService = PageGeneratorService_1 = class PageGeneratorService {
    tasksService;
    progressService;
    componentService;
    aiConfigService;
    logger = new common_1.Logger(PageGeneratorService_1.name);
    constructor(tasksService, progressService, componentService, aiConfigService) {
        this.tasksService = tasksService;
        this.progressService = progressService;
        this.componentService = componentService;
        this.aiConfigService = aiConfigService;
    }
    async startPageGeneration(sessionId, dto, groupId, userId) {
        const { fileKey, nodeId, executionMode = 'parallel', concurrency = 2, config = {} } = dto;
        groupId = await this.componentService.resolvePrivateGroupId(groupId, userId);
        this.tasksService.createTask(sessionId, {
            componentId: sessionId,
            groupId,
            componentName: `page-${sessionId}`,
            nodeId,
            fileKey,
            taskType: 'page',
            userId,
            generationTier: 'max',
            sourceType: 'figma',
        });
        this.executePageGeneration(sessionId, {
            fileKey,
            nodeId,
            groupId,
            executionMode,
            concurrency,
            config,
            userId,
        }).catch((error) => {
            this.logger.error(`页面生成失败: ${error.message}`, error.stack);
            this.progressService.sendError(sessionId, {
                message: error.message,
                stack: error.stack,
            });
        });
    }
    async executePageGeneration(sessionId, params) {
        const { fileKey, nodeId, groupId, executionMode, concurrency, config } = params;
        try {
            const decomposerModule = await import('../ai-engine/utils/page-decomposer.js');
            const orchestratorModule = await import('../ai-engine/utils/batch-orchestrator.js');
            const { BatchOrchestrator } = orchestratorModule;
            const orchestrator = new BatchOrchestrator({
                sessionId,
                progressManager: this.progressService,
                concurrency,
                executionMode,
            });
            const figmaModule = await import('../ai-engine/roles/figma-connector.js');
            const { FigmaConnector } = figmaModule;
            const figmaConnector = new FigmaConnector({
                figmaToken: config.figmaToken || process.env.FIGMA_ACCESS_TOKEN,
            });
            orchestrator.figmaConnector = figmaConnector;
            const runSingle = async (compSessionId, compDto, compGroupId) => this.generateSingleComponent(compSessionId, compDto, compGroupId, params.userId, sessionId);
            orchestrator.phase2Service = {
                startGeneration: runSingle,
                startGenerationAndWait: runSingle,
            };
            const results = await orchestrator.generate(fileKey, nodeId, groupId, config);
            const summaryResults = results.map((r) => ({
                childSessionId: r.childSessionId,
                taskId: r.taskId || r.childSessionId,
                componentId: r.componentId || r.childSessionId,
                groupId: r.groupId || groupId,
                target: r.target || 'microcode',
                component: r.component,
                figmaNodeName: r.figmaNodeName,
                folderName: r.folderName,
                componentName: r.componentName,
                panelKey: r.panelKey,
                componentType: r.componentType,
                figmaNodeId: r.figmaNodeId,
                success: r.success,
                error: r.error,
                outputPath: r.outputPath,
                iterations: r.iterations,
                duration: r.duration,
            }));
            const successCount = summaryResults.filter((r) => r.success).length;
            const failedCount = summaryResults.filter((r) => !r.success).length;
            const summary = failedCount === 0
                ? 'all_success'
                : successCount === 0
                    ? 'all_failed'
                    : 'partial_failure';
            this.progressService.sendComplete(sessionId, {
                results: summaryResults,
                totalComponents: results.length,
                successCount,
                failedCount,
                summary,
            });
            this.logger.log(`页面生成完成: ${results.filter((r) => r.success).length}/${results.length} 成功`);
        }
        catch (error) {
            this.logger.error(`页面生成失败: ${error.message}`, error.stack);
            this.progressService.sendError(sessionId, error);
        }
    }
    async retryGeneration(originalSessionId, config, userId) {
        const meta = this.tasksService.getRetryMetadata(originalSessionId, userId);
        if (!meta || 'error' in meta) {
            throw new Error(meta?.error || '无法获取任务元数据');
        }
        const metadata = meta;
        const { randomBytes } = await import('crypto');
        const retrySessionId = `retry-${Date.now()}-${randomBytes(4).toString('hex')}`;
        this.tasksService.createRetryTask(originalSessionId, retrySessionId, userId);
        this.logger.log(`断点续跑启动: original=${originalSessionId}, retry=${retrySessionId}`);
        this.executeRetry(retrySessionId, metadata, config, userId).catch((error) => {
            this.logger.error(`重试生成失败: ${error.message}`, error.stack);
            this.progressService.sendError(retrySessionId, error);
        });
        return {
            success: true,
            sessionId: retrySessionId,
            originalSessionId,
            message: '断点续跑已启动',
        };
    }
    async executeRetry(retrySessionId, metadata, config, userId) {
        const { componentId, groupId, fileKey, nodeId, componentName, target, panelKey, outputPath: existingOutputPath, } = metadata;
        try {
            const aiDefaultsModule = await import('../ai-engine/utils/ai-defaults.js');
            const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;
            const runGeneration = target === 'vue3'
                ? (await import('../ai-engine/graphs/mc-component-graph-vue3.js')).runVue3Generation
                : (await import('../ai-engine/graphs/mc-component-graph-phase2.js')).runPhase2Generation;
            const checkpointData = { stage: 'full' };
            let detectedOutputPath = existingOutputPath;
            if (!detectedOutputPath) {
                const { globSync } = await import('glob');
                const candidates = globSync(`temp-components/**/${componentName}*/declare.json`, { cwd: backend_root_1.projectRoot });
                if (candidates.length > 0) {
                    detectedOutputPath = (0, path_1.join)(backend_root_1.projectRoot, candidates[0].replace('/declare.json', ''));
                }
            }
            if (detectedOutputPath && (0, fs_1.existsSync)(detectedOutputPath)) {
                const cpDir = (0, path_1.join)(detectedOutputPath, '.checkpoint');
                if ((0, fs_1.existsSync)((0, path_1.join)(detectedOutputPath, 'package', 'index.vue'))) {
                    checkpointData.stage = 'code-generated';
                    checkpointData._uiCache = {};
                    const figmaCp = (0, path_1.join)(cpDir, 'figma.json');
                    if ((0, fs_1.existsSync)(figmaCp)) {
                        try {
                            const raw = (0, fs_1.readFileSync)(figmaCp, 'utf-8');
                            checkpointData._uiCache.figmaNodeData = JSON.parse(raw);
                            this.logger.log('🔄 断点续跑: 已加载 Figma 缓存，跳过 Figma API 调用');
                        }
                        catch (e) { }
                    }
                    const visualCp = (0, path_1.join)(cpDir, 'visual.json');
                    if ((0, fs_1.existsSync)(visualCp)) {
                        try {
                            const raw = (0, fs_1.readFileSync)(visualCp, 'utf-8');
                            checkpointData._uiCache.previewAnalysis = JSON.parse(raw);
                            this.logger.log('🔄 断点续跑: 已加载视觉分析缓存，跳过 Vision AI 调用');
                        }
                        catch (e) { }
                    }
                    const analysisCp = (0, path_1.join)(cpDir, 'analysis.json');
                    if ((0, fs_1.existsSync)(analysisCp)) {
                        try {
                            const raw = (0, fs_1.readFileSync)(analysisCp, 'utf-8');
                            const analysisData = JSON.parse(raw);
                            checkpointData._cachedReviewResult = analysisData.reviewResult;
                            checkpointData._cachedStyleMappings = analysisData.styleMappings;
                            this.logger.log('🔄 断点续跑: 已加载分析缓存，跳过 parallel-analysis');
                        }
                        catch (e) { }
                    }
                }
                else {
                    const figmaCp = (0, path_1.join)(cpDir, 'figma.json');
                    if ((0, fs_1.existsSync)(figmaCp)) {
                        checkpointData.stage = 'figma-cached';
                        checkpointData._uiCache = {};
                        try {
                            const raw = (0, fs_1.readFileSync)(figmaCp, 'utf-8');
                            checkpointData._uiCache.figmaNodeData = JSON.parse(raw);
                            this.logger.log('🔄 断点续跑: 已加载 Figma 缓存，跳过 Figma API 调用');
                        }
                        catch (e) { }
                    }
                }
                this.logger.log(`断点续跑 checkpoint 级别: ${checkpointData.stage}, outputPath: ${detectedOutputPath}`);
            }
            this.tasksService.createTask(retrySessionId, {
                componentId,
                groupId,
                componentName,
                nodeId,
                fileKey,
                target,
                outputPath: detectedOutputPath || (0, path_1.join)(backend_root_1.tempComponentsDir, `retry-${retrySessionId}`, componentName),
                lastCompletedStage: checkpointData.stage || undefined,
                checkpointStatus: checkpointData.stage ? 'partial' : 'none',
                taskType: 'component',
                userId,
            });
            const mergedAiConfig = userId
                ? (await this.aiConfigService.getMergedAiConfig(userId))
                : {};
            const visionCfg = resolveVisionConfig({ ...mergedAiConfig });
            const textCfg = resolveTextConfig({
                ...mergedAiConfig,
                textApiKey: config?.apiKey || mergedAiConfig.textApiKey,
                textBaseURL: config?.endpoint || mergedAiConfig.textBaseURL,
                textModel: config?.model || mergedAiConfig.textModel,
            });
            const result = await runGeneration({
                componentName,
                fileKey,
                nodeId,
                outputPath: detectedOutputPath || (0, path_1.join)(backend_root_1.tempComponentsDir, `retry-${retrySessionId}`, componentName),
                panelType: panelKey || 'aio-panel',
                target,
                figmaToken: mergedAiConfig.figmaToken || process.env.FIGMA_ACCESS_TOKEN,
                visionAIConfig: visionCfg,
                textAIConfig: textCfg,
                aiConfig: {
                    apiKey: textCfg.apiKey,
                    baseURL: textCfg.baseURL,
                    model: textCfg.model,
                },
                sessionId: retrySessionId,
                uiCache: checkpointData._uiCache || null,
                _resumeData: {
                    stage: checkpointData.stage,
                    cachedReviewResult: checkpointData._cachedReviewResult || null,
                    cachedStyleMappings: checkpointData._cachedStyleMappings || null,
                },
                onProgress: (data) => {
                    this.progressService.sendProgress(retrySessionId, data);
                },
            });
            this.progressService.sendComplete(retrySessionId, {
                ...result,
                taskId: retrySessionId,
                componentId,
                groupId,
                target,
            });
            if (detectedOutputPath && componentName) {
                const hasEntry = (0, fs_1.existsSync)((0, path_1.join)(detectedOutputPath, 'package', 'index.vue'));
                if (hasEntry) {
                    try {
                        await this.copyToWorkspace(detectedOutputPath, componentId, target, groupId);
                    }
                    catch (postErr) {
                        this.logger.warn(`重试后复制到 workspace 失败: ${postErr.message}`);
                    }
                }
            }
            return result;
        }
        catch (error) {
            this.logger.error(`断点续跑执行失败: ${error.message}`, error.stack);
            this.progressService.sendError(retrySessionId, error);
            throw error;
        }
    }
    async generateSingleComponent(compSessionId, compDto, compGroupId, userId, parentSessionId) {
        const { componentName, fileKey, nodeId, componentId, panelType, target = 'microcode', config = {}, } = compDto;
        const folderName = componentName
            ? `${compSessionId}-${componentName}`
            : compSessionId;
        const tempRoot = (0, path_1.join)(backend_root_1.tempComponentsDir, compGroupId, folderName);
        const outputPath = config.outputPath || tempRoot;
        this.tasksService.createTask(compSessionId, {
            componentId: compSessionId,
            groupId: compGroupId,
            componentName,
            nodeId,
            fileKey,
            target,
            outputPath,
            checkpointStatus: 'none',
            taskType: 'component',
            parentId: parentSessionId,
            userId,
            generationTier: 'max',
            sourceType: 'figma',
        });
        try {
            const runGeneration = target === 'vue3'
                ? (await import('../ai-engine/graphs/mc-component-graph-vue3.js')).runVue3Generation
                : (await import('../ai-engine/graphs/mc-component-graph-phase2.js')).runPhase2Generation;
            const aiDefaultsModule = await import('../ai-engine/utils/ai-defaults.js');
            const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;
            const result = await runGeneration({
                componentName,
                fileKey,
                nodeId,
                outputPath,
                panelType: panelType || 'aio-panel',
                target,
                figmaToken: config.figmaToken || process.env.FIGMA_ACCESS_TOKEN,
                visionAIConfig: resolveVisionConfig(config),
                textAIConfig: resolveTextConfig(config),
                aiConfig: {
                    apiKey: config.aiApiKey,
                    baseURL: config.aiBaseURL,
                    model: config.aiModel,
                },
                onProgress: (data) => {
                    this.progressService.sendProgress(compSessionId, data);
                    if (parentSessionId && data.stage) {
                        const keyStages = ['complete', 'error', 'failed', 'figma-connector', 'visual-parser', 'microcode-engineer', 'code-structure-validator', 'adversarial-checker'];
                        const isKey = keyStages.some(s => data.stage?.includes?.(s)) || data.status === 'failed' || data.status === 'warning';
                        if (isKey) {
                            this.progressService.sendProgress(parentSessionId, {
                                type: 'progress',
                                stage: `[${componentName}] ${data.stage}`,
                                message: data.message || '',
                                status: data.status || 'info',
                                childSessionId: compSessionId,
                                componentName,
                                timestamp: Date.now(),
                            });
                        }
                    }
                },
            });
            this.progressService.sendComplete(compSessionId, {
                ...result,
                taskId: compSessionId,
                componentId: compSessionId,
                groupId: compGroupId,
                target,
            });
            const hasEntry = (0, fs_1.existsSync)((0, path_1.join)(outputPath, 'package', 'index.vue'));
            if (outputPath && componentName && hasEntry) {
                try {
                    if (target !== 'vue3') {
                        await this.precompileCss(outputPath);
                    }
                    await this.copyToWorkspace(outputPath, compSessionId, target, compGroupId);
                }
                catch (postErr) {
                    this.logger.warn(`Preview post-processing failed for ${compSessionId}: ${postErr.message}`);
                }
            }
            return result;
        }
        catch (error) {
            this.progressService.sendError(compSessionId, error);
            throw error;
        }
    }
    async analyzePage(fileKey, nodeId, config = {}) {
        const figmaModule = await import('../ai-engine/roles/figma-connector.js');
        const { FigmaConnector } = figmaModule;
        const figmaConnector = new FigmaConnector({
            figmaToken: config.figmaToken || process.env.FIGMA_ACCESS_TOKEN,
        });
        const nodeTree = await figmaConnector.fetchNodeData(fileKey, nodeId);
        if (!nodeTree) {
            throw new Error('Figma API 返回数据为空（节点可能不存在或无权限访问）');
        }
        const decomposerModule = await import('../ai-engine/utils/page-decomposer.js');
        const { findCpComponents } = decomposerModule;
        return findCpComponents(nodeTree);
    }
    async precompileCss(outputPath) {
        try {
            const { exec } = require('child_process');
            const lessEntry = (0, path_1.join)(outputPath, 'resources', 'styles', 'index.less');
            const cssOutput = (0, path_1.join)(outputPath, 'resources', 'styles', 'index.css');
            if ((0, fs_1.existsSync)(lessEntry)) {
                exec(`lessc "${lessEntry}" "${cssOutput}"`, (error) => {
                    if (error) {
                        this.logger.warn(`LESS 编译失败: ${error.message}`);
                    }
                });
            }
        }
        catch (error) {
            this.logger.warn(`CSS 预编译跳过: ${error.message}`);
        }
    }
    async copyToWorkspace(outputPath, componentId, target = 'microcode', groupId) {
        try {
            const { cp, mkdir, writeFile } = require('fs/promises');
            if (target === 'vue3' && !groupId) {
                throw new Error('Vue3 组件复制缺少 groupId');
            }
            const resolvedGroupId = groupId || '';
            const packageDir = (0, path_1.join)(outputPath, 'package');
            const syntaxErrors = (0, sfc_syntax_validation_js_1.validateVueSfcDirectory)(packageDir);
            if (syntaxErrors.length > 0) {
                throw new Error(`拒绝复制不可编译页面组件产物: ${syntaxErrors.slice(0, 5).join('; ')}`);
            }
            const backendWsPath = target === 'vue3'
                ? (0, path_1.join)(backend_root_1.vue3ComponentsDir, resolvedGroupId, componentId)
                : (0, path_1.join)(backend_root_1.customComponentsDir, componentId);
            const frontendWsPath = target === 'vue3'
                ? (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', resolvedGroupId, componentId)
                : (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', componentId);
            for (const targetPath of [backendWsPath, frontendWsPath]) {
                await mkdir(targetPath, { recursive: true });
                if (target === 'vue3') {
                    await cp((0, path_1.join)(outputPath, 'package'), (0, path_1.join)(targetPath, 'package'), { recursive: true });
                    const resourcesDir = (0, path_1.join)(outputPath, 'resources');
                    if ((0, fs_1.existsSync)(resourcesDir)) {
                        await cp(resourcesDir, (0, path_1.join)(targetPath, 'resources'), { recursive: true });
                    }
                    continue;
                }
                await cp(outputPath, targetPath, {
                    recursive: true,
                    filter: (src) => !src.endsWith('index.html'),
                });
                const hasCss = (0, fs_1.existsSync)((0, path_1.join)(outputPath, 'resources', 'styles', 'index.css'));
                const hasLess = (0, fs_1.existsSync)((0, path_1.join)(outputPath, 'resources', 'styles', 'index.less'));
                const styleImport = hasCss
                    ? "import './resources/styles/index.css'"
                    : hasLess
                        ? "import './resources/styles/index.less'"
                        : '// No CSS/LESS file found';
                const componentJs = `import component from './package/index.vue'
${styleImport}
export default component
`;
                await writeFile((0, path_1.join)(targetPath, 'component.js'), componentJs, 'utf-8');
            }
            this.logger.log(`组件已复制到 workspace（backend+frontend）: ${componentId} (${target})`);
        }
        catch (error) {
            this.logger.warn(`复制到 workspace 失败: ${error.message}`);
        }
    }
};
exports.PageGeneratorService = PageGeneratorService;
exports.PageGeneratorService = PageGeneratorService = PageGeneratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        progress_service_1.ProgressService,
        component_service_1.ComponentService,
        config_service_1.AiConfigService])
], PageGeneratorService);
//# sourceMappingURL=page-generator.service.js.map