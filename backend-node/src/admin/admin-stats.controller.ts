import {
  Controller,
  Get,
  Headers,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AdminService } from './admin.service';

/**
 * 用户生成统计端点（内部服务间调用专用）。
 *
 * <p>管理后台用户列表由 Java 提供（/api/admin/users 已迁 Java），而 task / apifox
 * 生成台账只存在 Node 的 data 目录（无 DB 副本），Java 无法直接统计。本端点供 Java
 * 列表聚合时跨服务拉取一次全量 { userId → 组件数/任务数/接口数 }。
 *
 * <p>鉴权：不走 SessionGuard（Java 无登录会话），改用静态内部 key
 * （请求头 x-admin-stats-key，与 Node 端 env ADMIN_STATS_KEY 比对）。
 * 未配置 ADMIN_STATS_KEY 时返回 503（防裸奔），key 不匹配返回 403。
 * 该端点仅暴露计数（敏感度低），仍建议 Node 仅监听内网。
 */
@Controller('admin')
export class AdminStatsController {
  constructor(private readonly adminService: AdminService) {}

  @Get('user-stats')
  async listUserStats(@Headers('x-admin-stats-key') key?: string) {
    const expect = process.env.ADMIN_STATS_KEY || '';
    if (!expect) {
      throw new ServiceUnavailableException('服务端未配置 ADMIN_STATS_KEY，user-stats 不可用');
    }
    if (!key || key !== expect) {
      throw new ForbiddenException('内部调用 key 无效');
    }
    const data = await this.adminService.listUserStats();
    return { success: true, data };
  }
}
