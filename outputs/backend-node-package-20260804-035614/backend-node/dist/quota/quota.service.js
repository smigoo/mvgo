"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var QuotaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotaService = void 0;
const common_1 = require("@nestjs/common");
let QuotaService = QuotaService_1 = class QuotaService {
    logger = new common_1.Logger(QuotaService_1.name);
    HOURLY_LIMIT = 5;
    DAILY_LIMIT = 15;
    userQuotas = new Map();
    async checkQuota(userId) {
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
        if (quota.hourly.count >= this.HOURLY_LIMIT) {
            const nextWindowMs = (quota.hourly.window + 1) * 60 * 60 * 1000;
            const waitMinutes = Math.ceil((nextWindowMs - now) / (60 * 1000));
            this.logger.warn(`用户 ${userId} 小时级配额已用完`, {
                hourlyCount: quota.hourly.count,
                limit: this.HOURLY_LIMIT,
                nextReset: new Date(nextWindowMs).toISOString(),
            });
            throw new common_1.HttpException({
                code: 'QUOTA_HOURLY_EXCEEDED',
                message: `您本小时已生成 ${quota.hourly.count} 个组件（上限 ${this.HOURLY_LIMIT} 个），请等待 ${waitMinutes} 分钟后重试`,
                waitMinutes,
                limit: this.HOURLY_LIMIT,
                used: quota.hourly.count,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (quota.daily.count >= this.DAILY_LIMIT) {
            this.logger.warn(`用户 ${userId} 每日配额已用完`, {
                dailyCount: quota.daily.count,
                limit: this.DAILY_LIMIT,
                currentDate: quota.daily.date,
            });
            throw new common_1.HttpException({
                code: 'QUOTA_DAILY_EXCEEDED',
                message: `您今日已生成 ${quota.daily.count} 个组件（上限 ${this.DAILY_LIMIT} 个），明日 00:00 后重置`,
                limit: this.DAILY_LIMIT,
                used: quota.daily.count,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        this.logger.debug(`用户 ${userId} 配额检查通过`, {
            hourly: { used: quota.hourly.count, limit: this.HOURLY_LIMIT },
            daily: { used: quota.daily.count, limit: this.DAILY_LIMIT },
        });
    }
    async recordSuccess(userId, sessionId) {
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
        quota.hourly.count++;
        quota.daily.count++;
        this.logger.log(`用户 ${userId} 成功生成组件 ${sessionId}，配额已更新`, {
            sessionId,
            hourly: { used: quota.hourly.count, limit: this.HOURLY_LIMIT },
            daily: { used: quota.daily.count, limit: this.DAILY_LIMIT },
        });
    }
    async getQuotaStatus(userId) {
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
};
exports.QuotaService = QuotaService;
exports.QuotaService = QuotaService = QuotaService_1 = __decorate([
    (0, common_1.Injectable)()
], QuotaService);
//# sourceMappingURL=quota.service.js.map