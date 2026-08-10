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
const progress_service_1 = require("../progress/progress.service");
const component_service_1 = require("../component/component.service");
const token_tracker_service_1 = require("../token-usage/token-tracker.service");
const doc_analyzer_service_1 = require("./doc/doc-analyzer.service");
const ui_cache_service_1 = require("./ui-cache.service");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const workspace_config_1 = require("../config/workspace.config");
const config_service_1 = require("../config/config.service");
const quota_service_1 = require("../quota/quota.service");
const fs_1 = require("fs");
const { ZipArchive } = require('archiver');
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const css_sanitizer_js_1 = require("../ai-engine/utils/css-sanitizer.js");
const group_member_schema_1 = require("../schemas/group-member.schema");
const mongoose_3 = require("mongoose");
let Phase2Service = Phase2Service_1 = class Phase2Service {
    tasksService;
    progressService;
    componentService;
    tokenTrackerService;
    aiConfigService;
    docAnalyzerService;
    uiCacheService;
    quotaService;
    groupMemberModel;
    logger = new common_1.Logger(Phase2Service_1.name);
    constructor(tasksService, progressService, componentService, tokenTrackerService, aiConfigService, docAnalyzerService, uiCacheService, quotaService, groupMemberModel) {
        this.tasksService = tasksService;
        this.progressService = progressService;
        this.componentService = componentService;
        this.tokenTrackerService = tokenTrackerService;
        this.aiConfigService = aiConfigService;
        this.docAnalyzerService = docAnalyzerService;
        this.uiCacheService = uiCacheService;
        this.quotaService = quotaService;
        this.groupMemberModel = groupMemberModel;
    }
    async startGeneration(sessionId, dto, groupId, userId) {
        const { createLogger } = await import('../ai-engine/logger/index.js');
        const { Logger: CustomLogger } = await import('../ai-engine/logger/logger.js');
        CustomLogger.setSessionContext(sessionId, this.progressService);
        const { componentName, fileKey, nodeId, componentId, config = {}, panelType, target = 'microcode', requirementDoc, docAnalysis, } = dto;
        const finalComponentName = componentName || sessionId;
        const folderName = componentName && componentName !== sessionId
            ? `${sessionId}-${finalComponentName}`
            : sessionId;
        const tempRoot = (0, path_1.join)(process.cwd(), '..', 'temp-components', groupId, folderName);
        const outputPath = config.outputPath || tempRoot;
        const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
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
            target,
            outputPath,
            checkpointStatus: 'none',
            panelKey: panelType,
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
            target,
            requirementDoc,
            docAnalysis,
        }).catch((error) => {
            this.logger.error(`Phase 1 generation failed: ${error.message}`, error.stack);
            this.progressService.sendError(sessionId, {
                message: error.message,
                stack: error.stack,
            });
        });
    }
    async regenerateWithDoc(sessionId, params) {
        const { componentId, groupId, requirementDoc, config, userId, panelType } = params;
        const candidates = [
            (0, path_1.join)(process.cwd(), 'workspace', 'custom-components', componentId),
        ];
        const componentDir = candidates.find((p) => (0, fs_1.existsSync)(p));
        if (!componentDir) {
            throw new Error(`组件目录不存在: ${componentId}`);
        }
        const cacheHit = this.uiCacheService.check(componentDir, {});
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
        const outputPath = (0, path_1.join)(process.cwd(), '..', 'temp-components', groupId, `${sessionId}-${componentId}-doc-regen`);
        const configSnapshot = this.aiConfigService.buildTaskConfigSnapshot({
            ...config,
            outputPath,
            target: 'microcode',
            panelType,
        });
        this.tasksService.createTask(sessionId, {
            configSnapshot,
            componentId: sessionId,
            groupId,
            componentName: `${componentId}(文档纠偏)`,
            nodeId,
            fileKey,
            target: 'microcode',
            outputPath,
            checkpointStatus: 'none',
            panelKey: panelType,
            taskType: 'component',
            userId,
        });
        this.executeGeneration(sessionId, {
            componentName: componentId,
            fileKey,
            nodeId,
            outputPath,
            config,
            groupId,
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
        try {
            const { componentName: name, fileKey, nodeId, outputPath: path, config, panelType, target, requirementDoc, docAnalysis, uiCache, } = params;
            outputPath = path;
            componentName = name;
            genTarget = target || 'microcode';
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
            console.log('[Phase2] 原始 config:', JSON.stringify(config).substring(0, 400));
            const visionCfg = resolveVisionConfig(config);
            const textCfg = resolveTextConfig(config);
            console.log('[Phase2] visionCfg:', JSON.stringify(visionCfg));
            console.log('[Phase2] textCfg:', JSON.stringify(textCfg));
            const effectiveFigmaToken = this.resolveFigmaToken(config?.figmaToken);
            genResult = await runGeneration({
                componentName,
                fileKey,
                nodeId,
                outputPath,
                panelType: panelType || 'default-panel',
                target,
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
                requirementDoc,
                docAnalysis,
                uiCache,
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
            this.logger.log(`Phase 1 generation completed for session ${sessionId}`);
        }
        catch (error) {
            this.logger.error(`Phase 1 generation failed for session ${sessionId}: ${error.message}`);
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
                    target: genTarget || 'microcode',
                });
                if (params.userId) {
                    this.quotaService.recordSuccess(params.userId, sessionId);
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
                    await this.precompileCss(outputPath);
                    await this.copyToWorkspace(outputPath, sessionId, genTarget, params.groupId);
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
                    await this.componentService.createComponent(componentName, componentName || '微码生成组件', resolvedGroupId, resolvedCreatorId, {
                        type: genTarget === 'vue3' ? 'vue3' : 'phase2',
                        target: genTarget || 'microcode',
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
            await this.fixPackageImagePaths(outputPath);
            const compDir = target === 'vue3' ? 'vue3-components' : 'custom-components';
            const backendPath = target === 'vue3'
                ? (0, path_1.join)(process.cwd(), 'workspace', compDir, groupId, sessionId)
                : (0, path_1.join)(process.cwd(), 'workspace', compDir, sessionId);
            const frontendPath = target === 'vue3'
                ? (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), compDir, groupId, sessionId)
                : (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), compDir, sessionId);
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
            }
            this.logger.log(`Component copied to workspace: ${sessionId} (${target}, backend + frontend)`);
        }
        catch (error) {
            this.logger.error(`Failed to copy component to workspace: ${error.message}`, error.stack);
        }
    }
    async packageComponent(componentId, target, groupId) {
        let workspacePath = target === 'vue3' && groupId
            ? (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', groupId, componentId)
            : (0, path_1.join)(process.cwd(), 'workspace', 'custom-components', componentId);
        if (!(0, fs_1.existsSync)(workspacePath) && !target) {
            const vue3Base = (0, path_1.join)(process.cwd(), 'workspace/vue3-components');
            if ((0, fs_1.existsSync)(vue3Base)) {
                const { readdirSync, statSync } = await import('fs');
                for (const gDir of readdirSync(vue3Base)) {
                    const candidate = (0, path_1.join)(vue3Base, gDir, componentId);
                    if ((0, fs_1.existsSync)(candidate) && statSync(candidate).isDirectory()) {
                        workspacePath = candidate;
                        break;
                    }
                }
            }
        }
        if (!(0, fs_1.existsSync)(workspacePath)) {
            throw new Error(`组件不存在: ${componentId}`);
        }
        return new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const chunks = [];
            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(err));
            archive.directory(workspacePath, componentId);
            archive.finalize();
        });
    }
};
exports.Phase2Service = Phase2Service;
exports.Phase2Service = Phase2Service = Phase2Service_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(8, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        progress_service_1.ProgressService,
        component_service_1.ComponentService,
        token_tracker_service_1.TokenTrackerService,
        config_service_1.AiConfigService,
        doc_analyzer_service_1.DocAnalyzerService,
        ui_cache_service_1.UiCacheService,
        quota_service_1.QuotaService,
        mongoose_2.Model])
], Phase2Service);
//# sourceMappingURL=phase2.service.js.map