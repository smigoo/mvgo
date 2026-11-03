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
var Vue3Controller_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vue3Controller = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const vue3_service_1 = require("./vue3.service");
const generate_vue3_dto_1 = require("./dto/generate-vue3.dto");
const analyze_slots_dto_1 = require("./dto/analyze-slots.dto");
const analyze_from_doc_dto_1 = require("./dto/analyze-from-doc.dto");
const bind_api_dto_1 = require("./dto/bind-api.dto");
const slot_analyzer_service_1 = require("./slot-analyzer.service");
const doc_analyzer_service_1 = require("./doc-analyzer.service");
const api_binding_service_1 = require("./api-binding.service");
const quota_service_1 = require("../quota/quota.service");
const task_queue_service_1 = require("../queue/task-queue.service");
const tasks_service_1 = require("../tasks/tasks.service");
const session_guard_1 = require("../auth/session.guard");
let Vue3Controller = Vue3Controller_1 = class Vue3Controller {
    vue3Service;
    slotAnalyzer;
    docAnalyzer;
    apiBindingService;
    quotaService;
    queueService;
    tasksService;
    logger = new common_1.Logger(Vue3Controller_1.name);
    constructor(vue3Service, slotAnalyzer, docAnalyzer, apiBindingService, quotaService, queueService, tasksService) {
        this.vue3Service = vue3Service;
        this.slotAnalyzer = slotAnalyzer;
        this.docAnalyzer = docAnalyzer;
        this.apiBindingService = apiBindingService;
        this.quotaService = quotaService;
        this.queueService = queueService;
        this.tasksService = tasksService;
    }
    onModuleInit() {
        this.queueService.registerRestoreExecutor(async (task) => {
            if (task.target !== 'vue3')
                return false;
            if (!task.fileKey || !task.nodeId) {
                this.logger.warn(`跳过 vue3 任务恢复（fileKey/nodeId 为空）: ${task.sessionId} (fileKey=${task.fileKey}, nodeId=${task.nodeId})`);
                return false;
            }
            try {
                const dto = new generate_vue3_dto_1.GenerateVue3Dto();
                dto.componentName = task.componentName || task.sessionId;
                dto.componentId = task.componentId || task.sessionId;
                dto.nodeId = task.nodeId;
                dto.fileKey = task.fileKey;
                dto.groupId = task.groupId || '';
                dto.panelType = task.panelKey || 'default-panel';
                if (task.configSnapshot) {
                    dto.config = {
                        outputPath: task.configSnapshot.outputPath,
                        ...task.configSnapshot,
                    };
                }
                await this.vue3Service.startGeneration(task.sessionId, dto, task.groupId || '', task.userId);
                return true;
            }
            catch (error) {
                this.logger.error(`恢复 vue3 任务失败: ${task.sessionId}`, error);
                return false;
            }
        });
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
        const sessionId = `mv-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        if (!dto.componentName) {
            dto.componentName = sessionId;
        }
        if (enqueueResult?.queued) {
            const queuedTask = this.tasksService.createTask(sessionId, {
                componentId: sessionId,
                componentName: dto.componentName,
                nodeId: dto.nodeId,
                fileKey: dto.fileKey,
                target: 'vue3',
                groupId: groupId,
                panelKey: 'default-panel',
                taskType: 'component',
                userId,
                generationTier: 'max',
                sourceType: 'figma',
                enqueuedAt: Date.now(),
                quotaResetAt: enqueueResult.quotaResetAt,
                queuePriority: 0,
            }, 'queued');
            await this.queueService.enqueue(queuedTask, 'quota_exceeded', async () => {
                await this.vue3Service.startGeneration(sessionId, dto, groupId, userId);
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
        const availableSlots = await this.queueService.getAvailableSlots(userId);
        if (availableSlots <= 0) {
            this.logger.log(`[Vue3] 无可用并发槽位，任务进入等待队列: ${sessionId}`);
            const queuedTask = this.tasksService.createTask(sessionId, {
                componentId: sessionId,
                componentName: dto.componentName,
                nodeId: dto.nodeId,
                fileKey: dto.fileKey,
                target: 'vue3',
                groupId: groupId,
                panelKey: 'default-panel',
                taskType: 'component',
                userId,
                generationTier: 'max',
                sourceType: 'figma',
                enqueuedAt: Date.now(),
                queuePriority: 0,
            }, 'queued');
            await this.queueService.enqueue(queuedTask, 'concurrency_full', async () => {
                await this.vue3Service.startGeneration(sessionId, dto, groupId, userId);
            });
            return {
                success: true,
                sessionId,
                queued: true,
                message: '当前并发任务数已满，任务已加入等待队列，将自动排队执行',
                queue: {
                    reason: 'concurrency_full',
                },
            };
        }
        await this.queueService.registerRunning(sessionId, userId);
        const task = this.tasksService.createTask(sessionId, {
            componentId: sessionId,
            componentName: dto.componentName,
            nodeId: dto.nodeId,
            fileKey: dto.fileKey,
            target: 'vue3',
            groupId: groupId,
            panelKey: 'default-panel',
            taskType: 'component',
            userId,
            generationTier: 'max',
            sourceType: 'figma',
        });
        this.vue3Service.startGeneration(sessionId, dto, groupId, userId);
        return {
            success: true,
            sessionId,
            message: 'Vue3 生成任务已开始',
        };
    }
    async analyzeSlots(dto) {
        try {
            const result = await this.slotAnalyzer.analyzeSlots(dto.componentId, dto.groupId);
            return { success: true, ...result };
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                this.logger.warn(`[analyzeSlots] SFC 未找到，降级为空 slots: ${error.message}`);
                return {
                    success: true,
                    slots: [],
                    notice: '组件源码尚未落盘，接口对接将在组件生成完成后可用',
                };
            }
            this.logger.error(`[analyzeSlots] ${error.message}`);
            throw new common_1.HttpException({ success: false, error: error.message, slots: [] }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async analyzeFromDoc(dto) {
        try {
            const result = await this.docAnalyzer.analyzeFromDoc(dto);
            return result;
        }
        catch (error) {
            this.logger.error(`[analyzeFromDoc] ${error.message}`);
            throw new common_1.HttpException({
                success: false,
                error: error.message,
                bindings: [],
                summary: `分析失败: ${error.message}`,
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async bindApi(dto) {
        try {
            const result = await this.apiBindingService.bindApi(dto);
            return result;
        }
        catch (error) {
            this.logger.error(`[bindApi] ${error.message}`);
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException({ success: false, error: error.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    getBindings(componentId) {
        if (!componentId) {
            return { success: false, error: '缺少 componentId 参数' };
        }
        const bindings = this.apiBindingService.getBindings(componentId);
        return { success: true, bindings };
    }
    getBinding(bindingId) {
        const binding = this.apiBindingService.getBinding(bindingId);
        if (!binding) {
            return { success: false, error: '绑定记录不存在' };
        }
        return { success: true, binding };
    }
    async unbind(bindingId) {
        try {
            const result = await this.apiBindingService.unbind(bindingId);
            return result;
        }
        catch (error) {
            this.logger.error(`[unbind] ${error.message}`);
            if (error instanceof common_1.HttpException)
                throw error;
            throw new common_1.HttpException({ success: false, error: error.message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.Vue3Controller = Vue3Controller;
__decorate([
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_vue3_dto_1.GenerateVue3Dto, Object]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "generate", null);
__decorate([
    (0, common_1.Post)('analyze-slots'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [analyze_slots_dto_1.AnalyzeSlotsDto]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "analyzeSlots", null);
__decorate([
    (0, common_1.Post)('analyze-from-doc'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [analyze_from_doc_dto_1.AnalyzeFromDocDto]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "analyzeFromDoc", null);
__decorate([
    (0, common_1.Post)('bind-api'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bind_api_dto_1.BindApiDto]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "bindApi", null);
__decorate([
    (0, common_1.Get)('bindings'),
    __param(0, (0, common_1.Query)('componentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], Vue3Controller.prototype, "getBindings", null);
__decorate([
    (0, common_1.Get)('bindings/:bindingId'),
    __param(0, (0, common_1.Param)('bindingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], Vue3Controller.prototype, "getBinding", null);
__decorate([
    (0, common_1.Post)('bindings/:bindingId/delete'),
    __param(0, (0, common_1.Param)('bindingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], Vue3Controller.prototype, "unbind", null);
exports.Vue3Controller = Vue3Controller = Vue3Controller_1 = __decorate([
    (0, common_1.Controller)('vue3'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [vue3_service_1.Vue3Service,
        slot_analyzer_service_1.SlotAnalyzerService,
        doc_analyzer_service_1.DocAnalyzerService,
        api_binding_service_1.ApiBindingService,
        quota_service_1.QuotaService,
        task_queue_service_1.TaskQueueService,
        tasks_service_1.TasksService])
], Vue3Controller);
//# sourceMappingURL=vue3.controller.js.map