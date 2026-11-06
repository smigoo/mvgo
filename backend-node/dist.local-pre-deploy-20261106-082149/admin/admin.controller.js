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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../auth/session.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const admin_service_1 = require("./admin.service");
const list_components_dto_1 = require("../component/dto/list-components.dto");
const set_user_admin_dto_1 = require("./dto/set-user-admin.dto");
let AdminController = class AdminController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    async listAiConfigs(userId) {
        await this.adminService.assertAdmin(userId);
        const list = await this.adminService.listUserConfigs();
        return { success: true, list, total: list.length };
    }
    async listUsers(userId) {
        await this.adminService.assertAdmin(userId);
        const list = await this.adminService.listUsers();
        return { success: true, list, total: list.length };
    }
    async setUserAdmin(userId, id, body) {
        await this.adminService.assertAdmin(userId);
        await this.adminService.setUserAdmin(id, body.isAdmin);
        return { success: true };
    }
    async deleteUser(userId, id) {
        await this.adminService.assertAdmin(userId);
        const result = await this.adminService.deleteUser(userId, id);
        return { success: true, ...result };
    }
    async listComponents(userId, query) {
        await this.adminService.assertAdmin(userId);
        const data = await this.adminService.listComponents(query);
        return { success: true, ...data };
    }
    async usageExport(userId, preset, from, to, dept, format) {
        await this.adminService.assertAdmin(userId);
        const file = await this.adminService.buildUsageExport({ preset, from, to, dept, format });
        const encoded = encodeURIComponent(file.filename);
        return new common_1.StreamableFile(Buffer.from(file.body, 'utf-8'), {
            type: file.contentType,
            disposition: `attachment; filename="export"; filename*=UTF-8''${encoded}`,
        });
    }
    async deptReport(userId) {
        await this.adminService.assertAdmin(userId);
        const file = await this.adminService.buildDeptReport();
        const encoded = encodeURIComponent(file.filename);
        return new common_1.StreamableFile(Buffer.from(file.body, 'utf-8'), {
            type: file.contentType,
            disposition: `attachment; filename="report"; filename*=UTF-8''${encoded}`,
        });
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('ai-configs'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listAiConfigs", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Post)('users/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, set_user_admin_dto_1.SetUserAdminDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "setUserAdmin", null);
__decorate([
    (0, common_1.Post)('users/:id/delete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteUser", null);
__decorate([
    (0, common_1.Get)('components'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, list_components_dto_1.ListComponentsDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listComponents", null);
__decorate([
    (0, common_1.Get)('usage-export'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('preset')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __param(4, (0, common_1.Query)('dept')),
    __param(5, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "usageExport", null);
__decorate([
    (0, common_1.Get)('dept-report'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deptReport", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map