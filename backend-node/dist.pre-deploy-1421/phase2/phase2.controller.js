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
var Phase2Controller_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Phase2Controller = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const path_1 = require("path");
const fs_1 = require("fs");
const phase2_service_1 = require("./phase2.service");
const component_service_1 = require("../component/component.service");
const doc_analyzer_service_js_1 = require("./doc/doc-analyzer.service.js");
const generate_phase2_dto_1 = require("./dto/generate-phase2.dto");
const refine_component_dto_1 = require("./dto/refine-component.dto");
const quota_service_1 = require("../quota/quota.service");
const redact_1 = require("../common/utils/redact");
const task_queue_service_1 = require("../queue/task-queue.service");
const tasks_service_1 = require("../tasks/tasks.service");
const session_guard_1 = require("../auth/session.guard");
const backend_root_1 = require("../config/backend-root");
let Phase2Controller = Phase2Controller_1 = class Phase2Controller {
    phase2Service;
    componentService;
    docAnalyzerService;
    quotaService;
    queueService;
    tasksService;
    logger = new common_1.Logger(Phase2Controller_1.name);
    constructor(phase2Service, componentService, docAnalyzerService, quotaService, queueService, tasksService) {
        this.phase2Service = phase2Service;
        this.componentService = componentService;
        this.docAnalyzerService = docAnalyzerService;
        this.quotaService = quotaService;
        this.queueService = queueService;
        this.tasksService = tasksService;
    }
    async getFigmaPreview(body, req) {
        try {
            const userId = req?.session?.userId;
            const result = await this.phase2Service.getFigmaPreview(body.figmaUrl, body.figmaToken, body.config, userId);
            return result;
        }
        catch (err) {
            this.logger.error(`figma-preview 失败: ${err.message}`);
            throw new common_1.HttpException({ success: false, error: err.message }, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getPreviewImage(token, res) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token || '')) {
            throw new common_1.HttpException('无效的预览 token', common_1.HttpStatus.BAD_REQUEST);
        }
        const filePath = (0, path_1.join)(backend_root_1.backendRoot, 'temp-preview-images', `${token}.png`);
        if (!(0, fs_1.existsSync)(filePath)) {
            throw new common_1.HttpException('预览图不存在或已过期', common_1.HttpStatus.NOT_FOUND);
        }
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.sendFile(filePath);
    }
    onModuleInit() {
        this.queueService.registerRestoreExecutor(async (task) => {
            if (task.target === 'vue3')
                return false;
            if (task.generationTier === 'lite' || (task.sourceType && task.sourceType !== 'figma')) {
                this.logger.warn(`跳过 lite 任务恢复（不应走 phase2）: ${task.sessionId} (tier=${task.generationTier}, source=${task.sourceType})`);
                return false;
            }
            if (!task.fileKey || !task.nodeId) {
                this.logger.warn(`跳过 microcode 任务恢复（fileKey/nodeId 为空）: ${task.sessionId} (fileKey=${task.fileKey}, nodeId=${task.nodeId})`);
                return false;
            }
            try {
                const dto = new generate_phase2_dto_1.GeneratePhase2Dto();
                dto.componentName = task.componentName || task.sessionId;
                dto.componentId = task.componentId || task.sessionId;
                dto.nodeId = task.nodeId;
                dto.fileKey = task.fileKey;
                dto.groupId = task.groupId || '';
                dto.panelType = task.panelKey || 'default-panel';
                dto.target = 'microcode';
                if (task.configSnapshot) {
                    dto.config = (0, redact_1.stripRedactedPlaceholders)({
                        outputPath: task.configSnapshot.outputPath,
                        ...task.configSnapshot,
                    });
                }
                await this.phase2Service.startGeneration(task.sessionId, dto, task.groupId || '', task.userId);
                return true;
            }
            catch (error) {
                this.logger.error(`恢复 microcode 任务失败: ${task.sessionId}`, error);
                return false;
            }
        });
    }
    async analyzeDoc(dto) {
        try {
            return await this.docAnalyzerService.analyzeDocument(dto);
        }
        catch (error) {
            this.logger.error(`文档分析失败: ${error.message}`, error.stack);
            throw new common_1.HttpException(`文档分析失败: ${error.message}`, error.status || common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async regenerateWithDoc(dto, req) {
        const { componentId, groupId, requirementDoc, docAnalysis, config, panelType } = dto || {};
        if (!componentId || !groupId || !requirementDoc) {
            throw new common_1.HttpException('参数不完整（componentId/groupId/requirementDoc 必填）', common_1.HttpStatus.BAD_REQUEST);
        }
        const sessionId = `mc-doc-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        const userId = req.session?.userId;
        try {
            await this.phase2Service.regenerateWithDoc(sessionId, {
                componentId,
                groupId,
                requirementDoc,
                docAnalysis,
                config: config || {},
                userId,
                panelType,
            });
            return { success: true, sessionId, message: '路径B 文档纠偏再生成已开始' };
        }
        catch (error) {
            this.logger.error(`路径B 发起失败: ${error.message}`, error.stack);
            throw new common_1.HttpException(`路径B 发起失败: ${error.message}`, error.status || common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async refine(dto, req) {
        const { componentId, refineType = 'both', target, generationTier, visionRefine, visualDiffGuidance, overrideImage } = dto;
        const userId = req.session?.userId;
        const prefix = target === 'vue3' ? 'vue3' : 'mc';
        const sessionId = `${prefix}-refine-${generationTier || 'max'}-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        try {
            await this.phase2Service.refineComponent(sessionId, {
                componentId,
                refineType,
                userId,
                target,
                generationTier,
                visionRefine,
                visualDiffGuidance,
                overrideImage,
            });
            return { success: true, sessionId, message: visionRefine ? '视觉优化精修已开始' : '精修已开始', target, generationTier };
        }
        catch (error) {
            this.logger.error(`精修发起失败: ${error.message}`, error.stack);
            throw new common_1.HttpException(`精修发起失败: ${error.message}`, error.status || common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async visionAnalyze(dto, req) {
        const { componentId, refineType = 'both', target, generationTier, overrideImage } = dto;
        const userId = req.session?.userId;
        const prefix = target === 'vue3' ? 'vue3' : 'mc';
        const sessionId = `${prefix}-refine-${generationTier || 'max'}-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        try {
            const result = await this.phase2Service.visionRefineAnalyze(sessionId, {
                componentId,
                refineType,
                target,
                generationTier,
                overrideImage,
                userId,
            });
            return result;
        }
        catch (error) {
            this.logger.error(`视觉分析失败: ${error.message}`, error.stack);
            return { success: false, error: 'ANALYZE_FAILED', message: error.message || '视觉分析失败' };
        }
    }
    async visionImage(sessionId, kind, res) {
        const metaPath = (0, path_1.join)(backend_root_1.backendRoot, 'data', 'vision-refine', `${sessionId}.json`);
        if (!(0, fs_1.existsSync)(metaPath)) {
            res.status(404).json({ error: 'NOT_FOUND', message: '分析记录不存在或已过期' });
            return;
        }
        let meta;
        try {
            meta = JSON.parse((0, fs_1.readFileSync)(metaPath, 'utf-8'));
        }
        catch {
            res.status(500).json({ error: 'META_CORRUPT', message: '分析元数据损坏' });
            return;
        }
        const filePath = kind === 'design' ? meta.designPath : meta.renderedPath;
        if (!filePath || !(0, fs_1.existsSync)(filePath)) {
            res.status(404).json({ error: 'IMAGE_MISSING', message: '图片文件不存在' });
            return;
        }
        res.sendFile(filePath, { dotfiles: 'allow' });
    }
    async getQuota(req) {
        const userId = req.session?.userId;
        if (!userId) {
            return {
                success: false,
                error: '未登录',
            };
        }
        const quota = await this.quotaService.getQuotaStatus(userId);
        return {
            success: true,
            data: quota,
        };
    }
    async generate(dto, req) {
        const { fileKey, nodeId, groupId } = dto;
        if (!fileKey || !nodeId) {
            throw new common_1.HttpException('参数不完整', common_1.HttpStatus.BAD_REQUEST);
        }
        const userId = req.session?.userId;
        let enqueueResult = null;
        if (userId) {
            try {
                const quotaStatus = await this.quotaService.checkQuotaStatus(userId);
                if (!quotaStatus.allowed) {
                    const waitMinutes = Math.ceil(((quotaStatus.quotaResetAt || Date.now() + 60 * 60 * 1000) - Date.now()) / (60 * 1000));
                    enqueueResult = {
                        queued: true,
                        reason: quotaStatus.reason,
                        message: `配额不足，任务已加入等待队列。配额预计将在约 ${waitMinutes} 分钟后恢复，届时将自动开始执行。您可以在任务中心查看排队状态。`,
                        quotaResetAt: quotaStatus.quotaResetAt,
                        waitMinutes,
                        used: quotaStatus.used,
                        limit: quotaStatus.limit,
                    };
                }
            }
            catch (error) {
                if (error instanceof common_1.HttpException) {
                    throw error;
                }
                this.logger.error(`配额检查失败: ${error.message}`, error.stack);
                throw new common_1.HttpException('配额检查服务异常', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
        const idPrefix = dto.target === 'vue3' ? 'mv' : 'mc';
        const sessionId = `${idPrefix}-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        if (!dto.componentName) {
            dto.componentName = sessionId;
        }
        this.logger.debug(`[DEBUG] Session keys: ${req.session ? Object.keys(req.session).join(', ') : 'NO SESSION'}`);
        this.logger.debug(`[DEBUG] userId from session: ${userId}`);
        this.logger.debug(`[DEBUG] groupId from DTO: ${groupId}`);
        if (enqueueResult?.queued) {
            const queuedTask = this.tasksService.createTask(sessionId, {
                componentId: sessionId,
                componentName: dto.componentName,
                nodeId: dto.nodeId,
                fileKey: dto.fileKey,
                themeNodes: dto.themeNodes,
                target: dto.target || 'microcode',
                groupId: groupId,
                panelKey: dto.panelType || 'default-panel',
                taskType: 'component',
                userId,
                generationTier: 'max',
                sourceType: 'figma',
                enqueuedAt: Date.now(),
                quotaResetAt: enqueueResult.quotaResetAt,
                queuePriority: 0,
            }, 'queued');
            await this.queueService.enqueue(queuedTask, 'quota_exceeded', async () => {
                await this.phase2Service.startGeneration(sessionId, dto, groupId, userId);
            });
            return {
                success: true,
                sessionId,
                queued: true,
                message: enqueueResult.message,
                queue: {
                    position: this.queueService.getQueueStats().totalQueued,
                    quotaResetAt: enqueueResult.quotaResetAt,
                    waitMinutes: enqueueResult.waitMinutes,
                },
            };
        }
        if (this.queueService.getRunningCount(userId) >= this.queueService.MAX_CONCURRENT) {
            this.logger.log(`并发槽位已满 (${this.queueService.getRunningCount(userId)}/${this.queueService.MAX_CONCURRENT})，任务加入等待队列`);
            const queuedTask = this.tasksService.createTask(sessionId, {
                componentId: sessionId,
                componentName: dto.componentName,
                nodeId: dto.nodeId,
                fileKey: dto.fileKey,
                themeNodes: dto.themeNodes,
                target: dto.target || 'microcode',
                groupId: groupId,
                panelKey: dto.panelType || 'default-panel',
                taskType: 'component',
                userId,
                generationTier: 'max',
                sourceType: 'figma',
                enqueuedAt: Date.now(),
                queuePriority: 0,
            }, 'queued');
            const queueResult = await this.queueService.enqueue(queuedTask, 'concurrency_full', async () => {
                await this.phase2Service.startGeneration(sessionId, dto, groupId, userId);
            });
            return {
                success: true,
                sessionId,
                queued: true,
                message: queueResult.message,
                queue: {
                    position: queueResult.queuePosition,
                    runningCount: this.queueService.getRunningCount(userId),
                    maxConcurrent: this.queueService.MAX_CONCURRENT,
                },
            };
        }
        const task = this.tasksService.createTask(sessionId, {
            componentId: sessionId,
            componentName: dto.componentName,
            nodeId: dto.nodeId,
            fileKey: dto.fileKey,
            themeNodes: dto.themeNodes,
            target: dto.target || 'microcode',
            groupId: groupId,
            panelKey: dto.panelType || 'default-panel',
            taskType: 'component',
            userId,
            generationTier: 'max',
            sourceType: 'figma',
        });
        this.queueService.registerRunning(sessionId, userId);
        this.phase2Service.startGeneration(sessionId, dto, groupId, userId);
        return {
            success: true,
            sessionId,
            message: 'Phase 2 生成任务已开始',
            queue: {
                runningCount: this.queueService.getRunningCount(userId),
                maxConcurrent: this.queueService.MAX_CONCURRENT,
                availableSlots: this.queueService.getAvailableSlots(userId),
            },
        };
    }
    async downloadComponent(componentId, req, res) {
        try {
            const userId = req.session?.userId;
            if (!userId) {
                throw new common_1.HttpException('未登录', common_1.HttpStatus.UNAUTHORIZED);
            }
            const authorized = await this.componentService.authorizeWorkspaceComponent(componentId, userId, 'read');
            const zipBuffer = await this.phase2Service.packageComponent(authorized.componentId, authorized.target, authorized.groupId);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${authorized.componentId}.zip"`);
            res.send(zipBuffer);
        }
        catch (error) {
            this.logger.error(`下载组件失败: ${error.message}`, error.stack);
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException(`下载组件失败: ${error.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.Phase2Controller = Phase2Controller;
__decorate([
    (0, common_1.Post)('figma-preview'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "getFigmaPreview", null);
__decorate([
    (0, common_1.Get)('preview-image/:token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "getPreviewImage", null);
__decorate([
    (0, common_1.Post)('analyze-doc'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "analyzeDoc", null);
__decorate([
    (0, common_1.Post)('regenerate-with-doc'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "regenerateWithDoc", null);
__decorate([
    (0, common_1.Post)('refine'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refine_component_dto_1.RefineComponentDto, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "refine", null);
__decorate([
    (0, common_1.Post)('refine/vision-analyze'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refine_component_dto_1.RefineComponentDto, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "visionAnalyze", null);
__decorate([
    (0, common_1.Get)('refine/vision-image/:sessionId/:kind'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Param)('kind')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "visionImage", null);
__decorate([
    (0, common_1.Get)('quota'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "getQuota", null);
__decorate([
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_phase2_dto_1.GeneratePhase2Dto, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "generate", null);
__decorate([
    (0, common_1.Get)('download/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], Phase2Controller.prototype, "downloadComponent", null);
exports.Phase2Controller = Phase2Controller = Phase2Controller_1 = __decorate([
    (0, common_1.Controller)('phase2'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [phase2_service_1.Phase2Service,
        component_service_1.ComponentService,
        doc_analyzer_service_js_1.DocAnalyzerService,
        quota_service_1.QuotaService,
        task_queue_service_1.TaskQueueService,
        tasks_service_1.TasksService])
], Phase2Controller);
//# sourceMappingURL=phase2.controller.js.map