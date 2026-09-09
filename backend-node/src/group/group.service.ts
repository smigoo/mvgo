import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Group, GroupDocument } from '../schemas/group.schema';
import {
  GroupMember,
  GroupMemberDocument,
} from '../schemas/group-member.schema';
import { ALL_PERMISSIONS } from '../auth/permission.constants';
import { ROLES } from '../common/constants';

@Injectable()
export class GroupService {
  constructor(
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    @InjectModel(GroupMember.name)
    private groupMemberModel: Model<GroupMemberDocument>,
  ) {}

  // 创建群组
  async createGroup(
    name: string,
    description: string,
    adminId: string,
  ): Promise<Group> {
    const group = new this.groupModel({
      name,
      description,
      adminId,
    });

    await group.save();

    // 创建管理员成员记录
    await this.groupMemberModel.create({
      groupId: group._id,
      userId: adminId,
      role: ROLES.ADMIN,
    });

    return group;
  }

  // 获取用户的所有群组
  async getUserGroups(userId: string): Promise<any[]> {
    const memberships = await this.groupMemberModel
      .find({ userId })
      .populate('groupId')
      .exec();

    return memberships.map((m) => ({
      ...(m.groupId as any).toObject(),
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  // 获取群组详情（含成员列表）
  async getGroupDetails(groupId: string, userId: string): Promise<any> {
    const group = await this.groupModel.findById(groupId);
    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    // 检查用户是否是成员
    const membership = await this.groupMemberModel.findOne({ groupId, userId });
    if (!membership) {
      throw new ForbiddenException('无权访问该群组');
    }

    // 获取所有成员
    const members = await this.groupMemberModel
      .find({ groupId })
      .populate('userId', 'username email')
      .exec();

    return {
      ...group.toObject(),
      members: members.map((m) => ({
        id: (m.userId as any)._id,
        username: (m.userId as any).username,
        email: (m.userId as any).email,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      userRole: membership.role,
    };
  }

  // 邀请用户加入群组（仅管理员）
  async inviteUser(
    groupId: string,
    targetUserId: string,
    adminId: string,
  ): Promise<void> {
    await this.checkAdminPermission(groupId, adminId);

    // 检查用户是否已是成员
    const existing = await this.groupMemberModel.findOne({
      groupId,
      userId: targetUserId,
    });
    if (existing) {
      throw new ConflictException('用户已是群组成员');
    }

    await this.groupMemberModel.create({
      groupId,
      userId: targetUserId,
      role: ROLES.MEMBER,
    });
  }

  // 移除成员（仅管理员）
  async removeMember(
    groupId: string,
    targetUserId: string,
    adminId: string,
  ): Promise<void> {
    await this.checkAdminPermission(groupId, adminId);

    const result = await this.groupMemberModel.deleteOne({
      groupId,
      userId: targetUserId,
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('成员不存在');
    }
  }

  // 更新群组信息（仅管理员）
  async updateGroup(
    groupId: string,
    name: string,
    description: string,
    adminId: string,
  ): Promise<Group> {
    await this.checkAdminPermission(groupId, adminId);

    const group = await this.groupModel.findByIdAndUpdate(
      groupId,
      { name, description },
      { returnDocument: 'after' },
    );

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    return group;
  }

  // 删除群组（仅创建者）
  async deleteGroup(groupId: string, userId: string): Promise<void> {
    const group = await this.groupModel.findById(groupId);
    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    if (group.adminId.toString() !== userId) {
      throw new ForbiddenException('只有创建者可以删除群组');
    }

    // 删除所有成员记录
    await this.groupMemberModel.deleteMany({ groupId });

    // 删除群组
    await this.groupModel.findByIdAndDelete(groupId);
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

  // 更新成员权限
  async updateMemberPermissions(
    groupId: string,
    userId: string,
    permissions: string[],
  ): Promise<void> {
    const membership = await this.groupMemberModel.findOne({ groupId, userId });
    if (!membership) {
      throw new NotFoundException('成员不存在');
    }
    if (membership.role === ROLES.ADMIN) {
      throw new BadRequestException('管理员自动拥有全部权限，无需分配');
    }
    // 校验权限码是否合法
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      throw new BadRequestException(`无效的权限码: ${invalid.join(', ')}`);
    }
    membership.permissions = permissions;
    await membership.save();
  }

  // 获取成员权限
  async getMemberPermissions(
    groupId: string,
    userId: string,
  ): Promise<string[]> {
    const membership = await this.groupMemberModel.findOne({ groupId, userId }).lean();
    if (!membership) {
      throw new NotFoundException('成员不存在');
    }
    if (membership.role === ROLES.ADMIN) {
      return ALL_PERMISSIONS;
    }
    return membership.permissions || [];
  }
}
