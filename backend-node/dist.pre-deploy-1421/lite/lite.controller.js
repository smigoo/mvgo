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
var LiteController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiteController = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const path_1 = require("path");
const backend_root_1 = require("../config/backend-root");
const lite_service_1 = require("./lite.service");
const html_split_service_1 = require("./html-split.service");
const phase2_service_1 = require("../phase2/phase2.service");
const generate_phase2_dto_1 = require("../phase2/dto/generate-phase2.dto");
const generate_lite_dto_1 = require("./dto/generate-lite.dto");
const figma_url_parser_js_1 = require("../ai-engine/utils/figma-url-parser.js");
const tasks_service_1 = require("../tasks/tasks.service");
const redact_1 = require("../common/utils/redact");
const progress_service_1 = require("../progress/progress.service");
const quota_service_1 = require("../quota/quota.service");
const task_queue_service_1 = require("../queue/task-queue.service");
const session_guard_1 = require("../auth/session.guard");
const lite_constants_1 = require("./lite.constants");
let LiteController = LiteController_1 = class LiteController {
    liteService;
    htmlSplitService;
    phase2Service;
    tasksService;
    progressService;
    quotaService;
    queueService;
    logger = new common_1.Logger(LiteController_1.name);
    constructor(liteService, htmlSplitService, phase2Service, tasksService, progressService, quotaService, queueService) {
        this.liteService = liteService;
        this.htmlSplitService = htmlSplitService;
        this.phase2Service = phase2Service;
        this.tasksService = tasksService;
        this.progressService = progressService;
        this.quotaService = quotaService;
        this.queueService = queueService;
    }
    async retryFromCache(sessionId, body, req) {
        try {
            const task = this.tasksService.getTask(sessionId);
            if (!task) {
                throw new common_1.HttpException('任务不存在', common_1.HttpStatus.NOT_FOUND);
            }
            let outputPath = task.outputPath;
            if (!outputPath && task.groupId) {
                outputPath = (0, path_1.join)(backend_root_1.tempComponentsDir, task.groupId, sessionId);
            }
            if (!outputPath) {
                throw new common_1.HttpException('无法定位任务产物目录', common_1.HttpStatus.BAD_REQUEST);
            }
            const { readFileSync, existsSync, readdirSync } = await import('fs');
            let sourceFile = null;
            const imagesDir = (0, path_1.join)(outputPath, 'resources', 'images');
            if (existsSync(imagesDir)) {
                const candidates = readdirSync(imagesDir).filter((f) => /^source-screenshot\.(png|jpe?g|webp)$/i.test(f));
                if (candidates.length > 0)
                    sourceFile = (0, path_1.join)(imagesDir, candidates[0]);
            }
            if (!sourceFile) {
                const uploadDir = (0, path_1.join)(outputPath, '_upload');
                if (existsSync(uploadDir)) {
                    const candidates = readdirSync(uploadDir).filter((f) => /^screenshot\.(png|jpe?g|webp)$/i.test(f));
                    if (candidates.length > 0) {
                        sourceFile = (0, path_1.join)(uploadDir, candidates[0]);
                        this.logger.log(`📸 Lite 重试使用 _upload 兜底缓存: ${candidates[0]} (${Math.round(readFileSync(sourceFile).length / 1024)}KB)`);
                    }
                }
            }
            if (!sourceFile) {
                throw new common_1.HttpException('未找到原图缓存（source-screenshot.* 或 _upload/screenshot.*），请在 Lite 生成页重新上传截图', common_1.HttpStatus.BAD_REQUEST);
            }
            const buffer = readFileSync(sourceFile);
            const ext = sourceFile.split('.').pop()?.toLowerCase() || 'png';
            const mime = ext === 'jpg' ? 'jpeg' : ext;
            const imageBase64 = `data:image/${mime};base64,${buffer.toString('base64')}`;
            const { readFileSync: rf2, existsSync: ex2 } = await import('fs');
            const cpPath = (0, path_1.join)(outputPath, '.checkpoint', 'lite-state.json');
            if (ex2(cpPath)) {
                this.logger.log(`🔁 Lite 断点续跑: ${sessionId}`);
                const retryDto = new generate_lite_dto_1.GenerateLiteDto();
                retryDto.componentName = task.componentName || sessionId;
                retryDto.groupId = task.groupId;
                retryDto.componentType = (body?.componentType || task.target || 'vue3');
                if (body?.config || task.configSnapshot) {
                    retryDto.config = (0, redact_1.stripRedactedPlaceholders)(body?.config || task.configSnapshot);
                }
                return await this.liteService.resumeFromCheckpoint(sessionId, outputPath, retryDto);
            }
            const retryDto = new generate_lite_dto_1.GenerateLiteDto();
            retryDto.imageBase64 = imageBase64;
            retryDto.componentName = task.componentName || sessionId;
            retryDto.groupId = task.groupId;
            retryDto.componentType = (body?.componentType || task.target || 'vue3');
            if (body?.config || task.configSnapshot) {
                retryDto.config = (0, redact_1.stripRedactedPlaceholders)(body?.config || task.configSnapshot);
            }
            return await this.generate(retryDto, req);
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            this.logger.error(`Lite 重试失败 ${sessionId}: ${e.message}`);
            throw new common_1.HttpException({ code: lite_constants_1.LiteErrorCode.INTERNAL_ERROR, message: `重试失败: ${e.message}` }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async upgradeAssets(sessionId, body, req) {
        const userId = req?.user?.userId ?? req?.user?.sub;
        try {
            const result = await this.liteService.upgradeAssets(sessionId, body?.figmaUrl, userId);
            if (!result.success) {
                throw new common_1.HttpException(result.message, common_1.HttpStatus.BAD_REQUEST);
            }
            return result;
        }
        catch (e) {
            if (e instanceof common_1.HttpException)
                throw e;
            this.logger.error(`素材升级失败 ${sessionId}: ${e.message}`);
            throw new common_1.HttpException({ code: 'UPGRADE_ASSETS_FAILED', message: `素材升级失败: ${e.message}` }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async analyzeHtml(body) {
        if (!body?.htmlContent) {
            throw new common_1.HttpException('htmlContent 不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        const result = this.htmlSplitService.analyzeHtml({
            htmlContent: body.htmlContent,
            htmlFileName: body.htmlFileName,
        });
        if (!result.success || result.totalComponents === 0) {
            throw new common_1.HttpException('未能从 HTML 中识别出组件区块。建议在 HTML 中为需要拆分的区块添加 data-component 属性作为显式标记。', common_1.HttpStatus.BAD_REQUEST);
        }
        return result;
    }
    async generateSplit(body, req) {
        if (!body?.htmlContent) {
            throw new common_1.HttpException('htmlContent 不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!body.selections || body.selections.length === 0) {
            throw new common_1.HttpException('至少选择一个组件', common_1.HttpStatus.BAD_REQUEST);
        }
        const userId = req.session?.userId;
        const result = await this.htmlSplitService.generateSelectedComponents({
            htmlContent: body.htmlContent,
            htmlFileName: body.htmlFileName,
            groupId: await this.liteService.resolvePrivateGroupId(body.groupId, userId),
            config: body.config,
            userId,
            selections: body.selections,
        });
        return result;
    }
    async generate(dto, req) {
        if (!dto) {
            throw new common_1.HttpException('请求体不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        const hasImage = !!dto.imageBase64 && dto.imageBase64.trim().length > 0;
        const hasFigma = !!dto.figmaUrl && dto.figmaUrl.trim().length > 0;
        const hasHtml = !!dto.htmlContent && dto.htmlContent.trim().length > 0;
        const inputCount = [hasImage, hasFigma, hasHtml].filter(Boolean).length;
        if (inputCount !== 1) {
            throw new common_1.HttpException('输入数据必须且只能提供一种：imageBase64（截图）、figmaUrl（Figma 链接）或 htmlContent（HTML 文件）', common_1.HttpStatus.BAD_REQUEST);
        }
        const userId = req.session?.userId;
        const componentType = dto.componentType || 'vue3';
        if (componentType !== 'vue3' && componentType !== 'microcode') {
            throw new common_1.HttpException(`不支持的组件类型: ${componentType}，仅支持 vue3 或 microcode`, common_1.HttpStatus.BAD_REQUEST);
        }
        const sourceType = hasFigma ? 'figma' : hasHtml ? 'html' : 'screenshot';
        let generationTier;
        if (dto.generationTier) {
            generationTier = dto.generationTier;
        }
        else {
            generationTier = sourceType === 'figma' ? 'max' : 'lite';
        }
        if (sourceType !== 'figma') {
            generationTier = lite_constants_1.LITE_SCREENSHOT_TIER;
        }
        const groupId = await this.liteService.resolvePrivateGroupId(dto.groupId, userId);
        const typePrefix = componentType === 'microcode' ? 'mc' : 'mv';
        const tierSuffix = generationTier === 'lite' ? 'lite' : 'max';
        const sessionId = `${typePrefix}-${tierSuffix}-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        if (generationTier === 'max') {
            const parsed = (0, figma_url_parser_js_1.parseFigmaUrl)(dto.figmaUrl);
            if (!parsed.fileKey || !parsed.nodeId) {
                throw new common_1.HttpException('Max 完整生成需要包含 node-id 的有效 Figma 链接', common_1.HttpStatus.BAD_REQUEST);
            }
            const phase2Dto = new generate_phase2_dto_1.GeneratePhase2Dto();
            phase2Dto.componentName = dto.componentName || sessionId;
            phase2Dto.componentId = sessionId;
            phase2Dto.fileKey = parsed.fileKey;
            phase2Dto.nodeId = parsed.nodeId;
            phase2Dto.groupId = groupId;
            phase2Dto.target = componentType;
            phase2Dto.requirementDoc = dto.requirementDoc;
            phase2Dto.previewToken = dto.previewToken;
            phase2Dto.panelType = dto.panelType;
            phase2Dto.userComponentId = dto.userComponentId;
            phase2Dto.extraPrompt = dto.extraPrompt;
            phase2Dto.requirementDocText = dto.requirementDocText;
            phase2Dto.config = dto.config;
            if (Array.isArray(dto.themeNodes) && dto.themeNodes.length > 0) {
                phase2Dto.themeNodes = dto.themeNodes;
            }
            this.tasksService.createTask(sessionId, {
                componentId: sessionId,
                componentName: dto.componentName || sessionId,
                themeNodes: dto.themeNodes,
                target: componentType,
                groupId,
                panelKey: dto.panelType || 'default-panel',
                taskType: 'component',
                userId,
                generationTier: 'max',
                sourceType: 'figma',
                outputPath: (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, sessionId),
                extraPrompt: dto.extraPrompt,
                requirementDocText: dto.requirementDocText,
                userComponentId: dto.userComponentId,
            }, 'queued');
            const executeMaxGeneration = async () => {
                try {
                    this.tasksService.updateTask(sessionId, { status: 'running' });
                    await this.phase2Service.startGeneration(sessionId, phase2Dto, groupId, userId);
                    this.tasksService.updateTask(sessionId, {
                        generationTier: 'max',
                        sourceType: 'figma',
                    });
                }
                catch (err) {
                    this.logger.error(`Max 任务启动失败 ${sessionId}: ${err?.message}`);
                    const task = this.tasksService.getTask(sessionId);
                    if (task?.status !== 'failed' && task?.status !== 'cancelled') {
                        await this.progressService.sendError(sessionId, {
                            code: 'INTERNAL_ERROR',
                            message: err?.message || 'Max 生成失败',
                        });
                    }
                    else if (this.queueService) {
                        await this.queueService.markTaskFailed(sessionId);
                    }
                }
            };
            if (this.queueService && this.queueService.getAvailableSlots(userId) <= 0) {
                const enqueueResult = await this.queueService.enqueue({
                    sessionId,
                    componentId: sessionId,
                    componentName: dto.componentName || sessionId,
                    target: componentType,
                    groupId,
                    userId,
                }, 'concurrency_full', executeMaxGeneration);
                return {
                    success: true,
                    sessionId,
                    sourceType,
                    componentType,
                    generationTier,
                    queued: true,
                    queuePosition: enqueueResult.queuePosition,
                    message: `并发已满，任务已加入等待队列（位置: ${enqueueResult.queuePosition}）`,
                };
            }
            if (this.queueService) {
                this.queueService.registerRunning(sessionId, userId);
            }
            executeMaxGeneration();
            return {
                success: true,
                sessionId,
                sourceType,
                componentType,
                generationTier,
                queued: false,
                message: 'Max 完整生成任务已进入 Phase2 管线',
            };
        }
        let rateLimitReason;
        let quotaInfo = {};
        if (this.quotaService && userId) {
            const quotaStatus = await this.quotaService.checkQuotaStatus(userId);
            if (!quotaStatus.allowed) {
                rateLimitReason = quotaStatus.reason === 'QUOTA_HOURLY_EXCEEDED'
                    ? 'USER_HOURLY_QUOTA'
                    : 'USER_DAILY_QUOTA';
                quotaInfo = {
                    quotaResetAt: quotaStatus.quotaResetAt,
                    waitMinutes: quotaStatus.waitMinutes,
                    message: quotaStatus.message,
                };
            }
        }
        this.tasksService.createTask(sessionId, {
            componentId: sessionId,
            componentName: dto.componentName || sessionId,
            target: componentType,
            groupId,
            panelKey: dto.panelType || 'default-panel',
            taskType: 'component',
            userId,
            rateLimitReason,
            generationTier,
            sourceType,
            ...(sourceType === 'figma' && dto.previewWidth && dto.previewHeight
                ? {
                    figmaDimensions: {
                        width: Math.round(dto.previewWidth),
                        height: Math.round(dto.previewHeight),
                    },
                }
                : {}),
            outputPath: (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, sessionId),
            extraPrompt: dto.extraPrompt,
            requirementDocText: dto.requirementDocText,
            userComponentId: dto.userComponentId,
        }, 'queued');
        const executeGeneration = async () => {
            try {
                this.tasksService.updateTask(sessionId, { status: 'running' });
                const result = await this.liteService.startGeneration(sessionId, dto, groupId, userId, {
                    sourceType,
                    componentType,
                    generationTier,
                });
                if (result === false) {
                    if (this.queueService) {
                        await this.queueService.markTaskFailed(sessionId);
                    }
                    return;
                }
                if (this.quotaService && userId) {
                    await this.quotaService.recordSuccess(userId, sessionId);
                }
                if (this.queueService) {
                    await this.queueService.markTaskCompleted(sessionId);
                }
            }
            catch (err) {
                this.logger.error(`Lite 任务失败 ${sessionId}: ${err?.message}`);
                const task = this.tasksService.getTask(sessionId);
                if (task?.status !== 'failed' && task?.status !== 'cancelled') {
                    this.progressService.sendError(sessionId, {
                        code: lite_constants_1.LiteErrorCode.INTERNAL_ERROR,
                        message: err?.message || lite_constants_1.LITE_ERROR_MESSAGES[lite_constants_1.LiteErrorCode.INTERNAL_ERROR],
                    });
                }
                if (this.queueService) {
                    await this.queueService.markTaskFailed(sessionId);
                }
            }
        };
        if (rateLimitReason) {
            if (this.queueService) {
                const enqueueResult = await this.queueService.enqueue({
                    sessionId,
                    componentId: sessionId,
                    componentName: dto.componentName || sessionId,
                    target: componentType,
                    groupId,
                    userId,
                }, 'quota_exceeded', executeGeneration);
                return {
                    success: true,
                    sessionId,
                    sourceType,
                    componentType,
                    generationTier,
                    queued: true,
                    queuePosition: enqueueResult.queuePosition,
                    rateLimitReason,
                    quotaResetAt: quotaInfo.quotaResetAt,
                    waitMinutes: quotaInfo.waitMinutes,
                    message: quotaInfo.message || '任务已加入等待队列',
                };
            }
            else {
                throw new common_1.HttpException({
                    code: rateLimitReason,
                    message: quotaInfo.message,
                    quotaResetAt: quotaInfo.quotaResetAt,
                    waitMinutes: quotaInfo.waitMinutes,
                }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
        }
        if (this.queueService) {
            const availableSlots = this.queueService.getAvailableSlots(userId);
            if (availableSlots > 0) {
                this.queueService.registerRunning(sessionId, userId);
                this.tasksService.updateTask(sessionId, { status: 'running' });
                executeGeneration().catch(() => {
                });
                return {
                    success: true,
                    sessionId,
                    sourceType,
                    componentType,
                    generationTier,
                    queued: false,
                    message: hasFigma
                        ? 'Figma 组件生成任务已开始'
                        : hasHtml
                            ? 'HTML 组件生成任务已开始'
                            : 'Lite 生成任务已开始',
                };
            }
            else {
                const enqueueResult = await this.queueService.enqueue({
                    sessionId,
                    componentId: sessionId,
                    componentName: dto.componentName || sessionId,
                    target: componentType,
                    groupId,
                    userId,
                }, 'concurrency_full', executeGeneration);
                this.tasksService.updateTask(sessionId, {
                    rateLimitReason: 'PLATFORM_QUEUE',
                });
                return {
                    success: true,
                    sessionId,
                    sourceType,
                    componentType,
                    generationTier,
                    queued: true,
                    queuePosition: enqueueResult.queuePosition,
                    rateLimitReason: 'PLATFORM_QUEUE',
                    message: enqueueResult.message,
                };
            }
        }
        this.tasksService.updateTask(sessionId, { status: 'running' });
        executeGeneration().catch(() => {
        });
        return {
            success: true,
            sessionId,
            sourceType,
            componentType,
            generationTier,
            queued: false,
            message: hasFigma
                ? 'Figma 组件生成任务已开始'
                : hasHtml
                    ? 'HTML 组件生成任务已开始'
                    : 'Lite 生成任务已开始',
        };
    }
};
exports.LiteController = LiteController;
__decorate([
    (0, common_1.Post)('retry/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], LiteController.prototype, "retryFromCache", null);
__decorate([
    (0, common_1.Post)('upgrade-assets/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], LiteController.prototype, "upgradeAssets", null);
__decorate([
    (0, common_1.Post)('analyze'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LiteController.prototype, "analyzeHtml", null);
__decorate([
    (0, common_1.Post)('generate-split'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], LiteController.prototype, "generateSplit", null);
__decorate([
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_lite_dto_1.GenerateLiteDto, Object]),
    __metadata("design:returntype", Promise)
], LiteController.prototype, "generate", null);
exports.LiteController = LiteController = LiteController_1 = __decorate([
    (0, common_1.Controller)('lite'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(5, (0, common_1.Optional)()),
    __param(5, (0, common_1.Inject)(quota_service_1.QuotaService)),
    __param(6, (0, common_1.Optional)()),
    __param(6, (0, common_1.Inject)(task_queue_service_1.TaskQueueService)),
    __metadata("design:paramtypes", [lite_service_1.LiteService,
        html_split_service_1.HtmlSplitService,
        phase2_service_1.Phase2Service,
        tasks_service_1.TasksService,
        progress_service_1.ProgressService,
        quota_service_1.QuotaService,
        task_queue_service_1.TaskQueueService])
], LiteController);
//# sourceMappingURL=lite.controller.js.map