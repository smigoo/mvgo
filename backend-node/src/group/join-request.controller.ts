import { Controller, Get, Post, Param, Body, Session, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JoinRequestService } from './join-request.service';
import { SessionGuard } from '../auth/session.guard';

@Controller('group/:groupId/join-requests')
@UseGuards(SessionGuard)
export class JoinRequestController {
  constructor(private readonly joinRequestService: JoinRequestService) {}

  @Post()
  async applyToJoin(
    @Param('groupId') groupId: string,
    @Body() body: { message?: string },
    @Session() session: Record<string, any>,
  ) {
    const request = await this.joinRequestService.applyToJoin(
      groupId,
      session.userId,
      body.message || '',
    );

    return {
      success: true,
      message: '申请已提交',
      request: {
        id: request._id,
        status: request.status,
        createdAt: request.createdAt,
      },
    };
  }

  @Get()
  async getPendingRequests(
    @Param('groupId') groupId: string,
    @Session() session: Record<string, any>,
  ) {
    const requests = await this.joinRequestService.getPendingRequests(
      groupId,
      session.userId,
    );

    return {
      success: true,
      requests,
    };
  }

  @Post(':requestId/approve')
  @HttpCode(HttpStatus.OK)
  async approveRequest(
    @Param('groupId') groupId: string,
    @Param('requestId') requestId: string,
    @Session() session: Record<string, any>,
  ) {
    await this.joinRequestService.approveRequest(groupId, requestId, session.userId);

    return {
      success: true,
      message: '已批准加入申请',
    };
  }

  @Post(':requestId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectRequest(
    @Param('groupId') groupId: string,
    @Param('requestId') requestId: string,
    @Session() session: Record<string, any>,
  ) {
    await this.joinRequestService.rejectRequest(groupId, requestId, session.userId);

    return {
      success: true,
      message: '已拒绝加入申请',
    };
  }
}
