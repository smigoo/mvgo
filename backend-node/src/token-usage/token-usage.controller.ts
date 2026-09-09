import {
  Controller,
  Get,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TokenTrackerService } from './token-tracker.service';
import {
  TaskUsageResponse,
  TokenStatsResponse,
  BudgetStatusResponse,
  PricingTableResponse,
  StatsQuery,
} from './dto/token-usage.dto';

@Controller('token-usage')
export class TokenUsageController {
  constructor(private readonly tokenTrackerService: TokenTrackerService) {}

  /**
   * GET /api/token-usage/task/:sessionId
   * 按任务查询 Token 明细
   */
  @Get('task/:sessionId')
  async getTaskUsage(
    @Param('sessionId') sessionId: string,
  ): Promise<{ success: boolean; data: TaskUsageResponse }> {
    if (!sessionId) {
      throw new HttpException('sessionId is required', HttpStatus.BAD_REQUEST);
    }
    const data = await this.tokenTrackerService.getTaskUsage(sessionId);
    return { success: true, data };
  }

  /**
   * GET /api/token-usage/stats?period=daily&days=7
   * 聚合统计
   */
  @Get('stats')
  async getStats(
    @Query('period') period?: string,
    @Query('days') days?: string,
  ): Promise<{ success: boolean; data: TokenStatsResponse }> {
    const query: StatsQuery = {
      period: (period as StatsQuery['period']) || 'daily',
      days: days ? parseInt(days, 10) : 7,
    };
    const data = await this.tokenTrackerService.getStats(query);
    return { success: true, data };
  }

  /**
   * GET /api/token-usage/budget/:sessionId
   * 检查任务预算状态
   */
  @Get('budget/:sessionId')
  async getBudgetStatus(
    @Param('sessionId') sessionId: string,
  ): Promise<{ success: boolean; data: BudgetStatusResponse }> {
    if (!sessionId) {
      throw new HttpException('sessionId is required', HttpStatus.BAD_REQUEST);
    }
    const data = await this.tokenTrackerService.getBudgetStatus(sessionId);
    return { success: true, data };
  }

  /**
   * GET /api/token-usage/pricing
   * 返回模型定价表
   */
  @Get('pricing')
  getPricing(): { success: boolean; data: PricingTableResponse } {
    return {
      success: true,
      data: {
        models: this.tokenTrackerService.getPricing(),
        currency: 'CNY',
      },
    };
  }
}
