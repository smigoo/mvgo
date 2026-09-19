import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';
import { ListComponentsDto } from '../component/dto/list-components.dto';
import { SetUserAdminDto } from './dto/set-user-admin.dto';

/**
 * 管理后台只读接口（仅 admin 可访问）。
 * - GET /api/admin/ai-configs  → 所有用户的 AI/API 配置（密钥脱敏）
 * - GET /api/admin/components   → 全量生成组件列表（支持 search/page/pageSize）
 */
@Controller('admin')
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('ai-configs')
  async listAiConfigs(@CurrentUser() userId: string) {
    await this.adminService.assertAdmin(userId);
    const list = await this.adminService.listUserConfigs();
    return { success: true, list, total: list.length };
  }

  @Get('users')
  async listUsers(@CurrentUser() userId: string) {
    await this.adminService.assertAdmin(userId);
    const list = await this.adminService.listUsers();
    return { success: true, list, total: list.length };
  }

  @Post('users/:id')
  async setUserAdmin(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: SetUserAdminDto,
  ) {
    await this.adminService.assertAdmin(userId);
    await this.adminService.setUserAdmin(id, body.isAdmin);
    return { success: true };
  }

  @Post('users/:id/delete')
  async deleteUser(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.adminService.assertAdmin(userId);
    const result = await this.adminService.deleteUser(userId, id);
    return { success: true, ...result };
  }

  @Get('components')
  async listComponents(
    @CurrentUser() userId: string,
    @Query() query: ListComponentsDto,
  ) {
    await this.adminService.assertAdmin(userId);
    const data = await this.adminService.listComponents(query);
    return { success: true, ...data };
  }

  @Get('usage-export')
  async usageExport(
    @CurrentUser() userId: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('dept') dept?: string,
    @Query('format') format?: string,
  ) {
    await this.adminService.assertAdmin(userId);
    const file = await this.adminService.buildUsageExport({ preset, from, to, dept, format });
    const encoded = encodeURIComponent(file.filename);
    return new StreamableFile(Buffer.from(file.body, 'utf-8'), {
      type: file.contentType,
      disposition: `attachment; filename="export"; filename*=UTF-8''${encoded}`,
    });
  }

  @Get('dept-report')
  async deptReport(@CurrentUser() userId: string) {
    await this.adminService.assertAdmin(userId);
    const file = await this.adminService.buildDeptReport();
    const encoded = encodeURIComponent(file.filename);
    return new StreamableFile(Buffer.from(file.body, 'utf-8'), {
      type: file.contentType,
      disposition: `attachment; filename="report"; filename*=UTF-8''${encoded}`,
    });
  }
}
