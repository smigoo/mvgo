import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GroupMember, GroupMemberDocument } from '../schemas/group-member.schema';
import { PermissionAdapter } from './permission-adapter.interface';
import { ALL_PERMISSIONS } from './permission.constants';
import { ROLES } from '../common/constants';

/**
 * NodePermissionAdapter — 基于 MongoDB GroupMember 的权限适配器实现
 *
 * 当前阶段的实现：查 GroupMember 表的 role + permissions 字段。
 *
 * 迁移时：新建 QSPermissionAdapter 实现同一接口，在 auth.module.ts 中
 * 将 provider 的 useClass 从 NodePermissionAdapter 改为 QSPermissionAdapter 即可。
 */
@Injectable()
export class NodePermissionAdapter extends PermissionAdapter {
  constructor(
    @InjectModel(GroupMember.name)
    private groupMemberModel: Model<GroupMemberDocument>,
  ) {
    super();
  }

  async checkPermission(userId: string, permCode: string): Promise<boolean> {
    const membership = await this.groupMemberModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();

    if (!membership) return false;

    if (membership.role === ROLES.ADMIN) return true;

    return (membership.permissions || []).includes(permCode);
  }

  async getUserPermissions(userId: string): Promise<{
    role: string;
    permissions: string[];
  }> {
    const membership = await this.groupMemberModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();

    if (!membership) {
      return { role: ROLES.MEMBER, permissions: [] };
    }

    if (membership.role === ROLES.ADMIN) {
      return { role: ROLES.ADMIN, permissions: ALL_PERMISSIONS };
    }

    return {
      role: membership.role,
      permissions: membership.permissions || [],
    };
  }
}
