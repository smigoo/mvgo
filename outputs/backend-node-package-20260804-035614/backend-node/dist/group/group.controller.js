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
exports.GroupController = void 0;
const common_1 = require("@nestjs/common");
const group_service_1 = require("./group.service");
const session_guard_1 = require("../auth/session.guard");
const permissions_guard_1 = require("../auth/permissions.guard");
const permissions_decorator_1 = require("../auth/permissions.decorator");
const permission_constants_1 = require("../auth/permission.constants");
let GroupController = class GroupController {
    groupService;
    constructor(groupService) {
        this.groupService = groupService;
    }
    async createGroup(body, session) {
        const group = await this.groupService.createGroup(body.name, body.description || '', session.userId);
        return {
            success: true,
            message: '群组创建成功',
            group,
        };
    }
    async getUserGroups(session) {
        const groups = await this.groupService.getUserGroups(session.userId);
        return {
            success: true,
            groups,
        };
    }
    async getGroupDetails(groupId, session) {
        const group = await this.groupService.getGroupDetails(groupId, session.userId);
        return {
            success: true,
            group,
        };
    }
    async inviteUser(groupId, body, session) {
        await this.groupService.inviteUser(groupId, body.userId, session.userId);
        return {
            success: true,
            message: '邀请成功',
        };
    }
    async removeMember(groupId, userId, session) {
        await this.groupService.removeMember(groupId, userId, session.userId);
        return {
            success: true,
            message: '成员已移除',
        };
    }
    async updateGroup(groupId, body, session) {
        const group = await this.groupService.updateGroup(groupId, body.name, body.description || '', session.userId);
        return {
            success: true,
            message: '群组信息已更新',
            group,
        };
    }
    async deleteGroup(groupId, session) {
        await this.groupService.deleteGroup(groupId, session.userId);
        return {
            success: true,
            message: '群组已删除',
        };
    }
    async updateMemberPermissions(groupId, userId, body) {
        if (!Array.isArray(body.permissions)) {
            throw new common_1.BadRequestException('permissions 必须是数组');
        }
        await this.groupService.updateMemberPermissions(groupId, userId, body.permissions);
        return {
            success: true,
            message: '权限更新成功',
        };
    }
    async getMemberPermissions(groupId, userId) {
        const permissions = await this.groupService.getMemberPermissions(groupId, userId);
        return {
            success: true,
            permissions,
        };
    }
};
exports.GroupController = GroupController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "createGroup", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "getUserGroups", null);
__decorate([
    (0, common_1.Get)(':groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "getGroupDetails", null);
__decorate([
    (0, common_1.Post)(':groupId/invite'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "inviteUser", null);
__decorate([
    (0, common_1.Delete)(':groupId/members/:userId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Put)(':groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "updateGroup", null);
__decorate([
    (0, common_1.Delete)(':groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "deleteGroup", null);
__decorate([
    (0, common_1.Put)(':groupId/members/:userId/permissions'),
    (0, common_1.UseGuards)(permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.GROUP_MANAGE),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "updateMemberPermissions", null);
__decorate([
    (0, common_1.Get)(':groupId/members/:userId/permissions'),
    (0, common_1.UseGuards)(permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.Permissions)(permission_constants_1.PERMISSIONS.GROUP_MANAGE),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], GroupController.prototype, "getMemberPermissions", null);
exports.GroupController = GroupController = __decorate([
    (0, common_1.Controller)('group'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [group_service_1.GroupService])
], GroupController);
//# sourceMappingURL=group.controller.js.map