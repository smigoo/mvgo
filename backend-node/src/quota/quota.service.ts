import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

/**
 * 组件生成配额服务
 * 
 * 限制规则：
 * 1. 每小时最多 5 个成功生成的组件（防并发滥用）
 * 2. 每天最多 15 个成功生成的组件（每日重置）
 * 3. 生成失败的组件不占用额度
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  // 配额限制配置
  private readonly HOURLY_LIMIT = 5;
  private readonly DAILY_LIMIT = 15;

  // 内存存储：userId -> { hourly: { window: number, count: number }, daily: { date: string, count: number } }
  private userQuotas = new Map<string, {
    hourly: { window: number; count: number };
    daily: { date: string; count: number };
  }>();

  /**
   * 检查用户配额状态（不抛异常，返回配额信息供调用方决策）
   * @param userId 用户ID
   * @returns 配额状态：allowed 为 true 时可立即执行，为 false 时需入队等待
   */
  async checkQuotaStatus(userId: string): Promise<{
    allowed: boolean;
    reason?: 'QUOTA_HOURLY_EXCEEDED' | 'QUOTA_DAILY_EXCEEDED';
    message?: string;
    quotaResetAt?: number;  // 配额恢复时间戳
    waitMinutes?: number;   // 预计等待分钟数
    used: number;           // 已用配额
    limit: number;          // 配额上限
  }> {
    const now = Date.now();
    const currentHourWindow = Math.floor(now / (60 * 60 * 1000));
    const currentDate = new Date().toISOString().split('T')[0];

    let quota = this.userQuotas.get(userId);
    if (!quota) {
      quota = {
        hourly: { window: currentHourWindow, count: 0 },
        daily: { date: currentDate, count: 0 },
      };
      this.userQuotas.set(userId, quota);
    }

    if (quota.hourly.window !== currentHourWindow) {
      quota.hourly = { window: currentHourWindow, count: 0 };
    }
    if (quota.daily.date !== currentDate) {
      quota.daily = { date: currentDate, count: 0 };
    }

    // 检查小时级配额
    if (quota.hourly.count >= this.HOURLY_LIMIT) {
      const nextWindowMs = (quota.hourly.window + 1) * 60 * 60 * 1000;
      const waitMinutes = Math.ceil((nextWindowMs - now) / (60 * 1000));
      
      this.logger.warn(`用户 ${userId} 小时级配额已用完，需入队等待`, {
        hourlyCount: quota.hourly.count,
        limit: this.HOURLY_LIMIT,
        nextReset: new Date(nextWindowMs).toISOString(),
      });

      return {
        allowed: false,
        reason: 'QUOTA_HOURLY_EXCEEDED',
        message: `您本小时已生成 ${quota.hourly.count} 个组件（上限 ${this.HOURLY_LIMIT} 个），任务将自动排队等待`,
        quotaResetAt: nextWindowMs,
        waitMinutes,
        used: quota.hourly.count,
        limit: this.HOURLY_LIMIT,
      };
    }

    // 检查每日配额
    if (quota.daily.count >= this.DAILY_LIMIT) {
      this.logger.warn(`用户 ${userId} 每日配额已用完，需入队等待`, {
        dailyCount: quota.daily.count,
        limit: this.DAILY_LIMIT,
        currentDate: quota.daily.date,
      });

      // 次日 00:00 重置
      const tomorrow = new Date(currentDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const quotaResetAt = tomorrow.getTime();
      const waitMinutes = Math.ceil((quotaResetAt - now) / (60 * 1000));

      return {
        allowed: false,
        reason: 'QUOTA_DAILY_EXCEEDED',
        message: `您今日已生成 ${quota.daily.count} 个组件（上限 ${this.DAILY_LIMIT} 个），任务将自动排队等待`,
        quotaResetAt,
        waitMinutes,
        used: quota.daily.count,
        limit: this.DAILY_LIMIT,
      };
    }

    this.logger.debug(`用户 ${userId} 配额检查通过`, {
      hourly: { used: quota.hourly.count, limit: this.HOURLY_LIMIT },
      daily: { used: quota.daily.count, limit: this.DAILY_LIMIT },
    });

    return {
      allowed: true,
      used: Math.max(quota.hourly.count, quota.daily.count),
      limit: this.HOURLY_LIMIT,
    };
  }

  /**
   * 检查用户是否可以生成组件（向后兼容，直接抛异常版本）
   * @param userId 用户ID
   * @throws HttpException 如果超出配额限制
   * @deprecated 推荐使用 checkQuotaStatus，由调用方处理入队逻辑
   */
  async checkQuota(userId: string): Promise<void> {
    const status = await this.checkQuotaStatus(userId);
    if (!status.allowed) {
      throw new HttpException(
        {
          code: status.reason,
          message: status.message,
          waitMinutes: status.waitMinutes,
          limit: status.limit,
          used: status.used,
          quotaResetAt: status.quotaResetAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * 记录成功生成的组件
   * 只在组件生成成功后调用，失败的组件不计入配额
   * 
   * @param userId 用户ID
   * @param sessionId 组件会话ID（用于日志追踪）
   */
  async recordSuccess(userId: string, sessionId: string): Promise<void> {
    const now = Date.now();
    const currentHourWindow = Math.floor(now / (60 * 60 * 1000));
    const currentDate = new Date().toISOString().split('T')[0];

    let quota = this.userQuotas.get(userId);
    if (!quota) {
      quota = {
        hourly: { window: currentHourWindow, count: 0 },
        daily: { date: currentDate, count: 0 },
      };
      this.userQuotas.set(userId, quota);
    }

    // 确保时间窗口正确
    if (quota.hourly.window !== currentHourWindow) {
      quota.hourly = { window: currentHourWindow, count: 0 };
    }
    if (quota.daily.date !== currentDate) {
      quota.daily = { date: currentDate, count: 0 };
    }

    quota.hourly.count++;
    quota.daily.count++;

    this.logger.log(`用户 ${userId} 成功生成组件 ${sessionId}，配额已更新`, {
      sessionId,
      hourly: { used: quota.hourly.count, limit: this.HOURLY_LIMIT },
      daily: { used: quota.daily.count, limit: this.DAILY_LIMIT },
    });
  }

  /**
   * 获取用户当前配额使用情况
   */
  async getQuotaStatus(userId: string): Promise<{
    hourly: { used: number; limit: number; remaining: number };
    daily: { used: number; limit: number; remaining: number };
  }> {
    const now = Date.now();
    const currentHourWindow = Math.floor(now / (60 * 60 * 1000));
    const currentDate = new Date().toISOString().split('T')[0];

    const quota = this.userQuotas.get(userId);
    if (!quota) {
      return {
        hourly: { used: 0, limit: this.HOURLY_LIMIT, remaining: this.HOURLY_LIMIT },
        daily: { used: 0, limit: this.DAILY_LIMIT, remaining: this.DAILY_LIMIT },
      };
    }

    // 如果时间窗口已过期，返回重置后的状态
    const hourlyUsed = quota.hourly.window === currentHourWindow ? quota.hourly.count : 0;
    const dailyUsed = quota.daily.date === currentDate ? quota.daily.count : 0;

    return {
      hourly: {
        used: hourlyUsed,
        limit: this.HOURLY_LIMIT,
        remaining: Math.max(0, this.HOURLY_LIMIT - hourlyUsed),
      },
      daily: {
        used: dailyUsed,
        limit: this.DAILY_LIMIT,
        remaining: Math.max(0, this.DAILY_LIMIT - dailyUsed),
      },
    };
  }

  /**
   * Phase 7 #208：批量生成配额预检
   * 根据当前配额剩余，将批量提交拆分为"立即可执行"和"需等待"
   * 
   * @returns 拆批结果：availableNow/availableLater/quotaDetails/resetTimes/recommendedAction
   */
  async preCheckBatch(
    userId: string,
    requestedCount: number,
  ): Promise<{
    requestedCount: number;
    availableNow: number;
    availableLater: number;
    hourly: { used: number; limit: number; remaining: number; resetAt: number; waitMinutes: number };
    daily: { used: number; limit: number; remaining: number; resetAt: number; waitMinutes: number };
    recommendedAction: 'all_now' | 'partial' | 'all_wait';
    message: string;
  }> {
    const status = await this.getQuotaStatus(userId);
    const now = Date.now();
    const currentHourWindow = Math.floor(now / (60 * 60 * 1000));

    // 小时级恢复时间
    const nextHourMs = (currentHourWindow + 1) * 60 * 60 * 1000;
    const hourlyWaitMinutes = Math.ceil((nextHourMs - now) / (60 * 1000));

    // 日级恢复时间
    const tomorrow = new Date(new Date().toISOString().split('T')[0]);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dailyResetAt = tomorrow.getTime();
    const dailyWaitMinutes = Math.ceil((dailyResetAt - now) / (60 * 1000));

    // 可用额度 = min(小时剩余, 日剩余)
    const availableNow = Math.min(status.hourly.remaining, status.daily.remaining, requestedCount);
    const availableLater = requestedCount - availableNow;

    let recommendedAction: 'all_now' | 'partial' | 'all_wait';
    let message: string;

    if (availableNow === requestedCount) {
      recommendedAction = 'all_now';
      message = `全部 ${requestedCount} 个组件可以立即开始生成`;
    } else if (availableNow === 0) {
      recommendedAction = 'all_wait';
      const bottleneck = status.hourly.remaining === 0 ? '小时' : '日';
      const waitMin = status.hourly.remaining === 0 ? hourlyWaitMinutes : dailyWaitMinutes;
      message = `当前${bottleneck}配额已用完，${requestedCount} 个组件将全部排队，预计 ${waitMin} 分钟后恢复`;
    } else {
      recommendedAction = 'partial';
      const bottleneck = status.hourly.remaining <= status.daily.remaining ? '小时' : '日';
      message = `配额剩余 ${availableNow} 个，${availableNow} 个立即执行，${availableLater} 个将排队等待（${bottleneck}配额不足）`;
    }

    this.logger.log(`批量预检: 用户 ${userId}, 请求 ${requestedCount}, 可用 ${availableNow}, 延后 ${availableLater}, 建议 ${recommendedAction}`);

    return {
      requestedCount,
      availableNow,
      availableLater,
      hourly: {
        ...status.hourly,
        resetAt: nextHourMs,
        waitMinutes: hourlyWaitMinutes,
      },
      daily: {
        ...status.daily,
        resetAt: dailyResetAt,
        waitMinutes: dailyWaitMinutes,
      },
      recommendedAction,
      message,
    };
  }
}
