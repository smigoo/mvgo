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
exports.AgentBuilderController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../auth/session.guard");
const platform_express_1 = require("@nestjs/platform-express");
const agent_builder_service_1 = require("./agent-builder.service");
const tool_templates_js_1 = require("./templates/tool-templates.js");
const llm_templates_js_1 = require("./templates/llm-templates.js");
let AgentBuilderController = class AgentBuilderController {
    agentBuilderService;
    constructor(agentBuilderService) {
        this.agentBuilderService = agentBuilderService;
    }
    upload(file) {
        return this.agentBuilderService.uploadResource(file);
    }
    create(dto, userId) {
        return this.agentBuilderService.create(dto, userId);
    }
    feedback(body, userId) {
        return this.agentBuilderService.submitFeedback(body, userId);
    }
    test(body) {
        return this.agentBuilderService.testAgent(body?.name, body?.input);
    }
    list() {
        return this.agentBuilderService.list();
    }
    templates() {
        const pick = (t) => Object.values(t).map((x) => ({
            id: x.id,
            label: x.label,
            description: x.description,
            resources: x.resources || null,
        }));
        return {
            success: true,
            data: {
                tool: pick(tool_templates_js_1.TOOL_TEMPLATES),
                llm: pick(llm_templates_js_1.LLM_TEMPLATES),
            },
        };
    }
    remove(name, userId) {
        return this.agentBuilderService.remove(name, userId);
    }
};
exports.AgentBuilderController = AgentBuilderController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AgentBuilderController.prototype, "upload", null);
__decorate([
    (0, common_1.Post)('create'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AgentBuilderController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('feedback'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AgentBuilderController.prototype, "feedback", null);
__decorate([
    (0, common_1.Post)('test'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AgentBuilderController.prototype, "test", null);
__decorate([
    (0, common_1.Get)('list'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AgentBuilderController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('templates'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AgentBuilderController.prototype, "templates", null);
__decorate([
    (0, common_1.Post)(':name/delete'),
    __param(0, (0, common_1.Param)('name')),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AgentBuilderController.prototype, "remove", null);
exports.AgentBuilderController = AgentBuilderController = __decorate([
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.Controller)('agent-builder'),
    __metadata("design:paramtypes", [agent_builder_service_1.AgentBuilderService])
], AgentBuilderController);
//# sourceMappingURL=agent-builder.controller.js.map