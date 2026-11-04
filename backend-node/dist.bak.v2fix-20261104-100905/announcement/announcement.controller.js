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
exports.AnnouncementController = void 0;
const common_1 = require("@nestjs/common");
const announcement_service_1 = require("./announcement.service");
const session_guard_1 = require("../auth/session.guard");
let AnnouncementController = class AnnouncementController {
    announcementService;
    constructor(announcementService) {
        this.announcementService = announcementService;
    }
    async create(body, req) {
        const data = {
            ...body,
            publishAt: body.publishAt ? new Date(body.publishAt) : new Date(),
            expireAt: body.expireAt ? new Date(body.expireAt) : undefined,
            author: req.session?.username || 'anonymous',
        };
        return this.announcementService.create(data);
    }
    async findAllForAdmin(page, pageSize, active, keyword) {
        return this.announcementService.findAllForAdmin({
            page: page ? parseInt(page) : 1,
            pageSize: pageSize ? parseInt(pageSize) : 20,
            active: active !== undefined ? active === 'true' : undefined,
            keyword,
        });
    }
    async findActiveForUser() {
        return this.announcementService.findActiveForUser();
    }
    async findById(id) {
        return this.announcementService.findById(id);
    }
    async update(id, body) {
        const data = { ...body };
        if (body.publishAt) {
            data.publishAt = new Date(body.publishAt);
        }
        if (body.expireAt) {
            data.expireAt = new Date(body.expireAt);
        }
        return this.announcementService.update(id, data);
    }
    async delete(id) {
        return this.announcementService.delete(id);
    }
    async toggleActive(id) {
        return this.announcementService.toggleActive(id);
    }
};
exports.AnnouncementController = AnnouncementController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AnnouncementController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('admin'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __param(2, (0, common_1.Query)('active')),
    __param(3, (0, common_1.Query)('keyword')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AnnouncementController.prototype, "findAllForAdmin", null);
__decorate([
    (0, common_1.Get)('active'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnnouncementController.prototype, "findActiveForUser", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnnouncementController.prototype, "findById", null);
__decorate([
    (0, common_1.Post)(':id/update'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AnnouncementController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/delete'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnnouncementController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':id/toggle'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnnouncementController.prototype, "toggleActive", null);
exports.AnnouncementController = AnnouncementController = __decorate([
    (0, common_1.Controller)('announcements'),
    __metadata("design:paramtypes", [announcement_service_1.AnnouncementService])
], AnnouncementController);
//# sourceMappingURL=announcement.controller.js.map