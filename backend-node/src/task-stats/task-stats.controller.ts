import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TaskStatsService } from './task-stats.service';
import { SelfHealingService } from './self-healing.service';

/**
 * 任务统计（管理员视角）。
 * - GET /api/task-stats/tasks           → 所有用户任务日志明细（支持 ?preset=&from=&to= 时间窗）
 * - GET /api/task-stats/model-compare   → 模型 × 代理效果对比聚合（支持时间窗）
 * - GET /api/task-stats/failure-analysis → 任务失败原因分析（自愈提示）
 * 鉴权：SessionGuard + assertAdmin（仅管理员）。
 */
@Controller('task-stats')
@UseGuards(SessionGuard)
export class TaskStatsController {
  constructor(
    private readonly taskStatsService: TaskStatsService,
    private readonly selfHealingService: SelfHealingService,
  ) {}

  @Get('tasks')
  async listAllTasks(
    @CurrentUser() userId: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.taskStatsService.assertAdmin(userId);
    const res = await this.taskStatsService.listAllTasks({ preset, from, to });
    return {
      success: true,
      list: res.list,
      count: res.count,
      windowLabel: res.windowLabel,
    };
  }

  @Get('model-compare')
  async modelCompare(
    @CurrentUser() userId: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.taskStatsService.assertAdmin(userId);
    const res = await this.taskStatsService.modelCompare({ preset, from, to });
    return {
      success: true,
      list: res.list,
      count: res.count,
      windowLabel: res.windowLabel,
    };
  }

  /**
   * R11 历史回填：从 tasks.json 的 configSnapshot 读取 baseURL，回填到历史 token 记录
   * POST /api/task-stats/backfill-token-baseurls
   */
  @Post('backfill-token-baseurls')
  async backfillTokenBaseURLs(@CurrentUser() userId: string) {
    await this.taskStatsService.assertAdmin(userId);
    const res = await this.taskStatsService.backfillTokenBaseURLs();
    return {
      success: true,
      ...res,
    };
  }

  /**
   * R12 效果趋势：按时间维度聚合成功率/耗时/token 曲线
   * GET /api/task-stats/trends?preset=week&metric=successRate&granularity=day
   */
  @Get('trends')
  async trends(
    @CurrentUser() userId: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('metric') metric?: 'successRate' | 'duration' | 'tokens' | 'taskCount',
    @Query('granularity') granularity?: 'day' | 'week',
  ) {
    await this.taskStatsService.assertAdmin(userId);
    const res = await this.taskStatsService.trends(
      { preset, from, to },
      metric || 'successRate',
      granularity || 'day',
    );
    return {
      success: true,
      ...res,
    };
  }

  /**
   * 仪表台聚合（全局概览 + 模型效率排行 + 效率趋势 + 失败归因 + 部门汇总）
   * GET /api/task-stats/dashboard?preset=d30
   * 默认近 30 天
   */
  @Get('dashboard')
  async dashboard(
    @CurrentUser() userId: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.taskStatsService.assertAdmin(userId);
    const res = await this.taskStatsService.dashboard({ preset, from, to });
    return {
      success: true,
      data: res,
    };
  }

  /**
   * 我的统计（用户视角）
   * GET /api/task-stats/my-dashboard?preset=d30
   * 返回当前用户的任务统计、常用模型、Token消耗、成本
   */
  @Get('my-dashboard')
  async myDashboard(
    @CurrentUser() userId: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const res = await this.taskStatsService.myDashboard(userId, { preset, from, to });
    return {
      success: true,
      data: res,
    };
  }

  /**
   * 任务失败原因分析（自愈提示）
   * GET /api/task-stats/failure-analysis?sessionId=xxx
   * 返回失败分类、原因说明、修复建议、可执行动作
   */
  @Get('failure-analysis')
  async failureAnalysis(
    @CurrentUser() userId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    await this.taskStatsService.assertAdmin(userId);
    if (!sessionId) {
      return { success: false, message: '缺少 sessionId 参数' };
    }
    const analysis = this.selfHealingService.analyzeFailure(sessionId);
    return {
      success: true,
      data: analysis,
    };
  }
}
