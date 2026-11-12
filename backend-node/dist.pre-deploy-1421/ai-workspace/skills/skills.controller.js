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
var AiSkillsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiSkillsController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../../auth/session.guard");
const skills_service_1 = require("./skills.service");
let AiSkillsController = AiSkillsController_1 = class AiSkillsController {
    skillsService;
    logger = new common_1.Logger(AiSkillsController_1.name);
    constructor(skillsService) {
        this.skillsService = skillsService;
    }
    async findAll() {
        const skills = await this.skillsService.findAll();
        return { data: skills };
    }
};
exports.AiSkillsController = AiSkillsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiSkillsController.prototype, "findAll", null);
exports.AiSkillsController = AiSkillsController = AiSkillsController_1 = __decorate([
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.Controller)('skills'),
    __metadata("design:paramtypes", [skills_service_1.AiSkillsService])
], AiSkillsController);
//# sourceMappingURL=skills.controller.js.map