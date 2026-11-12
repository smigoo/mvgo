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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../auth/session.guard");
const workflow_service_1 = require("./workflow.service");
let WorkflowController = class WorkflowController {
    workflowService;
    constructor(workflowService) {
        this.workflowService = workflowService;
    }
    async getMetaHandlers() {
        const handlers = this.workflowService.getHandlers();
        const nodeTypes = this.workflowService.getNodeTypes();
        const { listDynamicAgentDefs } = await import('../agent-builder/dynamic-loader.js');
        const dynamicDefs = await listDynamicAgentDefs();
        const dynamicEntries = {};
        for (const def of dynamicDefs) {
            if (!def || !def.name)
                continue;
            dynamicEntries[def.name] = {
                label: def.label || def.name,
                description: def.description || '',
                category: def.category || '自定义',
                configSchema: {},
                logicType: def.logicType || 'tool',
                templateId: def.templateId || '',
                author: def.author,
                isDynamic: true,
                inputs: (def.inputs || []).map((i) => i.key),
                outputs: (def.outputs || []).map((o) => o.key),
            };
        }
        const builtinMap = handlers.handlers || handlers;
        const merged = {
            ...builtinMap,
            ...dynamicEntries,
        };
        return {
            success: true,
            data: {
                handlers: merged,
                nodeTypes,
            },
        };
    }
    getGraphTopology(type) {
        return this.workflowService.getGraphTopology(type);
    }
    async listWorkflows() {
        return this.workflowService.list();
    }
    getNodeSnapshots(sessionId) {
        return this.workflowService.getNodeSnapshots(sessionId);
    }
    async getWorkflow(name) {
        return this.workflowService.get(name);
    }
    async saveWorkflow(workflow) {
        return this.workflowService.save(workflow);
    }
    async loadWorkflow(body) {
        return this.workflowService.get(body.name);
    }
    async deleteWorkflow(name) {
        return this.workflowService.delete(name);
    }
    async runWorkflow(name, params, req) {
        const userId = req.session?.userId;
        return this.workflowService.run(name, params, userId);
    }
};
exports.WorkflowController = WorkflowController;
__decorate([
    (0, common_1.Get)('meta/handlers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "getMetaHandlers", null);
__decorate([
    (0, common_1.Get)('graph/:type'),
    __param(0, (0, common_1.Param)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "getGraphTopology", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "listWorkflows", null);
__decorate([
    (0, common_1.Get)(':sessionId/nodes'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "getNodeSnapshots", null);
__decorate([
    (0, common_1.Get)(':name'),
    __param(0, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "getWorkflow", null);
__decorate([
    (0, common_1.Post)('save'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "saveWorkflow", null);
__decorate([
    (0, common_1.Post)('load'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "loadWorkflow", null);
__decorate([
    (0, common_1.Post)(':name/delete'),
    __param(0, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "deleteWorkflow", null);
__decorate([
    (0, common_1.Post)(':name/run'),
    __param(0, (0, common_1.Param)('name')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], WorkflowController.prototype, "runWorkflow", null);
exports.WorkflowController = WorkflowController = __decorate([
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.Controller)('workflows'),
    __metadata("design:paramtypes", [workflow_service_1.WorkflowService])
], WorkflowController);
//# sourceMappingURL=workflow.controller.js.map