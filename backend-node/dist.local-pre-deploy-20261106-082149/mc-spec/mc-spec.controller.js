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
exports.McSpecController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const mc_spec_service_1 = require("./mc-spec.service");
const admin_service_1 = require("../admin/admin.service");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let McSpecController = class McSpecController {
    svc;
    adminService;
    constructor(svc, adminService) {
        this.svc = svc;
        this.adminService = adminService;
    }
    async listSkills() {
        return { success: true, skills: this.svc.listSkills() };
    }
    async check(body, userId) {
        const componentId = String(body?.componentId || '').trim();
        if (!componentId) {
            throw new common_1.HttpException('缺少 componentId', common_1.HttpStatus.BAD_REQUEST);
        }
        const skillId = String(body?.skillId || '').trim() || undefined;
        const result = await this.svc.checkComponent(componentId, skillId);
        return { success: true, userId, result };
    }
    async uploadSkill(file, body, userId) {
        await this.adminService.assertAdmin(userId);
        if (!file?.buffer?.length) {
            throw new common_1.HttpException('缺少上传文件 file（zip）', common_1.HttpStatus.BAD_REQUEST);
        }
        const overwrite = String(body?.overwrite ?? '') === 'true' || body?.overwrite === true;
        const skill = await this.svc.installSkillFromZip(file.buffer, {
            skillId: String(body?.skillId || '').trim() || undefined,
            overwrite,
            fileName: file.originalname,
        });
        return { success: true, skill };
    }
    async removeSkill(skillId, userId) {
        await this.adminService.assertAdmin(userId);
        return { success: true, ...this.svc.removeSkill(skillId) };
    }
    async scoreQuality(body, userId) {
        await this.adminService.assertAdmin(userId);
        const componentId = String(body?.componentId || '').trim();
        if (!componentId) {
            throw new common_1.HttpException('缺少 componentId', common_1.HttpStatus.BAD_REQUEST);
        }
        const persist = body?.persist !== false && body?.persist !== 'false';
        const result = await this.svc.scoreQualityV1(componentId, { persist });
        return { success: true, result };
    }
    async readQuality(componentId, userId) {
        await this.adminService.assertAdmin(userId);
        const result = await this.svc.readQualityV1(componentId);
        return { success: true, result };
    }
    async fixQuality(body, userId) {
        await this.adminService.assertAdmin(userId);
        const componentId = String(body?.componentId || '').trim();
        if (!componentId) {
            throw new common_1.HttpException('缺少 componentId', common_1.HttpStatus.BAD_REQUEST);
        }
        const dimensions = Array.isArray(body?.dimensions) ? body.dimensions : undefined;
        const result = await this.svc.fixQualityIssues(componentId, { dimensions });
        return { success: true, result };
    }
    async report(componentId, stamp, res) {
        const p = this.svc.resolveReportPath(componentId, stamp);
        if (!p) {
            throw new common_1.HttpException('报告不存在', common_1.HttpStatus.NOT_FOUND);
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-store');
        return res.sendFile(p);
    }
};
exports.McSpecController = McSpecController;
__decorate([
    (0, common_1.Get)('skills'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], McSpecController.prototype, "listSkills", null);
__decorate([
    (0, common_1.Post)('check'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], McSpecController.prototype, "check", null);
__decorate([
    (0, common_1.Post)('skills'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 10 * 1024 * 1024 } })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], McSpecController.prototype, "uploadSkill", null);
__decorate([
    (0, common_1.Post)('skills/:skillId/delete'),
    __param(0, (0, common_1.Param)('skillId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], McSpecController.prototype, "removeSkill", null);
__decorate([
    (0, common_1.Post)('quality-score'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], McSpecController.prototype, "scoreQuality", null);
__decorate([
    (0, common_1.Get)('quality-score/:componentId'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], McSpecController.prototype, "readQuality", null);
__decorate([
    (0, common_1.Post)('quality-fix'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], McSpecController.prototype, "fixQuality", null);
__decorate([
    (0, common_1.Get)('report/:componentId/:stamp'),
    __param(0, (0, common_1.Param)('componentId')),
    __param(1, (0, common_1.Param)('stamp')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], McSpecController.prototype, "report", null);
exports.McSpecController = McSpecController = __decorate([
    (0, common_1.Controller)('mc-spec'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [mc_spec_service_1.McSpecService,
        admin_service_1.AdminService])
], McSpecController);
//# sourceMappingURL=mc-spec.controller.js.map