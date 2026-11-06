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
var LiteLabService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiteLabService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const backend_root_1 = require("../../config/backend-root");
const workspace_config_1 = require("../../config/workspace.config");
const config_service_1 = require("../../config/config.service");
const lite_service_1 = require("../../lite/lite.service");
const progress_service_1 = require("../../progress/progress.service");
const tasks_service_1 = require("../../tasks/tasks.service");
const task_code_snapshot_service_1 = require("../../tasks/task-code-snapshot.service");
const truth_matcher_1 = require("../lib/truth-matcher");
const e2n_map_1 = require("../lib/e2n-map");
const backfill_plan_1 = require("../lib/backfill-plan");
const unsourced_style_1 = require("../lib/unsourced-style");
const unsourced_apply_1 = require("../lib/unsourced-apply");
const asset_opacity_1 = require("../lib/asset-opacity");
const backfill_plan_apply_1 = require("../lib/backfill-plan-apply");
const REPORT_FILE = 'truth-backfill-report.json';
const TRUTH_FILE = 'figma-truth.json';
const E2N_FILE = 'e2n-map.json';
const PLAN_FILE = 'backfill-plan.json';
const PLAN_MD_FILE = 'backfill-plan.md';
const ARTIFACT_EXT_WHITELIST = new Set([
    '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif',
    '.json', '.vue', '.less', '.css', '.txt',
]);
let LiteLabService = LiteLabService_1 = class LiteLabService {
    liteService;
    tasksService;
    progressService;
    aiConfigService;
    taskCodeSnapshotService;
    logger = new common_1.Logger(LiteLabService_1.name);
    constructor(liteService, tasksService, progressService, aiConfigService, taskCodeSnapshotService) {
        this.liteService = liteService;
        this.tasksService = tasksService;
        this.progressService = progressService;
        this.aiConfigService = aiConfigService;
        this.taskCodeSnapshotService = taskCodeSnapshotService;
    }
    async resolveFigmaToken(dto, userId) {
        const fromDto = dto.config?.figmaToken;
        if (fromDto)
            return fromDto;
        try {
            const merged = await this.aiConfigService.getMergedAiConfig(userId);
            if (merged?.figmaToken)
                return merged.figmaToken;
        }
        catch (e) {
            this.logger.warn(`[lite-lab] getMergedAiConfig 失败（继续回落）: ${e?.message}`);
        }
        if (process.env.FIGMA_ACCESS_TOKEN)
            return process.env.FIGMA_ACCESS_TOKEN;
        try {
            const cfg = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(process.cwd(), 'data', 'ai-config.json'), 'utf8'));
            return cfg?.figma?.token || cfg?.figmaToken;
        }
        catch {
            return undefined;
        }
    }
    locateOutputPath(sessionId, probeFile) {
        if (!(0, fs_1.existsSync)(backend_root_1.tempComponentsDir))
            return undefined;
        for (const group of (0, fs_1.readdirSync)(backend_root_1.tempComponentsDir)) {
            const candidate = (0, path_1.join)(backend_root_1.tempComponentsDir, group, sessionId);
            if (!(0, fs_1.existsSync)(candidate))
                continue;
            if (!probeFile || (0, fs_1.existsSync)((0, path_1.join)(candidate, probeFile)))
                return candidate;
        }
        return undefined;
    }
    async parseFigmaUrlLocal(url) {
        const { parseFigmaUrl } = await import('../../ai-engine/utils/figma-url-parser.js');
        return parseFigmaUrl(url) || {};
    }
    async run(dto, userId) {
        const parsed = await this.parseFigmaUrlLocal(dto.figmaUrl);
        if (!parsed.fileKey || !parsed.nodeId) {
            throw Object.assign(new Error('Figma URL 无法解析出 fileKey/nodeId'), { status: 400 });
        }
        const componentType = dto.componentType || 'microcode';
        const groupId = dto.groupId || 'default-group';
        const typePrefix = componentType === 'microcode' ? 'mc' : 'mv';
        const sessionId = `${typePrefix}-lab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        this.tasksService.createTask(sessionId, {
            componentId: sessionId,
            componentName: dto.componentName || sessionId,
            target: componentType,
            groupId,
            taskType: 'component',
            userId,
            sourceType: 'figma',
            generationTier: 'lite',
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId,
            lab: 'truth-backfill',
        }, 'running');
        this.executeLab(sessionId, dto, parsed.fileKey, parsed.nodeId, groupId, userId).catch((e) => this.logger.error(`[lite-lab] ${sessionId} 异常结束: ${e?.message}`));
        return {
            sessionId,
            fileKey: parsed.fileKey,
            nodeId: parsed.nodeId,
            componentType,
            progressUrl: `/api/progress/${sessionId}`,
            message: 'lite-lab 两阶段实验管线已启动：Stage A lite 布局 → Stage B/C Figma 真值匹配回填',
        };
    }
    async executeLab(sessionId, dto, fileKey, nodeId, groupId, userId) {
        const componentType = dto.componentType || 'microcode';
        const outputPath = (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, sessionId);
        const cacheDir = (0, path_1.join)(outputPath, '.cache');
        const token = await this.resolveFigmaToken(dto, userId);
        try {
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'layout',
                status: 'running',
                message: 'Stage A：Lite 布局生成中（vision 分析 + LLM 单程直出）...',
            });
            const liteDto = {
                figmaUrl: dto.figmaUrl,
                componentName: dto.componentName,
                componentType,
                generationTier: 'lite',
                config: dto.config,
            };
            await this.liteService.startGeneration(sessionId, liteDto, groupId, userId, {
                sourceType: 'figma',
                componentType,
                generationTier: 'lite',
            });
            this.tasksService.updateTask(sessionId, { status: 'running', labStage: 'truth-fetch' });
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'truth-fetch',
                status: 'running',
                message: 'Stage B：拉取 Figma node 真值（颜色/字号/几何/图片）...',
            });
            if (!token)
                throw new Error('未找到 Figma token（config.figmaToken 或 data/ai-config.json）');
            const { FigmaConnector } = await import('../../ai-engine/roles/figma-connector.js');
            const connector = new FigmaConnector({ figmaToken: token });
            const nodeData = await connector.fetchNodeData(fileKey, nodeId);
            const truth = (0, truth_matcher_1.collectFigmaTruth)(nodeData);
            const assetsDir = (0, path_1.join)(cacheDir, 'resources');
            (0, fs_1.mkdirSync)(assetsDir, { recursive: true });
            let downloadedAssets = [];
            try {
                downloadedAssets = await connector.downloadAssets(fileKey, nodeData, assetsDir);
                const { buildTruthInventory } = await import('../lib/truth-inventory.js');
                const { truth: inv, feed } = buildTruthInventory(nodeData, downloadedAssets);
                truth.assets = inv.assets;
                truth.texts = inv.texts;
                truth.containers = inv.containers;
                truth.containerCount = inv.containerCount;
                this.logger.log(`[lite-lab] ${sessionId} 真值清单组装：下载 ${feed.downloaded}，对齐 ${feed.aligned}，反哺 ${feed.fed}，未匹配 ${feed.unmatched}`);
                if (feed.unmatched > 0) {
                    this.logger.warn(`[lite-lab] ${sessionId} ${feed.unmatched} 个资产未对齐到下载文件（将计入 noFile）`);
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} 资源下载失败（不影响文本回填）: ${e?.message}`);
            }
            (0, fs_1.mkdirSync)(cacheDir, { recursive: true });
            (0, fs_1.writeFileSync)((0, path_1.join)(cacheDir, TRUTH_FILE), JSON.stringify({ fileKey, nodeId, fetchedAt: new Date().toISOString(), truth }, null, 2));
            this.progressService.sendProgress(sessionId, {
                type: 'progress',
                stage: 'truth-match',
                status: 'running',
                message: 'Stage C：文本锚点匹配 + 真值回填（颜色/字号/尺寸）...',
            });
            const sfcFiles = this.collectSfcFiles((0, path_1.join)(outputPath, 'package'));
            if (sfcFiles.length === 0)
                throw new Error('lite 产物中未找到 .vue 文件，无法回填');
            const opts = {
                applyColor: dto.applyColor !== false,
                applyFontSize: dto.applyFontSize !== false,
                applySizes: dto.applySizes === true,
            };
            const result = (0, truth_matcher_1.backfillSfcFiles)(sfcFiles, truth, opts);
            const scriptBf = (0, truth_matcher_1.backfillScriptOptionTruth)(result.files, truth);
            const prodImagesDir = (0, path_1.join)(outputPath, 'resources', 'images');
            (0, fs_1.mkdirSync)(prodImagesDir, { recursive: true });
            let copiedCount = 0;
            for (const a of truth.assets) {
                if (!a.fileName)
                    continue;
                const src = (0, path_1.join)(assetsDir, a.fileName);
                if ((0, fs_1.existsSync)(src)) {
                    (0, fs_1.copyFileSync)(src, (0, path_1.join)(prodImagesDir, a.fileName));
                    copiedCount += 1;
                }
            }
            let e2n;
            let e2nBg;
            let plan;
            let planApply;
            let unsourced;
            let unsourcedFinal;
            let unsourcedApply;
            let planRecon;
            const extraChanged = new Set();
            let sfcAfterE2n = scriptBf.files;
            try {
                const e2nProdFiles = [...scriptBf.files, ...this.collectPrecompiledCss(outputPath)];
                e2n = (0, e2n_map_1.buildE2nMap)(nodeData, e2nProdFiles);
                (0, fs_1.writeFileSync)((0, path_1.join)(cacheDir, E2N_FILE), JSON.stringify({
                    sessionId,
                    fileKey,
                    nodeId,
                    builtAt: new Date().toISOString(),
                    stats: e2n.stats,
                    nodes: e2n.nodes,
                    multi: e2n.multi,
                    seeds: e2n.seeds,
                    unmapped: e2n.unmapped,
                    prodNodes: e2n.prodNodes.map((p) => ({
                        key: p.key,
                        path: p.path,
                        tag: p.tag,
                        classes: p.classes,
                        vforCount: p.vforCount,
                        renderTexts: p.renderTexts.length > 20 ? p.renderTexts.slice(0, 20) : p.renderTexts,
                        instanceTexts: p.instanceTexts,
                    })),
                }, null, 2));
                const legacyBg = (0, e2n_map_1.mountBgByE2n)(e2nProdFiles, truth.assets, e2n);
                const bgFileNames = truth.assets.map((x) => x.fileName).filter((n) => !!n && /^bg-/.test(n));
                const assetOpacity = (0, asset_opacity_1.readPngStatsMap)(assetsDir, bgFileNames);
                plan = (0, backfill_plan_1.buildBackfillPlan)({ figmaRoot: nodeData, prodFiles: e2nProdFiles, truth, e2n, assetOpacity });
                planApply = (0, backfill_plan_apply_1.applyBackfillPlan)(e2nProdFiles, plan);
                planRecon = (0, backfill_plan_apply_1.reconcileBgPlan)(plan, legacyBg.anchoredAssets);
                for (const f of planApply.files) {
                    if (f.changed)
                        (0, fs_1.writeFileSync)((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
                }
                unsourced = (0, unsourced_style_1.detectUnsourcedStyles)({
                    figmaRoot: nodeData,
                    prodFiles: planApply.files.map((f) => ({ path: f.path, content: f.content })),
                    e2n,
                });
                this.logger.log(`[lite-lab] ${sessionId} 无源样式: ${(0, unsourced_style_1.unsourcedStatsLine)(unsourced.stats)}`);
                if (unsourced.stats.unmappedRiskClasses.length > 0) {
                    this.logger.warn(`[lite-lab] ${sessionId} 闸④ 盲区 ${unsourced.stats.unmappedRiskClasses.length} 个类名无 E2N 映射` +
                        `（未检查，不代表无问题）: ${unsourced.stats.unmappedRiskClasses.slice(0, 8).join(', ')}` +
                        (unsourced.stats.unmappedRiskClasses.length > 8 ? ' …' : ''));
                }
                (0, fs_1.writeFileSync)((0, path_1.join)(cacheDir, PLAN_FILE), JSON.stringify(plan, null, 2));
                if (!planRecon.agree) {
                    this.logger.warn(`[lite-lab] ${sessionId} 计划与旧 bg 通道不一致：计划独有 ${planRecon.planOnly.length}，旧通道独有 ${planRecon.legacyOnly.length}`);
                }
                e2nBg = legacyBg;
                const planChanged = new Map(planApply.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
                if (planChanged.size > 0) {
                    const sfcPaths = new Set(scriptBf.files.map((f) => f.path));
                    for (const p of planChanged.keys())
                        if (!sfcPaths.has(p))
                            extraChanged.add(p);
                    sfcAfterE2n = scriptBf.files.map((f) => planChanged.has(f.path) ? { ...f, content: planChanged.get(f.path) } : f);
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} E2N 建图/挂载失败（非致命）: ${e?.message}`);
            }
            const e2nConsumedBgs = new Set([
                ...(e2nBg?.anchoredAssets ?? []).map((x) => x.fileName),
                ...(planApply?.consumedAssets ?? []).map((x) => x.fileName),
            ]);
            const mount = (0, truth_matcher_1.mountAssetIcons)(sfcAfterE2n, truth.assets);
            for (const f of mount.files) {
                if (f.changed) {
                    (0, fs_1.writeFileSync)((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
                }
            }
            let finalFiles = mount.files;
            let bgAi;
            try {
                const imgDir = (0, path_1.join)(outputPath, 'resources', 'images');
                const noCoreBgs = truth.assets.filter((a) => a.fileName &&
                    (0, truth_matcher_1.isBgClassAsset)(a) &&
                    !e2nConsumedBgs.has(a.fileName));
                const shotPath = (0, path_1.join)(imgDir, 'source-screenshot.png');
                if (noCoreBgs.length > 0 && (0, fs_1.existsSync)(shotPath)) {
                    bgAi = await this.runBgAiFallback(shotPath, imgDir, noCoreBgs, cacheDir, userId);
                    for (const f of bgAi.files) {
                        if (f.changed) {
                            (0, fs_1.writeFileSync)((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
                        }
                    }
                    const aiChanged = new Map(bgAi.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
                    if (aiChanged.size > 0) {
                        const inFinal = new Set(finalFiles.map((f) => f.path));
                        for (const p of aiChanged.keys())
                            if (!inFinal.has(p))
                                extraChanged.add(p);
                        finalFiles = finalFiles.map((f) => aiChanged.has(f.path) ? { ...f, content: aiChanged.get(f.path), changed: true } : f);
                    }
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} AI 背景图兜底失败（非致命）: ${e?.message}`);
                if (bgAi)
                    bgAi.stats.errors += 1;
            }
            let cf;
            try {
                const cfFiles = [...finalFiles, ...this.collectPrecompiledCss(outputPath)];
                cf = (0, truth_matcher_1.backfillContainerFill)(cfFiles, truth);
                for (const f of cf.files) {
                    if (f.changed) {
                        (0, fs_1.writeFileSync)((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
                    }
                }
                const cfChanged = new Map(cf.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
                if (cfChanged.size > 0) {
                    const inFinal = new Set(finalFiles.map((f) => f.path));
                    for (const p of cfChanged.keys())
                        if (!inFinal.has(p))
                            extraChanged.add(p);
                    finalFiles = finalFiles.map((f) => cfChanged.has(f.path) ? { ...f, content: cfChanged.get(f.path), changed: true } : f);
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} 容器 fill 回填失败（非致命）: ${e?.message}`);
            }
            let pt;
            try {
                const taskRec = this.tasksService.getTask(sessionId);
                const panelDisplayName = taskRec?.displayName || '';
                pt = (0, truth_matcher_1.relocatePanelTitle)(finalFiles, panelDisplayName);
                for (const f of pt.files) {
                    if (f.changed) {
                        (0, fs_1.writeFileSync)((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
                    }
                }
                const ptChanged = new Map(pt.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
                if (ptChanged.size > 0) {
                    finalFiles = finalFiles.map((f) => ptChanged.has(f.path) ? { ...f, content: ptChanged.get(f.path), changed: true } : f);
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} 面板标题归位失败（非致命）: ${e?.message}`);
            }
            let rc;
            try {
                const rcFiles = [...finalFiles, ...this.collectPrecompiledCss(outputPath)];
                rc = (0, truth_matcher_1.clearRootContentBackground)(rcFiles);
                for (const f of rc.files) {
                    if (f.changed)
                        (0, fs_1.writeFileSync)((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
                }
                const rcChanged = new Map(rc.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
                if (rcChanged.size > 0) {
                    const inFinal = new Set(finalFiles.map((f) => f.path));
                    for (const p of rcChanged.keys())
                        if (!inFinal.has(p))
                            extraChanged.add(p);
                    finalFiles = finalFiles.map((f) => rcChanged.has(f.path) ? { ...f, content: rcChanged.get(f.path), changed: true } : f);
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} 根内容容器背景清除失败（非致命）: ${e?.message}`);
            }
            try {
                const uaFiles = [...finalFiles, ...this.collectPrecompiledCss(outputPath)];
                const detectForApply = (0, unsourced_style_1.detectUnsourcedStyles)({
                    figmaRoot: nodeData,
                    prodFiles: uaFiles.map((f) => ({ path: f.path, content: f.content })),
                    e2n,
                });
                unsourcedFinal = detectForApply;
                const ua = (0, unsourced_apply_1.applyUnsourcedStyles)({
                    findings: detectForApply.findings,
                    prodFiles: uaFiles,
                });
                for (const f of ua.files) {
                    if (f.changed)
                        (0, fs_1.writeFileSync)((0, path_1.join)(outputPath, f.path), f.content, 'utf8');
                }
                const uaChanged = new Map(ua.files.filter((f) => f.changed).map((f) => [f.path, f.content]));
                if (uaChanged.size > 0) {
                    const inFinal = new Set(finalFiles.map((f) => f.path));
                    for (const p of uaChanged.keys())
                        if (!inFinal.has(p))
                            extraChanged.add(p);
                    finalFiles = finalFiles.map((f) => uaChanged.has(f.path) ? { ...f, content: uaChanged.get(f.path), changed: true } : f);
                }
                this.logger.log(`[lite-lab] ${sessionId} 闸③ 落地: ${(0, unsourced_apply_1.unsourcedApplyStatsLine)(ua.stats)}`);
                const after = (0, unsourced_style_1.detectUnsourcedStyles)({
                    figmaRoot: nodeData,
                    prodFiles: [...finalFiles, ...this.collectPrecompiledCss(outputPath)].map((f) => ({
                        path: f.path,
                        content: f.content,
                    })),
                    e2n,
                });
                const remainingAuto = (0, unsourced_style_1.countAutoApplicable)(after.findings);
                unsourcedApply = { stats: ua.stats, applied: ua.applied, skipped: ua.skipped, remainingAuto };
                if (remainingAuto > 0) {
                    this.logger.warn(`[lite-lab] ${sessionId} 闸③ 收敛断言失败：落地后仍有 ${remainingAuto} 条可落地项` +
                        `（检测与落地口径不一致，需排查）`);
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} 闸③ 落地失败（非致命）: ${e?.message}`);
            }
            try {
                const planMd = plan ? (0, backfill_plan_1.renderPlanMarkdown)(plan) : '';
                const us = unsourcedFinal ?? unsourced;
                const usMd = us ? (0, unsourced_style_1.renderUnsourcedMarkdown)(us.findings, us.stats) : '';
                const uaMd = unsourcedApply
                    ? (0, unsourced_apply_1.renderUnsourcedAppliedMarkdown)(unsourcedApply.stats, unsourcedApply.applied, unsourcedApply.skipped)
                    : '';
                (0, fs_1.writeFileSync)((0, path_1.join)(cacheDir, PLAN_MD_FILE), `${planMd}\n${usMd}${uaMd}`, 'utf8');
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} 计划报告写入失败（非致命）: ${e?.message}`);
            }
            if (unsourcedFinal)
                unsourced = unsourcedFinal;
            const changedCount = finalFiles.filter((f) => f.changed).length;
            const syncedTargets = changedCount > 0 || extraChanged.size > 0
                ? this.syncBackfillToWorkspace(outputPath, sessionId, groupId, componentType)
                : [];
            const s = result.stats;
            const m = mount.stats;
            const sb = scriptBf.stats;
            let snapshotSynced = 0;
            try {
                const relPaths = new Set(finalFiles.filter((f) => f.changed).map((f) => f.path));
                for (const p of extraChanged)
                    relPaths.add(p);
                const imgDir = (0, path_1.join)(outputPath, 'resources', 'images');
                if ((0, fs_1.existsSync)(imgDir)) {
                    for (const name of (0, fs_1.readdirSync)(imgDir)) {
                        if (name.startsWith('.'))
                            continue;
                        if ((0, fs_1.existsSync)((0, path_1.join)(imgDir, name)))
                            relPaths.add(`resources/images/${name}`);
                    }
                }
                const revisions = new Set();
                for (const mf of [
                    this.taskCodeSnapshotService.getCandidateManifest(sessionId),
                    this.taskCodeSnapshotService.getLastGoodManifest(sessionId),
                    this.taskCodeSnapshotService.getLatestManifest(sessionId),
                ]) {
                    if (mf?.revision)
                        revisions.add(mf.revision);
                }
                for (const rev of revisions) {
                    try {
                        const refreshed = this.taskCodeSnapshotService.refreshRevisionFilesFromDisk(sessionId, rev, outputPath, [...relPaths]);
                        snapshotSynced += refreshed.length;
                    }
                    catch (e) {
                        this.logger.warn(`[lite-lab] ${sessionId} 快照刷新失败（非致命）rev=${rev}: ${e?.message}`);
                    }
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} 快照同源化失败（非致命）: ${e?.message}`);
            }
            console.log(`snapshotSync: refreshedFiles=${snapshotSynced}`);
            console.log(`truthBackfill: evaluated=${s.evaluated},exact=${s.exact},substr=${s.substr},miss=${s.miss},` +
                `interpSkipped=${s.interpSkipped},shortSkipped=${s.shortSkipped},` +
                `colorApplied=${s.colorApplied},fontSizeApplied=${s.fontSizeApplied},sizeApplied=${s.sizeApplied},` +
                `scriptAxis=${sb.xAxisBackfilled}/${sb.yAxisBackfilled},markLine=${sb.markLineBackfilled},` +
                `scriptColor=${sb.scriptColorApplied},scriptFontSize=${sb.scriptFontSizeApplied},scriptSkipped=${sb.scriptSkipped},` +
                `assets=${truth.assets.length},assetsCopied=${copiedCount},` +
                `assetMounted=${m.mounted},assetNoAnchor=${m.noAnchor},assetNoSiblingTexts=${m.noSiblingTexts},assetNoFile=${m.noFile},` +
                `svgReplaced=${m.svgReplaced},dataUriReplaced=${m.dataUriReplaced},iconClassReplaced=${m.iconClassReplaced},` +
                `emptyVars=${m.emptyIconVarsReplaced},emptyFields=${m.emptyIconFieldsReplaced},` +
                `emptyObjProps=${m.emptyObjPropsReplaced},newEl=${m.newElementInserted},` +
                `newElSkipNoAnchor=${m.newElSkipNoAnchor},newElSkipAmbiguous=${m.newElSkipAmbiguous},` +
                `svgSkipped=${m.svgSkipped},` +
                `bgAnchored=${m.bgAnchored},bgSkipNoClass=${m.bgSkipNoClass},bgSkipAmbiguous=${m.bgSkipAmbiguous},bgSkipNoBgKey=${m.bgSkipNoBgKey},` +
                `bgSkipAlreadyUrl=${m.bgSkipAlreadyUrl},` +
                `rootBgPanels=${rc?.stats.panels ?? 0},rootBgClasses=${rc?.stats.rootClasses ?? 0},rootBgCleared=${rc?.stats.cleared ?? 0},` +
                `rootBgSkipAlreadyTransparent=${rc?.stats.skipAlreadyTransparent ?? 0},rootBgSkipNoBackground=${rc?.stats.skipNoBackground ?? 0},` +
                `rootBgSkipNoRootClass=${rc?.stats.skipNoRootClass ?? 0},` +
                `bgAiCalled=${bgAi?.stats.candidates ?? 0},bgAiAnchored=${bgAi?.stats.anchored ?? 0},` +
                `bgAiStructCand=${bgAi?.stats.structCandidates ?? 0},bgAiStructOverrides=${bgAi?.stats.structOverrides ?? 0},` +
                `bgAiSkipNoLabelHit=${bgAi?.stats.skipNoLabelHit ?? 0},bgAiSkipNoClass=${bgAi?.stats.skipNoClass ?? 0},` +
                `bgAiSkipClassAmbiguous=${bgAi?.stats.skipClassAmbiguous ?? 0},bgAiSkipNoRule=${bgAi?.stats.skipNoRule ?? 0},` +
                `bgAiSkipRuleAmbiguous=${bgAi?.stats.skipRuleAmbiguous ?? 0},bgAiSkipNoBgKey=${bgAi?.stats.skipNoBgKey ?? 0},` +
                `bgAiSkipAlreadyUrl=${bgAi?.stats.skipAlreadyUrl ?? 0},bgAiErrors=${bgAi?.stats.errors ?? 0},bgAiTokens=${bgAi?.stats.totalTokens ?? 0},` +
                `cfWrapTransparent=${cf?.stats.wrapTransparentized ?? 0},cfWrapColorFixed=${cf?.stats.wrapColorFixed ?? 0},` +
                `cfContainerColorFixed=${cf?.stats.containerColorFixed ?? 0},cfSkipNoRule=${cf?.stats.skipNoRule ?? 0},` +
                `cfSkipAmbiguous=${cf?.stats.skipAmbiguous ?? 0},cfSkipUrlOrGradient=${cf?.stats.skipUrlOrGradient ?? 0},` +
                `cfSkipSameColor=${cf?.stats.skipSameColor ?? 0},` +
                `ptPanels=${pt?.stats.panels ?? 0},ptRelocated=${pt?.stats.titleRelocated ?? 0},ptSkipNoTitle=${pt?.stats.skipNoTitle ?? 0},` +
                `e2nProdNodes=${e2n?.stats.prodNodes ?? 0},e2nFigmaTexts=${e2n?.stats.figmaTexts ?? 0},` +
                `e2nSeeds=${e2n?.stats.seeds ?? 0},e2nPartialSeeds=${e2n?.stats.partialSeeds ?? 0},` +
                `e2nAmbiguousSeeds=${e2n?.stats.ambiguousSeeds ?? 0},e2nMissSeeds=${e2n?.stats.missSeeds ?? 0},` +
                `e2nNodes=${e2n?.stats.nodes ?? 0},e2nMulti=${e2n?.stats.multi ?? 0},e2nFigmaContainers=${e2n?.stats.figmaContainers ?? 0},` +
                `e2nBgCand=${e2nBg?.stats.candidates ?? 0},e2nBgAnchored=${e2nBg?.stats.anchored ?? 0},` +
                `e2nBgInserted=${e2nBg?.stats.inserted ?? 0},e2nBgMergedColor=${e2nBg?.stats.mergedColor ?? 0},` +
                `e2nBgReplacedGradient=${e2nBg?.stats.replacedGradient ?? 0},e2nBgReplacedColor=${e2nBg?.stats.replacedColor ?? 0},` +
                `e2nBgSkipNoEdge=${e2nBg?.stats.skipNoEdge ?? 0},e2nBgSkipNoClass=${e2nBg?.stats.skipNoClass ?? 0},` +
                `e2nBgSkipNoRule=${e2nBg?.stats.skipNoRule ?? 0},e2nBgSkipMultiClass=${e2nBg?.stats.skipMultiClass ?? 0},` +
                `e2nBgSkipRuleAmbiguous=${e2nBg?.stats.skipRuleAmbiguous ?? 0},e2nBgSkipAlreadyUrl=${e2nBg?.stats.skipAlreadyUrl ?? 0},` +
                `planEntries=${plan?.stats.entries ?? 0},planApply=${plan?.stats.apply ?? 0},planSatisfied=${plan?.stats.satisfied ?? 0},` +
                `planConflicts=${plan?.stats.conflicts ?? 0},planGaps=${plan?.gaps.length ?? 0},` +
                `planBgInserted=${planApply?.stats.bgInserted ?? 0},planBgReplacedGradient=${planApply?.stats.bgReplacedGradient ?? 0},` +
                `planBgReplacedColor=${planApply?.stats.bgReplacedColor ?? 0},planBgCleanup=${planApply?.stats.bgReplacedUrl ?? 0},` +
                `planFillApplied=${planApply?.stats.fillApplied ?? 0},planTextApplied=${planApply?.stats.textApplied ?? 0},planRuleEdits=${planApply?.stats.ruleEdits ?? 0},` +
                `planNoop=${planApply?.stats.noop ?? 0},planStale=${planApply?.stats.stale ?? 0},` +
                `planReconBoth=${planRecon?.both.length ?? 0},planReconPlanOnly=${planRecon?.planOnly.length ?? 0},` +
                `planReconLegacyOnly=${planRecon?.legacyOnly.length ?? 0},` +
                `sizeRestored=${m.sizeRestored},containerSizeFixed=${m.containerSizeFixed},` +
                `parentBoxRelaxed=${m.parentBoxRelaxed},` +
                `snapshotSynced=${snapshotSynced},` +
                `extraFilesChanged=${extraChanged.size},` +
                `filesChanged=${changedCount}`);
            const report = {
                status: 'done',
                sessionId,
                fileKey,
                nodeId,
                stats: {
                    ...s,
                    assets: truth.assets.length,
                    containers: truth.containerCount,
                    assetsCopied: copiedCount,
                    assetMounted: m.mounted,
                    assetNoAnchor: m.noAnchor,
                    assetNoSiblingTexts: m.noSiblingTexts,
                    assetNoFile: m.noFile,
                    svgReplaced: m.svgReplaced,
                    dataUriReplaced: m.dataUriReplaced,
                    iconClassReplaced: m.iconClassReplaced,
                    emptyIconVarsReplaced: m.emptyIconVarsReplaced,
                    emptyIconFieldsReplaced: m.emptyIconFieldsReplaced,
                    emptyObjPropsReplaced: m.emptyObjPropsReplaced,
                    newElementInserted: m.newElementInserted,
                    newElSkipNoAnchor: m.newElSkipNoAnchor,
                    newElSkipAmbiguous: m.newElSkipAmbiguous,
                    svgSkipped: m.svgSkipped,
                    bgAnchored: m.bgAnchored,
                    bgSkipNoClass: m.bgSkipNoClass,
                    bgSkipAmbiguous: m.bgSkipAmbiguous,
                    bgSkipNoBgKey: m.bgSkipNoBgKey,
                    bgSkipAlreadyUrl: m.bgSkipAlreadyUrl,
                    rootBgPanels: rc?.stats.panels ?? 0,
                    rootBgClasses: rc?.stats.rootClasses ?? 0,
                    rootBgCleared: rc?.stats.cleared ?? 0,
                    rootBgSkipAlreadyTransparent: rc?.stats.skipAlreadyTransparent ?? 0,
                    rootBgSkipNoBackground: rc?.stats.skipNoBackground ?? 0,
                    rootBgSkipNoRootClass: rc?.stats.skipNoRootClass ?? 0,
                    bgAiCalled: bgAi?.stats.candidates ?? 0,
                    bgAiAnchored: bgAi?.stats.anchored ?? 0,
                    bgAiStructCand: bgAi?.stats.structCandidates ?? 0,
                    bgAiStructOverrides: bgAi?.stats.structOverrides ?? 0,
                    bgAiSkipNoLabelHit: bgAi?.stats.skipNoLabelHit ?? 0,
                    bgAiSkipNoClass: bgAi?.stats.skipNoClass ?? 0,
                    bgAiSkipClassAmbiguous: bgAi?.stats.skipClassAmbiguous ?? 0,
                    bgAiSkipNoRule: bgAi?.stats.skipNoRule ?? 0,
                    bgAiSkipRuleAmbiguous: bgAi?.stats.skipRuleAmbiguous ?? 0,
                    bgAiSkipNoBgKey: bgAi?.stats.skipNoBgKey ?? 0,
                    bgAiSkipAlreadyUrl: bgAi?.stats.skipAlreadyUrl ?? 0,
                    bgAiErrors: bgAi?.stats.errors ?? 0,
                    bgAiTokens: bgAi?.stats.totalTokens ?? 0,
                    cfWrapTransparent: cf?.stats.wrapTransparentized ?? 0,
                    cfWrapColorFixed: cf?.stats.wrapColorFixed ?? 0,
                    cfContainerColorFixed: cf?.stats.containerColorFixed ?? 0,
                    cfSkipNoRule: cf?.stats.skipNoRule ?? 0,
                    cfSkipAmbiguous: cf?.stats.skipAmbiguous ?? 0,
                    cfSkipUrlOrGradient: cf?.stats.skipUrlOrGradient ?? 0,
                    cfSkipSameColor: cf?.stats.skipSameColor ?? 0,
                    ptPanels: pt?.stats.panels ?? 0,
                    ptRelocated: pt?.stats.titleRelocated ?? 0,
                    ptSkipNoTitle: pt?.stats.skipNoTitle ?? 0,
                    e2nProdNodes: e2n?.stats.prodNodes ?? 0,
                    e2nFigmaTexts: e2n?.stats.figmaTexts ?? 0,
                    e2nSeeds: e2n?.stats.seeds ?? 0,
                    e2nPartialSeeds: e2n?.stats.partialSeeds ?? 0,
                    e2nAmbiguousSeeds: e2n?.stats.ambiguousSeeds ?? 0,
                    e2nMissSeeds: e2n?.stats.missSeeds ?? 0,
                    e2nNodes: e2n?.stats.nodes ?? 0,
                    e2nMulti: e2n?.stats.multi ?? 0,
                    e2nFigmaContainers: e2n?.stats.figmaContainers ?? 0,
                    e2nBgCand: e2nBg?.stats.candidates ?? 0,
                    e2nBgAnchored: e2nBg?.stats.anchored ?? 0,
                    e2nBgInserted: e2nBg?.stats.inserted ?? 0,
                    e2nBgMergedColor: e2nBg?.stats.mergedColor ?? 0,
                    e2nBgReplacedGradient: e2nBg?.stats.replacedGradient ?? 0,
                    e2nBgReplacedColor: e2nBg?.stats.replacedColor ?? 0,
                    e2nBgSkipNoEdge: e2nBg?.stats.skipNoEdge ?? 0,
                    e2nBgSkipNoClass: e2nBg?.stats.skipNoClass ?? 0,
                    e2nBgSkipNoRule: e2nBg?.stats.skipNoRule ?? 0,
                    e2nBgSkipMultiClass: e2nBg?.stats.skipMultiClass ?? 0,
                    e2nBgSkipRuleAmbiguous: e2nBg?.stats.skipRuleAmbiguous ?? 0,
                    e2nBgSkipAlreadyUrl: e2nBg?.stats.skipAlreadyUrl ?? 0,
                    planEntries: plan?.stats.entries ?? 0,
                    planApply: plan?.stats.apply ?? 0,
                    planSatisfied: plan?.stats.satisfied ?? 0,
                    planConflicts: plan?.stats.conflicts ?? 0,
                    planGaps: plan?.gaps.length ?? 0,
                    planBgInserted: planApply?.stats.bgInserted ?? 0,
                    planBgReplacedGradient: planApply?.stats.bgReplacedGradient ?? 0,
                    planBgReplacedColor: planApply?.stats.bgReplacedColor ?? 0,
                    planBgCleanup: planApply?.stats.bgReplacedUrl ?? 0, planBgLayered: planApply?.stats.bgLayered ?? 0,
                    planFillApplied: planApply?.stats.fillApplied ?? 0,
                    planTextApplied: planApply?.stats.textApplied ?? 0,
                    planRuleEdits: planApply?.stats.ruleEdits ?? 0, planNoop: planApply?.stats.noop ?? 0,
                    planStale: planApply?.stats.stale ?? 0,
                    planReconBoth: planRecon?.both.length ?? 0,
                    planReconPlanOnly: planRecon?.planOnly.length ?? 0,
                    planReconLegacyOnly: planRecon?.legacyOnly.length ?? 0,
                    planReconAgree: planRecon?.agree ? 1 : 0,
                    unsourcedScanned: unsourced?.stats.classesScanned ?? 0,
                    unsourcedFindings: unsourced?.stats.findings ?? 0,
                    unsourcedDelete: unsourced?.stats.delete ?? 0,
                    unsourcedOverride: unsourced?.stats.override ?? 0,
                    unsourcedFanout: unsourced?.stats.fanout ?? 0,
                    unsourcedUnmapped: unsourced?.stats.unmappedRiskClasses.length ?? 0,
                    unsourcedApplied: unsourcedApply?.stats.applied ?? 0,
                    unsourcedAppliedDelete: unsourcedApply?.stats.delete ?? 0,
                    unsourcedAppliedOverride: unsourcedApply?.stats.override ?? 0,
                    unsourcedApplyReportOnly: unsourcedApply?.stats.reportOnly ?? 0,
                    unsourcedApplySkipped: unsourcedApply?.stats.skipped ?? 0,
                    unsourcedApplyStale: unsourcedApply?.stats.byReason['stale-offset'] ?? 0,
                    unsourcedApplyRules: unsourcedApply?.stats.rulesRewritten ?? 0,
                    unsourcedRemainingAuto: unsourcedApply?.remainingAuto ?? 0,
                    sizeRestored: m.sizeRestored,
                    containerSizeFixed: m.containerSizeFixed,
                    parentBoxRelaxed: m.parentBoxRelaxed,
                    snapshotSynced,
                    extraFilesChanged: extraChanged.size,
                    xAxisBackfilled: sb.xAxisBackfilled,
                    yAxisBackfilled: sb.yAxisBackfilled,
                    markLineBackfilled: sb.markLineBackfilled,
                    scriptColorApplied: sb.scriptColorApplied,
                    scriptFontSizeApplied: sb.scriptFontSizeApplied,
                    scriptSkipped: sb.scriptSkipped,
                },
                assets: truth.assets.map((a) => ({ nodeId: a.nodeId, name: a.name, fileName: a.fileName })),
                ...(unsourced
                    ? {
                        unsourced: {
                            stats: unsourced.stats,
                            findings: unsourced.findings.map((f) => ({
                                cls: f.cls,
                                prop: f.prop,
                                value: f.value,
                                verdict: f.verdict,
                                figmaId: f.figmaId,
                                evidence: f.evidence,
                            })),
                        },
                    }
                    : {}),
                ...(unsourcedApply
                    ? {
                        unsourcedApplied: {
                            stats: unsourcedApply.stats,
                            remainingAuto: unsourcedApply.remainingAuto,
                            applied: unsourcedApply.applied.map((a) => ({
                                file: a.file,
                                cls: a.cls,
                                rawProp: a.rawProp,
                                kind: a.kind,
                                from: a.from,
                                to: a.to,
                                figmaId: a.figmaId,
                            })),
                            skipped: unsourcedApply.skipped.map((s) => ({
                                cls: s.cls,
                                rawProp: s.rawProp,
                                verdict: s.verdict,
                                reason: s.reason,
                            })),
                        },
                    }
                    : {}),
                ...(plan
                    ? {
                        plan: {
                            entries: plan.stats.entries,
                            apply: plan.stats.apply,
                            satisfied: plan.stats.satisfied,
                            conflicts: plan.stats.conflicts,
                            gaps: plan.gaps.length,
                            byKind: plan.stats.byKind,
                            applyStats: planApply?.stats ?? {
                                entries: 0,
                                appliedEntries: 0,
                                ruleEdits: 0,
                                bgInserted: 0,
                                bgReplacedGradient: 0,
                                bgReplacedColor: 0,
                                bgReplacedUrl: 0,
                                bgLayered: 0,
                                fillApplied: 0,
                                textApplied: 0,
                                noop: 0,
                                stale: 0,
                            },
                            reconcile: {
                                both: planRecon?.both.length ?? 0,
                                planOnly: planRecon?.planOnly ?? [],
                                legacyOnly: planRecon?.legacyOnly ?? [],
                                agree: planRecon?.agree ?? false,
                            },
                        },
                    }
                    : {}),
                files: finalFiles.map((f) => ({
                    path: f.path,
                    changed: f.changed,
                    editCount: f.edits.length,
                })),
                workspaceSynced: syncedTargets.length > 0,
                outputPath,
                finishedAt: new Date().toISOString(),
            };
            (0, fs_1.writeFileSync)((0, path_1.join)(cacheDir, REPORT_FILE), JSON.stringify({ ...report, edits: finalFiles }, null, 2));
            this.tasksService.updateTask(sessionId, {
                status: 'completed',
                labStage: 'done',
                labReportPath: (0, path_1.join)(cacheDir, REPORT_FILE),
                visualDegraded: false,
            });
            await this.progressService.sendComplete(sessionId, {
                success: true,
                lab: true,
                report,
                message: `lite-lab 完成：匹配 ${s.exact + s.substr}/${s.evaluated}，回填颜色 ${s.colorApplied}、字号 ${s.fontSizeApplied}、尺寸 ${s.sizeApplied}，资源挂载 ${m.mounted}/${m.uniqueImageRefs}`,
            });
        }
        catch (e) {
            this.logger.error(`[lite-lab] ${sessionId} 失败: ${e?.message}`);
            try {
                (0, fs_1.mkdirSync)(cacheDir, { recursive: true });
                (0, fs_1.writeFileSync)((0, path_1.join)(cacheDir, REPORT_FILE), JSON.stringify({ status: 'error', sessionId, error: e?.message, finishedAt: new Date().toISOString() }, null, 2));
            }
            catch {
            }
            const task = this.tasksService.getTask(sessionId);
            if (task?.status !== 'failed' && task?.status !== 'cancelled') {
                await this.progressService.sendError(sessionId, {
                    code: 'LAB_FAILED',
                    message: `lite-lab 失败：${e?.message || e}`,
                });
            }
        }
    }
    syncBackfillToWorkspace(outputPath, sessionId, groupId, componentType) {
        const isMicrocode = componentType === 'microcode';
        const targets = isMicrocode
            ? [(0, path_1.join)(backend_root_1.customComponentsDir, sessionId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', sessionId)]
            : [
                (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, sessionId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, sessionId),
            ];
        if (isMicrocode) {
            try {
                const declare = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(outputPath, 'declare.json'), 'utf8'));
                if (declare?.componentId && declare.componentId !== sessionId) {
                    targets.push((0, path_1.join)(backend_root_1.customComponentsDir, declare.componentId));
                    targets.push((0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', declare.componentId));
                }
            }
            catch {
            }
        }
        const synced = [];
        for (const targetPath of targets) {
            try {
                const pkgSrc = (0, path_1.join)(outputPath, 'package');
                if ((0, fs_1.existsSync)(pkgSrc)) {
                    (0, fs_1.cpSync)(pkgSrc, (0, path_1.join)(targetPath, 'package'), { recursive: true, force: true });
                    synced.push((0, path_1.join)(targetPath, 'package'));
                }
                const resSrc = (0, path_1.join)(outputPath, 'resources');
                if ((0, fs_1.existsSync)(resSrc)) {
                    (0, fs_1.cpSync)(resSrc, (0, path_1.join)(targetPath, 'resources'), { recursive: true, force: true });
                }
            }
            catch (e) {
                this.logger.warn(`[lite-lab] ${sessionId} workspace 同步失败 ${targetPath}: ${e?.message}`);
            }
        }
        return synced;
    }
    async runBgAiFallback(shotPath, imgDir, assets, cacheDir, userId) {
        const { resolveVisionConfig } = await import('../../ai-engine/utils/ai-defaults.js');
        const cfg = resolveVisionConfig(await this.aiConfigService.getMergedAiConfig(userId));
        const emptyStats = () => ({
            candidates: assets.length, anchored: 0, skipNoLabelHit: 0, skipNoClass: 0,
            skipClassAmbiguous: 0, skipNoRule: 0, skipRuleAmbiguous: 0, skipNoBgKey: 0,
            skipAlreadyUrl: 0, errors: 0, totalTokens: 0,
        });
        const fileNames = assets.map((a) => a.fileName).filter((n) => !!n);
        const structCand = new Map();
        for (const a of assets) {
            const name = a.fileName;
            if (!name)
                continue;
            const src = a.parentTexts && a.parentTexts.length > 0 ? a.parentTexts : a.siblingTexts ?? [];
            const words = src.map((t) => String(t).trim()).filter((t) => t.length >= 2);
            if (words.length > 0)
                structCand.set(name, words.join(' '));
        }
        let overrides = 0;
        const anchor = (cands, tokens, errors = 0) => {
            const r = (0, truth_matcher_1.aiAnchorBackgroundAssets)(this.collectSfcFiles((0, path_1.join)((0, path_1.dirname)(shotPath), '..', '..', 'package')).concat(...this.collectPrecompiledCss((0, path_1.join)((0, path_1.dirname)(shotPath), '..', '..'))), cands);
            r.stats.totalTokens = tokens;
            r.stats.structCandidates = structCand.size;
            r.stats.structOverrides = overrides;
            r.stats.errors += errors;
            return r;
        };
        if (!cfg?.apiKey) {
            if (structCand.size === 0) {
                this.logger.warn('[lite-lab] 背景图兜底：未配置 vision 模型且无结构锚点，跳过');
                return { files: [], stats: { ...emptyStats(), errors: 1 } };
            }
            this.logger.log(`[lite-lab] 背景图兜底：未配置 vision，改走结构锚定 ${structCand.size} 条`);
            return anchor([...structCand].map(([fileName, label]) => ({ fileName, label })), 0);
        }
        const compositePath = await this.buildBgAiComposite(shotPath, imgDir, fileNames);
        const { VisionAgent } = await import('../../ai-engine/agents/vision-agent.js');
        const agent = new VisionAgent(cfg);
        let tokens = 0;
        try {
            agent.onTokenUsage = (u) => { tokens += u?.totalTokens || 0; };
        }
        catch { }
        const prompt = '这是一张 UI 设计稿截图（左侧主体）。右侧竖排是若干带红框标注的背景图资产，红框下方标注了文件名。\n' +
            '请判断截图中哪个容器区域使用了每张背景图（整块铺满的纹理/渐变/图片背景），并输出该容器区域内或紧邻的可见文字。\n' +
            `严格输出 JSON，格式：{"文件名": "可见文字或null", ...}，不要输出任何其他内容。`;
        let content = '';
        try {
            content = await agent.analyzeImage(compositePath, prompt, {});
        }
        catch (e) {
            this.logger.warn(`[lite-lab] 背景图兜底 vision 调用失败: ${e?.message}`);
            if (structCand.size > 0) {
                return anchor([...structCand].map(([fileName, label]) => ({ fileName, label })), tokens, 1);
            }
            return { files: [], stats: { ...emptyStats(), errors: 1, totalTokens: tokens } };
        }
        const usageTokens = tokens > 0 ? tokens : Number(agent?._lastTotalTokens || 0);
        const jsonM = /\{[\s\S]*\}/.exec(String(content || ''));
        let parsed = {};
        if (!jsonM) {
            this.logger.warn('[lite-lab] 背景图兜底：vision 输出无法解析出 JSON');
            if (structCand.size === 0) {
                return { files: [], stats: { ...emptyStats(), errors: 1, totalTokens: usageTokens } };
            }
        }
        else {
            try {
                parsed = JSON.parse(jsonM[0]);
            }
            catch {
                this.logger.warn('[lite-lab] 背景图兜底：vision JSON 解析失败');
                if (structCand.size === 0) {
                    return { files: [], stats: { ...emptyStats(), errors: 1, totalTokens: usageTokens } };
                }
            }
        }
        const candidates = [];
        for (const name of fileNames) {
            const label = typeof parsed[name] === 'string' ? parsed[name].trim() : '';
            const st = structCand.get(name);
            if (st) {
                if (label)
                    overrides += 1;
                candidates.push({ fileName: name, label: st });
            }
            else if (label) {
                candidates.push({ fileName: name, label });
            }
        }
        try {
            (0, fs_1.mkdirSync)(cacheDir, { recursive: true });
            (0, fs_1.writeFileSync)((0, path_1.join)(cacheDir, 'bg-ai-response.json'), JSON.stringify({
                at: new Date().toISOString(),
                fileNames,
                struct: Object.fromEntries(structCand),
                raw: parsed,
                candidates,
                structOverrides: overrides,
            }, null, 2), 'utf8');
            if (candidates.length > 0) {
                this.logger.log(`[lite-lab] 背景图兜底候选: ${candidates.map((c) => `${c.fileName}→「${c.label}」`).join(', ')}`);
            }
        }
        catch { }
        return anchor(candidates, usageTokens, jsonM ? 0 : 1);
    }
    async buildBgAiComposite(shotPath, imgDir, fileNames) {
        const sharp = (await import('sharp')).default;
        const shotBuf = await sharp(shotPath)
            .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
        const meta = await sharp(shotBuf).metadata();
        const W = meta.width ?? 1400;
        const H = meta.height ?? 900;
        const laneW = 260;
        const comps = [
            { input: shotBuf, left: 0, top: 0 },
        ];
        const present = fileNames.filter((n) => (0, fs_1.existsSync)((0, path_1.join)(imgDir, n)));
        const slotH = present.length > 0 ? Math.floor((H - 40) / present.length) : H;
        const marks = [];
        let y = 14;
        for (const name of fileNames) {
            const p = (0, path_1.join)(imgDir, name);
            if (!(0, fs_1.existsSync)(p))
                continue;
            const maxH = Math.max(24, slotH - 46);
            const assetBuf = await sharp(p)
                .resize(laneW - 60, maxH, { fit: 'inside' })
                .png()
                .toBuffer();
            const am = await sharp(assetBuf).metadata();
            const aw = am.width ?? 100;
            const ah = am.height ?? 40;
            const ax = W + 24;
            marks.push(`<rect x="${ax - 4}" y="${y - 4}" width="${aw + 8}" height="${ah + 8}" fill="none" stroke="#ff3333" stroke-width="3"/>`, `<text x="${ax}" y="${y + ah + 22}" font-size="18" fill="#ffffff" font-family="monospace">${name.replace(/[<>&]/g, '')}</text>`);
            comps.push({ input: assetBuf, left: ax, top: y });
            y += slotH;
        }
        const svg = Buffer.from(`<svg width="${W + laneW}" height="${H}" xmlns="http://www.w3.org/2000/svg">${marks.join('')}</svg>`);
        comps.push({ input: svg, left: 0, top: 0 });
        const out = (0, path_1.join)(imgDir, '.bg-ai-composite.png');
        await sharp({ create: { width: W + laneW, height: H, channels: 3, background: { r: 24, g: 24, b: 24 } } })
            .composite(comps)
            .png()
            .toFile(out);
        return out;
    }
    collectSfcFiles(packageDir) {
        const out = [];
        if (!(0, fs_1.existsSync)(packageDir))
            return out;
        for (const name of (0, fs_1.readdirSync)(packageDir)) {
            const full = (0, path_1.join)(packageDir, name);
            if (name.endsWith('.vue')) {
                out.push({ path: `package/${name}`, content: (0, fs_1.readFileSync)(full, 'utf8') });
            }
            else if (name === 'components') {
                const compDir = (0, path_1.join)(packageDir, 'components');
                for (const c of (0, fs_1.readdirSync)(compDir)) {
                    if (c.endsWith('.vue')) {
                        out.push({
                            path: `package/components/${c}`,
                            content: (0, fs_1.readFileSync)((0, path_1.join)(compDir, c), 'utf8'),
                        });
                    }
                }
            }
        }
        return out;
    }
    collectPrecompiledCss(outputDir) {
        const out = [];
        const walk = (relDir) => {
            const absDir = (0, path_1.join)(outputDir, relDir);
            if (!(0, fs_1.existsSync)(absDir))
                return;
            for (const ent of (0, fs_1.readdirSync)(absDir, { withFileTypes: true })) {
                const rel = `${relDir}/${ent.name}`;
                if (ent.isDirectory()) {
                    walk(rel);
                    continue;
                }
                if (!/\.(css|less)$/i.test(ent.name))
                    continue;
                out.push({ path: rel, content: (0, fs_1.readFileSync)((0, path_1.join)(outputDir, rel), 'utf8') });
            }
        };
        walk('resources/styles');
        return out;
    }
    assertLabAccess(sessionId, userId) {
        const task = this.tasksService.getTask(sessionId);
        const owner = typeof task?.userId === 'string' ? task.userId.trim() : '';
        if (!owner)
            return;
        if (owner !== (userId ?? '').trim()) {
            this.logger.warn(`[lite-lab][owner] 拒绝访问 sessionId=${sessionId}：归属不一致（caller=${userId ?? 'anonymous'}）`);
            throw Object.assign(new Error(`任务 ${sessionId} 不存在`), { status: 404 });
        }
    }
    getReport(sessionId, userId) {
        this.assertLabAccess(sessionId, userId);
        const outputPath = this.locateOutputPath(sessionId, (0, path_1.join)('.cache', REPORT_FILE));
        const reportPath = outputPath ? (0, path_1.join)(outputPath, '.cache', REPORT_FILE) : undefined;
        if (!reportPath || !(0, fs_1.existsSync)(reportPath)) {
            this.logger.warn(`[lite-lab] report 未找到: sessionId=${sessionId}, outputPath=${outputPath ?? 'NOT_LOCATED'}, reportExists=${reportPath ? (0, fs_1.existsSync)(reportPath) : 'n/a'}`);
            throw Object.assign(new Error(`任务 ${sessionId} 暂无 lab 报告`), { status: 404 });
        }
        return JSON.parse((0, fs_1.readFileSync)(reportPath, 'utf8'));
    }
    getArtifact(sessionId, relPath, userId) {
        this.assertLabAccess(sessionId, userId);
        const outputPath = this.locateOutputPath(sessionId, relPath);
        if (!outputPath)
            throw Object.assign(new Error(`任务 ${sessionId} 产物目录不存在`), { status: 404 });
        const base = (0, path_1.normalize)(outputPath);
        const full = (0, path_1.normalize)((0, path_1.join)(outputPath, relPath));
        if (!full.startsWith(base + path_1.sep)) {
            throw Object.assign(new Error('非法路径'), { status: 400 });
        }
        const ext = relPath.slice(relPath.lastIndexOf('.')).toLowerCase();
        if (!ARTIFACT_EXT_WHITELIST.has(ext)) {
            throw Object.assign(new Error(`不允许的文件类型: ${ext}`), { status: 400 });
        }
        if (!(0, fs_1.existsSync)(full))
            throw Object.assign(new Error('文件不存在'), { status: 404 });
        return { buffer: (0, fs_1.readFileSync)(full), ext };
    }
};
exports.LiteLabService = LiteLabService;
exports.LiteLabService = LiteLabService = LiteLabService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [lite_service_1.LiteService,
        tasks_service_1.TasksService,
        progress_service_1.ProgressService,
        config_service_1.AiConfigService,
        task_code_snapshot_service_1.TaskCodeSnapshotService])
], LiteLabService);
//# sourceMappingURL=lite-lab.service.js.map