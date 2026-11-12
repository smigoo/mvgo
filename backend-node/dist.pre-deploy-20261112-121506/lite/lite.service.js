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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var LiteService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiteService = void 0;
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("../tasks/tasks.service");
const progress_service_1 = require("../progress/progress.service");
const component_service_1 = require("../component/component.service");
const token_tracker_service_1 = require("../token-usage/token-tracker.service");
const config_service_1 = require("../config/config.service");
const quota_service_1 = require("../quota/quota.service");
const task_code_snapshot_service_1 = require("../tasks/task-code-snapshot.service");
const design_canvas_1 = require("./utils/design-canvas");
const repair_json_util_1 = require("./repair-json.util");
const lite_theme_reconcile_1 = require("./utils/lite-theme-reconcile");
const figma_access_diagnosis_1 = require("./figma-access-diagnosis");
const lite_constants_1 = require("./lite.constants");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const sfc_syntax_validation_js_1 = require("../ai-engine/utils/sfc-syntax-validation.js");
const font_size_normalizer_js_1 = require("../ai-engine/utils/font-size-normalizer.js");
const font_size_guard_js_1 = require("../ai-engine/utils/font-size-guard.js");
const index_css_recompiler_js_1 = require("../ai-engine/utils/index-css-recompiler.js");
const less_compile_gate_js_1 = require("../ai-engine/validators/less-compile-gate.js");
const lite_subcomponent_splitter_js_1 = require("../ai-engine/utils/lite-subcomponent-splitter.js");
const iso_lite_prompt_js_1 = require("../ai-engine/utils/iso-lite-prompt.js");
const user_addendum_js_1 = require("../ai-engine/utils/user-addendum.js");
const layout_truth_healer_js_1 = require("../ai-engine/utils/layout-truth-healer.js");
const lite_truncation_telemetry_js_1 = require("./lite-truncation-telemetry.js");
const css_sanitizer_js_1 = require("../ai-engine/utils/css-sanitizer.js");
const sfc_semantics_js_1 = require("../ai-engine/utils/sfc-semantics.js");
const component_naming_js_1 = require("../ai-engine/utils/component-naming.js");
const less_variable_checker_js_1 = require("../ai-engine/validators/less-variable-checker.js");
const group_resolver_1 = require("../common/group-resolver");
const loadPreviewPublisher = () => import('../ai-engine/utils/workspace-preview-publisher.js');
const sharp_1 = __importDefault(require("sharp"));
const vision_agent_js_1 = require("../ai-engine/agents/vision-agent.js");
const ai_defaults_js_1 = require("../ai-engine/utils/ai-defaults.js");
const model_config_js_1 = require("../ai-engine/utils/model-config.js");
const workspace_config_1 = require("../config/workspace.config");
const backend_root_1 = require("../config/backend-root");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const group_member_schema_1 = require("../schemas/group-member.schema");
const mongoose_3 = require("mongoose");
const figma_client_js_1 = require("../ai-engine/tools/figma/figma-client.js");
const figma_url_parser_js_1 = require("../ai-engine/utils/figma-url-parser.js");
const figma_execution_token_probe_1 = require("../config/figma-execution-token-probe");
let LiteService = LiteService_1 = class LiteService {
    tasksService;
    progressService;
    componentService;
    tokenTrackerService;
    aiConfigService;
    quotaService;
    taskCodeSnapshotService;
    groupMemberModel;
    baseLogger = new common_1.Logger(LiteService_1.name);
    logger = this.baseLogger;
    loggerBridgePromise;
    resumeOperations = new Map();
    assetUpgradeOperations = new Map();
    constructor(tasksService, progressService, componentService, tokenTrackerService, aiConfigService, quotaService, taskCodeSnapshotService, groupMemberModel) {
        this.tasksService = tasksService;
        this.progressService = progressService;
        this.componentService = componentService;
        this.tokenTrackerService = tokenTrackerService;
        this.aiConfigService = aiConfigService;
        this.quotaService = quotaService;
        this.taskCodeSnapshotService = taskCodeSnapshotService;
        this.groupMemberModel = groupMemberModel;
    }
    ensureLoggerBridge() {
        if (!this.loggerBridgePromise) {
            this.loggerBridgePromise = (async () => {
                const { createLogger } = await import('../ai-engine/logger/index.js');
                const sseLogger = createLogger({ name: 'lite', progressManager: this.progressService });
                const target = this.baseLogger;
                this.logger = new Proxy(target, {
                    get(obj, prop) {
                        switch (prop) {
                            case 'log':
                                return (msg, ...args) => { obj.log(msg, ...args); sseLogger.info(String(msg)); };
                            case 'warn':
                                return (msg, ...args) => { obj.warn(msg, ...args); sseLogger.warn(String(msg)); };
                            case 'error':
                                return (msg, ...args) => { obj.error(msg, ...args); sseLogger.error(String(msg)); };
                            case 'debug':
                                return (msg, ...args) => { obj.debug(msg, ...args); sseLogger.debug(String(msg)); };
                            default:
                                return obj[prop];
                        }
                    },
                });
            })();
        }
        return this.loggerBridgePromise;
    }
    async withSessionLogContext(sessionId, fn) {
        const { Logger: SessionScopedLogger } = await import('../ai-engine/logger/index.js');
        return SessionScopedLogger.runInSessionContext(sessionId, this.progressService, fn);
    }
    async startGeneration(sessionId, dto, groupId, userId, meta) {
        return this.withSessionLogContext(sessionId, () => this.startGenerationInSession(sessionId, dto, groupId, userId, meta));
    }
    async startGenerationInSession(sessionId, dto, groupId, userId, meta) {
        const { sourceType, componentType, generationTier } = meta;
        const tempRoot = (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, sessionId);
        const outputPath = tempRoot;
        const controller = new AbortController();
        this.tasksService.registerAbortController(sessionId, controller);
        await this.ensureLoggerBridge();
        try {
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'precheck',
                status: 'running',
                message: sourceType === 'figma'
                    ? '导出 Figma 图片中...'
                    : sourceType === 'html'
                        ? '安全渲染 HTML 文件中...'
                        : '校验截图中...',
            });
            let imageResult;
            let figmaNodeData = null;
            if (sourceType === 'figma' && dto.figmaUrl) {
                imageResult = await this.fetchFigmaImage(dto, sessionId, userId);
                const parsed = (0, figma_url_parser_js_1.parseFigmaUrl)(dto.figmaUrl);
                if (parsed.fileKey && parsed.nodeId) {
                    await this.saveFigmaSource(outputPath, dto.figmaUrl, parsed.fileKey, parsed.nodeId);
                    try {
                        const tokenRes = await (0, figma_execution_token_probe_1.resolveExecutionFigmaTokenWithProbe)({
                            task: this.tasksService.getTask(sessionId),
                            requestConfig: dto.config,
                            envToken: process.env.FIGMA_ACCESS_TOKEN,
                            fileKey: parsed.fileKey,
                            nodeId: parsed.nodeId,
                        });
                        if (tokenRes?.token) {
                            const fc = new figma_client_js_1.FigmaClient({ token: tokenRes.token });
                            figmaNodeData = await fc.fetchNodeData(parsed.fileKey, parsed.nodeId);
                        }
                    }
                    catch (e) {
                        this.logger?.warn?.(`[lite] 奇偶检测 figma 节点树获取失败（非阻断）：${e?.message || e}`);
                        figmaNodeData = null;
                    }
                }
            }
            else if (sourceType === 'html' && dto.htmlContent) {
                imageResult = await this.renderHtmlPreview(dto, sessionId);
            }
            else {
                imageResult = this.normalizeImage(dto);
            }
            const { buffer, mime, ext } = imageResult;
            const { width: rasterWidth, height: rasterHeight } = await this.precheck(buffer, mime);
            const rasterScale = (0, design_canvas_1.normalizeRasterScale)(dto.rasterScale, design_canvas_1.DEFAULT_RASTER_SCALE);
            const canvas = (0, design_canvas_1.resolveDesignCanvas)({
                sourceType,
                rasterWidth,
                rasterHeight,
                previewWidth: dto.previewWidth,
                previewHeight: dto.previewHeight,
                logicalWidth: imageResult.logicalWidth,
                logicalHeight: imageResult.logicalHeight,
                rasterScale,
            });
            const width = canvas.width;
            const height = canvas.height;
            this.logger.log(`[design-canvas] sourceType=${sourceType} 栅格=${rasterWidth}x${rasterHeight} 画布=${width}x${height} rasterScale=${canvas.rasterScale} origin=${canvas.origin}`);
            if (!(0, design_canvas_1.isCanvasScaleConsistent)(canvas, rasterWidth)) {
                this.logger.warn(`设计画布与栅格倍率不自洽：栅格 ${rasterWidth}x${rasterHeight} / 画布 ${width}x${height} = ${(rasterWidth / Math.max(width, 1)).toFixed(2)}，声明 rasterScale=${canvas.rasterScale}（origin=${canvas.origin}）`, {
                    sourceType,
                    rasterWidth,
                    rasterHeight,
                    width,
                    height,
                    rasterScale: canvas.rasterScale,
                    origin: canvas.origin,
                });
            }
            const uploadDir = (0, path_1.join)(outputPath, '_upload');
            await (0, promises_1.mkdir)(uploadDir, { recursive: true });
            const uploadPath = (0, path_1.join)(uploadDir, `screenshot.${ext}`);
            await (0, promises_1.writeFile)(uploadPath, buffer);
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'precheck',
                status: 'completed',
                message: `${sourceType === 'html' ? 'HTML 渲染' : '截图校验'}通过（${rasterWidth}x${rasterHeight}）`,
                rasterWidth,
                rasterHeight,
                width,
                height,
            });
            if (sourceType !== 'figma') {
                this.tasksService.updateTask(sessionId, {
                    figmaDimensions: { width, height },
                });
            }
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'analyzing',
                status: 'running',
                message: '分析截图结构、配色与组件...',
            });
            const agent = await this.buildVisionAgent(dto, sourceType, userId);
            let brief;
            try {
                const analysisText = await agent.analyzeImage(uploadPath, this.buildAnalysisPrompt(width, height, rasterWidth, rasterHeight, imageResult.figmaTexts, canvas.rasterScale), { signal: controller.signal, requestTimeoutMs: 300000, onProgress: this.visionOnProgress(sessionId), outputKind: 'brief' });
                brief = this.parseBrief(analysisText);
                brief.oddEvenHints = figmaNodeData ? (0, layout_truth_healer_js_1.detectOddEvenPatterns)(figmaNodeData) : [];
                const pixelTheme = await this.sampleRootBrightness(buffer);
                if (pixelTheme) {
                    const modelTheme = typeof brief?.theme === 'string' ? brief.theme : '';
                    if (modelTheme && modelTheme !== pixelTheme) {
                        this.logger.warn(`主题判定不一致，以像素采样为准：模型=${modelTheme} 像素=${pixelTheme}`, { modelTheme, pixelTheme });
                    }
                    brief.theme = pixelTheme;
                    brief._themeSource = 'pixel';
                }
                else if (typeof brief?.theme === 'string') {
                    brief._themeSource = 'model';
                }
                if (dto.backgroundBrightness === 'light' || dto.backgroundBrightness === 'dark') {
                    brief.theme = dto.backgroundBrightness;
                    brief._themeSource = 'user-selected';
                }
                if (sourceType !== 'figma') {
                    const reconciled = (0, lite_theme_reconcile_1.reconcileBriefTheme)(brief, brief?.theme);
                    brief = reconciled.brief;
                    if (reconciled.applied) {
                        this.logger.warn(`主题色板与像素明暗冲突，已确定性归一：theme=${brief?.theme} fields=${reconciled.conflicts.length}`, { theme: brief?.theme, conflicts: reconciled.conflicts });
                    }
                }
                if (sourceType === 'figma') {
                    const edgeColor = await this.sampleEdgeColor(buffer);
                    if (edgeColor) {
                        if (!brief.colors || typeof brief.colors !== 'object')
                            brief.colors = {};
                        const modelBg = String(brief.colors.background || '');
                        if (modelBg && modelBg.toUpperCase() !== edgeColor) {
                            this.logger.warn(`底色不一致，以边缘像素采样为准：模型=${modelBg} 采样=${edgeColor}`);
                        }
                        brief.colors.background = edgeColor;
                        brief._bgSource = 'pixel-edge';
                    }
                }
            }
            catch (err) {
                this.progressService.sendProgress(sessionId, {
                    type: 'progress',
                    stage: 'analyzing',
                    status: 'failed',
                    message: `视觉分析失败: ${err.message}`,
                });
                throw this.wrapError(lite_constants_1.LiteErrorCode.ANALYSIS_FAILED, `视觉分析失败: ${err.message}`, err);
            }
            const derivedName = this.deriveComponentName(dto.componentName, brief, sessionId);
            const finalComponentName = derivedName.codeName;
            const displayName = derivedName.displayName;
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'analyzing',
                status: 'completed',
                message: '截图分析完成',
                brief,
            });
            await this.saveCheckpoint(outputPath, {
                stage: 'analysis_done',
                brief,
                width,
                height,
                sourceType,
                componentType,
                generationTier,
                ...(finalComponentName && finalComponentName !== sessionId ? { finalComponentName, displayName } : {}),
            });
            const isMicrocode = componentType === 'microcode';
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'generating',
                status: 'running',
                message: isMicrocode ? '生成微码组件代码...' : '生成 Vue3 组件代码...',
            });
            let vueCode;
            let declareJson = null;
            try {
                const guarded = await this.callCodegenWithTruncationRetry({
                    agent,
                    imagePath: uploadPath,
                    prompt: isMicrocode
                        ? this.buildMicrocodeCodegenPrompt(brief, finalComponentName, dto, width, height)
                        : this.buildCodegenPrompt(brief, finalComponentName, dto, width, height),
                    isMicrocode,
                    sessionId,
                    userId,
                    callOpts: { signal: controller.signal, requestTimeoutMs: 300000, onProgress: this.visionOnProgress(sessionId), outputKind: 'sfc' },
                });
                vueCode = guarded.vueCode;
                declareJson = guarded.declareJson ?? null;
            }
            catch (err) {
                this.progressService.sendProgress(sessionId, {
                    type: 'progress',
                    stage: 'generating',
                    status: 'failed',
                    message: `代码生成失败: ${err.message}`,
                });
                throw this.wrapError(lite_constants_1.LiteErrorCode.GENERATION_FAILED, `代码生成失败: ${err.message}`, err);
            }
            if (!vueCode || vueCode.trim().length < 30) {
                throw this.wrapError(lite_constants_1.LiteErrorCode.GENERATION_FAILED, '生成的组件代码为空或无效');
            }
            vueCode = (0, css_sanitizer_js_1.repairScopedThirdPartySelectors)(vueCode, this.logger);
            vueCode = this.sanitizeVueScriptImports(vueCode);
            this.validateLiteSfc(vueCode);
            const _scriptBlock = vueCode.match(/<script[\s>][\s\S]*?<\/script>/i);
            const _scriptBody = _scriptBlock ? _scriptBlock[0] : vueCode;
            const _residualDups = [
                ...(0, sfc_semantics_js_1.findDuplicateImports)(_scriptBody),
                ...(0, sfc_semantics_js_1.findDuplicateScriptDeclarations)(_scriptBody),
            ];
            if (_residualDups.length > 0) {
                throw this.wrapError(lite_constants_1.LiteErrorCode.GENERATION_FAILED, `生成的组件存在重复声明（${_residualDups.slice(0, 5).join('、')}），已拒绝发布`);
            }
            if (isMicrocode) {
                const userComponentIdNormalized = (0, component_naming_js_1.normalizeUserComponentId)(dto.userComponentId);
                const uniqueComponentId = userComponentIdNormalized || (0, component_naming_js_1.buildComponentId)(finalComponentName || 'component', sessionId);
                declareJson = this.normalizeLiteDeclare(declareJson, uniqueComponentId, finalComponentName, width, height, brief?.theme);
            }
            await this.saveCheckpoint(outputPath, {
                stage: 'codegen_done',
                brief,
                width,
                height,
                sourceType,
                componentType,
                generationTier,
                vueCode,
                ...(declareJson ? { declareJson } : {}),
            });
            const packageDir = (0, path_1.join)(outputPath, 'package');
            await (0, promises_1.mkdir)(packageDir, { recursive: true });
            if (isMicrocode) {
                const { buildMcSkeleton } = await import('../ai-engine/utils/mc-skeleton.js');
                const { extractAndPrepareLiteMicrocodeStyles } = await import('../ai-engine/utils/lite-style-extractor.js');
                const _extracted = await extractAndPrepareLiteMicrocodeStyles(vueCode, finalComponentName);
                let vueFinal = _extracted.vueFinal;
                let businessStyles = _extracted.businessStyles;
                const styleStats = _extracted.styleStats;
                {
                    const _fontGuard = (0, font_size_guard_js_1.ensureMinFontSize)({
                        'package/index.vue': vueFinal,
                        'resources/styles/common.less': businessStyles,
                    });
                    vueFinal = _fontGuard.files['package/index.vue'];
                    businessStyles = _fontGuard.files['resources/styles/common.less'];
                    const _fontGuardLog = (0, font_size_guard_js_1.formatFontGuardLog)(_fontGuard, 'lite');
                    this.logger.log(_fontGuardLog.message, _fontGuardLog.meta);
                }
                await (0, promises_1.writeFile)((0, path_1.join)(packageDir, 'index.vue'), vueFinal, 'utf-8');
                this.logLiteSubcomponentSplit(packageDir, sessionId);
                await (0, promises_1.writeFile)((0, path_1.join)(outputPath, 'declare.json'), JSON.stringify(declareJson, null, 2), 'utf-8');
                const skeleton = buildMcSkeleton({
                    componentName: finalComponentName,
                    rootClass: `c-${finalComponentName}`,
                });
                if (businessStyles && businessStyles.trim().length > 0) {
                    skeleton['resources/styles/common.less'] =
                        `@import './themes/theme-vars.less';

.common();

// ─────────────────────────────────────────────
// ${finalComponentName} 业务样式（从 LLM 产物提取）
// ─────────────────────────────────────────────
${businessStyles}
`;
                }
                try {
                    const { healBusinessStyleVarRefs } = await import('../ai-engine/utils/theme-color-guard.js');
                    const { pruneDuplicateStyleDeclsFromShared } = await import('../ai-engine/utils/style-dedup-guard.js');
                    const varFixed = healBusinessStyleVarRefs(skeleton, {
                        logger: this.logger,
                    });
                    const dedup = pruneDuplicateStyleDeclsFromShared(skeleton);
                    if (varFixed.length > 0 || dedup.changes.length > 0) {
                        this.logger.log(`🛡️ P1.9 Lite 写盘自愈：var() 直引→槽位 ${varFixed.length} 个文件；` +
                            `FLEX-003 同名类布局冲突剥离 ${dedup.changes.length} 处`);
                    }
                }
                catch (healErr) {
                    this.logger.warn('⚠️ P1.9 Lite 写盘自愈失败（非阻断）', {
                        error: healErr?.message || String(healErr),
                    });
                }
                const idxKey = 'package/index.vue';
                if (typeof skeleton[idxKey] === 'string' && skeleton[idxKey].includes("@import './resources/")) {
                    skeleton[idxKey] = skeleton[idxKey]
                        .split("@import './resources/")
                        .join("@import '../resources/");
                    this.logger.log('🛡️ P1.9-③ package/index.vue @import 路径兜底归一（./resources → ../resources）');
                }
                for (const [rel, content] of Object.entries(skeleton)) {
                    const abs = (0, path_1.join)(outputPath, rel);
                    await (0, promises_1.mkdir)((0, path_1.dirname)(abs), { recursive: true });
                    await (0, promises_1.writeFile)(abs, content, 'utf-8');
                }
                this.logger.log(`🧩 P1.8 微码平台骨架已补齐（${Object.keys(skeleton).length} 个文件）；` +
                    `业务样式${businessStyles ? `${businessStyles.split('\n').length}行` : '无'}` +
                    `；字号${styleStats.fontNormalized ? '已归一' : '无需归一'}`);
            }
            else {
                const _fontGuardVue3 = (0, font_size_guard_js_1.ensureMinFontSize)({ 'package/index.vue': vueCode });
                vueCode = _fontGuardVue3.files['package/index.vue'];
                const _fontGuardVue3Log = (0, font_size_guard_js_1.formatFontGuardLog)(_fontGuardVue3, 'lite');
                this.logger.log(_fontGuardVue3Log.message, _fontGuardVue3Log.meta);
                await (0, promises_1.writeFile)((0, path_1.join)(packageDir, 'index.vue'), vueCode, 'utf-8');
                this.logLiteSubcomponentSplit(packageDir, sessionId);
            }
            const previewDir = (0, path_1.join)(outputPath, 'resources', 'images');
            await (0, promises_1.mkdir)(previewDir, { recursive: true });
            await (0, sharp_1.default)(buffer).png().toFile((0, path_1.join)(previewDir, 'mc-preview.png'));
            await (0, promises_1.writeFile)((0, path_1.join)(outputPath, '_figma-size.json'), JSON.stringify({ document: { absoluteBoundingBox: { width, height } } }, null, 2), 'utf-8');
            const metaPathL1 = (0, path_1.join)(outputPath, 'component-meta.json');
            let prevMetaL1 = {};
            try {
                if ((0, fs_1.existsSync)(metaPathL1)) {
                    prevMetaL1 = JSON.parse((0, fs_1.readFileSync)(metaPathL1, 'utf-8')) || {};
                }
            }
            catch {
                prevMetaL1 = {};
            }
            await (0, promises_1.writeFile)(metaPathL1, JSON.stringify({
                ...prevMetaL1,
                requirementDoc: dto.requirementDoc || '',
                docAnalysis: null,
                componentName: finalComponentName,
                displayName: displayName || finalComponentName,
                generatedAt: new Date().toISOString(),
            }, null, 2), 'utf-8');
            if (isMicrocode) {
                await this.ensureLiteStylesCompilable(outputPath, sessionId);
            }
            await this.publishValidatedLiteOutput(outputPath, sessionId, groupId, isMicrocode ? 'microcode' : 'vue3', dto);
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'generating',
                status: 'completed',
                message: '组件已生成',
            });
            this.tasksService.updateTask(sessionId, {
                componentName: finalComponentName,
                ...(displayName && displayName !== finalComponentName ? { displayName } : {}),
            });
            const target = componentType;
            const resultComponentId = isMicrocode
                ? (0, component_naming_js_1.normalizeUserComponentId)(dto.userComponentId) ||
                    (0, component_naming_js_1.buildComponentId)(finalComponentName || 'component', sessionId)
                : sessionId;
            const workspacePath = isMicrocode
                ? (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', resultComponentId)
                : (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, sessionId);
            this.progressService.sendComplete(sessionId, {
                taskId: sessionId,
                componentId: resultComponentId,
                groupId,
                target,
                sourceType,
                componentType,
                generationTier,
                componentName: finalComponentName,
                displayName,
                workspacePath,
                outputPath,
                previewImage: (0, path_1.join)(previewDir, 'mc-preview.png'),
                brief,
                code: vueCode,
                _completionModels: { visionModel: agent?.model || null, textModel: agent?.model || null },
                ...(declareJson ? { declareJson } : {}),
            });
            if (userId) {
                try {
                    await this.quotaService.recordSuccess(userId, sessionId);
                }
                catch (e) {
                    this.logger.warn(`配额记录失败(非阻塞): ${e.message}`);
                }
            }
            this.persistComponent(finalComponentName, sessionId, groupId, userId, width, height, componentType, sourceType, generationTier, dto.userComponentId).catch((e) => this.logger.warn(`组件记录保存失败(非阻塞): ${e.message}`));
        }
        catch (error) {
            this.logger.error(`Lite 生成失败 ${sessionId}: ${error.message}`, error.stack);
            this.progressService.sendError(sessionId, {
                code: error.code || lite_constants_1.LiteErrorCode.INTERNAL_ERROR,
                message: error.message ||
                    lite_constants_1.LITE_ERROR_MESSAGES[lite_constants_1.LiteErrorCode.INTERNAL_ERROR],
            });
            return false;
        }
        finally {
            this.tasksService.removeAbortController(sessionId);
            try {
                const { readdirSync, copyFileSync, mkdirSync } = await import('fs');
                const uploadDir = (0, path_1.join)(outputPath, '_upload');
                const entries = readdirSync(uploadDir).filter((f) => /^screenshot\.(png|jpe?g|webp)$/i.test(f));
                if (entries.length > 0) {
                    const imagesDir = (0, path_1.join)(outputPath, 'resources', 'images');
                    mkdirSync(imagesDir, { recursive: true });
                    for (const f of entries) {
                        const ext = f.replace(/^screenshot\./i, '');
                        copyFileSync((0, path_1.join)(uploadDir, f), (0, path_1.join)(imagesDir, `source-screenshot.${ext}`));
                    }
                    this.logger.log(`📸 原截图已保留为缓存: ${entries.join(', ')} -> resources/images/source-screenshot.*`);
                }
            }
            catch {
            }
            try {
                await (0, promises_1.rm)((0, path_1.join)(outputPath, '_upload'), {
                    recursive: true,
                    force: true,
                });
            }
            catch {
            }
        }
    }
    async upgradeAssets(sessionId, fallbackFigmaUrl, userId) {
        return this.withSessionLogContext(sessionId, async () => {
            const running = this.assetUpgradeOperations.get(sessionId);
            if (running)
                return running;
            const operation = this.performAssetUpgrade(sessionId, fallbackFigmaUrl);
            this.assetUpgradeOperations.set(sessionId, operation);
            try {
                return await operation;
            }
            finally {
                this.assetUpgradeOperations.delete(sessionId);
            }
        });
    }
    async performAssetUpgrade(sessionId, fallbackFigmaUrl) {
        const task = this.tasksService.getTask(sessionId);
        if (!task) {
            return { success: false, message: `任务 ${sessionId} 不存在` };
        }
        const srcType = task.sourceType || '';
        const tier = task.generationTier || '';
        if (srcType !== 'figma' || tier !== 'lite') {
            return {
                success: false,
                message: '素材升级仅支持 Figma 来源的 Lite 组件',
            };
        }
        const status = task.status;
        if (status !== 'completed') {
            return { success: false, message: '素材升级仅支持已完成的组件' };
        }
        const outputPath = task.outputPath;
        if (!outputPath) {
            return { success: false, message: '未找到组件产物目录' };
        }
        let fileKey;
        let nodeId;
        try {
            const { readFileSync } = await import('fs');
            const cacheDir = (0, path_1.join)(outputPath, '.cache');
            const sourceFile = (0, path_1.join)(cacheDir, 'figma-source.json');
            if ((0, fs_1.existsSync)(sourceFile)) {
                const src = JSON.parse(readFileSync(sourceFile, 'utf-8'));
                fileKey = src.fileKey;
                nodeId = src.nodeId;
                this.logger.log(`📌 从 .cache/figma-source.json 读取 Figma 源: ${fileKey}/${nodeId}`);
            }
            else if (fallbackFigmaUrl) {
                const parsed = (0, figma_url_parser_js_1.parseFigmaUrl)(fallbackFigmaUrl);
                if (!parsed.fileKey || !parsed.nodeId) {
                    return {
                        success: false,
                        message: '传入的 Figma URL 无法解析出 fileKey/nodeId',
                    };
                }
                fileKey = parsed.fileKey;
                nodeId = parsed.nodeId;
                await this.saveFigmaSource(outputPath, fallbackFigmaUrl, fileKey, nodeId);
                this.logger.log(`📌 历史任务已建立 Figma 源缓存: ${fileKey}/${nodeId}`);
            }
            else {
                return {
                    success: false,
                    message: '未找到 Figma 源信息（.cache/figma-source.json），历史组件需从 Figma URL 重新生成一次以建立来源缓存',
                };
            }
        }
        catch (e) {
            return { success: false, message: `读取 Figma 源信息失败: ${e.message}` };
        }
        const userId = task?.userId;
        const aiConfig = await this.aiConfigService.getMergedAiConfig(userId);
        const figmaTokenRes = await (0, figma_execution_token_probe_1.resolveExecutionFigmaTokenWithProbe)({
            task: task || null,
            activeConfig: aiConfig,
            envToken: process.env.FIGMA_ACCESS_TOKEN,
            fileKey,
            nodeId,
        });
        this.logger.log(`[figma-cred] lite/upgrade-assets session=${sessionId} source=${figmaTokenRes.source} ` +
            `reason=${figmaTokenRes.reason} ref=${figmaTokenRes.refSource || '-'} ` +
            `probed=${figmaTokenRes.probes.length} :: ${figmaTokenRes.note}`);
        const figmaToken = figmaTokenRes.token;
        if (!figmaToken) {
            return { success: false, message: figmaTokenRes.note };
        }
        if (figmaTokenRes.refFields) {
            this.tasksService.updateTask(sessionId, figmaTokenRes.refFields);
        }
        this.tasksService.updateTask(sessionId, { status: 'running' });
        try {
            const { FigmaConnector } = await import('../ai-engine/roles/figma-connector.js');
            const connector = new FigmaConnector({ figmaToken });
            this.logger.log(`🔍 获取 Figma 节点数据: ${fileKey}/${nodeId}`);
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'upgrade-fetch',
                status: 'running',
                message: '获取 Figma 节点数据...',
            });
            const nodeData = await connector.fetchNodeData(fileKey, nodeId);
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'upgrade-fetch',
                status: 'completed',
                message: `节点数据获取完成 (${fileKey}/${nodeId})`,
            });
            const cacheDir = (0, path_1.join)(outputPath, '.cache');
            const { mkdirSync, writeFileSync } = await import('fs');
            mkdirSync(cacheDir, { recursive: true });
            writeFileSync((0, path_1.join)(cacheDir, 'figma-node-data.json'), JSON.stringify({ fileKey, nodeId, fetchedAt: new Date().toISOString(), document: nodeData }, null, 2));
            const assetsDir = (0, path_1.join)(cacheDir, 'resources');
            mkdirSync(assetsDir, { recursive: true });
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'upgrade-download',
                status: 'running',
                message: '下载素材资源（bg/img/icon）...',
            });
            const assets = await connector.downloadAssets(fileKey, nodeData, assetsDir);
            const dlCount = assets.filter((a) => a.downloaded).length;
            const cssCount = assets.filter((a) => a.cssInsteadOfImage).length;
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'upgrade-download',
                status: 'completed',
                message: `素材下载完成：${dlCount} 个图片 + ${cssCount} 个 CSS 替代`,
                data: { downloaded: dlCount, cssSubstituted: cssCount, total: assets.length },
            });
            const resourceDomMapping = connector._buildResourceDomMapping(nodeData, assets);
            const mappingPath = (0, path_1.join)(cacheDir, 'resource-dom-mapping.json');
            writeFileSync(mappingPath, JSON.stringify(resourceDomMapping, null, 2));
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'upgrade-analysis',
                status: 'running',
                message: '确定性资源挂载（真值锚点，不用 AI 定位）...',
            });
            const { buildTruthInventory } = await import('../lite-lab/lib/truth-inventory.js');
            const { truth, feed } = buildTruthInventory(nodeData, assets);
            const imagesDir = (0, path_1.join)(outputPath, 'resources', 'images');
            mkdirSync(imagesDir, { recursive: true });
            const { copyFileSync } = await import('fs');
            let syncedCount = 0;
            const copiedFiles = [];
            for (const asset of assets) {
                if (asset.downloaded && asset.localPath && !asset.cssInsteadOfImage) {
                    const fileName = asset.localPath.split('/').pop() || `${asset.name}.png`;
                    const destFile = (0, path_1.join)(imagesDir, fileName);
                    copyFileSync(asset.localPath, destFile);
                    syncedCount++;
                    copiedFiles.push(`resources/images/${fileName}`);
                }
            }
            const packageDir = (0, path_1.join)(outputPath, 'package');
            if (!(0, fs_1.existsSync)((0, path_1.join)(packageDir, 'index.vue'))) {
                throw new Error('产物结构不支持（缺 package/index.vue）——存量任务请先在详情页确认产物完整');
            }
            const sfcFiles = this.collectLiteSfcFiles(packageDir);
            const { buildE2nMap, mountBgByE2n } = await import('../lite-lab/lib/e2n-map.js');
            const e2n = buildE2nMap(nodeData, sfcFiles);
            const { mountAssetIcons } = await import('../lite-lab/lib/truth-matcher.js');
            const mount = mountAssetIcons(sfcFiles, truth.assets);
            for (const f of mount.files) {
                if (f.changed)
                    writeFileSync((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
            }
            const legacyBg = mountBgByE2n(mount.files.map((f) => ({ path: f.path, content: f.content })), truth.assets, e2n);
            for (const f of legacyBg.files) {
                if (f.changed)
                    writeFileSync((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
            }
            const { detectUnsourcedStyles, countAutoApplicable } = await import('../lite-lab/lib/unsourced-style.js');
            const { applyUnsourcedStyles } = await import('../lite-lab/lib/unsourced-apply.js');
            const filesAfterBg = [...mount.files].map((f) => legacyBg.files.find((x) => x.path === f.path && x.changed)
                ? { path: f.path, content: legacyBg.files.find((x) => x.path === f.path).content }
                : { path: f.path, content: f.content });
            const unsourced = detectUnsourcedStyles({ figmaRoot: nodeData, prodFiles: filesAfterBg, e2n });
            const ua = applyUnsourcedStyles({ findings: unsourced.findings, prodFiles: filesAfterBg });
            for (const f of ua.files) {
                if (f.changed)
                    writeFileSync((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
            }
            const finalLiteFiles = ua.files;
            const deterministicStats = {
                feed,
                mounted: mount.stats.mounted,
                svgSkipped: mount.stats.svgSkipped,
                bgAnchored: mount.stats.bgAnchored + legacyBg.stats.anchored,
                unsourcedFindings: unsourced.stats.findings,
                unsourcedApplied: ua.stats.applied,
                unsourcedRemainingAuto: countAutoApplicable(detectUnsourcedStyles({ figmaRoot: nodeData, prodFiles: ua.files, e2n }).findings),
            };
            const codeUpdated = mount.files.some((f) => f.changed) || legacyBg.files.some((f) => f.changed) || ua.files.some((f) => f.changed);
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'upgrade-analysis',
                status: 'completed',
                message: `确定性挂载完成：icon ${mount.stats.mounted}/${truth.assets.length}，bg ${deterministicStats.bgAnchored}，无源样式落地 ${ua.stats.applied}`,
                data: deterministicStats,
            });
            void codeUpdated;
            let placementReport = null;
            let codeApplication = { codeUpdated: false, appliedPlacements: [], skippedPlacements: [], modifiedFiles: [], validation: { sfcStructure: 'skipped', scriptSetupUnchanged: 'skipped' } };
            if (mount.stats.mounted === 0 && truth.assets.length > 0) {
                this.progressService.sendProgress(sessionId, {
                    type: 'progress',
                    stage: 'upgrade-analysis',
                    status: 'running',
                    message: '确定性通道未命中，降级 AI 定位...',
                });
                const resourceDomMappingForAi = resourceDomMapping;
                placementReport = await this.analyzeAssetPlacement(outputPath, resourceDomMappingForAi, assets, userId);
                if (placementReport?.placements?.length) {
                    codeApplication = await this.applyAssetPlacementsToCode(outputPath, placementReport, resourceDomMapping, assets, userId);
                }
            }
            const manifestPath = (0, path_1.join)(cacheDir, 'resources.json');
            const manifest = {
                componentId: sessionId,
                fileKey,
                nodeId,
                upgradedAt: new Date().toISOString(),
                totalAssets: assets.length,
                assets: assets.map((a) => ({
                    name: a.name,
                    ref: a.ref,
                    localPath: a.localPath,
                    downloadStatus: a.downloaded ? 'success' : a.cssInsteadOfImage ? 'css' : 'failed',
                    type: a.preferredUsage || (a.localPath?.includes('bg-') ? 'bg' : a.localPath?.includes('icon-') ? 'icon' : 'image'),
                    ...(a.cssInsteadOfImage ? { cssValue: a.cssValue } : {}),
                })),
                mapping: resourceDomMapping.map((m) => ({
                    figmaNodeId: m.figmaNodeId,
                    resourceFile: m.resourceFile,
                    targetDomSelector: m.targetDomSelector,
                    downloadStatus: m.downloadStatus,
                    role: m.previewAnalysisRole,
                    recommendedUsage: m.recommendedUsage,
                })),
                placementReport,
                codeApplication,
            };
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            writeFileSync((0, path_1.join)(cacheDir, 'asset-code-application.json'), JSON.stringify({ appliedAt: new Date().toISOString(), ...codeApplication }, null, 2));
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'upgrade-sync',
                status: 'running',
                message: `提交续跑版本（revision 事务，${syncedCount} 个资源文件）...`,
            });
            const candidate = this.taskCodeSnapshotService.createCandidate({
                sessionId,
                componentId: sessionId,
                groupId: task.groupId || 'default-group',
                target: task.target === 'microcode' ? 'microcode' : 'vue3',
                stage: 'asset-upgrade',
                files: this.collectSnapshotFiles(outputPath),
            });
            const upgradeValidation = {
                semantics: 'passed',
                sfc: 'passed',
                less: 'passed',
                runtime: 'pending',
            };
            this.taskCodeSnapshotService.markValidating(sessionId, candidate.revision, upgradeValidation);
            this.progressService.sendCodeSnapshot(sessionId, {
                revision: candidate.revision,
                status: 'validating',
                stage: candidate.stage,
                fileCount: candidate.files.length,
                changedFiles: candidate.files.map((file) => file.path),
                lastGoodRevision: candidate.lastGoodRevision,
            });
            try {
                await this.copyToWorkspace(outputPath, sessionId, task.groupId || 'default-group', task.target || 'vue3');
                const published = this.taskCodeSnapshotService.publishLastGood(sessionId, candidate.revision, { ...upgradeValidation, runtime: 'passed' });
                this.progressService.sendCodeSnapshot(sessionId, {
                    revision: published.revision,
                    status: published.status,
                    stage: published.stage,
                    fileCount: published.files.length,
                    changedFiles: published.files.map((file) => file.path),
                    lastGoodRevision: published.revision,
                });
            }
            catch (upgradeError) {
                const rejected = this.taskCodeSnapshotService.rejectCandidate(sessionId, candidate.revision, upgradeError?.message || '素材续跑 workspace 同步失败', { ...upgradeValidation, runtime: 'blocked' });
                this.progressService.sendCodeSnapshot(sessionId, {
                    revision: rejected.revision,
                    status: rejected.status,
                    stage: rejected.stage,
                    fileCount: rejected.files.length,
                    changedFiles: rejected.files.map((file) => file.path),
                    lastGoodRevision: rejected.lastGoodRevision,
                });
                throw upgradeError;
            }
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'upgrade-sync',
                status: 'completed',
                message: `续跑版本已发布（revision ${candidate.revision.slice(0, 12)}…，可一键回滚）`,
            });
            const upgradeResult = {
                totalAssets: assets.length,
                downloaded: assets.filter((a) => a.downloaded).length,
                cssSubstituted: assets.filter((a) => a.cssInsteadOfImage).length,
                syncedToWorkspace: syncedCount,
                mappingFile: mappingPath,
                placementReport,
                codeUpdated: codeApplication.codeUpdated,
                backupFile: codeApplication.backupFile,
                appliedPlacements: codeApplication.appliedPlacements,
                skippedPlacements: codeApplication.skippedPlacements,
                modifiedFiles: [...copiedFiles, ...codeApplication.modifiedFiles],
                validation: codeApplication.validation,
                deterministicStats,
            };
            const currentTask = this.tasksService.getTask(sessionId);
            this.tasksService.updateTask(sessionId, {
                status: 'completed',
                error: undefined,
                result: {
                    ...(currentTask?.result || {}),
                    upgradeResult,
                },
                assetUpgradedAt: Date.now(),
                assetUpgradeNote: (() => {
                    const ds = deterministicStats;
                    const parts = [`挂载 ${ds.mounted}/${truth.assets.length}`];
                    if (ds.bgAnchored > 0)
                        parts.push(`背景 ${ds.bgAnchored}`);
                    if (ds.unsourcedApplied > 0)
                        parts.push(`删无源样式 ${ds.unsourcedApplied}`);
                    return parts.join('，');
                })(),
            });
            this.progressService.sendProgress(sessionId, {
                type: 'upgrade-complete',
                stage: 'upgrade-complete',
                status: 'completed',
                message: codeApplication.codeUpdated ? '素材升级并自动应用完成' : '素材下载完成，代码未自动修改',
                data: upgradeResult,
            });
            this.logger.log(`✅ 素材升级完成: ${sessionId}, 总素材 ${assets.length}, 下载 ${assets.filter((a) => a.downloaded).length}, CSS替代 ${assets.filter((a) => a.cssInsteadOfImage).length}, 同步 ${syncedCount}, 自动应用 ${codeApplication.appliedPlacements.length} 项`);
            return {
                success: true,
                message: codeApplication.codeUpdated
                    ? `素材升级完成：已下载 ${syncedCount} 个资源，并自动应用 ${codeApplication.appliedPlacements.length} 个素材到组件代码`
                    : `素材升级完成：已下载 ${syncedCount} 个资源，但没有可安全自动应用的位置，组件代码保持不变`,
                assets: manifest.assets,
                mappingFile: mappingPath,
                placementReport,
                codeUpdated: codeApplication.codeUpdated,
                backupFile: codeApplication.backupFile,
                appliedPlacements: codeApplication.appliedPlacements,
                skippedPlacements: codeApplication.skippedPlacements,
                modifiedFiles: upgradeResult.modifiedFiles,
                validation: codeApplication.validation,
            };
        }
        catch (error) {
            let diagnosis = null;
            let userMessage = `素材升级失败: ${error.message}`;
            if ((0, figma_access_diagnosis_1.isFigmaNotFoundError)(error)) {
                try {
                    diagnosis = await (0, figma_access_diagnosis_1.diagnoseFigmaNotFoundAccess)({
                        fileKey,
                        nodeId,
                        config: aiConfig,
                    });
                    userMessage = `素材升级失败：${diagnosis.message}`;
                    this.logger.warn(`[LiteService] Figma 404 归因 ${sessionId}: ${JSON.stringify({
                        activeSlotId: diagnosis.activeSlotId,
                        candidateSlotIds: diagnosis.candidateSlotIds,
                        probes: diagnosis.probes,
                    })}`);
                }
                catch (diagError) {
                    this.logger.warn(`[LiteService] Figma 404 归因失败（降级为原始错误）: ${diagError?.message}`);
                }
            }
            this.logger.error(`素材升级失败 ${sessionId}: ${error.message}`, error.stack);
            this.progressService.sendProgress(sessionId, {
                type: 'upgrade-error',
                stage: 'upgrade-error',
                status: 'failed',
                message: userMessage,
            });
            const currentTask = this.tasksService.getTask(sessionId);
            this.tasksService.updateTask(sessionId, {
                status: 'completed',
                result: {
                    ...(currentTask?.result || {}),
                    upgradeResult: {
                        ...(currentTask?.result?.upgradeResult || {}),
                        success: false,
                        error: error.message,
                        message: userMessage,
                        ...(diagnosis
                            ? {
                                diagnosis: {
                                    kind: diagnosis.kind,
                                    activeSlotId: diagnosis.activeSlotId,
                                    candidateSlotIds: diagnosis.candidateSlotIds,
                                    probes: diagnosis.probes,
                                },
                            }
                            : {}),
                        failedAt: new Date().toISOString(),
                    },
                },
            });
            return { success: false, message: userMessage };
        }
    }
    async saveFigmaSource(outputPath, figmaUrl, fileKey, nodeId, nodeName) {
        try {
            const { mkdirSync, writeFileSync } = await import('fs');
            const cacheDir = (0, path_1.join)(outputPath, '.cache');
            mkdirSync(cacheDir, { recursive: true });
            writeFileSync((0, path_1.join)(cacheDir, 'figma-source.json'), JSON.stringify({
                figmaUrl,
                fileKey,
                nodeId,
                nodeName: nodeName || '',
                savedAt: new Date().toISOString(),
            }, null, 2));
            this.logger.log(`💾 Figma 源信息已保存到 .cache/figma-source.json: ${fileKey}/${nodeId}`);
        }
        catch (e) {
            this.logger.warn(`保存 Figma 源信息失败（非阻塞）: ${e.message}`);
        }
    }
    async analyzeAssetPlacement(outputPath, resourceDomMapping, assets, userId) {
        try {
            const { readFileSync } = await import('fs');
            const vuePath = (0, path_1.join)(outputPath, 'package', 'index.vue');
            if (!(0, fs_1.existsSync)(vuePath)) {
                this.logger.warn('组件 Vue 文件不存在，跳过位置分析');
                return null;
            }
            const vueCode = readFileSync(vuePath, 'utf-8');
            const templateMatch = vueCode.match(/<template>([\s\S]*?)<\/template>/i);
            const template = templateMatch ? templateMatch[1].trim() : vueCode;
            if (template.length < 10) {
                this.logger.warn('组件模板为空，跳过位置分析');
                return null;
            }
            const actionableMappings = resourceDomMapping.filter((m) => m.downloadStatus === 'success' || m.downloadStatus === 'css' || m.deduplicatedFrom);
            if (actionableMappings.length === 0) {
                this.logger.log('无可定位资源，跳过位置分析');
                return null;
            }
            const mappingSummary = actionableMappings.map((m, i) => {
                const asset = assets.find((a) => a.ref === m.figmaNodeId);
                const fileName = m.resourceFile
                    ? m.resourceFile.split('/').pop()
                    : m.cssInsteadOfImage
                        ? `[CSS: ${m.cssValue?.slice?.(0, 40) || 'N/A'}]`
                        : '[未下载]';
                return `${i + 1}. Figma 节点: ${m.figmaNodeId} (${m.figmaPath || 'unknown'})
   - 类型: ${m.previewAnalysisRole || 'unknown'}
   - 资源文件: ${fileName}
   - 推荐用途: ${m.recommendedUsage || '未指定'}
   - Figma 建议选择器(仅供参考, 以真实模板为准): ${m.targetDomSelector || '无'}
   - 描述提示: ${m.targetDomHint || m.hint || '无'}
   - Figma 尺寸: ${m.figmaBox ? `${m.figmaBox.width}x${m.figmaBox.height}` : '未知'}
   - 状态: ${m.downloadStatus}${m.cssInsteadOfImage ? ` (CSS: ${m.cssValue?.slice?.(0, 30)})` : ''}`;
            }).join('\n\n');
            const prompt = `你是一个前端组件素材定位专家。下面是：
1. 一个 Vue 组件的模板代码（仅 template 部分）
2. Figma 资源映射表，列出了从 Figma 下载的素材（背景图/图标/图片）

请分析**每个素材应该对应到模板中的哪个 DOM 元素**，并给出具体的使用建议。

回复 JSON 格式（不要 markdown 包裹）：
{
  "placements": [
    {
      "figmaNodeId": "节点ID",
      "resourceFile": "资源文件名",
      "type": "bg|icon|image",
      "targetElement": "模板中的目标元素描述",
      "targetSelector": "CSS 选择器（如 .header-bg）",
      "usage": "imgSrc|backgroundImage|inlineStyle|cssClass",
      "codeSuggestion": "具体代码片段（如 <img :src=\"bgHeader\" class=\"header-bg\" /> 或 style=\"background-image: url(...)\"）",
      "confidence": "high|medium|low",
      "reason": "匹配理由"
    }
  ],
  "summary": "整体定位总结（1-2句话）"
}

规则：
- 以组件模板中的【真实 class 与 DOM 结构】为准进行定位，不要机械依赖 Figma 映射里的 targetDomSelector（那只是参考，经常与真实模板 class 不一致）
- 仔细阅读下方完整模板，根据素材类型（bg/icon/image）与 Figma 描述，推断最合理的承载元素
- bg 类型（大面积背景）通常作为容器背景，优先选最外层或区块容器元素（如 header/section 根 div）
- icon 类型（小图标）用 <img> 标签或 CSS background 替换原占位图标
- image 类型直接放入对应内容区 <img>
- 若模板中确实无合适元素，才标记 confidence 为 low 并解释原因
- CSS 替代的资源不需要定位，跳过

--- 组件模板 ---
${template.slice(0, 12000)}

--- Figma 资源映射 ---
${mappingSummary}`;
            const aiConfig = await this.aiConfigService.getMergedAiConfig(userId);
            const apiKey = aiConfig.textApiKey || aiConfig.apiKey;
            const baseURL = aiConfig.textBaseURL || aiConfig.baseURL;
            if (!apiKey || !baseURL) {
                this.logger.warn('AI 配置不完整，跳过素材位置分析');
                return null;
            }
            const { buildChatUrl } = await import('../ai-engine/utils/chat-url.js');
            const fullUrl = buildChatUrl(baseURL);
            const model = aiConfig.textModel || aiConfig.model || '';
            this.logger.log(`🤖 调用 AI 分析素材位置: ${model}`);
            const axios = (await import('axios')).default;
            const response = await axios.post(fullUrl, {
                model,
                messages: [
                    { role: 'system', content: '你是一个前端组件素材定位专家。只返回合法 JSON，不要任何额外文字。' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 16384,
                response_format: { type: 'json_object' },
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 300000,
            });
            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                this.logger.warn('AI 位置分析返回空内容');
                return null;
            }
            let parsed;
            try {
                parsed = JSON.parse(content);
            }
            catch {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                }
                else {
                    this.logger.warn('AI 位置分析返回非 JSON 内容');
                    return null;
                }
            }
            const result = {
                placements: (parsed.placements || []).filter((p) => p.confidence !== 'low' && p.type !== 'css'),
                summary: parsed.summary || '',
                analyzedAt: new Date().toISOString(),
                model,
            };
            this.logger.log(`✅ AI 位置分析完成: ${result.placements.length} 个素材已定位`);
            return result;
        }
        catch (error) {
            this.logger.warn(`AI 素材位置分析失败（非阻塞）: ${error.message}`);
            return null;
        }
    }
    collectLiteSfcFiles(packageDir) {
        const { existsSync, readdirSync, readFileSync } = require('fs');
        const out = [];
        if (!existsSync(packageDir))
            return out;
        for (const name of readdirSync(packageDir)) {
            const full = (0, path_1.join)(packageDir, name);
            if (name.endsWith('.vue')) {
                out.push({ path: `package/${name}`, content: readFileSync(full, 'utf8') });
            }
            else if (name === 'components') {
                const compDir = (0, path_1.join)(packageDir, 'components');
                for (const c of readdirSync(compDir)) {
                    if (c.endsWith('.vue')) {
                        out.push({ path: `package/components/${c}`, content: readFileSync((0, path_1.join)(compDir, c), 'utf8') });
                    }
                }
            }
        }
        return out;
    }
    async applyAssetPlacementsToCode(outputPath, placementReport, resourceDomMapping, assets, userId) {
        const placements = Array.isArray(placementReport?.placements)
            ? placementReport.placements
            : [];
        const skippedResult = (reason) => ({
            codeUpdated: false,
            appliedPlacements: [],
            skippedPlacements: placements.map((placement) => ({
                ...placement,
                skipReason: reason,
            })),
            modifiedFiles: [],
            validation: {
                sfcStructure: 'skipped',
                scriptSetupUnchanged: 'skipped',
                resourceReferences: 'skipped',
            },
        });
        if (placements.length === 0) {
            return skippedResult('无高/中置信度素材定位结果');
        }
        const vuePath = (0, path_1.join)(outputPath, 'package', 'index.vue');
        if (!(0, fs_1.existsSync)(vuePath)) {
            throw new Error(`组件入口不存在: ${vuePath}`);
        }
        const { readFileSync, writeFileSync, readdirSync } = await import('fs');
        const originalCode = readFileSync(vuePath, 'utf-8');
        const originalScript = this.extractSfcBlock(originalCode, 'script');
        const imagesDir = (0, path_1.join)(outputPath, 'resources', 'images');
        const availableFiles = (0, fs_1.existsSync)(imagesDir)
            ? new Set(readdirSync(imagesDir, { withFileTypes: true })
                .filter((entry) => entry.isFile())
                .map((entry) => entry.name))
            : new Set();
        const actionablePlacements = placements.filter((placement) => {
            const fileName = String(placement.resourceFile || '').split('/').pop() || '';
            return fileName && availableFiles.has(fileName);
        });
        if (actionablePlacements.length === 0) {
            return skippedResult('定位结果未引用已下载的本地素材');
        }
        const aiConfig = (await this.aiConfigService.getMergedAiConfig(userId)) || {};
        const apiKey = aiConfig.textApiKey || aiConfig.apiKey;
        const baseURL = aiConfig.textBaseURL || aiConfig.baseURL;
        if (!apiKey || !baseURL) {
            return skippedResult('AI 文本模型配置不完整');
        }
        const placementContext = actionablePlacements.map((placement) => {
            const fileName = String(placement.resourceFile).split('/').pop();
            const mapping = resourceDomMapping.find((item) => item.figmaNodeId === placement.figmaNodeId);
            const asset = assets.find((item) => item.ref === placement.figmaNodeId);
            return {
                ...placement,
                resourceFile: `../resources/images/${fileName}`,
                figmaPath: mapping?.figmaPath,
                targetDomHint: mapping?.targetDomHint || mapping?.hint,
                dimensions: mapping?.figmaBox,
                preferredUsage: asset?.preferredUsage,
            };
        });
        const prompt = `你是 Vue3 单文件组件素材应用工程师。请把给定的本地图片素材应用到组件中，并返回修改后的完整 Vue SFC。

硬性规则：
1. 只允许修改 <template> 和 <style>；<script setup> 的开始标签、内容、结束标签必须逐字保持不变。
2. 只能引用清单中的 ../resources/images/* 本地路径，禁止 data URL、网络 URL 和不存在的文件。
3. 背景使用 CSS background-image: url('../resources/images/文件名')；内容图和图标优先直接使用 <img src="../resources/images/文件名">，不要新增 JS import。
4. 保留现有业务结构、交互、变量、事件、组件标签和 scoped/lang 属性，只做素材应用所需的最小改动。
5. 选择器不可靠时，以 targetElement、reason、DOM 语义和现有 class 综合判断；无法可靠应用的素材跳过。
6. 必须返回完整且可闭合的 template、script setup、style，不要输出解释。

--- 可应用素材 ---
${JSON.stringify(placementContext, null, 2)}

--- 原始组件 ---
${originalCode}`;
        const { buildChatUrl } = await import('../ai-engine/utils/chat-url.js');
        const fullUrl = buildChatUrl(baseURL);
        const model = aiConfig.textModel || aiConfig.model || '';
        const axios = (await import('axios')).default;
        const response = await axios.post(fullUrl, {
            model,
            messages: [
                {
                    role: 'system',
                    content: '只返回一个包含完整 Vue SFC 的 ```vue 代码块。不得修改 script setup。',
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 16384,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 300000,
        });
        const content = response.data?.choices?.[0]?.message?.content || '';
        let updatedCode = this.extractVueCode(content);
        updatedCode = this.sanitizeVueScriptImports(updatedCode);
        if (!updatedCode || updatedCode === originalCode.trim()) {
            return skippedResult('AI 未生成有效代码变更');
        }
        updatedCode = this.sanitizeSfcAttributeEscapes(updatedCode);
        updatedCode = (0, css_sanitizer_js_1.repairScopedThirdPartySelectors)(updatedCode, this.logger);
        this.validateLiteSfc(updatedCode);
        const updatedScript = this.extractSfcBlock(updatedCode, 'script');
        if (originalScript !== updatedScript) {
            throw new Error('素材自动应用被拒绝：AI 修改了 <script setup>');
        }
        const referencedFiles = Array.from(updatedCode.matchAll(/\.\.\/resources\/images\/([^\s"'()?#]+)/g), (match) => match[1]);
        const missingReferences = referencedFiles.filter((fileName) => !availableFiles.has(fileName));
        if (missingReferences.length > 0) {
            throw new Error(`素材自动应用被拒绝：引用了不存在的资源 ${missingReferences.join(', ')}`);
        }
        const appliedPlacements = actionablePlacements.filter((placement) => {
            const fileName = String(placement.resourceFile).split('/').pop() || '';
            return referencedFiles.includes(fileName);
        });
        if (appliedPlacements.length === 0) {
            return skippedResult('AI 输出未实际引用任何定位素材');
        }
        const skippedPlacements = placements
            .filter((placement) => !appliedPlacements.includes(placement))
            .map((placement) => ({
            ...placement,
            skipReason: '未通过本地资源校验或未被 AI 应用',
        }));
        const cacheDir = (0, path_1.join)(outputPath, '.cache');
        const backupFile = (0, path_1.join)(cacheDir, `package-index.before-assets-${Date.now()}.vue`);
        writeFileSync(backupFile, originalCode, 'utf-8');
        writeFileSync(vuePath, `${updatedCode.trim()}\n`, 'utf-8');
        return {
            codeUpdated: true,
            backupFile,
            appliedPlacements,
            skippedPlacements,
            modifiedFiles: ['package/index.vue'],
            validation: {
                sfcStructure: 'passed',
                scriptSetupUnchanged: 'passed',
                resourceReferences: 'passed',
            },
        };
    }
    extractSfcBlock(code, block) {
        const match = code.match(/<script\s+setup(?:\s[^>]*)?>[\s\S]*?<\/script>/i);
        return match?.[0] || '';
    }
    async renderHtmlPreview(dto, sessionId) {
        const html = dto.htmlContent?.trim() || '';
        const size = Buffer.byteLength(html, 'utf8');
        if (!html || size > lite_constants_1.LITE_HTML_MAX_BYTES || !/<(?:html|body|div|main|section|article|header|footer|form|table)\b/i.test(html)) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_HTML, lite_constants_1.LITE_ERROR_MESSAGES[lite_constants_1.LiteErrorCode.INVALID_HTML]);
        }
        const sanitized = html
            .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
            .replace(/<(?:iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed)\s*>/gi, '')
            .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
            .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        let browser;
        try {
            const puppeteer = await import('puppeteer');
            const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || [
                '/usr/bin/chromium-browser',
                '/usr/bin/google-chrome',
                '/snap/bin/chromium',
            ].find(p => { try {
                return (0, fs_1.existsSync)(p);
            }
            catch {
                return false;
            } });
            browser = await puppeteer.default.launch({
                headless: true,
                executablePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ],
            });
            const page = await browser.newPage();
            await page.setJavaScriptEnabled(false);
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const url = request.url();
                if (url.startsWith('data:') || url.startsWith('about:'))
                    request.continue();
                else
                    request.abort();
            });
            await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
            await page.setContent(sanitized, { waitUntil: 'domcontentloaded', timeout: 15_000 });
            const dimensions = await page.evaluate(() => ({
                width: Math.min(1600, Math.max(320, document.documentElement.scrollWidth || document.body?.scrollWidth || 1440)),
                height: Math.min(1200, Math.max(240, document.documentElement.scrollHeight || document.body?.scrollHeight || 900)),
            }));
            await page.setViewport({ ...dimensions, deviceScaleFactor: 1 });
            const screenshot = await page.screenshot({ type: 'png', fullPage: false });
            this.logger.log(`HTML 安全渲染完成 ${sessionId}: ${dimensions.width}x${dimensions.height}, ${Math.round(size / 1024)}KB`);
            return { buffer: Buffer.from(screenshot), mime: 'image/png', ext: 'png' };
        }
        catch (error) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_HTML, `HTML 渲染失败: ${error.message}`, error);
        }
        finally {
            if (browser)
                await browser.close().catch(() => undefined);
        }
    }
    async fetchFigmaImage(dto, sessionId, userId) {
        try {
            const parsed = (0, figma_url_parser_js_1.parseFigmaUrl)(dto.figmaUrl);
            if (!parsed.fileKey || !parsed.nodeId) {
                throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_FIGMA_URL, 'Figma 链接缺少 fileKey 或 nodeId');
            }
            const aiCfg = await this.aiConfigService.getMergedAiConfig(userId);
            const figmaCredTask = this.tasksService.getTask(sessionId) || null;
            const figmaTokenRes = await (0, figma_execution_token_probe_1.resolveExecutionFigmaTokenWithProbe)({
                task: figmaCredTask,
                requestConfig: dto.config,
                activeConfig: aiCfg,
                envToken: process.env.FIGMA_ACCESS_TOKEN,
                fileKey: parsed.fileKey,
                nodeId: parsed.nodeId,
            });
            this.logger.log(`[figma-cred] lite/export session=${sessionId} source=${figmaTokenRes.source} ` +
                `reason=${figmaTokenRes.reason} ref=${figmaTokenRes.refSource || '-'} ` +
                `request-overridden=${figmaTokenRes.requestOverridden} ` +
                `probed=${figmaTokenRes.probes.length} :: ${figmaTokenRes.note}`);
            const figmaToken = figmaTokenRes.token;
            if (!figmaToken) {
                throw this.wrapError(lite_constants_1.LiteErrorCode.FIGMA_EXPORT_FAILED, figmaTokenRes.reason === 'probe-failed'
                    ? figmaTokenRes.note
                    : '未配置 Figma Token，请在设置中配置或传入 config.figmaToken');
            }
            if (figmaTokenRes.refFields) {
                this.tasksService.updateTask(sessionId, figmaTokenRes.refFields);
            }
            const figmaClient = new figma_client_js_1.FigmaClient({ token: figmaToken });
            const imageUrl = await figmaClient.exportImage(parsed.fileKey, parsed.nodeId, { format: 'png', scale: design_canvas_1.FIGMA_EXPORT_SCALE });
            if (!imageUrl) {
                throw this.wrapError(lite_constants_1.LiteErrorCode.FIGMA_EXPORT_FAILED, 'Figma 图片导出失败：未返回图片 URL');
            }
            const https = await import('https');
            const http = await import('http');
            const client = imageUrl.startsWith('https:') ? https : http;
            const buffer = await new Promise((resolve, reject) => {
                const chunks = [];
                client
                    .get(imageUrl, (res) => {
                    if (res.statusCode !== 200) {
                        reject(this.wrapError(lite_constants_1.LiteErrorCode.FIGMA_EXPORT_FAILED, `Figma 图片下载失败：HTTP ${res.statusCode}`));
                        return;
                    }
                    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                    res.on('error', reject);
                })
                    .on('error', reject);
            });
            if (buffer.length === 0 ||
                buffer.length > lite_constants_1.LITE_PRECHECK.MAX_IMAGE_BYTES) {
                throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_IMAGE, `Figma 导出图片大小无效（${buffer.length} bytes）`);
            }
            let logicalWidth = null;
            let logicalHeight = null;
            let figmaTexts = null;
            try {
                const nodeDoc = await figmaClient.getNode(parsed.fileKey, parsed.nodeId);
                const bbox = nodeDoc?.absoluteBoundingBox;
                if (bbox && Number(bbox.width) > 0 && Number(bbox.height) > 0) {
                    logicalWidth = Math.round(Number(bbox.width));
                    logicalHeight = Math.round(Number(bbox.height));
                    this.logger.log(`Figma 节点逻辑尺寸: ${logicalWidth}x${logicalHeight}（导出倍率 scale=${design_canvas_1.FIGMA_EXPORT_SCALE}）`);
                }
                figmaTexts = this.extractFigmaTextNodes(nodeDoc);
                if (figmaTexts.length > 0) {
                    this.logger.log(`Figma 文本图层真值: ${figmaTexts.length} 条（注入视觉分析对照）`);
                }
            }
            catch (nodeErr) {
                this.logger.warn(`获取 Figma 节点尺寸失败（非阻塞，走 resolveDesignCanvas 栅格/倍率兜底）: ${nodeErr?.message}`);
            }
            return {
                buffer,
                mime: 'image/png',
                ext: 'png',
                logicalWidth,
                logicalHeight,
                figmaTexts,
            };
        }
        catch (error) {
            if (error.code)
                throw error;
            throw this.wrapError(lite_constants_1.LiteErrorCode.FIGMA_EXPORT_FAILED, `Figma 图片获取失败：${error.message}`, error);
        }
    }
    extractFigmaTextNodes(nodeDoc) {
        if (!nodeDoc || typeof nodeDoc !== 'object')
            return [];
        const items = [];
        const walk = (node) => {
            if (!node || typeof node !== 'object')
                return;
            if (node.visible === false)
                return;
            if (node.type === 'TEXT' && typeof node.characters === 'string') {
                const text = node.characters.replace(/\s+/g, ' ').trim();
                if (text) {
                    const bb = node.absoluteBoundingBox || {};
                    items.push({
                        text,
                        x: Number(bb.x) || 0,
                        y: Number(bb.y) || 0,
                    });
                }
            }
            if (Array.isArray(node.children)) {
                for (const child of node.children)
                    walk(child);
            }
        };
        walk(nodeDoc);
        items.sort((a, b) => (Math.abs(a.y - b.y) <= 8 ? a.x - b.x : a.y - b.y));
        const seen = new Set();
        const out = [];
        for (const item of items) {
            if (seen.has(item.text))
                continue;
            seen.add(item.text);
            out.push(item.text);
            if (out.length >= 80)
                break;
        }
        return out;
    }
    normalizeImage(dto) {
        let raw = (dto.imageBase64 || '').trim();
        let mime = (dto.imageMime || '').trim().toLowerCase();
        raw = raw.replace(/\s+/g, '');
        const dataUrlMatch = raw.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.*)$/s);
        if (dataUrlMatch) {
            mime = dataUrlMatch[1].toLowerCase();
            raw = dataUrlMatch[2];
        }
        else if (!mime) {
            const head = Buffer.from(raw.slice(0, 16), 'base64');
            if (head.slice(0, 8).toString('hex') === '89504e470d0a1a0a')
                mime = 'image/png';
            else if (head.slice(0, 3).toString('hex') === 'ffd8ff')
                mime = 'image/jpeg';
            else if (head.slice(0, 4).toString('hex') === '52494646')
                mime = 'image/webp';
        }
        if (!lite_constants_1.LITE_PRECHECK.ALLOWED_MIME.includes(mime)) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_IMAGE, `不支持的图片格式: ${mime || 'unknown'}`);
        }
        let buffer;
        try {
            buffer = Buffer.from(raw, 'base64');
        }
        catch {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_IMAGE, 'base64 解码失败');
        }
        if (buffer.length === 0 || buffer.length > lite_constants_1.LITE_PRECHECK.MAX_IMAGE_BYTES) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_IMAGE, `图片大小超出限制（${lite_constants_1.LITE_PRECHECK.MAX_IMAGE_BYTES / 1024 / 1024}MB）`);
        }
        const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        return { buffer, mime, ext };
    }
    async precheck(buffer, mime) {
        let meta;
        try {
            meta = await (0, sharp_1.default)(buffer).metadata();
        }
        catch (e) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_IMAGE, `图片解析失败: ${e.message}`);
        }
        const width = meta.width || 0;
        const height = meta.height || 0;
        if (width < lite_constants_1.LITE_PRECHECK.MIN_DIMENSION ||
            height < lite_constants_1.LITE_PRECHECK.MIN_DIMENSION) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INVALID_IMAGE, `图片尺寸过小（${width}x${height}，需单边 ≥ ${lite_constants_1.LITE_PRECHECK.MIN_DIMENSION}px）`);
        }
        return { width, height };
    }
    async sampleRootBrightness(buffer) {
        try {
            const { data, info } = await (0, sharp_1.default)(buffer)
                .resize(64, 64, { fit: 'inside' })
                .raw()
                .toBuffer({ resolveWithObject: true });
            const ch = info.channels;
            const lums = [];
            for (let p = 0; p < data.length; p += ch) {
                if (ch === 4 && data[p + 3] < 128)
                    continue;
                const lum = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
                lums.push(lum);
            }
            if (lums.length < 50)
                return null;
            lums.sort((a, b) => a - b);
            const median = lums[Math.floor(lums.length / 2)];
            const lightRatio = lums.filter((l) => l > 0.6).length / lums.length;
            const darkRatio = lums.filter((l) => l < 0.4).length / lums.length;
            if (median > 0.55 && lightRatio >= 0.5)
                return 'light';
            if (median < 0.45 && darkRatio >= 0.5)
                return 'dark';
            return null;
        }
        catch (e) {
            this.logger.warn(`像素级主题采样失败（非阻塞）: ${e.message}`);
            return null;
        }
    }
    async sampleEdgeColor(buffer) {
        try {
            const { data, info } = await (0, sharp_1.default)(buffer)
                .resize(100, 100, { fit: 'fill' })
                .raw()
                .toBuffer({ resolveWithObject: true });
            const ch = info.channels;
            const w = info.width;
            const h = info.height;
            const ring = 3;
            const rs = [];
            const gs = [];
            const bs = [];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const onRing = x < ring || x >= w - ring || y < ring || y >= h - ring;
                    if (!onRing)
                        continue;
                    const p = (y * w + x) * ch;
                    if (ch === 4 && data[p + 3] < 128)
                        continue;
                    rs.push(data[p]);
                    gs.push(data[p + 1]);
                    bs.push(data[p + 2]);
                }
            }
            if (rs.length < 100)
                return null;
            const median = (arr) => {
                const s = [...arr].sort((a, b) => a - b);
                return s[Math.floor(s.length / 2)];
            };
            const hex = (v) => v.toString(16).padStart(2, '0');
            return `#${hex(median(rs))}${hex(median(gs))}${hex(median(bs))}`.toUpperCase();
        }
        catch (e) {
            this.logger.warn(`边缘底色采样失败（非阻塞）: ${e.message}`);
            return null;
        }
    }
    async buildVisionAgent(dto, sourceType = 'screenshot', userId) {
        const aiCfg = (await this.aiConfigService.getMergedAiConfig(userId)) || {};
        const apiKey = dto.config?.visionApiKey ||
            aiCfg.visionApiKey ||
            dto.config?.aiApiKey ||
            '';
        const baseURL = dto.config?.visionBaseURL ||
            aiCfg.visionBaseURL ||
            dto.config?.aiBaseURL ||
            '';
        const model = dto.config?.visionModel ||
            aiCfg.visionModel ||
            dto.config?.aiModel ||
            '';
        const providerType = dto.config?.visionProviderType ||
            aiCfg.visionProviderType ||
            'auto';
        const inlineTemperature = dto.config?.modelMode === 'unified'
            ? dto.config?.unifiedTemperature
            : dto.config?.visionTemperature;
        const temperature = inlineTemperature ?? aiCfg.visionTemperature;
        if (!apiKey) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INTERNAL_ERROR, '视觉模型未配置 API Key，请在设置面板中配置视觉模型后重试');
        }
        const visionModelName = String(model || '').trim();
        if (!visionModelName) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INTERNAL_ERROR, '未配置视觉模型，无法从截图生成组件，请到「设置 - 模型配置」中选择支持视觉的模型并保存');
        }
        const visionCap = (0, model_config_js_1.resolveVisionCapability)(visionModelName);
        if (visionCap.vision === false) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INTERNAL_ERROR, `模型「${visionModelName}」不支持视觉输入，无法从截图生成组件。` +
                `请到「设置 - 模型配置」更换为支持视觉的模型（并点击「检测」确认）后重试`);
        }
        if (visionCap.vision !== true) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INTERNAL_ERROR, `模型「${visionModelName}」的视觉能力尚未检测，无法确认其能否识别截图。` +
                `请到「设置 - 模型配置」点击「检测」完成能力识别后重试（未检测不支持直接生成，避免产出与截图无关的结果）`);
        }
        try {
            (0, ai_defaults_js_1.resolveVisionConfig)(aiCfg);
        }
        catch {
        }
        try {
            return new vision_agent_js_1.VisionAgent({
                apiKey,
                baseURL,
                model,
                providerType,
                ...(temperature !== undefined && temperature !== null && temperature !== ''
                    ? { temperature: Number(temperature) }
                    : {}),
                maxTokens: 16384,
                onTokenUsage: (usage) => {
                    try {
                        this.tokenTrackerService.recordUsage({
                            ...usage,
                            sessionId: undefined,
                            componentName: undefined,
                            sourceType,
                            userId,
                            baseURL,
                        });
                    }
                    catch {
                    }
                },
            });
        }
        catch (e) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.INTERNAL_ERROR, `视觉模型初始化失败: ${e.message}`, e);
        }
    }
    deriveComponentName(dtoName, brief, sessionId) {
        const toKebab = (s) => String(s || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64);
        const briefEn = toKebab(brief?.name?.en);
        const briefCn = String(brief?.name?.cn || '').trim().slice(0, 32);
        const zhFallback = (zh) => {
            if (!zh)
                return null;
            const mapped = (0, component_naming_js_1.zhToSemanticEn)(zh);
            if (mapped)
                return mapped;
            const ascii = zh.match(/[A-Za-z][A-Za-z0-9]*(?:[-_ ][A-Za-z0-9]+)*/g);
            const k = toKebab((ascii || []).join('-'));
            return k || null;
        };
        if (dtoName && dtoName.trim()) {
            const rawDisplay = dtoName.trim().slice(0, 32);
            const code = toKebab(dtoName);
            if (code)
                return { codeName: code, displayName: rawDisplay };
            if (briefEn)
                return { codeName: briefEn, displayName: rawDisplay };
            return {
                codeName: zhFallback(rawDisplay) || 'component',
                displayName: rawDisplay,
            };
        }
        if (briefEn) {
            return { codeName: briefEn, displayName: briefCn || briefEn };
        }
        return {
            codeName: zhFallback(briefCn) || 'component',
            displayName: briefCn || sessionId,
        };
    }
    buildAnalysisPrompt(logicalWidth, logicalHeight, rasterWidth, rasterHeight, figmaTexts, rasterScale) {
        const scale = (0, design_canvas_1.normalizeRasterScale)(rasterScale, design_canvas_1.DEFAULT_RASTER_SCALE);
        let scaleNote = '';
        if (logicalWidth && logicalHeight && rasterWidth && rasterHeight) {
            scaleNote =
                scale === 1
                    ? `\n【尺寸标定铁律（必须遵守）】
- 本截图为 ${rasterWidth}×${rasterHeight} 像素，与逻辑画布 ${logicalWidth}×${logicalHeight} CSS px **1:1（1:1 栅格）**，图上 1 像素 = 1 CSS px。
- typography.size、spacing、regions.size 中所有像素数值**直接按图上观测像素输出即可**（禁止再做除法或折半），并给出具体数值（如 "标题约16px、正文约11px、数字约14px"）。
- 估尺寸时以逻辑画布 ${logicalWidth}×${logicalHeight} 为参照：某元素约占画布宽度的几分之几 → 换算成逻辑 px。
`
                    : `\n【尺寸标定铁律（必须遵守）】
- 本截图是 ${rasterWidth}×${rasterHeight} 像素的栅格图（${scale}x），对应逻辑画布 ${logicalWidth}×${logicalHeight} CSS px。
- typography.size、spacing、regions.size 中所有像素数值**必须按逻辑 CSS px 输出**（≈ 图上观测像素 ÷ ${scale}），并给出具体数值（如 "标题约16px、正文约11px、数字约14px"），禁止直接照抄图上看到的像素值。
- 估尺寸时以逻辑画布为参照：某元素约占画布宽度的几分之几 → 换算成逻辑 px。
`;
        }
        const textTruthNote = Array.isArray(figmaTexts) && figmaTexts.length > 0
            ? `\n【文案真值对照表（取自 Figma 文本图层，优先级高于图像识别）】
${figmaTexts.map((t) => `- "${t}"`).join('\n')}
- textContent、regions.description、name.cn 中的一切文案**必须与上表逐字一致**；表中条目即截图中实际出现的文字。
- 图像识别与上表冲突时**以上表为准**（图像小字号易误读）；仅表中不存在的文字才允许按图像识别补充。
`
            : '';
        return `你是一名 UI 布局分析师。请分析这张截图，提取布局还原所需的信息（包括可交互元素的位置和类型）。
${scaleNote}${textTruthNote}
只输出一个 JSON 对象，不要任何解释或 markdown 代码块。字段如下：
{
  "layout": "整体布局、主轴方向、对齐方式与区域比例",
  "regions": [{"name":"区域名","description":"可见内容 + 区域内部子元素排布（横向/纵向、对齐方式、图标与文字的相对位置，如「图标在左，名称与数字在右上下排列」「竖排文字按钮纵向等分」）","position":"top/center/bottom/left/right","size":"相对宽高 + 主轴起止参照（如「顶部与网格区齐平，不向上延伸到统计卡片区」「占满剩余高度」）"}],
  "spacing": {"outer":"外边距特征（逻辑px）","gap":"区域间距特征（逻辑px）","padding":"内边距特征（逻辑px）"},
  "theme": "light 或 dark（判定规则见下，必须二选一）",
  "colors": {"primary":"主色hex","background":"页面/根容器真实底色hex","surface":"主卡片容器底色hex","text":"正文文字色hex","border":"边框色hex"},
  "typography": {"size":"字号层级（逻辑 CSS px 具体数值）","weight":"字重层级","lineHeight":"行高特征"},
  "components": ["截图中实际可见的原生 UI 元素"],
  "textContent": ["关键可见文案（逐字转录，必须与截图完全一致；生僻词按字形逐字核对，禁止臆测/谐音替代）"],
  "name": "组件中英文名称，从截图标题栏/主标题/内容主题推断。格式：{\"cn\":\"设备监测\",\"en\":\"equipment-monitor\"}；en 用 kebab-case 小写英文（不含组件前缀、不含扩展名、不含非法字符），无法推断时 en 留空字符串",
  "visualDetails": ["圆角、边框、阴影、图标位置、图片比例等可见细节"],
  "interactions": ["可见的交互元素：如 Tab 切换栏(标注各 tab 名称和当前激活项)、按钮(标注位置和文案)、展开/收起区域等"]
}

【主题判定铁律（必须遵守）】
1. theme 由「页面/根容器真实底色」的明度决定，不由单个卡片的 rgba 透明度决定：
   - 页面/根容器底色为浅色（白/浅灰/浅蓝/米色等，亮度 L > 0.7）→ light
   - 页面/根容器底色为深色（黑/深蓝/深灰等，亮度 L < 0.3）→ dark
   - 页面底色被大面积深色遮罩/渐变覆盖时按实际可见底色判定；底色无法确定时，以主内容卡片底色 + 正文文字色联合判定，此时卡片底色浅、文字深 → light
2. 半透明元素（rgba / opacity）不得作为主题判定依据：只描述其叠加后的实际观感，主题仍以最底层页面底色为准。
3. colors.background 必须填页面/根容器真实底色；若页面底色是半透明，给出叠加在页面背景上后的最终观感色，并注明（如 "background": "#F0F4F8 (半透明叠加后)"）。
4. 禁止用主色/高亮色（如蓝色强调色）充当 background 或 text；text 填正文实际颜色（浅色主题下应为深色系 #1F2329~#4A5568 之类，深色主题下应为浅色系）。
5. 截图来源可能是 2 倍像素导出，颜色值不受像素倍率影响，直接按截图取色即可。

不要推断接口、数据源、业务规则或截图中不可见的业务逻辑。字段缺失时给空字符串或空数组。`;
    }
    async callCodegenWithControlGuard(agent, imagePath, basePrompt, isMicrocode, sessionId, callOpts) {
        const { scanBareFormControls, summarizeBareFormControls } = await import('../ai-engine/utils/bare-form-control-guard.js');
        const call = (p) => agent.analyzeImage(imagePath, p, callOpts);
        const parse = (t) => isMicrocode
            ? this.extractMicrocodeOutput(t)
            : { vueCode: this.extractVueCode(t), declareJson: null };
        const genText = await call(basePrompt);
        const first = parse(genText);
        if (!first.vueCode || first.vueCode.trim().length < 30) {
            return { genText, ...first };
        }
        const firstHits = scanBareFormControls(first.vueCode);
        if (firstHits.length === 0) {
            return { genText, ...first };
        }
        this.logger.warn(`[control-guard] 首轮产物裸写表单控件 ${summarizeBareFormControls(firstHits)}，触发修正重试`, { sessionId });
        this.progressService.sendProgress(sessionId, {
            type: 'progress',
            stage: 'generating',
            status: 'running',
            message: `检测到手写表单控件 ${firstHits.length} 处，正在修正...`,
        });
        const fixPrompt = `${basePrompt}

【⚠️ 修正指令（上一轮产物不合格，必须遵守）】
上一轮产物中存在 ${firstHits.length} 处裸写的原生标签（${summarizeBareFormControls(firstHits)}），违反硬性边界第 ${isMicrocode ? '7' : '14'} 条。必须整体修正：
- 裸 <input>/<select>/<textarea> → 替换为 Ant Design Vue 真组件（a-input / a-textarea / a-select / a-input-number / a-radio-group / a-checkbox-group / a-switch / a-upload / a-button 等）；
- 裸 <label> → 表单行结构整体改为 \`<a-form>\` 包裹 + 每行 \`<a-form-item>\`，标签文本放 a-form-item 的 \`label\` 属性或 \`#label\` 插槽（必填星号写在插槽内），禁止任何裸 <label> 标签。
重新输出完整组件代码${isMicrocode ? '与 declare.json' : ''}。`;
        try {
            const retryText = await call(fixPrompt);
            const retry = parse(retryText);
            if (retry.vueCode && retry.vueCode.trim().length >= 30) {
                const retryHits = scanBareFormControls(retry.vueCode);
                if (retryHits.length < firstHits.length) {
                    this.logger.warn(`[control-guard] 修正后裸控件 ${retryHits.length} 处（首轮 ${firstHits.length}），采用重试产物`, { sessionId });
                    return { genText: retryText, ...retry };
                }
                this.logger.warn(`[control-guard] 修正未改善（${retryHits.length} >= ${firstHits.length}），保留首轮产物`, { sessionId });
            }
            else {
                this.logger.warn('[control-guard] 重试产物无效，保留首轮产物', { sessionId });
            }
        }
        catch (e) {
            this.logger.warn(`[control-guard] 修正重试失败，保留首轮产物: ${e?.message}`, { sessionId });
        }
        return { genText, ...first };
    }
    buildFontFloorRule(brief) {
        const typoSize = brief && typeof brief === 'object' && typeof brief.typography?.size === 'string'
            ? brief.typography.size.trim()
            : '';
        const truthBlock = typoSize
            ? `【本次字号真值（来自视觉分析，已按逻辑 CSS px 标定；逐级还原，禁止统一压缩）】
${typoSize}
- 产物中每个层级的 \`font-size\` 必须落在上表对应值 ±1px 内；**禁止把多个层级压成同一字号**，也**禁止整体乘以同一个缩小系数**。
`
            : '';
        return `${truthBlock}【字号下限铁律（P0，空间不足一律禁止压字号）】
- 字号层级按【结构化拆解】的 typography.size 逐级还原，并保持层级差（标题 > 数值 > 正文 > 辅助文字）。
- **任何可见正文 / 标签 / 数值文字的字号不得低于 ${font_size_normalizer_js_1.MIN_BODY_FONT_PX}px**（= 基准 14px × ${font_size_normalizer_js_1.MIN_BODY_FONT_RATIO}；微码 LESS 写法即 \`calc(@fontSize * ${font_size_normalizer_js_1.MIN_BODY_FONT_RATIO})\`）。该下限只约束最低层级，**不得把所有文字统一抬成同一字号**（那等于丢掉 typography 层级）。
- 横向/纵向空间不足时，**优先压缩 padding、间距 gap、图标尺寸、装饰留白**；仍放不下就减少装饰元素或改用换行/省略，**禁止把文字压到下限以下硬塞**（实锤：正文被压到 8px 后整屏不可读，且归一成 0.5714 系数后无法检索）。
- 若上述预算冲突与【设计画布逻辑尺寸】内放不下同时成立，以「文字可读」优先：允许内部滚动（\`min-height: 0\` + \`overflow-y: auto\`），不得靠缩字号消除溢出。
`;
    }
    buildCodegenPrompt(brief, componentName, dto, designWidth, designHeight) {
        const briefJson = JSON.stringify(brief || {}, null, 2);
        const fontFloorRule = this.buildFontFloorRule(brief);
        const extra = [dto.requirementDoc, dto.notes]
            .filter(Boolean)
            .join('\n');
        const epUser = String(dto.extraPrompt || '').trim().slice(0, 4000);
        const rdtUser = String(dto.requirementDocText || '').trim().slice(0, 20000);
        const userAddendum = epUser || rdtUser
            ? `\n【用户补充需求（用户显式输入，必须遵守；视觉样式（颜色/尺寸/布局/字体）与设计稿冲突时以设计稿为准，但交互/行为类显式要求（tab 切换、轮播、折叠展开、点击联动等）必须落实，不得以「设计稿没有」为由省略；用户显式要求优先于平台默认规范）】\n${epUser ? `补充提示词：\n${epUser}\n` : ''}${rdtUser ? `需求文档要点：\n${rdtUser}\n` : ''}\n`
            : '';
        const isoBlock = (0, iso_lite_prompt_js_1.buildLiteIsoPromptBlock)(brief);
        this.logger.log((0, iso_lite_prompt_js_1.formatLiteIsoLog)('vue3/lite', isoBlock));
        return `你是一名 Vue3 布局还原工程师。请基于截图和结构化拆解，生成一个只负责静态布局还原的单文件组件。

【组件名】${componentName}
${designWidth && designHeight ? `【设计画布逻辑尺寸】${designWidth} × ${designHeight} CSS px
参考截图可能是 2 倍导出像素，只用于视觉识别，不得把图片像素作为组件 CSS 尺寸。
组件根节点必须使用 width: 100%、height: 100%、box-sizing: border-box，不得自行设置固定 max-width。
**高度预算分解铁律（P0-4）**：写 CSS 前必须先做高度预算分解：可用高度 H = ${designHeight}px - 根容器 padding×2；逐区块分配后，grid 行高 = (主内容区高度 - (行数-1)×gap) ÷ 行数，卡片内元素必须适配行高（图标 ≤ 行高×0.45）；竖排文字按钮（writing-mode:vertical-rl）必须加 \`white-space: nowrap\` 防中间断列，按钮高度按**最长标签**预算（最长字数 ×(字号+letterSpacing) + padding×2 ≤ 按钮高），任一字数排不下就统一缩字号——禁止断列导致阅读顺序乱（实锤：供配电→电供/配），且 N 个按钮总高 + (N-1)×gap + 徽标预留 ≤ sidebar 分配高度，超出**优先缩字号**、按钮高随字号同比缩小，任何压缩后仍须满足 按钮高 ≥ 最长字数 ×(字号+letterSpacing) + padding×2（禁止只压按钮高不缩字号导致文字被裁），禁止末尾按钮被面板底部裁切；角标/计数徽标用负偏移挂在按钮外侧时，必须为所在栏预留空间（padding-top ≥ 外溢高度）+ 父链 overflow:visible + 徽标 z-index 高于相邻区块，禁止被上一区块裁切；徽标还必须完全落在面板水平边界内（left ≥ 0），栏宽不足时缩徽标字号或改为栏内右上角内嵌，禁止溢出面板边界。禁止不做预算直接堆固定尺寸。**宽度预算同理（P0-4）**：grid 列宽 = (可用宽 - (列数-1)×gap) ÷ 列数，卡片内文字必须适配列宽（设备名称 字数×字号 ≤ 列宽 - 卡片padding×2 - 图标宽，超出就缩字号，禁止横向裁切/省略）；顶部统计条必须**单行**放下（所有标签+数值总宽 ≤ 可用宽，超出就缩字号/间距，禁止换行）；根容器及任何区块的 scrollWidth/scrollHeight 不得大于 clientWidth/clientHeight（底部行文字被裁半即不合格，预算超 H 优先压缩 grid 行高）。
` : ''}${fontFloorRule}【结构化拆解】
${briefJson}
${isoBlock.block}
${extra ? `【布局补充】\n${extra}\n` : ''}
${userAddendum}${(0, user_addendum_js_1.buildOddEvenHintSection)(brief.oddEvenHints)}
硬性边界：
0. **主题锚点铁律（P0-4）**：组件整体明暗风格由【结构化拆解】中的 theme 字段决定，不凭截图局部观感自行切换：
   - theme="light"：根容器背景必须用浅色（白/浅灰/浅蓝系，如 #FFFFFF / #F5F8FC），正文文字用深色（#1F2329 / #333333 系），禁止把根容器渲染成深色底。
   - theme="dark"：根容器背景用深色，正文文字用浅色。
   - **半透明防误判**：卡片/面板背景可使用 rgba 或浅色透明层，但「主题归属」一律由根容器底色决定；禁止因单个卡片深色/半透明而把整个组件改成深色主题。
   - 若【结构化拆解】没有 theme 字段，则以 colors.background 的明度推断：浅色背景 → 浅色主题。
   - **冲突裁决（P0，2026-11-11 补丁层自防）**：若 theme 与 colors / visualDetails 的明暗描述冲突，一律以 theme 为准；禁止使用与之矛盾的 background / surface / text / border 色值，也禁止依据「整体背景为深蓝色渐变」之类描述把根容器改成深色。根治项是装配层的主题色板归一，本条只防其未覆盖的矛盾描述。
