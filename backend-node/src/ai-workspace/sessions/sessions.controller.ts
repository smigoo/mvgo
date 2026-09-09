import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { AiSessionsService } from './sessions.service';
import { CreateSessionDto, UpdateSessionDto } from '../chat/dto/chat.dto';
import { SessionGuard } from '../../auth/session.guard';
import { CurrentUser } from '../../auth/current-user.decorator';

@Controller('sessions')
@UseGuards(SessionGuard)
export class AiSessionsController {
  constructor(private readonly sessionsService: AiSessionsService) {}

  @Get()
  async findByUser(@CurrentUser() userId: string, @Query('projectId') projectId?: string) {
    const sessions = await this.sessionsService.findByUser(userId, projectId);
    return { data: sessions };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() userId: string) {
    const session = await this.sessionsService.findById(id, userId);
    if (!session) throw new HttpException('会话不存在', HttpStatus.NOT_FOUND);
    return { data: session };
  }

  @Post()
  async create(@Body() dto: CreateSessionDto, @CurrentUser() userId: string) {
    const session = await this.sessionsService.create(dto, userId);
    return { data: session };
  }

  @Post(':id')
  async updateTitle(@Param('id') id: string, @Body() dto: UpdateSessionDto, @CurrentUser() userId: string) {
    const session = await this.sessionsService.updateTitle(id, dto, userId);
    if (!session) throw new HttpException('会话不存在', HttpStatus.NOT_FOUND);
    return { data: session };
  }

  @Post(':id/delete')
  async delete(@Param('id') id: string, @CurrentUser() userId: string) {
    await this.sessionsService.delete(id, userId);
    return { success: true };
  }
}
