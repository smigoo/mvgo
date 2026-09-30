import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import { SessionGuard } from '../auth/session.guard';

@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  /**
   * 创建公告（登录用户）
   */
  @Post()
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: {
      title: string;
      content: string;
      version?: string;
      type?: 'info' | 'warning' | 'success' | 'error';
      publishAt?: string;
      expireAt?: string;
      priority?: number;
    },
    @Req() req: any,
  ) {
    const data = {
      ...body,
      publishAt: body.publishAt ? new Date(body.publishAt) : new Date(),
      expireAt: body.expireAt ? new Date(body.expireAt) : undefined,
      author: req.session?.username || 'anonymous',
    };
    return this.announcementService.create(data);
  }

  /**
   * 获取公告列表（登录用户）
   */
  @Get('admin')
  @UseGuards(SessionGuard)
  async findAllForAdmin(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('active') active?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.announcementService.findAllForAdmin({
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      active: active !== undefined ? active === 'true' : undefined,
      keyword,
    });
  }

  /**
   * 获取当前有效公告（用户端）
   */
  @Get('active')
  @UseGuards(SessionGuard)
  async findActiveForUser() {
    return this.announcementService.findActiveForUser();
  }

  /**
   * 获取单个公告详情
   */
  @Get(':id')
  @UseGuards(SessionGuard)
  async findById(@Param('id') id: string) {
    return this.announcementService.findById(id);
  }

  /**
   * 更新公告（登录用户）
   */
  @Post(':id/update')
  @UseGuards(SessionGuard)
  async update(
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      content?: string;
      version?: string;
      type?: 'info' | 'warning' | 'success' | 'error';
      active?: boolean;
      publishAt?: string;
      expireAt?: string;
      priority?: number;
    },
  ) {
    const data: any = { ...body };
    if (body.publishAt) {
      data.publishAt = new Date(body.publishAt);
    }
    if (body.expireAt) {
      data.expireAt = new Date(body.expireAt);
    }
    return this.announcementService.update(id, data);
  }

  /**
   * 删除公告（登录用户）
   */
  @Post(':id/delete')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string) {
    return this.announcementService.delete(id);
  }

  /**
   * 切换公告状态（登录用户）
   */
  @Post(':id/toggle')
  @UseGuards(SessionGuard)
  async toggleActive(@Param('id') id: string) {
    return this.announcementService.toggleActive(id);
  }
}
