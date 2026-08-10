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
exports.JoinRequestService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const join_request_schema_1 = require("../schemas/join-request.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
const group_schema_1 = require("../schemas/group.schema");
let JoinRequestService = class JoinRequestService {
    joinRequestModel;
    groupMemberModel;
    groupModel;
    constructor(joinRequestModel, groupMemberModel, groupModel) {
        this.joinRequestModel = joinRequestModel;
        this.groupMemberModel = groupMemberModel;
        this.groupModel = groupModel;
    }
    async applyToJoin(groupId, userId, message) {
        const group = await this.groupModel.findById(groupId);
        if (!group) {
            throw new common_1.NotFoundException('群组不存在');
        }
        const existing = await this.groupMemberModel.findOne({ groupId, userId });
        if (existing) {
            throw new common_1.ConflictException('您已是该群组成员');
        }
        const pendingRequest = await this.joinRequestModel.findOne({
            groupId,
            userId,
            status: 'pending',
        });
        if (pendingRequest) {
            throw new common_1.ConflictException('您已提交过加入申请，请等待审核');
        }
        const joinRequest = new this.joinRequestModel({
            groupId,
            userId,
            message,
            status: 'pending',
        });
        await joinRequest.save();
        return joinRequest;
    }
    async getPendingRequests(groupId, adminId) {
        await this.checkAdminPermission(groupId, adminId);
        const requests = await this.joinRequestModel
            .find({ groupId, status: 'pending' })
            .populate('userId', 'username email')
            .sort({ createdAt: -1 })
            .exec();
        return requests.map((r) => ({
            id: r._id,
            user: {
                id: r.userId._id,
                username: r.userId.username,
                email: r.userId.email,
            },
            message: r.message,
            createdAt: r.createdAt,
        }));
    }
    async approveRequest(groupId, requestId, adminId) {
        await this.checkAdminPermission(groupId, adminId);
        const request = await this.joinRequestModel.findById(requestId);
        if (!request || request.groupId.toString() !== groupId) {
            throw new common_1.NotFoundException('申请不存在');
        }
        if (request.status !== 'pending') {
            throw new common_1.ConflictException('该申请已被处理');
        }
        await this.groupMemberModel.create({
            groupId,
            userId: request.userId,
            role: 'member',
        });
        request.status = 'approved';
        request.processedAt = new Date();
        request.processedBy = adminId;
        await request.save();
    }
    async rejectRequest(groupId, requestId, adminId) {
        await this.checkAdminPermission(groupId, adminId);
        const request = await this.joinRequestModel.findById(requestId);
        if (!request || request.groupId.toString() !== groupId) {
            throw new common_1.NotFoundException('申请不存在');
        }
        if (request.status !== 'pending') {
            throw new common_1.ConflictException('该申请已被处理');
        }
        request.status = 'rejected';
        request.processedAt = new Date();
        request.processedBy = adminId;
        await request.save();
    }
    async checkAdminPermission(groupId, userId) {
        const membership = await this.groupMemberModel.findOne({ groupId, userId });
        if (!membership || membership.role !== 'admin') {
            throw new common_1.ForbiddenException('需要管理员权限');
        }
    }
};
exports.JoinRequestService = JoinRequestService;
exports.JoinRequestService = JoinRequestService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(join_request_schema_1.JoinRequest.name)),
    __param(1, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __param(2, (0, mongoose_1.InjectModel)(group_schema_1.Group.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], JoinRequestService);
//# sourceMappingURL=join-request.service.js.map