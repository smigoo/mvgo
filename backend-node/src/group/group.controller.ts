import { Controller, Get, Post, Body, Param, Session, UseGuards, HttpCode, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupService } from './group.service';
import { SessionGuard } from '../auth/session.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/permission.constants';

@Controller('group')
@UseGuards(SessionGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  async createGroup(
    @Body() body: { name: string; description?: string },
    @Session() session: Record<string, any>,
  ) {
    const group = await this.groupService.createGroup(
      body.name,
      body.description || '',
      session.userId,
    );

    return {
      success: true,
      message: '群组创建成功',
      group,
    };
  }

  @Get()
  async getUserGroups(@Session() session: Record<string, any>) {
    const groups = await this.groupService.getUserGroups(session.userId);
    return {
      success: true,
      groups,
    };
  }

  @Get(':groupId')
  async getGroupDetails(
    @Param('groupId') groupId: string,
    @Session() session: Record<string, any>,
  ) {
    const group = await this.groupService.getGroupDetails(groupId, session.userId);
    return {
      success: true,
      group,
    };
  }

  @Post(':groupId/invite')
  @HttpCode(HttpStatus.OK)
  async inviteUser(
    @Param('groupId') groupId: string,
    @Body() body: { userId: string },
    @Session() session: Record<string, any>,
  ) {
    await this.groupService.inviteUser(groupId, body.userId, session.userId);
    return {
      success: true,
      message: '邀请成功',
    };
  }

  @Post(':groupId/members/:userId/delete')
  async removeMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Session() session: Record<string, any>,
  ) {
    await this.groupService.removeMember(groupId, userId, session.userId);
    return {
      success: true,
      message: '成员已移除',
    };
  }

  @Post(':groupId')
  async updateGroup(
    @Param('groupId') groupId: string,
    @Body() body: { name: string; description?: string },
    @Session() session: Record<string, any>,
  ) {
    const group = await this.groupService.updateGroup(
      groupId,
      body.name,
      body.description || '',
      session.userId,
    );

    return {
      success: true,
      message: '群组信息已更新',
      group,
    };
  }

  @Post(':groupId/delete')
  async deleteGroup(
    @Param('groupId') groupId: string,
    @Session() session: Record<string, any>,
  ) {
    await this.groupService.deleteGroup(groupId, session.userId);
    return {
      success: true,
      message: '群组已删除',
    };
  }

  @Post(':groupId/members/:userId/permissions')
  @UseGuards(PermissionsGuard)
  @Permissions(PERMISSIONS.GROUP_MANAGE)
  async updateMemberPermissions(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body() body: { permissions: string[] },
  ) {
    if (!Array.isArray(body.permissions)) {
      throw new BadRequestException('permissions 必须是数组');
    }
    await this.groupService.updateMemberPermissions(groupId, userId, body.permissions);
    return {
      success: true,
      message: '权限更新成功',
    };
  }

  @Get(':groupId/members/:userId/permissions')
  @UseGuards(PermissionsGuard)
  @Permissions(PERMISSIONS.GROUP_MANAGE)
  async getMemberPermissions(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    const permissions = await this.groupService.getMemberPermissions(groupId, userId);
    return {
      success: true,
      permissions,
    };
  }
}
