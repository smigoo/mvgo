import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AiUserGitService } from './user-git.service';
import { SaveGitCredentialDto } from './dto/user-git.dto';
import { SessionGuard } from '../../auth/session.guard';
import { CurrentUser } from '../../auth/current-user.decorator';

@Controller('user/git-credential')
@UseGuards(SessionGuard)
export class AiUserGitController {
  constructor(private readonly userGitService: AiUserGitService) {}

  @Get()
  async getStatus(@CurrentUser() userId: string) {
    return this.userGitService.getStatus(userId);
  }

  /**
   * 获取解密后的明文 PAT（用于推送组件时自动填充，免重复输入）
   */
  @Get('token')
  async getToken(@CurrentUser() userId: string) {
    return this.userGitService.getToken(userId);
  }

  @Post()
  async save(@Body() dto: SaveGitCredentialDto, @CurrentUser() userId: string) {
    return this.userGitService.save(userId, dto);
  }

  @Post('delete')
  async delete(@CurrentUser() userId: string) {
    return this.userGitService.delete(userId);
  }
}