1. 只还原截图中可见的 DOM 层级、尺寸比例、间距、对齐、配色、字体、边框、圆角和阴影。
2. 不生成接口请求、异步逻辑、路由、表单提交、权限、业务状态机、复杂事件或需求文档中不可见的业务能力。
3. 允许使用少量本地常量表达截图中重复出现的可见内容；禁止臆造额外数据和交互。
4. 使用 <template> + <script setup> + <style scoped>；没有脚本需求时保留空的 <script setup> 块。
5. 使用语义化 class 名和 flex/grid/百分比布局，组件应可直接编译运行。**根容器 class 必须用【组件名】对应的 kebab-case（如组件名 equipment-monitor → 根 class \`equipment-monitor\`），内部区块 class 用 \`根名-\` 前缀的语义名（如 \`equipment-monitor-header\`、\`equipment-monitor-card\`），禁止用无意义的编码名/单字符/拼音缩写。**
6. **图表自动映射**：如果截图中包含图表（折线图/柱状图/饼图/面积图等），使用 ECharts 实现：
   - 引入：\`import * as echarts from 'echarts'\`
   - 在 \`<template>\` 中使用 \`<div ref="chartRef" class="chart"></div>\`（样式用 CSS，禁止内联 style）
   - chart 容器 CSS：\`.chart { width: 100%; height: 100%; }\`，父容器 \`flex: 1; min-height: 0;\`
   - **echarts 初始化时序（强制，防图表空白）**：禁止同步 \`echarts.init()\`。必须用 ResizeObserver **观察图表容器本身 \`chartRef.value\`**（严禁观察外层容器、严禁 \`document.querySelector\` 查 DOM）。容器 \`clientWidth/clientHeight\` 均 > 0 时才 init；尺寸为 0 时**继续等待、不得 disconnect**（否则「外层有尺寸 → rAF 内图表容器仍为 0 → 永久放弃」必现图表空白）。init 前加 \`if (!chartRef.value || chart) return\` 防重复初始化。
   - **init 入口驱动（强制，防 onMounted 时 ref 未填充）**：初始化逻辑封装为 \`const initChartWhenReady = () => { ... }\`，用 \`watch(chartRef, (el) => { if (el && !chart) nextTick(() => initChartWhenReady()) }, { immediate: true })\` 驱动 + \`onMounted(() => nextTick(initChartWhenReady))\` 兜底（两者幂等）。**严禁** \`onMounted(() => { if (!chartRef.value) return; ... })\` 一次性判断——预览/沙箱环境 onMounted 触发时 ref 可能未填充，return 后无任何重试 → 图表永久空白（实锤 mc-lite-1788179972462-cc22ec3e）。
   - **resize 监听（强制）**：实例创建后挂 ResizeObserver 监听 \`chartRef.value\`，回调中调 \`chart.resize()\`；onUnmounted 中 disconnect + dispose
   - 在 \`onUnmounted\` 中销毁：\`resizeObserver.disconnect(); chart.dispose();\`
   - **数据驱动（强制）**：用截图中的 mock 数据定义成响应式变量（如 \`const chartData = ref([5, 7, 6, 4])\`），\`series.data\`/xAxis 绑定该变量（\`data: chartData.value\`）。**严禁**在 \`setOption({...})\` 里硬编码数字字面量 \`data: [5, 7, 6]\`——否则后续 API 绑定无法驱动图表。
7. **表格自动映射**：如果截图中包含表格/列表，使用 Ant Design Vue 的 \`a-table\` 组件：
   - 引入：\`import { Table as ATable } from 'ant-design-vue'\`
   - 在 \`<template>\` 中使用 \`<a-table :columns="columns" :data-source="data" :pagination="false" />\`
   - 在 \`<script setup>\` 中定义 columns 和 data 常量
   - \`<style scoped>\` 中覆盖 Ant Design Vue 内部 \`.ant-*\` 节点时，选择器必须使用 \`:deep(...)\`，例如 \`:deep(.custom-table .ant-table-thead > tr > th)\`；禁止直接写 \`.ant-table-*\`
8. **简单交互**：如果截图中包含可交互元素（Tab 切换、按钮、展开/收起等），实现基础交互逻辑：
   - Tab 切换：使用 \`ref\` 存储当前激活 tab，通过 \`@click\` 切换
   - 按钮：添加 \`@click\` 事件（可只打印 console.log 或切换状态）
   - 展开/收起：使用 \`ref\` 控制显示状态
9. **布局顺序铁律（P0-5）**：顶层区块顺序必须严格遵循截图从上到下（如 header → tabs → 图表 → footer），**禁止把靠上区块（如 tabs）放入底部容器**。截图里 tabs 在图表上方时，模板里 tabs 必须渲染在图表之前。
10. **flex 使用克制（P0-5）**：纵向堆叠优先用默认块级流；仅当需要剩余空间分配（子元素 \`flex: 1\`）或垂直对齐时才用 \`display: flex; flex-direction: column\`，且凡有 \`flex: 1\` 子元素的 column-flex 容器与子元素**必须成对写 \`min-height: 0\`**（echarts/表格容器必现撑破问题）。无 flex 子属性的 column-flex 视为冗余，禁止使用。
11. **尺寸参照铁律（P0-4）**：所有字号/图标/间距必须基于【设计画布逻辑尺寸】${designWidth ? `（${designWidth}×${designHeight}px）` : ''}按比例还原，**禁止直接套用截图里看到的像素值**（截图多为 2 倍导出）。例如逻辑画布宽 420px 时，标题 20-28px、正文 12-16px、图标 20-32px 量级；整个组件布局必须在画布内完整放下，不得超出或挤压。卡片/区块禁止 \`min-width\`/\`max-width\` 固定 px（并排卡片纯 \`flex: 1\` 均分，防止窄画布换行堆叠）。
12. **网格/列布局高度铁律（P0-4）**：使用 CSS Grid（\`display: grid\`）且行数固定时，**禁止写 \`grid-template-rows: repeat(N, 1fr)\`**——\`1fr\` 行轨道默认 min-height:auto，行高下限=单元格内容最小高度，内容多时会把行撑到远超画布可用高度，导致整体溢出被裁切。正确写法二选一：
    - 内容必须完整可见（卡片/图标列表）：\`grid-template-rows: repeat(N, min-content)\` + 容器 \`overflow-y: auto\` + \`align-content: start\`，由容器内部滚动容纳全部内容；
    - 内容按画布剩余空间均分（图表/纯色块）：\`grid-template-rows: repeat(N, minmax(0, 1fr))\`。
    同时：grid/flex 中任何内容可能超过可用高度的容器（列表、网格、侧边栏导航）都必须成对写 \`min-height: 0\` + \`overflow-y: auto\`，**禁止内容把外层画布（height:100% 的根容器）撑出滚动/被裁切**。判定标准：根容器自身 scrollHeight 不得大于其 clientHeight。
13. **主题颜色规范（强制，防 THEME-VAR-NAME-MISMATCH / FLEX-003）**：
    - 一切颜色（文字/背景/边框/阴影）**禁止写 \`var(--colorXxx, fallback)\` 直引 CSS 变量**——平台不注入这些名字，fallback 恒生效 → 切主题零响应，质量门禁直接 BLOCK（实锤 c-122f11：15 处 var() 直引三轮重试全部被拦）。
    - 颜色一律引用主题槽位 Less 变量（theme-vars.less 的 \`.theme-dark()\`/\`.theme-light()\` 已定义）：\`@colorTextBase\`（正文文字）、\`@colorTextInverse\`（反色文字）、\`@colorBgPanel\`（面板背景）、\`@colorPrimary\`（主色）、\`@colorSecondary\`、\`@colorDanger\`、\`@colorBorder\`，写法如 \`color: @colorTextBase;\`。需要新颜色槽位时直接引用新名字（如 \`@colorBgCard\`），平台检查器会把缺失槽位补齐到两套主题。
    - **同名 class 的布局属性（flex/width/height/min-*）只能写在一处**：要么 \`common.less\`（共享表）要么组件 \`<style>\`，两处都写且值不同会触发 FLEX-003 BLOCK（scoped 优先级恒高，共享表成死样式）。图标/固定件写 \`flex: 0 0 auto\`，需要撑满的区块写 \`flex: 1\` 并成对 \`min-height: 0\`。
14. **常见 UI 控件 → antd 默认实现（U1 · 2026-10-09，实锤 c-c19746-c1974689 半真半假）**：截图中出现下述控件形态时**必须**用对应 Ant Design Vue 组件实现，**禁止手写 div/span 模仿组件 DOM 结构**（指纹：class 名中出现 \`antd-xxx\` / \`ant-design-vue-xxx\` 即不合格）：
    - 表单成组（标签+必填星号+输入控件）→ \`<a-form>\` + \`<a-form-item>\`；**每行标签必须由 \`<a-form-item>\` 的 \`label\` 属性或 \`#label\` 插槽承载（必填星号写在插槽内），禁止裸 \`<label>\` 标签**（实锤 mv-lite-1791600614695-397d13ce：控件全换 antd 但 10 处裸 label 行结构残留）；输入框 → \`<a-input>\`、多行 → \`<a-textarea>\`、下拉 → \`<a-select>\`
    - 上传区（虚线框+加号/「点击上传」）→ \`<a-upload>\`（拖拽形态用 a-upload-drag）；下载/导出按钮 → \`<a-button>\` + download 图标
    - 分页器 → \`<a-pagination>\`；标签页 → \`<a-tabs>\`/\`<a-tab-pane>\`；搜索框 → \`<a-input-search>\`；开关 → \`<a-switch>\`；日期 → \`<a-date-picker>\`
    - 已用 a-input/a-table 等真组件的其余部分不算达标——「半真半假」的结构模仿必须整体替换为真组件；覆盖内部 \`.ant-*\` 节点用 \`:deep(...)\`（同第 7 条）
15. 必须完整输出 </template>、</script>、</style>，不要包含说明文字。

只输出一个 \`\`\`vue 代码块，里面是完整组件代码。`;
    }
    visionOnProgress(sessionId) {
        return (data) => {
            try {
                this.progressService.sendProgress(sessionId, data);
            }
            catch {
            }
        };
    }
    extractVueCode(text) {
        if (typeof text !== 'string') {
            this.logger.warn(`extractVueCode 收到非字符串输入: ${typeof text}`);
            return '';
        }
        if (!text)
            return '';
        const fence = text.match(/```vue\s*([\s\S]*?)```/i);
        if (fence && fence[1].trim())
            return fence[1].trim();
        const plain = text.match(/```\s*([\s\S]*?)```/);
        if (plain && plain[1].trim())
            return plain[1].trim();
        const tpl = text.indexOf('<template');
        if (tpl >= 0)
            return text.slice(tpl).trim();
        return text.trim();
    }
    repairJson(text) {
        return (0, repair_json_util_1.repairJson)(text);
    }
    parseBrief(text) {
        if (!text)
            return {};
        const parsed = this.repairJson(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            return parsed;
        return { raw: text };
    }
    buildMicrocodeCodegenPrompt(brief, componentName, dto, designWidth, designHeight) {
        const briefJson = JSON.stringify(brief || {}, null, 2);
        const classPrefix = `c-${componentName}-`;
        const fontFloorRule = this.buildFontFloorRule(brief);
        const epUser = String(dto.extraPrompt || '').trim().slice(0, 4000);
        const rdtUser = String(dto.requirementDocText || '').trim().slice(0, 20000);
        const userAddendum = epUser || rdtUser
            ? `\n【用户补充需求（用户显式输入，必须遵守；视觉样式（颜色/尺寸/布局/字体）与设计稿冲突时以设计稿为准，但交互/行为类显式要求（tab 切换、轮播、折叠展开、点击联动等）必须落实，不得以「设计稿没有」为由省略；用户显式要求优先于平台默认规范）】\n${epUser ? `补充提示词：\n${epUser}\n` : ''}${rdtUser ? `需求文档要点：\n${rdtUser}\n` : ''}\n`
            : '';
        const themeOverride = dto.backgroundBrightness
            ? `\n**演示面板主题（用户显式指定，P0 覆盖）**：当前使用${dto.backgroundBrightness === 'dark' ? '深色' : '浅色'}演示面板。组件根容器必须使用${dto.backgroundBrightness === 'dark' ? '深色底（如 #1a1a2e / #2d2d3f）+ 浅色正文' : '浅色底（如 #FFFFFF / #F5F8FC）+ 深色正文'}。此设置优先于【结构化拆解】中的 theme 字段与截图背景推断。`
            : '';
        const isoBlock = (0, iso_lite_prompt_js_1.buildLiteIsoPromptBlock)(brief);
        this.logger.log((0, iso_lite_prompt_js_1.formatLiteIsoLog)('mc/lite', isoBlock));
        const panelKeyValue = dto.panelType || 'default-panel';
        const panelKeyRule = `\n【面板 key（用户显式指定，P0 铁律，禁止降级到 default-panel）】本次生成必须使用 panelKey="${panelKeyValue}"。**禁止**降级或回退到 "${'default-panel'}"，即使你认为其他面板更适合——这是用户在前端面板切换器里明确选的，整组组件（base-panel 实例）都必须与该值保持一致。`;
        return `你是一名微码组件工程师。请基于截图和结构化拆解，生成一个遵循微码组件规范的 Vue3 微码组件。

【组件名】${componentName}
【CSS 类名前缀】${classPrefix}（所有自定义 class 必须以此为前缀）${themeOverride}${panelKeyRule}
${designWidth && designHeight ? `【设计画布逻辑尺寸】${designWidth} × ${designHeight} CSS px
参考截图可能是 2 倍导出像素，只用于视觉识别，不得把图片像素作为组件 CSS 尺寸。
微码面板（base-panel）自带头部标题栏约占 36px，内容区可用高度按 ${designHeight - 36}px 预算——所有区块必须在此高度内完整放下，不得溢出。
**高度预算分解铁律（P0-4）**：写 CSS 前必须先做高度预算分解（可在 <style> 顶部注释中写出算式）：
  可用高度 H = ${designHeight - 36}px - 根容器 padding×2；
  逐区块分配：header ≈ 24px、统计卡/工具条 ≈ 40-56px、主内容区 = H - 其他区块 - 各 gap；
  grid 行高 = (主内容区高度 - (行数-1)×gap) ÷ 行数，行高定下来后卡片内元素必须适配（图标 ≤ 行高×0.45，名称/数字字号 ≤ 行高×0.25）；
  竖排文字按钮（writing-mode:vertical-rl）必须加 \`white-space: nowrap\` 防中间断列，按钮高度按**最长标签**预算（最长字数 ×(字号+letterSpacing) + padding×2 ≤ 按钮高），任一字数排不下就统一缩字号——禁止断列导致阅读顺序乱（实锤：供配电→电供/配、交通诱导→诱交/导通）；按最长标签定高后还必须做总高对账：N 个按钮总高 + (N-1)×gap + 徽标预留 ≤ sidebar 分配高度，超出则**优先缩字号**、按钮高随字号同比缩小——任何压缩后仍必须满足 按钮高 ≥ 最长字数 ×(字号+letterSpacing) + padding×2（禁止只压按钮高不缩字号导致文字被按钮裁切，实锤：交通诱导在 20px 按钮里只显示「交通」）；禁止按钮总高溢出导致末尾按钮被面板底部裁切（实锤：交通诱导被裁得只剩「交」字）。
  角标/计数徽标（badge）用负偏移挂在按钮外侧时，必须为所在栏预留对应空间（如 sidebar padding-top ≥ 徽标外溢高度），父链 overflow:visible 且徽标 z-index 高于相邻区块——禁止被上一区块裁切/遮挡（实锤：监控的 3/3740 标签被统计卡行遮住）；徽标还必须完全落在面板水平边界内（left ≥ 0、right ≤ 面板宽），栏宽不足时缩徽标字号或改为栏内右上角内嵌——禁止溢出面板左/右边界。
  对称溢出铁律：根容器及任何区块的 scrollHeight 不得大于 clientHeight（与 scrollWidth 同标准），底部行文字被裁半即不合格——预算总和超 H 时优先压缩 grid 行高/卡片内边距，禁止静默溢出。
  **宽度预算同理**：grid 列宽 = (可用宽 - (列数-1)×gap) ÷ 列数，卡片内文字必须适配列宽（名称 字数×字号 ≤ 列宽 - 卡片padding×2 - 图标宽，超出就缩字号，禁止横向裁切）；顶部统计条必须**单行**放下（标签+数值总宽 ≤ 可用宽，超出就缩字号，禁止换行）。
  **禁止不做预算直接堆「看起来舒服」的固定尺寸**（实测：14px 竖排按钮 × 6 + 110px 卡片 × 4 必然超出 389px 内容区，底部两行被裁）。
` : ''}${fontFloorRule}【结构化拆解】
${briefJson}
${isoBlock.block}
${dto.notes ? `【布局补充】\n${dto.notes}\n` : ''}${userAddendum}${(0, user_addendum_js_1.buildOddEvenHintSection)(brief.oddEvenHints)}

微码硬性规则：
0. 根容器必须使用微码面板组件：
   \`\`\`html
   <base-panel panelKey="${panelKeyValue}">
     <!-- 主体内容放默认插槽 -->
     <div class="${classPrefix}content">
       <!-- 业务内容 -->
     </div>
   </base-panel>
   \`\`\`
   **重要**：所有 \`<base-panel>\` 实例的 panelKey 都必须是 "${panelKeyValue}"，与上方规则 P0 铁律保持一致。
0.5 **面板头部归属铁律（P0）**：截图最顶部的面板标题栏（标题文字 + 与标题同一水平线的控件）属于**面板壳**（base-panel 自带头部约 36px），不是内容区的一部分，**禁止在内容区自绘标题栏**（实锤 mc-lab-1793862674851：内容区自绘「重点车辆监测」标题行，与面板壳标题叠成双重头部）：
   - declare.json 的 \`componentName\` 必须写截图面板标题的**中文文字**（如「重点车辆监测」）——面板壳用它渲染头部标题；componentId/目录名不受影响（由外部派生）。
   - \`<template #header-right>\` 插槽**只放面板壳头部条内的控件**——判据（P0，实锤 mc-lab-1793884391523：内容区右上角图标按钮被误放插槽，与 Figma 真值错位）：控件必须**紧贴面板最顶边、与标题文字处于同一条水平带（约 ≤36px 高度带）**才允许放插槽；**凡位于标题栏以下（哪怕贴近视觉右上角）的图标按钮/分页圆点等小元素，一律属于内容区**，放默认插槽内容容器内（需要贴边时用 \`position:absolute\` + 父容器 \`position:relative\` 定位到右上角）：
     \`\`\`html
     <base-panel panelKey="${panelKeyValue}">
       <template #header-right>
         <!-- 仅：紧贴面板顶边、与标题同一水平带的控件 -->
       </template>
       <div class="${classPrefix}content"><!-- 标题栏以下的内容区（含右上角图标等画布内元素） --></div>
     </base-panel>
     \`\`\`
   - 默认插槽只放标题栏**以下**的区块；高度预算按内容区口径（面板头部 36px 已含标题）。
0.6 **图标占位铁律（P0）**：截图中任何图标位（卡片图标/状态图标/按钮图标）**禁止臆造图形**——禁止内联 \`<svg>\` 手绘、禁止 \`data:image/svg+xml\` 字符串、禁止用 CSS 类/伪元素拼图形（实锤：手绘卡车/CSS 卡车与真实图标视觉差大且平台无法回填真值）。统一写法：
   - 模板：\`<img class="xxx-icon" :src="item.icon" :alt="item.name" />\`（v-for 数据驱动）或 \`<img class="xxx-icon" :src="iconXxx" />\`（静态）；
   - mock 数据：icon 字段一律留**空字符串** \`icon: ''\`（平台的 Figma 真值管线会把真实图标文件回填进来）；
   - icon 容器必须写背景色 + 圆角（如 \`background: rgba(0,0,0,0.06); border-radius: 8px\`）防回填前空白突兀。
1. 使用 \`<style scoped>\` 隔离样式。
2. 所有自定义 class 必须加前缀 \`${classPrefix}\`（如 \`${classPrefix}header\`、\`${classPrefix}title\`）。
3. 还原截图中可见的 DOM 层级、尺寸比例、间距、对齐、配色、字体、边框、圆角和阴影。
4. 使用 flex/grid/百分比布局，禁止固定 px 宽高；**同样禁止 min-width/max-width 固定 px**——并排卡片必须纯 \`flex: 1\` 均分，写 \`min-width: 200px\` 之类会让窄画布内卡片换行堆叠（实锤 mc-lite-1788258227940 两张统计卡竖排）。
5. **主题锚点铁律（P0-4）**：组件整体明暗风格由【结构化拆解】中的 theme 字段决定：
   - theme="light"：根容器背景用浅色（#FFFFFF / #F5F8FC 系），正文用深色（#1F2329 / #333333 系），禁止渲染成深色底。
   - theme="dark"：根容器背景用深色，正文用浅色。
   - **半透明防误判**：卡片背景可用 rgba 或浅色透明层，但「主题归属」由根容器底色决定；禁止因单个卡片深色/半透明把整个组件改成深色主题。
   - 无 theme 字段时以 colors.background 明度推断：浅色背景 → 浅色主题。
   - **冲突裁决（P0，2026-11-11 补丁层自防）**：若 theme 与 colors / visualDetails 的明暗描述冲突，一律以 theme 为准；禁止使用与之矛盾的 background / surface / text / border 色值，也禁止依据「整体背景为深蓝色渐变」之类描述把根容器改成深色。根治项是装配层的主题色板归一，本条只防其未覆盖的矛盾描述。
6. **图表自动映射**：如果截图中包含图表（折线图/柱状图/饼图/面积图等），使用 ECharts 实现：
   - 引入：\`import * as echarts from 'echarts'\`
   - 图表容器：\`<div ref="chartRef" class="${classPrefix}chart"></div>\`（样式用 CSS，禁止内联 style）
   - chart 容器 CSS：\`.${classPrefix}chart { width: 100%; height: 100%; }\`，父容器 \`flex: 1; min-height: 0;\`
   - **echarts 初始化时序（强制，防图表空白）**：禁止同步 \`echarts.init()\`。必须用 ResizeObserver **观察图表容器本身 \`chartRef.value\`**（严禁观察外层容器、严禁 \`document.querySelector\` 查 DOM）。容器 \`clientWidth/clientHeight\` 均 > 0 时才 init；尺寸为 0 时**继续等待、不得 disconnect**（否则「外层有尺寸 → rAF 内图表容器仍为 0 → 永久放弃」必现图表空白）。init 前加 \`if (!chartRef.value || chart) return\` 防重复初始化。
   - **init 入口驱动（强制，防 onMounted 时 ref 未填充）**：初始化逻辑封装为 \`const initChartWhenReady = () => { ... }\`，用 \`watch(chartRef, (el) => { if (el && !chart) nextTick(() => initChartWhenReady()) }, { immediate: true })\` 驱动 + \`onMounted(() => nextTick(initChartWhenReady))\` 兜底（两者幂等）。**严禁** \`onMounted(() => { if (!chartRef.value) return; ... })\` 一次性判断——预览/沙箱环境 onMounted 触发时 ref 可能未填充，return 后无任何重试 → 图表永久空白（实锤 mc-lite-1788179972462-cc22ec3e）。
   - **resize 监听（强制）**：实例创建后挂 ResizeObserver 监听 \`chartRef.value\`，回调中调 \`chart.resize()\`；onUnmounted 中 disconnect + dispose
   - 在 \`onUnmounted\` 中销毁：\`resizeObserver.disconnect(); chart.dispose();\`
   - **数据驱动（强制）**：用截图中的 mock 数据定义成响应式变量（如 \`const chartData = ref([5, 7, 6, 4])\`），\`series.data\` 绑定该变量（\`data: chartData.value\`）。**严禁**在 \`setOption({...})\` 里硬编码数字字面量 \`data: [5, 7, 6]\`。
7. **表格与常见 UI 控件 → Ant Design Vue 自动映射（U1 · 强制）**：
   - 表格/列表 → \`a-table\` 组件：
     - 引入：\`import { Table as ATable } from 'ant-design-vue'\`
     - 在 \`<script setup>\` 中定义 \`columns\` 和 \`dataSource\`（使用截图中的 mock 数据）
     - 在 \`<template>\` 中使用 \`<a-table :columns="columns" :data-source="data" :pagination="false" />\`
   - **常见 UI 控件必须用对应 antd 真组件**（截图中出现下述形态时，禁止手写 div/span/原生标签模仿）：
     - 表单成组（标签+必填星号+输入控件）→ \`<a-form>\` + \`<a-form-item>\`；**每行标签必须由 \`<a-form-item>\` 的 \`label\` 属性或 \`#label\` 插槽承载（必填星号写在插槽内），禁止裸 \`<label>\` 标签**（实锤 mv-lite-1791600614695-397d13ce：控件全换 antd 但 10 处裸 label 行结构残留）；输入框 → \`<a-input>\`、多行 → \`<a-textarea>\`、下拉 → \`<a-select>\`、数字 → \`<a-input-number>\`、单选 → \`<a-radio-group>\`、多选 → \`<a-checkbox-group>\`、开关 → \`<a-switch>\`、日期 → \`<a-date-picker>\`
     - 上传区（虚线框+加号/「点击上传」）→ \`<a-upload>\`；搜索框 → \`<a-input-search>\`；主操作/下载/导出按钮 → \`<a-button>\`
     - **禁止裸写 \`<input>\`/\`<select>\`/\`<textarea>\`/\`<label>\` 原生标签**——平台会对产物扫描裸控件并触发修正重试（实锤 c-add-product-3f734e7a：12 处裸 input 全部被判不合格）
     - 已用 a-table 等真组件的其余部分不算达标——「半真半假」必须整体替换
   - \`<style scoped>\` 中覆盖 Ant Design Vue 内部 \`.ant-*\` 节点时，选择器必须使用 \`:deep(...)\`；禁止直接写裸的 \`.ant-table-*\`
8. **简单交互**：如果截图中包含可交互元素（Tab 切换、按钮、展开/收起等），实现基础交互逻辑：
   - Tab 切换：使用 \`ref\` 存储当前激活 tab，通过 \`@click\` 切换
   - 按钮：添加 \`@click\` 事件（可只打印 console.log 或切换状态）
   - 展开/收起：使用 \`ref\` 控制显示状态
9. 不生成接口请求、数据源、业务事件、业务状态、emit 或截图中不可见的能力。
10. **布局顺序铁律（P0-5）**：顶层区块顺序必须严格遵循截图从上到下（如 header → tabs → 图表 → footer），**禁止把靠上区块（如 tabs）放入底部容器**。截图里 tabs 在图表上方时，模板里 tabs 必须渲染在图表之前。
11. **flex 使用克制（P0-5）**：纵向堆叠优先用默认块级流；仅当需要剩余空间分配（子元素 \`flex: 1\`）或垂直对齐时才用 \`display: flex; flex-direction: column\`，且凡有 \`flex: 1\` 子元素的 column-flex 容器与子元素**必须成对写 \`min-height: 0\`**（echarts/表格容器必现撑破问题）。无 flex 子属性的 column-flex 视为冗余，禁止使用。
12. **尺寸参照铁律（P0-4）**：所有字号/图标/间距必须基于【设计画布逻辑尺寸】${designWidth ? `（${designWidth}×${designHeight}px）` : ''}按比例还原，**禁止直接套用截图里看到的像素值**（截图多为 2 倍导出）。例如逻辑画布宽 420px 时，标题 20-28px、正文 12-16px、图标 20-32px 量级；整个组件布局必须在画布内完整放下，不得超出或挤压。卡片/区块禁止 \`min-width\`/\`max-width\` 固定 px（并排卡片纯 \`flex: 1\` 均分，防止窄画布换行堆叠）。
13. **网格/列布局高度铁律（P0-4）**：使用 CSS Grid（\`display: grid\`）且行数固定时，**禁止写 \`grid-template-rows: repeat(N, 1fr)\`**——\`1fr\` 行轨道默认 min-height:auto，行高下限=单元格内容最小高度，内容多时会把行撑到远超画布可用高度，导致整体溢出被裁切。正确写法二选一：
    - 内容必须完整可见（卡片/图标列表）：\`grid-template-rows: repeat(N, min-content)\` + 容器 \`overflow-y: auto\` + \`align-content: start\`，由容器内部滚动容纳全部内容；
    - 内容按画布剩余空间均分（图表/纯色块）：\`grid-template-rows: repeat(N, minmax(0, 1fr))\`。
    同时：grid/flex 中任何内容可能超过可用高度的容器（列表、网格、侧边栏导航）都必须成对写 \`min-height: 0\` + \`overflow-y: auto\`，**禁止内容把外层画布（height:100% 的根容器）撑出滚动/被裁切**。判定标准：根容器自身 scrollHeight 不得大于其 clientHeight。
14. 必须完整输出 \`</template>\`、\`</script>\`、\`</style>\`。
15. declare.json 只输出最小组件元信息，不声明业务事件、业务状态、数据源或表单源。

输出格式：
\`\`\`vue
<template>
  <base-panel panelKey="${panelKeyValue}">
    <div class="${classPrefix}content">
      <!-- 组件业务内容 -->
    </div>
  </base-panel>
</template>
<script setup>
// ...
</script>
<style scoped>
.${classPrefix}content {
  width: 100%;
  height: 100%;
}
</style>
\`\`\`

\`\`\`json
{
  "panelType": "default-panel",
  "size": { "width": 0, "height": 0 },
  "businessEvents": [],
  "businessStatuses": [],
  "dataSources": [],
  "formSources": []
}
\`\`\``;
    }
    extractMicrocodeOutput(text) {
        if (typeof text !== 'string') {
            const rescued = (0, model_config_js_1.coerceLLMText)(text);
            this.logger.warn(`extractMicrocodeOutput 收到非字符串输入: ${typeof text}，已归一化抢救（${rescued.length} 字符）`);
            text = rescued;
        }
        if (!text) {
            return { vueCode: '', declareJson: null };
        }
        const vueMatch = text.match(/```vue\s*([\s\S]*?)```/i);
        const vueCode = vueMatch ? vueMatch[1].trim() : this.extractVueCode(text);
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i);
        let declareJson = null;
        if (jsonMatch) {
            declareJson = this.repairJson(jsonMatch[1]);
        }
        if (!declareJson) {
            declareJson = this.repairJson(text);
        }
        return { vueCode, declareJson };
    }
    sanitizeSfcAttributeEscapes(code) {
        return code.replace(/<template>([\s\S]*?)<\/template>/gi, (block, inner) => {
            const fixed = inner.replace(/(\s[:@a-zA-Z0-9_-]+=)(["'])([\s\S]*?)\2/g, (full, name, quote, value) => {
                let cleaned = value;
                if (quote === '"')
                    cleaned = cleaned.replace(/\\"/g, "'");
                else
                    cleaned = cleaned.replace(/\\'/g, '"');
                return `${name}${quote}${cleaned}${quote}`;
            });
            return `<template>${fixed}</template>`;
        });
    }
    sanitizeVueScriptImports(vueCode) {
        const scriptMatch = vueCode.match(/<script\s+setup(?:\s[^>]*)?>([\s\S]*?)<\/script>/i)
            || vueCode.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i);
        if (!scriptMatch)
            return vueCode;
        const fullTag = scriptMatch[0];
        const inner = scriptMatch[1];
        const normalized = inner.replace(/(\bfrom\s+)([@A-Za-z_$][\w$./@:-]*)(?=\s*[;\n)>]|$)/g, (_m, pre, spec) => `${pre}'${spec}'`);
        const deduped = (0, sfc_semantics_js_1.dedupeScriptDeclarations)(normalized);
        const newFullTag = fullTag.replace(inner, () => deduped);
        return vueCode.replace(fullTag, () => newFullTag);
    }
    missingSfcBlocks(vueCode) {
        return (0, lite_truncation_telemetry_js_1.missingSfcBlocks)(vueCode);
    }
    validateLiteSfc(vueCode) {
        const missing = this.missingSfcBlocks(vueCode);
        if (missing.length > 0) {
            throw this.wrapError(lite_constants_1.LiteErrorCode.GENERATION_FAILED, `生成的组件结构不完整，缺少闭合标签: ${missing.join(', ')}`);
        }
    }
    async callCodegenWithTruncationRetry(params) {
        const { agent, imagePath, prompt, isMicrocode, sessionId, callOpts, progressStage = 'generating', userId } = params;
        const meta = (0, lite_truncation_telemetry_js_1.collectVisionAgentMeta)(agent, {
            userId,
            target: isMicrocode ? 'microcode' : 'vue3',
            tier: 'lite',
        });
        const emitTelemetry = (event, attempt, extra = {}) => {
            this.logger.log((0, lite_truncation_telemetry_js_1.formatLiteTelemetryLog)({ tag: 'lite-codegen', sessionId, meta, event, attempt, extra }));
            if (event.truncated) {
                this.logger.warn((0, lite_truncation_telemetry_js_1.formatLiteTelemetryLog)({ tag: 'truncation-detected', sessionId, meta, event, attempt, extra }));
            }
        };
        let guarded = await this.callCodegenWithControlGuard(agent, imagePath, prompt, isMicrocode, sessionId, callOpts);
        const first = (0, lite_truncation_telemetry_js_1.detectLiteCodegenTruncation)({ vueCode: guarded.vueCode, genText: guarded.genText });
        emitTelemetry(first, 1, { retryTriggered: first.retryTriggered });
        if (first.retryTriggered) {
            this.logger.warn(`[${sessionId}] 检测到生成代码不完整（缺 ${first.missingBlocks.join(', ')}，疑似输出截断），自动重试一次`);
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: progressStage,
                status: 'running',
                message: '检测到生成代码不完整（疑似输出截断），自动重试一次...',
            });
            const retryGuarded = await this.callCodegenWithControlGuard(agent, imagePath, prompt, isMicrocode, sessionId, callOpts);
            const second = (0, lite_truncation_telemetry_js_1.detectLiteCodegenTruncation)({ vueCode: retryGuarded.vueCode, genText: retryGuarded.genText });
            const adopted = (0, lite_truncation_telemetry_js_1.pickLessTruncatedAttempt)(second, first);
            emitTelemetry(second, 2, { retryTriggered: false, recovered: !second.truncated, adopted });
            if (adopted) {
                guarded = retryGuarded;
            }
            else {
                this.logger.warn(`[${sessionId}] 截断重试未改善（缺 ${second.missingBlocks.length} 处 >= ${first.missingBlocks.length} 处，codeLen ${second.codeLength} vs ${first.codeLength}），保留首轮产物`);
            }
        }
        return { vueCode: guarded.vueCode, declareJson: guarded.declareJson ?? null, genText: guarded.genText };
    }
    normalizeLiteDeclare(raw, componentId, componentName, width, height, themeHint) {
        const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const theme = (themeHint === 'dark' || themeHint === 'light')
            ? themeHint
            : input.defaultTheme === 'dark' || input.defaultTheme === 'light'
                ? input.defaultTheme
                : 'light';
        const aspectRatio = this.calcAspectRatio(width, height);
        const layoutConfig = input.layoutConfig && typeof input.layoutConfig === 'object' && input.layoutConfig.list?.length
            ? input.layoutConfig
            : {
                default: 'default',
                list: [{ name: '默认布局', key: 'default', previewName: 'mc-preview.png' }],
            };
        const themeConfig = {
            default: theme,
            list: [
                { name: '亮色主题', key: 'light', brightness: 'light' },
                { name: '深色主题', key: 'dark', brightness: 'dark' },
            ],
        };
        return {
            componentId,
            componentName: input.componentName || input.displayName || componentName,
            version: 'v1.0.0',
            panelType: input.panelType || 'default-panel',
            defaultTheme: theme,
            attribute: {
                aspectRatio,
                ...(input.attribute || {}),
            },
            size: {
                width: Number(input.size?.width) || width,
                height: Number(input.size?.height) || height,
            },
            businessEvents: input.businessEvents || {},
            businessStatuses: input.businessStatuses || {},
            dataSources: input.dataSources || [],
            formSources: input.formSources || [],
            layoutConfig,
            themeConfig,
            businessConfig: input.businessConfig || {},
        };
    }
    calcAspectRatio(width, height) {
        if (!width || !height)
            return [16, 9];
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        const g = gcd(Math.round(width), Math.round(height));
        return [Math.round(width / g), Math.round(height / g)];
    }
    buildDefaultLess(componentName) {
        return `// ${componentName} 组件样式
// 使用 CSS 变量支持主题切换

.mc-${componentName.toLowerCase()} {
  --primary-color: var(--mc-primary, #1890ff);
  --text-color: var(--mc-text, #333333);
  --border-color: var(--mc-border, #e8e8e8);
  --bg-color: var(--mc-bg, #ffffff);

  width: 100%;
  height: 100%;
  background-color: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 16px;
  box-sizing: border-box;

  &__header {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 12px;
  }

  &__content {
    font-size: 14px;
    line-height: 1.5;
  }
}
`;
    }
    async copyDirFileByFile(srcPath, destPath) {
        if (!(0, fs_1.existsSync)(srcPath))
            return;
        const { mkdirSync, readdirSync, copyFileSync, statSync } = await import('fs');
        const pathJoin = path_1.join;
        const pathDirname = path_1.dirname;
        if (!statSync(srcPath).isDirectory()) {
            mkdirSync(pathDirname(destPath), { recursive: true });
            copyFileSync(srcPath, destPath);
            return;
        }
        const walk = (s, d) => {
            mkdirSync(d, { recursive: true });
            for (const name of readdirSync(s)) {
                const sp = pathJoin(s, name);
                const dp = pathJoin(d, name);
                if (statSync(sp).isDirectory())
                    walk(sp, dp);
                else
                    copyFileSync(sp, dp);
            }
        };
        walk(srcPath, destPath);
    }
    collectSnapshotFiles(outputPath) {
        const files = {};
        const walk = (currentPath) => {
            for (const entry of (0, fs_1.readdirSync)(currentPath)) {
                if (entry === '.cache' || entry === '.checkpoint' || entry === '_upload')
                    continue;
                const absolutePath = (0, path_1.join)(currentPath, entry);
                const stat = (0, fs_1.lstatSync)(absolutePath);
                if (stat.isSymbolicLink())
                    continue;
                if (stat.isDirectory()) {
                    walk(absolutePath);
                    continue;
                }
                const relativePath = (0, path_1.relative)(outputPath, absolutePath).split(path_1.sep).join('/');
                files[relativePath] = (0, fs_1.readFileSync)(absolutePath);
            }
        };
        walk(outputPath);
        return files;
    }
    async publishValidatedLiteOutput(outputPath, sessionId, groupId, target, dto) {
        if (dto)
            await this.injectNThemeTruth(dto, outputPath, target, sessionId);
        try {
            await less_variable_checker_js_1.LessVariableChecker.check(outputPath);
        }
        catch (lessCheckErr) {
            console.warn('[lite] 预发布 Less 变量检查跳过', lessCheckErr?.message);
        }
        const candidate = this.taskCodeSnapshotService.createCandidate({
            sessionId,
            componentId: sessionId,
            groupId,
            target,
            stage: 'lite-generation',
            files: this.collectSnapshotFiles(outputPath),
        });
        const validation = {
            semantics: 'passed',
            sfc: 'passed',
            less: 'passed',
            runtime: 'pending',
        };
        this.taskCodeSnapshotService.markValidating(sessionId, candidate.revision, validation);
        this.progressService.sendCodeSnapshot(sessionId, {
            revision: candidate.revision,
            status: 'validating',
            stage: candidate.stage,
            fileCount: candidate.files.length,
            changedFiles: candidate.files.map((file) => file.path),
            lastGoodRevision: candidate.lastGoodRevision,
        });
        const previewContext = { componentId: sessionId, groupId, target };
        const publisher = await loadPreviewPublisher();
        try {
            const publishResult = await publisher.publishQualityPreview({ outputPath, ...previewContext });
            const publishContext = {
                ...previewContext,
                componentId: publishResult?.componentId || previewContext.componentId,
            };
            if (!publisher.commitQualityPreviewTransaction(publishContext)) {
                throw new Error('Lite workspace 质量预览事务提交失败');
            }
            const published = this.taskCodeSnapshotService.publishLastGood(sessionId, candidate.revision, { ...validation, runtime: 'passed' });
            this.progressService.sendCodeSnapshot(sessionId, {
                revision: published.revision,
                status: published.status,
                stage: published.stage,
                fileCount: published.files.length,
                changedFiles: published.files.map((file) => file.path),
                lastGoodRevision: published.revision,
            });
        }
        catch (error) {
            publisher.rollbackQualityPreviewTransaction({ ...previewContext, reason: error.message });
            const rejected = this.taskCodeSnapshotService.rejectCandidate(sessionId, candidate.revision, error.message || 'Lite 质量门禁未通过', { ...validation, runtime: 'blocked' });
            this.progressService.sendCodeSnapshot(sessionId, {
                revision: rejected.revision,
                status: rejected.status,
                stage: rejected.stage,
                fileCount: rejected.files.length,
                changedFiles: [],
                lastGoodRevision: rejected.lastGoodRevision,
            });
            throw error;
        }
    }
    async injectNThemeTruth(dto, outputPath, target, sessionId) {
        if (target !== 'microcode')
            return;
        const nodes = Array.isArray(dto.themeNodes) ? dto.themeNodes : [];
        if (nodes.length === 0)
            return;
        try {
            const { normalizeThemeInputs } = await import('../ai-engine/utils/multi-theme.js');
            const { themes, errors } = normalizeThemeInputs(nodes);
            if (errors.length > 0) {
                throw new Error(`N 主题输入校验失败：${errors.map((e) => e.detail).join('；')}`);
            }
            if (themes.length === 0)
                return;
            const { extractFigmaColorPalette, resolveBackgroundBrightness } = await import('../ai-engine/utils/style-tokens.js');
            const firstTheme = themes[0] || null;
            const figmaTokenRes = await (0, figma_execution_token_probe_1.resolveExecutionFigmaTokenWithProbe)({
                task: sessionId ? this.tasksService.getTask(sessionId) : null,
                requestConfig: dto.config,
                envToken: process.env.FIGMA_ACCESS_TOKEN,
                fileKey: firstTheme?.fileKey,
                nodeId: firstTheme?.nodeId,
            });
            this.logger.log(`[figma-cred] lite/n-theme session=${sessionId} source=${figmaTokenRes.source} ` +
                `reason=${figmaTokenRes.reason} ref=${figmaTokenRes.refSource || '-'} ` +
                `probed=${figmaTokenRes.probes.length} :: ${figmaTokenRes.note}`);
            if (!figmaTokenRes.token) {
                throw new Error(`无法取得可读取设计稿的 Figma Token：${figmaTokenRes.note}`);
            }
            const connector = new figma_client_js_1.FigmaClient(figmaTokenRes.token || undefined);
            const entries = [];
            for (let i = 0; i < themes.length; i++) {
                const t = themes[i];
                let nodeData = null;
                try {
                    nodeData = await connector.fetchNodeData(t.fileKey, t.nodeId);
                }
                catch (err) {
                    throw new Error(`主题「${t.name}」设计稿拉取失败：${err?.message || '未知原因'}`);
                }
                if (!nodeData || typeof nodeData !== 'object') {
                    throw new Error(`主题「${t.name}」设计稿拉取失败：返回内容为空`);
                }
                entries.push({
                    key: t.key,
                    name: t.name,
                    brightness: t.brightness === 'light' || t.brightness === 'dark'
                        ? t.brightness
                        : resolveBackgroundBrightness(nodeData, i === 0 ? 'dark' : 'light'),
                    palette: extractFigmaColorPalette(nodeData),
                    panelType: t.panelType || null,
                });
            }
            const { assembleLiteThemes, expandThemeVarsLess } = await import('../lite/utils/lite-multi-theme.js');
            const asm = assembleLiteThemes(entries);
            const themeVarsPath = (0, path_1.join)(outputPath, 'resources', 'styles', 'themes', 'theme-vars.less');
            if ((0, fs_1.existsSync)(themeVarsPath)) {
                const prev = (0, fs_1.readFileSync)(themeVarsPath, 'utf8');
                const next = expandThemeVarsLess(prev, asm.slots, asm.list);
                if (next !== prev) {
                    await (0, promises_1.writeFile)(themeVarsPath, next, 'utf8');
                }
            }
            else {
                this.logger?.warn?.(`[lite] N 主题注入跳过：未找到 theme-vars.less（outputPath=${outputPath}）`);
                return;
            }
            const declarePath = (0, path_1.join)(outputPath, 'declare.json');
            if ((0, fs_1.existsSync)(declarePath)) {
                try {
                    const declare = JSON.parse((0, fs_1.readFileSync)(declarePath, 'utf8'));
                    const tc = declare.themeConfig && typeof declare.themeConfig === 'object' ? declare.themeConfig : {};
                    tc.default = asm.list[0]?.key || tc.default;
                    tc.list = asm.list.map((t) => ({
                        name: t.legacyName || t.name,
                        key: t.key,
                        brightness: t.brightness,
                        ...(t.panelType ? { panelType: t.panelType } : {}),
                    }));
                    tc.multiTheme = asm.list.length > 2;
                    tc.themeCount = asm.list.length;
                    tc.dualTruth = asm.list.length > 1;
                    declare.themeConfig = tc;
                    if (asm.degraded.length > 0) {
                        tc.degradedThemes = asm.degraded;
                    }
                    await (0, promises_1.writeFile)(declarePath, JSON.stringify(declare, null, 2), 'utf8');
                }
                catch (err) {
                    this.logger?.warn?.(`[lite] N 主题 themeConfig 回写失败（非阻断）：${err?.message}`);
                }
            }
            this.logger?.log?.(`[lite] N 主题真值注入完成：${asm.list.length} 个主题` +
                (asm.degraded.length ? `（${asm.degraded.length} 个色板不合格已退兜底）` : ''));
        }
        catch (err) {
            this.logger?.error?.(`[lite] N 主题真值注入失败（阻断发布）：${err?.message}`);
            throw err;
        }
    }
    async copyToWorkspace(outputPath, sessionId, groupId, componentType = 'vue3') {
        try {
            const packageDir = (0, path_1.join)(outputPath, 'package');
            const resourcesDir = (0, path_1.join)(outputPath, 'resources');
            if (!(0, fs_1.existsSync)((0, path_1.join)(packageDir, 'index.vue'))) {
                this.logger.error(`Lite 入口缺失: ${(0, path_1.join)(packageDir, 'index.vue')}`);
                return;
            }
            const syntaxErrors = (0, sfc_syntax_validation_js_1.validateVueSfcDirectory)(packageDir);
            if (syntaxErrors.length > 0) {
                this.logger.warn(`[copyToWorkspace] SFC 校验有 ${syntaxErrors.length} 条警告（不阻断复制）: ${syntaxErrors.slice(0, 5).join('; ')}`);
            }
            const isMicrocode = componentType === 'microcode';
            const targets = isMicrocode
                ? [
                    (0, path_1.join)(backend_root_1.customComponentsDir, sessionId),
                    (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', sessionId),
                ]
                : [
                    (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, sessionId),
                    (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, sessionId),
                ];
            for (const targetPath of targets) {
                await (0, promises_1.mkdir)(targetPath, { recursive: true });
                if (isMicrocode) {
                    await this.copyDirFileByFile(packageDir, (0, path_1.join)(targetPath, 'package'));
                    if ((0, fs_1.existsSync)(resourcesDir)) {
                        await this.copyDirFileByFile(resourcesDir, (0, path_1.join)(targetPath, 'resources'));
                    }
                    const requiredFiles = ['declare.json', 'declare.js'];
                    const missing = requiredFiles.filter((file) => !(0, fs_1.existsSync)((0, path_1.join)(outputPath, file)));
                    if (missing.length > 0) {
                        throw new Error(`Lite 微码产物缺少运行时文件: ${missing.join(', ')}`);
                    }
                    for (const file of requiredFiles) {
                        await this.copyDirFileByFile((0, path_1.join)(outputPath, file), (0, path_1.join)(targetPath, file));
                    }
                    const styleImport = (0, fs_1.existsSync)((0, path_1.join)(targetPath, 'resources', 'styles', 'index.css'))
                        ? "import './resources/styles/index.css'"
                        : (0, fs_1.existsSync)((0, path_1.join)(targetPath, 'resources', 'styles', 'index.less'))
                            ? "import './resources/styles/index.less'"
                            : '';
                    if (!styleImport) {
                        throw new Error('Lite 微码产物缺少 resources/styles/index.css 或 index.less');
                    }
                    await (0, promises_1.writeFile)((0, path_1.join)(targetPath, 'component.js'), `import component from './package/index.vue'\n${styleImport}\nexport default component\n`, 'utf-8');
                }
                else {
                    await this.copyDirFileByFile(packageDir, (0, path_1.join)(targetPath, 'package'));
                    if ((0, fs_1.existsSync)(resourcesDir)) {
                        await this.copyDirFileByFile(resourcesDir, (0, path_1.join)(targetPath, 'resources'));
                    }
                }
                const generatedSizeSource = (0, path_1.join)(outputPath, '_figma-size.json');
                const figmaCacheSource = (0, path_1.join)(outputPath, '.mc-gen', 'cache', 'figma-node-data.json');
                const legacyCacheSource = (0, path_1.join)(outputPath, '.cache', 'figma-node-data.json');
                const sizeSource = (0, fs_1.existsSync)(generatedSizeSource)
                    ? generatedSizeSource
                    : (0, fs_1.existsSync)(figmaCacheSource)
                        ? figmaCacheSource
                        : (0, fs_1.existsSync)(legacyCacheSource)
                            ? legacyCacheSource
                            : null;
                if (sizeSource) {
                    const targetSizePath = (0, path_1.join)(targetPath, '_figma-size.json');
                    await this.copyDirFileByFile(sizeSource, targetSizePath);
                    this.logger.debug(`[copyToWorkspace] 已复制 Figma 尺寸文件: ${targetSizePath}`);
                }
            }
            this.logger.log(`Lite ${isMicrocode ? '微码' : 'Vue3'} 组件已复制到 workspace: ${isMicrocode ? sessionId : `${groupId}/${sessionId}`}`);
        }
        catch (error) {
            this.logger.error(`Lite workspace 复制失败: ${error.message}`, error.stack);
            throw this.wrapError(lite_constants_1.LiteErrorCode.GENERATION_FAILED, `组件运行时文件准备失败: ${error.message}`, error);
        }
    }
    async resolvePrivateGroupId(dtoGroupId, userId) {
        return (0, group_resolver_1.resolvePrivateGroupId)(dtoGroupId, userId, this.groupMemberModel);
    }
    async persistComponent(componentName, sessionId, groupId, userId, width, height, componentType = 'vue3', sourceType = 'screenshot', generationTier = lite_constants_1.LITE_SCREENSHOT_TIER, userComponentId) {
        let resolvedCreatorId = userId;
        let resolvedGroupId = groupId;
        if (!resolvedCreatorId && resolvedGroupId) {
            const firstMember = await this.groupMemberModel
                .findOne({ groupId: resolvedGroupId })
                .exec();
            if (firstMember)
                resolvedCreatorId = firstMember.userId.toString();
        }
        if (!mongoose_3.Types.ObjectId.isValid(resolvedGroupId) && resolvedCreatorId) {
            const membership = await this.groupMemberModel
                .findOne({ userId: resolvedCreatorId })
                .exec();
            if (membership)
                resolvedGroupId = membership.groupId.toString();
        }
        if (!mongoose_3.Types.ObjectId.isValid(resolvedGroupId)) {
            if (!resolvedGroupId || typeof resolvedGroupId !== 'string' || !resolvedGroupId.trim()) {
                this.logger.warn(`groupId 无效，跳过组件记录: ${resolvedGroupId}`);
                return;
            }
        }
        if (!resolvedCreatorId)
            resolvedCreatorId = resolvedGroupId;
        await this.componentService.createComponent(componentName, componentName || 'Lite 生成组件', resolvedGroupId, resolvedCreatorId, {
            type: componentType,
            target: componentType,
            taskId: sessionId,
            componentId: componentType === 'microcode'
                ? (0, component_naming_js_1.normalizeUserComponentId)(userComponentId) ||
                    (0, component_naming_js_1.buildComponentId)(componentName || 'component', sessionId)
                : sessionId,
            sessionId,
            sourceType,
            generationTier,
            ...(width ? { figmaWidth: width } : {}),
            ...(height ? { figmaHeight: height } : {}),
        });
        this.logger.log(`Lite 组件记录已保存: ${componentName} (${sessionId})`);
    }
    wrapError(code, message, cause) {
        const err = new Error(message);
        err.code = code;
        if (cause?.stack)
            err.stack = cause.stack;
        return err;
    }
    async saveCheckpoint(outputPath, state) {
        try {
            const { mkdirSync, writeFileSync } = await import('fs');
            const cpDir = (0, path_1.join)(outputPath, '.checkpoint');
            mkdirSync(cpDir, { recursive: true });
            writeFileSync((0, path_1.join)(cpDir, 'lite-state.json'), JSON.stringify(state, null, 2), 'utf-8');
        }
        catch {
        }
    }
    async loadCheckpoint(outputPath) {
        try {
            const { readFileSync, existsSync } = await import('fs');
            const cpPath = (0, path_1.join)(outputPath, '.checkpoint', 'lite-state.json');
            if (!existsSync(cpPath))
                return null;
            return JSON.parse(readFileSync(cpPath, 'utf-8'));
        }
        catch {
            return null;
        }
    }
    async resumeFromCheckpoint(sessionId, outputPath, dto) {
        return this.withSessionLogContext(sessionId, async () => {
            const runningOperation = this.resumeOperations.get(sessionId);
            if (runningOperation) {
                this.logger.warn(`Lite 断点续跑已在执行，复用当前操作: ${sessionId}`);
                return runningOperation;
            }
            const operation = this.executeResumeFromCheckpoint(sessionId, outputPath, dto);
            this.resumeOperations.set(sessionId, operation);
            try {
                return await operation;
            }
            finally {
                if (this.resumeOperations.get(sessionId) === operation) {
                    this.resumeOperations.delete(sessionId);
                }
            }
        });
    }
    async executeResumeFromCheckpoint(sessionId, outputPath, dto) {
        const cp = await this.loadCheckpoint(outputPath);
        if (!cp) {
            return { success: false, sessionId, message: '未找到断点，请使用重新生成' };
        }
        const { mkdirSync, writeFileSync } = await import('fs');
        const { brief, width, height, sourceType, componentType, generationTier } = cp;
        const isMicrocode = componentType === 'microcode';
        const derivedName = cp.finalComponentName
            ? { codeName: cp.finalComponentName, displayName: cp.displayName || cp.finalComponentName }
            : this.deriveComponentName(dto.componentName, brief, sessionId);
        const finalComponentName = derivedName.codeName;
        const displayName = derivedName.displayName;
        const controller = new AbortController();
        this.tasksService.registerAbortController(sessionId, controller);
        this.tasksService.updateTask(sessionId, {
            status: 'running',
            error: undefined,
            endTime: undefined,
            duration: undefined,
        });
        this.progressService.sendProgress(sessionId, {
            type: 'progress',
            stage: 'resuming',
            status: 'running',
            message: `从断点续跑（已完成：${cp.stage}）`,
        });
        try {
            let vueCode;
            let declareJson = null;
            let visionModelUsed = null;
            if (cp.stage === 'codegen_done' && cp.vueCode) {
                vueCode = cp.vueCode;
                if (cp.declareJson)
                    declareJson = cp.declareJson;
                this.progressService.sendProgress(sessionId, {
                    type: 'progress', stage: 'generating', status: 'completed',
                    message: '代码已从断点恢复',
                });
            }
            else {
                this.progressService.sendProgress(sessionId, {
                    type: 'progress', stage: 'generating', status: 'running',
                    message: '从断点续跑代码生成...',
                });
                const resumeTask = this.tasksService.getTask(sessionId);
                const agent = await this.buildVisionAgent(dto, cp.sourceType || 'screenshot', resumeTask?.userId);
                visionModelUsed = agent?.model || null;
                const screenshotPath = this.findScreenshotPath(outputPath);
                const guarded = await this.callCodegenWithTruncationRetry({
                    agent,
                    imagePath: screenshotPath,
                    prompt: isMicrocode
                        ? this.buildMicrocodeCodegenPrompt(brief, finalComponentName, dto, width, height)
                        : this.buildCodegenPrompt(brief, finalComponentName, dto, width, height),
                    isMicrocode,
                    sessionId,
                    userId: resumeTask?.userId,
                    callOpts: { signal: controller.signal, requestTimeoutMs: 300000, onProgress: this.visionOnProgress(sessionId), outputKind: 'sfc' },
                });
                vueCode = guarded.vueCode;
                declareJson = guarded.declareJson ?? null;
                if (!vueCode || vueCode.trim().length < 30) {
                    throw new Error('生成的组件代码为空或无效');
                }
                vueCode = (0, css_sanitizer_js_1.repairScopedThirdPartySelectors)(vueCode, this.logger);
                this.validateLiteSfc(vueCode);
                if (isMicrocode) {
                    declareJson = this.normalizeLiteDeclare(declareJson, sessionId, finalComponentName, width, height, brief?.theme);
                }
                await this.saveCheckpoint(outputPath, { ...cp, stage: 'codegen_done', vueCode, ...(declareJson ? { declareJson } : {}) });
            }
            const packageDir = (0, path_1.join)(outputPath, 'package');
            mkdirSync(packageDir, { recursive: true });
            if (isMicrocode) {
                const { extractAndPrepareLiteMicrocodeStyles } = await import('../ai-engine/utils/lite-style-extractor.js');
                const _extracted = await extractAndPrepareLiteMicrocodeStyles(vueCode, finalComponentName);
                let vueFinal = _extracted.vueFinal;
                let businessStyles = _extracted.businessStyles;
                {
                    const _fontGuard = (0, font_size_guard_js_1.ensureMinFontSize)({
                        'package/index.vue': vueFinal,
                        'resources/styles/common.less': businessStyles,
                    });
                    vueFinal = _fontGuard.files['package/index.vue'];
                    businessStyles = _fontGuard.files['resources/styles/common.less'];
                    const _fontGuardLog = (0, font_size_guard_js_1.formatFontGuardLog)(_fontGuard, 'lite');
                    this.logger.log(_fontGuardLog.message, _fontGuardLog.meta);
                }
                writeFileSync((0, path_1.join)(packageDir, 'index.vue'), vueFinal, 'utf-8');
                this.logLiteSubcomponentSplit(packageDir, sessionId);
                await this.writeMicrocodeAssets(outputPath, declareJson, finalComponentName, sessionId, businessStyles);
                await this.ensureLiteStylesCompilable(outputPath, sessionId);
            }
            else {
                const _fontGuardVue3 = (0, font_size_guard_js_1.ensureMinFontSize)({ 'package/index.vue': vueCode });
                vueCode = _fontGuardVue3.files['package/index.vue'];
                const _fontGuardVue3Log = (0, font_size_guard_js_1.formatFontGuardLog)(_fontGuardVue3, 'lite');
                this.logger.log(_fontGuardVue3Log.message, _fontGuardVue3Log.meta);
                writeFileSync((0, path_1.join)(packageDir, 'index.vue'), vueCode, 'utf-8');
                this.logLiteSubcomponentSplit(packageDir, sessionId);
            }
            const resumeGroupId = await this.resolvePrivateGroupId(dto.groupId, this.tasksService.getTask(sessionId)?.userId);
            const metaPathL2 = (0, path_1.join)(outputPath, 'component-meta.json');
            let prevMetaL2 = {};
            try {
                if ((0, fs_1.existsSync)(metaPathL2)) {
                    prevMetaL2 = JSON.parse((0, fs_1.readFileSync)(metaPathL2, 'utf-8')) || {};
                }
            }
            catch {
                prevMetaL2 = {};
            }
            await (0, promises_1.writeFile)(metaPathL2, JSON.stringify({
                ...prevMetaL2,
                requirementDoc: dto.requirementDoc || '',
                docAnalysis: null,
                componentName: finalComponentName,
                displayName: displayName || finalComponentName,
                generatedAt: new Date().toISOString(),
            }, null, 2), 'utf-8');
            await this.publishValidatedLiteOutput(outputPath, sessionId, resumeGroupId, isMicrocode ? 'microcode' : 'vue3', dto);
            const taskResult = {
                taskId: sessionId,
                componentId: sessionId,
                groupId: resumeGroupId,
                target: componentType,
                sourceType,
                componentType,
                generationTier,
                componentName: finalComponentName,
                brief,
                code: vueCode,
                _completionModels: { visionModel: visionModelUsed, textModel: visionModelUsed },
                ...(declareJson ? { declareJson } : {}),
            };
            this.progressService.sendComplete(sessionId, taskResult);
            this.persistComponent(finalComponentName, sessionId, resumeGroupId, undefined, width, height, componentType, sourceType, generationTier)
                .catch((e) => this.logger.warn(`组件记录保存失败(非阻塞): ${e.message}`));
            return { success: true, sessionId, message: '断点续跑完成' };
        }
        catch (err) {
            this.logger.error(`Lite 断点续跑失败 ${sessionId}: ${err.message}`);
            this.progressService.sendError(sessionId, { code: lite_constants_1.LiteErrorCode.INTERNAL_ERROR, message: err.message });
            return { success: false, sessionId, message: err.message };
        }
        finally {
            this.tasksService.removeAbortController(sessionId);
        }
    }
    findScreenshotPath(outputPath) {
        const { readdirSync, existsSync } = require('fs');
        try {
            const uploadDir = (0, path_1.join)(outputPath, '_upload');
            const files = readdirSync(uploadDir);
            const match = files.find((f) => /^screenshot\.(png|jpe?g|webp)$/i.test(f));
            if (match)
                return (0, path_1.join)(uploadDir, match);
        }
        catch {
        }
        try {
            const imagesDir = (0, path_1.join)(outputPath, 'resources', 'images');
            if (existsSync(imagesDir)) {
                const files = readdirSync(imagesDir);
                const match = files.find((f) => /^source-screenshot\.(png|jpe?g|webp)$/i.test(f));
                if (match)
                    return (0, path_1.join)(imagesDir, match);
            }
        }
        catch {
        }
        throw new Error('未找到截图文件（_upload/screenshot.* 或 resources/images/source-screenshot.*）');
    }
    findUploadExt(outputPath) {
        const { readdirSync, existsSync } = require('fs');
        try {
            const uploadDir = (0, path_1.join)(outputPath, '_upload');
            const files = readdirSync(uploadDir);
            const match = files.find((f) => /^screenshot\.(png|jpe?g|webp)$/i.test(f));
            if (match)
                return match.split('.').pop() || 'png';
        }
        catch {
        }
        try {
            const imagesDir = (0, path_1.join)(outputPath, 'resources', 'images');
            if (existsSync(imagesDir)) {
                const files = readdirSync(imagesDir);
                const match = files.find((f) => /^source-screenshot\.(png|jpe?g|webp)$/i.test(f));
                if (match)
                    return match.split('.').pop() || 'png';
            }
        }
        catch {
        }
        return 'png';
    }
    async ensureLiteStylesCompilable(outputPath, sessionId) {
        const result = await (0, index_css_recompiler_js_1.compileIndexCssStrict)(outputPath, this.logger);
        if (result.reason === 'missing') {
            return result;
        }
        if (!result.ok) {
            const e = result.error;
            const where = e?.filename
                ? `${String(e.filename).split('/custom-components/').pop()}:${e.line || '?'}`
                : 'index.less';
            const detail = `样式文件存在语法错误（${where}）：${String(e?.message || '').split('\n')[0]}`;
            this.logger.error(`❌ LESS 样式终验未通过：${detail}｜已自动修复 ${result.applied.length} 处`, { sessionId, applied: result.applied });
            throw new Error(`LESS 样式校验失败 · ${detail}` +
                (result.applied.length ? `（已自动修复 ${result.applied.length} 处仍未修好，可重试或续跑）` : '（可重试或续跑）'));
        }
        if (result.applied.length) {
            this.logger.log(`✅ LESS 样式终验通过（自动修复 ${result.applied.length} 处）`, { sessionId, applied: result.applied });
        }
        return result;
    }
    logLiteSubcomponentSplit(packageDir, sessionId) {
        try {
            const r = (0, lite_subcomponent_splitter_js_1.applyLiteSubcomponentSplit)(packageDir);
            if (r.changed) {
                this.logger.log(`🧩 Lite 子组件拆分：${r.stats?.split ?? 0} 个业务模块 → package/components/（候选 ${r.stats?.candidates ?? 0}，跳过 ${r.stats?.skipped ?? 0}）`, { sessionId });
            }
            else {
                this.logger.log(`🧩 Lite 子组件拆分：未拆（${r.reason}）`, { sessionId });
            }
        }
        catch (e) {
            this.logger.warn('⚠️ Lite 子组件拆分跳过（不阻断生成，产物保持单文件）', e);
        }
    }
    async writeMicrocodeAssets(outputPath, declareJson, componentName, sessionId, businessStyles) {
        const { mkdirSync, writeFileSync } = require('fs');
        if (!declareJson.attribute) {
            declareJson.attribute = {};
        }
        writeFileSync((0, path_1.join)(outputPath, 'declare.json'), JSON.stringify(declareJson, null, 2), 'utf-8');
        const { buildMcSkeleton } = await import('../ai-engine/utils/mc-skeleton.js');
        const skeleton = buildMcSkeleton({
            componentName,
            rootClass: `c-${componentName}`,
        });
        if (businessStyles && businessStyles.trim().length > 0) {
            const healed = (0, less_compile_gate_js_1.healLessFull)(businessStyles, { sourceType: 'style' });
            if (healed.changed) {
                businessStyles = healed.source;
                this.logger.log(`🧹 业务样式落盘前自愈：${healed.fixes.join('；')}`, { sessionId });
            }
            skeleton['resources/styles/common.less'] =
                `@import './themes/theme-vars.less';

.common();

// ─────────────────────────────────────────────
// ${componentName} 业务样式（从 LLM 产物提取）
// ─────────────────────────────────────────────
${businessStyles}
`;
        }
        for (const [rel, content] of Object.entries(skeleton)) {
            const abs = (0, path_1.join)(outputPath, rel);
            mkdirSync((0, path_1.dirname)(abs), { recursive: true });
            writeFileSync(abs, content, 'utf-8');
        }
        this.logger.log(`🧩 P1.8 微码平台骨架写入（${Object.keys(skeleton).length} 个文件，与 max 路径同源${businessStyles ? '，业务样式已提取' : ''}）`);
    }
};
exports.LiteService = LiteService;
exports.LiteService = LiteService = LiteService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(7, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        progress_service_1.ProgressService,
        component_service_1.ComponentService,
        token_tracker_service_1.TokenTrackerService,
        config_service_1.AiConfigService,
        quota_service_1.QuotaService,
        task_code_snapshot_service_1.TaskCodeSnapshotService,
        mongoose_2.Model])
], LiteService);
//# sourceMappingURL=lite.service.js.map