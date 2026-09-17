import {
  Controller,
  Get,
  Headers,
  Query,
  ForbiddenException,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TaskStatsService } from '../task-stats/task-stats.service';

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
  private readonly logger = console;

  constructor(
    private readonly adminService: AdminService,
    private readonly taskStatsService: TaskStatsService,
  ) {}

  /**
   * 用户维度聚合统计（供前端调用，SessionGuard 鉴权）
   * GET /api/admin/user-stats?preset=week
   * 按用户聚合：任务数、成功率、耗时 p50/p90、最近使用时间、常用模型
   *
   * 2026-09-17 修复：合并 adminService.listUserStats() 的 componentCount/apiTaskCount/apiCount
   * 前端 UsersView 需要这三个字段（生成组件数、接口批数、接口总数），但 taskStatsService.userStats()
   * 只统计了 tasks.json 的 taskCount，缺少 MongoDB components 和 apifox-tasks.json 的数据。
   */
  @Get('user-stats')
  @UseGuards(SessionGuard)
  async userStats(
    @CurrentUser() userId: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.taskStatsService.assertAdmin(userId);
    const res = await this.taskStatsService.userStats({ preset, from, to });

    // 合并 adminService.listUserStats() 的 componentCount/apiTaskCount/apiCount
    let extraMap: Record<string, any> = {};
    try {
      const extra = await this.adminService.listUserStats();
      extraMap = extra;
    } catch (err) {
      // 降级：合并失败不影响主流程
      this.logger.warn(`[user-stats] listUserStats 合并失败: ${err.message}`);
    }

    const mergedList = res.list.map((item: any) => {
      const uid = item.userId;
      const extra = extraMap[uid] || {};
      return {
        ...item,
        componentCount: extra.componentCount ?? 0,
        apiTaskCount: extra.apiTaskCount ?? 0,
        apiCount: extra.apiCount ?? 0,
      };
    });

    return {
      success: true,
      list: mergedList,
      count: res.count,
      windowLabel: res.windowLabel,
    };
  }

  /**
   * 用户统计（供 Java 内部调用，x-admin-stats-key 鉴权）
   * GET /api/admin/internal/user-stats
   */
  @Get('internal/user-stats')
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

  /**
   * 时间窗生成报告（JSON，供 Java 代理下载）。
   * 路径与 SessionGuard 附件路由 GET admin/usage-export 错开，避免双注册。
   * 鉴权同 user-stats：x-admin-stats-key。
   */
  @Get('internal/usage-export')
  async usageExport(
    @Headers('x-admin-stats-key') key?: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('dept') dept?: string,
    @Query('format') format?: string,
  ) {
    const expect = process.env.ADMIN_STATS_KEY || '';
    if (!expect) {
      throw new ServiceUnavailableException('服务端未配置 ADMIN_STATS_KEY，usage-export 不可用');
    }
    if (!key || key !== expect) {
      throw new ForbiddenException('内部调用 key 无效');
    }
    const file = await this.adminService.buildUsageExport({ preset, from, to, dept, format });
    return { success: true, ...file };
  }
}
