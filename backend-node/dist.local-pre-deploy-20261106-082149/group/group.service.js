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
exports.GroupService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const group_schema_1 = require("../schemas/group.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
const permission_constants_1 = require("../auth/permission.constants");
const constants_1 = require("../common/constants");
let GroupService = class GroupService {
    groupModel;
    groupMemberModel;
    constructor(groupModel, groupMemberModel) {
        this.groupModel = groupModel;
        this.groupMemberModel = groupMemberModel;
    }
    async createGroup(name, description, adminId) {
        const group = new this.groupModel({
            name,
            description,
            adminId,
        });
        await group.save();
        await this.groupMemberModel.create({
            groupId: group._id,
            userId: adminId,
            role: constants_1.ROLES.ADMIN,
        });
        return group;
    }
    async getUserGroups(userId) {
        const memberships = await this.groupMemberModel
            .find({ userId })
            .populate('groupId')
            .exec();
        return memberships.map((m) => ({
            ...m.groupId.toObject(),
            role: m.role,
            joinedAt: m.joinedAt,
        }));
    }
    async getGroupDetails(groupId, userId) {
        const group = await this.groupModel.findById(groupId);
        if (!group) {
            throw new common_1.NotFoundException('群组不存在');
        }
        const membership = await this.groupMemberModel.findOne({ groupId, userId });
        if (!membership) {
            throw new common_1.ForbiddenException('无权访问该群组');
        }
        const members = await this.groupMemberModel
            .find({ groupId })
            .populate('userId', 'username email')
            .exec();
        return {
            ...group.toObject(),
            members: members.map((m) => ({
                id: m.userId._id,
                username: m.userId.username,
                email: m.userId.email,
                role: m.role,
                joinedAt: m.joinedAt,
            })),
            userRole: membership.role,
        };
    }
    async inviteUser(groupId, targetUserId, adminId) {
        await this.checkAdminPermission(groupId, adminId);
        const existing = await this.groupMemberModel.findOne({
            groupId,
            userId: targetUserId,
        });
        if (existing) {
            throw new common_1.ConflictException('用户已是群组成员');
        }
        await this.groupMemberModel.create({
            groupId,
            userId: targetUserId,
            role: constants_1.ROLES.MEMBER,
        });
    }
    async removeMember(groupId, targetUserId, adminId) {
        await this.checkAdminPermission(groupId, adminId);
        const result = await this.groupMemberModel.deleteOne({
            groupId,
            userId: targetUserId,
        });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('成员不存在');
        }
    }
    async updateGroup(groupId, name, description, adminId) {
        await this.checkAdminPermission(groupId, adminId);
        const group = await this.groupModel.findByIdAndUpdate(groupId, { name, description }, { returnDocument: 'after' });
        if (!group) {
            throw new common_1.NotFoundException('群组不存在');
        }
        return group;
    }
    async deleteGroup(groupId, userId) {
        const group = await this.groupModel.findById(groupId);
        if (!group) {
            throw new common_1.NotFoundException('群组不存在');
        }
        if (group.adminId.toString() !== userId) {
            throw new common_1.ForbiddenException('只有创建者可以删除群组');
        }
        await this.groupMemberModel.deleteMany({ groupId });
        await this.groupModel.findByIdAndDelete(groupId);
    }
    async checkAdminPermission(groupId, userId) {
        const membership = await this.groupMemberModel.findOne({ groupId, userId });
        if (!membership || membership.role !== constants_1.ROLES.ADMIN) {
            throw new common_1.ForbiddenException('需要管理员权限');
        }
    }
    async updateMemberPermissions(groupId, userId, permissions) {
        const membership = await this.groupMemberModel.findOne({ groupId, userId });
        if (!membership) {
            throw new common_1.NotFoundException('成员不存在');
        }
        if (membership.role === constants_1.ROLES.ADMIN) {
            throw new common_1.BadRequestException('管理员自动拥有全部权限，无需分配');
        }
        const invalid = permissions.filter((p) => !permission_constants_1.ALL_PERMISSIONS.includes(p));
        if (invalid.length > 0) {
            throw new common_1.BadRequestException(`无效的权限码: ${invalid.join(', ')}`);
        }
        membership.permissions = permissions;
        await membership.save();
    }
    async getMemberPermissions(groupId, userId) {
        const membership = await this.groupMemberModel.findOne({ groupId, userId }).lean();
        if (!membership) {
            throw new common_1.NotFoundException('成员不存在');
        }
        if (membership.role === constants_1.ROLES.ADMIN) {
            return permission_constants_1.ALL_PERMISSIONS;
        }
        return membership.permissions || [];
    }
};
exports.GroupService = GroupService;
exports.GroupService = GroupService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(group_schema_1.Group.name)),
    __param(1, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], GroupService);
//# sourceMappingURL=group.service.js.map