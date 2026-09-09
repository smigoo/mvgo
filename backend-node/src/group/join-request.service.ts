import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  JoinRequest,
  JoinRequestDocument,
} from '../schemas/join-request.schema';
import {
  GroupMember,
  GroupMemberDocument,
} from '../schemas/group-member.schema';
import { Group, GroupDocument } from '../schemas/group.schema';
import { ROLES } from '../common/constants';

@Injectable()
export class JoinRequestService {
  constructor(
    @InjectModel(JoinRequest.name)
    private joinRequestModel: Model<JoinRequestDocument>,
    @InjectModel(GroupMember.name)
    private groupMemberModel: Model<GroupMemberDocument>,
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
  ) {}

  // 申请加入群组
  async applyToJoin(
    groupId: string,
    userId: string,
    message: string,
  ): Promise<JoinRequest> {
    // 检查群组是否存在
    const group = await this.groupModel.findById(groupId);
    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    // 检查用户是否已是成员
    const existing = await this.groupMemberModel.findOne({ groupId, userId });
    if (existing) {
      throw new ConflictException('您已是该群组成员');
    }

    // 检查是否已有待处理的申请
    const pendingRequest = await this.joinRequestModel.findOne({
      groupId,
      userId,
      status: 'pending',
    });
    if (pendingRequest) {
      throw new ConflictException('您已提交过加入申请，请等待审核');
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

  // 获取群组的待处理申请（仅管理员）
  async getPendingRequests(groupId: string, adminId: string): Promise<any[]> {
    await this.checkAdminPermission(groupId, adminId);

    const requests = await this.joinRequestModel
      .find({ groupId, status: 'pending' })
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .exec();

    return requests.map((r) => ({
      id: r._id,
      user: {
        id: (r.userId as any)._id,
        username: (r.userId as any).username,
        email: (r.userId as any).email,
      },
      message: r.message,
      createdAt: r.createdAt,
    }));
  }

  // 批准加入申请（仅管理员）
  async approveRequest(
    groupId: string,
    requestId: string,
    adminId: string,
  ): Promise<void> {
    await this.checkAdminPermission(groupId, adminId);

    const request = await this.joinRequestModel.findById(requestId);
    if (!request || request.groupId.toString() !== groupId) {
      throw new NotFoundException('申请不存在');
    }

    if (request.status !== 'pending') {
      throw new ConflictException('该申请已被处理');
    }

    // 添加用户为成员
    await this.groupMemberModel.create({
      groupId,
      userId: request.userId,
      role: ROLES.MEMBER,
    });

    // 更新申请状态
    request.status = 'approved';
    request.processedAt = new Date();
    request.processedBy = adminId as any;
    await request.save();
  }

  // 拒绝加入申请（仅管理员）
  async rejectRequest(
    groupId: string,
    requestId: string,
    adminId: string,
  ): Promise<void> {
    await this.checkAdminPermission(groupId, adminId);

    const request = await this.joinRequestModel.findById(requestId);
    if (!request || request.groupId.toString() !== groupId) {
      throw new NotFoundException('申请不存在');
    }

    if (request.status !== 'pending') {
      throw new ConflictException('该申请已被处理');
    }

    request.status = 'rejected';
    request.processedAt = new Date();
    request.processedBy = adminId as any;
    await request.save();
  }

  // 检查管理员权限
  private async checkAdminPermission(
    groupId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.groupMemberModel.findOne({ groupId, userId });
    if (!membership || membership.role !== ROLES.ADMIN) {
      throw new ForbiddenException('需要管理员权限');
    }
  }
}
