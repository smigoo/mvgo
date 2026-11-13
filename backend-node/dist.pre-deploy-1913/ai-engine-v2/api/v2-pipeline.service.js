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
var V2PipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2PipelineService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const backend_root_1 = require("../../config/backend-root");
const config_service_1 = require("../../config/config.service");
const progress_service_1 = require("../../progress/progress.service");
const task_code_snapshot_service_1 = require("../../tasks/task-code-snapshot.service");
const tasks_service_1 = require("../../tasks/tasks.service");
const sfc_syntax_validation_js_1 = require("../../ai-engine/utils/sfc-syntax-validation.js");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const group_member_schema_1 = require("../../schemas/group-member.schema");
const group_resolver_1 = require("../../common/group-resolver");
let V2PipelineService = V2PipelineService_1 = class V2PipelineService {
    aiConfigService;
    progressService;
    tasksService;
    taskCodeSnapshotService;
    groupMemberModel;
    logger = new common_1.Logger(V2PipelineService_1.name);
    engine = null;
    registryLoaded = null;
    constructor(aiConfigService, progressService, tasksService, taskCodeSnapshotService, groupMemberModel) {
        this.aiConfigService = aiConfigService;
        this.progressService = progressService;
        this.tasksService = tasksService;
        this.taskCodeSnapshotService = taskCodeSnapshotService;
        this.groupMemberModel = groupMemberModel;
    }
    async onModuleInit() {
        try {
            const { specRegistry } = await this.loadEngine();
            const loaded = specRegistry.loadSpecRegistry({ includeUser: true });
            this.registryLoaded = loaded;
            const { specs, builtin, user, warnings } = loaded;
            this.logger.log(`[v2] 规范注册表已加载: ${specs.length} 个（内置 ${builtin.length} / 用户 ${user.length}）`);
            for (const w of warnings)
                this.logger.warn(`[v2] ${w}`);
        }
        catch (e) {
            this.logger.error(`[v2] 规范注册表加载失败: ${e.message}`);
        }
    }
    async loadEngine() {
        if (this.engine)
            return this.engine;
        const [specRegistry, tierProfile, modelResolver, pipeline, inputAdapters, aiDefaults] = await Promise.all([
            import('../specs/spec-registry.js'),
            import('../pipeline/tier-profile.js'),
            import('../pipeline/model-resolver.js'),
            import('../pipeline/configurable-pipeline.js'),
            import('../pipeline/input-adapters/index.js'),
            import('../../ai-engine/utils/ai-defaults.js'),
        ]);
        this.engine = {
            specRegistry,
            tierProfile,
            modelResolver,
            pipeline,
            inputAdapters,
            aiDefaults,
        };
        return this.engine;
    }
    async ensureRegistry() {
        const engine = await this.loadEngine();
        if (!this.registryLoaded) {
            this.registryLoaded = engine.specRegistry.loadSpecRegistry({ includeUser: true });
        }
        return engine;
    }
    async getCatalog() {
        const engine = await this.ensureRegistry();
        const { specRegistry, tierProfile, modelResolver, inputAdapters } = engine;
        const tiers = tierProfile.listTiers().map((t) => ({
            ...t,
            configurableNodes: modelResolver.listConfigurableNodes(tierProfile.resolveTier(t.id)),
        }));
        return {
            specs: specRegistry.listSpecs(),
            tiers,
            sourceTypes: inputAdapters.SUPPORTED_SOURCE_TYPES,
            defaults: {
                spec: 'microcode',
                tier: tierProfile.DEFAULT_TIER,
                sourceType: 'screenshot',
            },
            fallbackModels: modelResolver.FALLBACK_MODELS,
            registryWarnings: this.registryLoaded?.warnings || [],
        };
    }
    async health(userId) {
        const engine = await this.ensureRegistry();
        const { specRegistry, tierProfile } = engine;
        const audit = specRegistry.auditRegistry();
        const aiConfig = await this.buildAiConfig({}, userId);
        const tiers = {};
        for (const t of tierProfile.listTiers()) {
            try {
                const preview = await this.buildPreview({ spec: 'microcode', tier: t.id }, aiConfig);
                tiers[t.id] = {
                    ok: true,
                    llmCallCount: preview.llmCallCount,
                    credentialsOk: preview.credentialsOk,
                    missingCredentials: preview.missingCredentials,
                };
            }
            catch (e) {
                tiers[t.id] = { ok: false, error: e.message };
            }
        }
        return {
            ok: audit.ok && Object.values(tiers).every((t) => t.ok),
            generationReady: audit.ok && Object.values(tiers).every((t) => t.ok && t.credentialsOk),
            specAudit: {
                ok: audit.ok,
                warnings: audit.warnings,
                reports: audit.reports,
            },
            tiers,
            exposedBy: process.env.AI_ENGINE_V2_ENABLED
                ? 'AI_ENGINE_V2_ENABLED'
                : `NODE_ENV=${process.env.NODE_ENV || 'development'}`,
        };
    }
    async preview(dto, userId) {
        const aiConfig = await this.buildAiConfig(dto.config, userId);
        return this.buildPreview(dto, aiConfig);
    }
    async buildPreview(dto, aiConfig) {
        const engine = await this.ensureRegistry();
        const { ConfigurablePipeline } = engine.pipeline;
        const p = new ConfigurablePipeline({
            spec: dto.spec || 'microcode',
            tier: dto.tier || 'lite',
            sourceType: dto.sourceType || 'screenshot',
            specOverrides: dto.specOverrides,
            tierOverrides: dto.tierOverrides,
            modelOverrides: dto.modelOverrides,
            aiConfig,
        });
        const view = p.preview();
        const prepared = p.prepare();
        return {
            ...view,
            models: Object.values(prepared.modelTable).map((m) => ({
                nodeId: m.nodeId,
                channel: m.channel,
                model: m.model,
                source: m.source,
                callsLlm: m.callsLlm,
                deterministic: m.deterministic,
                hasApiKey: Boolean(m.apiKey),
            })),
            expectedLlmCalls: prepared.tierProfile.expectedLlmCalls,
            matchesExpected: prepared.matchesExpected,
        };
    }
    async runGeneration(sessionId, dto, groupId, userId) {
        groupId = await (0, group_resolver_1.resolvePrivateGroupId)(groupId, userId, this.groupMemberModel);
        const engine = await this.ensureRegistry();
        const { ConfigurablePipeline } = engine.pipeline;
        const outputPath = (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, sessionId);
        (0, fs_1.mkdirSync)(outputPath, { recursive: true });
        const aiConfig = await this.buildAiConfig(dto.config, userId);
        const pipeline = new ConfigurablePipeline({
            spec: dto.spec || 'microcode',
            tier: dto.tier || 'lite',
            sourceType: dto.sourceType || 'screenshot',
            specOverrides: dto.specOverrides,
            tierOverrides: dto.tierOverrides,
            modelOverrides: dto.modelOverrides,
            promptInjectionMode: dto.promptInjectionMode || 'replace',
            aiConfig,
            workspaceDir: outputPath,
            sessionId,
            groupId,
            onProgress: (evt) => {
                this.progressService.sendProgress(sessionId, {
                    stage: evt.stage,
                    message: evt.message,
                    status: evt.status,
                    timestamp: evt.ts,
                });
            },
        });
        try {
            const result = await pipeline.execute({
                screenshot: dto.imageBase64,
                figmaUrl: dto.figmaUrl,
                figmaToken: this.resolveFigmaToken(dto.config?.figmaToken),
                componentName: dto.componentName || sessionId,
            });
            const written = this.writeArtifacts(outputPath, result.artifacts);
            this.publishCandidateSnapshot({
                sessionId,
                groupId,
                outputPath,
                target: this.resolveSnapshotTarget(engine, result.spec || dto.spec),
            });
            const payload = {
                sessionId,
                spec: result.spec,
                tier: result.tier,
                sourceType: result.sourceType,
                componentName: result.componentName,
                outputPath,
                files: written,
                quality: result.quality,
                warnings: result.warnings,
                durationMs: result.durationMs,
                trace: result.trace,
            };
            await this.progressService.sendComplete(sessionId, payload);
            return payload;
        }
        catch (e) {
            this.logger.error(`[v2] 生成失败 ${sessionId}: ${e.message}`);
            await this.progressService.sendError(sessionId, {
                code: e.nodeId ? 'NODE_FAILED' : 'PIPELINE_FAILED',
                message: e.message,
                nodeId: e.nodeId,
                trace: e.trace,
            });
            throw e;
        }
    }
    writeArtifacts(outputPath, artifacts) {
        if (!artifacts?.files)
            return [];
        const written = [];
        for (const [relPath, content] of Object.entries(artifacts.files)) {
            const abs = (0, path_1.join)(outputPath, relPath);
            if (!abs.startsWith(outputPath)) {
                this.logger.warn(`[v2] 跳过越界产物路径: ${relPath}`);
                continue;
            }
            const dir = (0, path_1.dirname)(abs);
            if (!(0, fs_1.existsSync)(dir))
                (0, fs_1.mkdirSync)(dir, { recursive: true });
            const source = String(content);
            if (String(relPath).endsWith('.vue')) {
                const syntaxResult = (0, sfc_syntax_validation_js_1.validateVueSfc)(source, String(relPath));
                if (!syntaxResult.valid) {
                    throw new Error(`拒绝写入不可编译 Vue SFC ${relPath}: ${syntaxResult.errors.join('; ')}`);
                }
            }
            (0, fs_1.writeFileSync)(abs, source, 'utf-8');
            written.push(relPath);
        }
        return written;
    }
    publishCandidateSnapshot(params) {
        const { sessionId, groupId, outputPath, target } = params;
        try {
            const files = this.collectSnapshotFiles(outputPath);
            const fileCount = Object.keys(files).length;
            if (fileCount === 0) {
                this.logger.warn(`[v2] 快照跳过：产物目录为空 ${outputPath}`);
                return;
            }
            const candidate = this.taskCodeSnapshotService.createCandidate({
                sessionId,
                componentId: sessionId,
                groupId,
                target,
                stage: 'v2-generation',
                files,
            });
            this.taskCodeSnapshotService.markValidating(sessionId, candidate.revision, {
                semantics: 'passed',
                sfc: 'passed',
                less: 'passed',
                runtime: 'pending',
            });
            this.progressService.sendCodeSnapshot(sessionId, {
                revision: candidate.revision,
                status: 'validating',
                stage: candidate.stage,
                fileCount: candidate.files.length,
                changedFiles: candidate.files.map((file) => file.path),
                lastGoodRevision: candidate.lastGoodRevision,
            });
            this.logger.log(`[v2] 候选快照已登记 ${sessionId} revision=${candidate.revision} 文件=${candidate.files.length} target=${target}`);
        }
        catch (e) {
            this.logger.error(`[v2] 候选快照登记失败 ${sessionId}: ${e.message}`);
        }
    }
    collectSnapshotFiles(outputPath) {
        const files = {};
        const SKIP_DIRS = new Set(['.mc-gen', '.cache', '.checkpoint', '_upload', 'node_modules']);
        const walk = (dir) => {
            for (const entry of (0, fs_1.readdirSync)(dir)) {
                if (SKIP_DIRS.has(entry))
                    continue;
                const abs = (0, path_1.join)(dir, entry);
                const stat = (0, fs_1.lstatSync)(abs);
                if (stat.isSymbolicLink())
                    continue;
                if (stat.isDirectory()) {
                    walk(abs);
                    continue;
                }
                const rel = (0, path_1.relative)(outputPath, abs).split(path_1.sep).join('/');
                files[rel] = (0, fs_1.readFileSync)(abs);
            }
        };
        walk(outputPath);
        return files;
    }
    resolveSnapshotTarget(engine, specId) {
        try {
            const def = engine?.specRegistry?.resolveSpec(specId || 'microcode');
            return def?.engineerClass === 'Vue3Engineer' ? 'vue3' : 'microcode';
        }
        catch {
            return 'microcode';
        }
    }
    async buildAiConfig(config = {}, userId) {
        const engine = await this.loadEngine();
        const { resolveVisionConfig, resolveTextConfig } = engine.aiDefaults;
        const saved = (await this.aiConfigService.getMergedAiConfig(userId)) || {};
        const pick = (key) => {
            for (const value of [config?.[key], saved[key]]) {
                if (value !== undefined && value !== null && value !== '')
                    return value;
            }
            return undefined;
        };
        const merged = {
            ...config,
            visionApiKey: pick('visionApiKey'),
            visionBaseURL: pick('visionBaseURL'),
            visionModel: pick('visionModel'),
            visionProviderType: pick('visionProviderType'),
            visionTemperature: pick('visionTemperature'),
            textApiKey: pick('textApiKey'),
            textBaseURL: pick('textBaseURL'),
            textModel: pick('textModel'),
            textProviderType: pick('textProviderType'),
            textTemperature: pick('textTemperature'),
            unifiedApiKey: pick('unifiedApiKey'),
            unifiedBaseURL: pick('unifiedBaseURL'),
            unifiedModel: pick('unifiedModel'),
            unifiedProviderType: pick('unifiedProviderType'),
            unifiedTemperature: pick('unifiedTemperature'),
            modelMode: pick('modelMode'),
        };
        return {
            visionAIConfig: resolveVisionConfig(merged),
            textAIConfig: resolveTextConfig(merged),
        };
    }
    resolveFigmaToken(requestToken) {
        const direct = typeof requestToken === 'string' ? requestToken.trim() : '';
        if (direct)
            return direct;
        return process.env.FIGMA_ACCESS_TOKEN;
    }
    async resolveGroupId(dtoGroupId, userId) {
        return (0, group_resolver_1.resolvePrivateGroupId)(dtoGroupId, userId, this.groupMemberModel);
    }
    buildTaskMetadata(sessionId, dto, groupId, userId) {
        return {
            componentId: sessionId,
            componentName: dto.componentName || sessionId,
            target: dto.spec === 'microcode' ? 'microcode' : 'vue3',
            groupId,
            taskType: 'component',
            userId,
            generationTier: (dto.tier || 'lite'),
            sourceType: (dto.sourceType || 'screenshot'),
            outputPath: (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, sessionId),
        };
    }
    async uploadSpec(specDef) {
        const { id, label, version } = specDef;
        if (!id || !label || !version) {
            throw new Error('自定义规范缺少必填字段: id, label, version');
        }
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(id) || id.length > 64) {
            throw new Error(`非法规范 id "${id}"（要求小写字母/数字/中划线，2-64 位）`);
        }
        const { USER_SPECS_DIR } = await import('../specs/spec-registry.js');
        const packageDir = (0, path_1.join)(USER_SPECS_DIR, id);
        const { loadSpecRegistry } = await import('../specs/spec-registry.js');
        const registry = loadSpecRegistry({ includeUser: false });
        if (registry.builtin.includes(id)) {
            throw new Error(`规范 id "${id}" 与内置规范冲突，不可覆盖`);
        }
        (0, fs_1.mkdirSync)(packageDir, { recursive: true });
        (0, fs_1.writeFileSync)((0, path_1.join)(packageDir, 'skill.json'), JSON.stringify({ id, label, version, __source: 'upload' }, null, 2), 'utf-8');
        const specFields = { ...specDef };
        delete specFields.id;
        delete specFields.label;
        delete specFields.version;
        if (Object.keys(specFields).length > 0) {
            (0, fs_1.writeFileSync)((0, path_1.join)(packageDir, 'spec.json'), JSON.stringify(specFields, null, 2), 'utf-8');
        }
        this.registryLoaded = null;
        this.logger.log(`[v2] 自定义规范已上传: ${id} → ${packageDir}`);
        return { id, packageDir };
    }
};
exports.V2PipelineService = V2PipelineService;
exports.V2PipelineService = V2PipelineService = V2PipelineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [config_service_1.AiConfigService,
        progress_service_1.ProgressService,
        tasks_service_1.TasksService,
        task_code_snapshot_service_1.TaskCodeSnapshotService,
        mongoose_2.Model])
], V2PipelineService);
//# sourceMappingURL=v2-pipeline.service.js.map