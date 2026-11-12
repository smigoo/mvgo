export declare class QuotaService {
    private readonly logger;
    private readonly HOURLY_LIMIT;
    private readonly DAILY_LIMIT;
    private userQuotas;
    checkQuotaStatus(userId: string): Promise<{
        allowed: boolean;
        reason?: 'QUOTA_HOURLY_EXCEEDED' | 'QUOTA_DAILY_EXCEEDED';
        message?: string;
        quotaResetAt?: number;
        waitMinutes?: number;
        used: number;
        limit: number;
    }>;
    checkQuota(userId: string): Promise<void>;
    recordSuccess(userId: string, sessionId: string): Promise<void>;
    getQuotaStatus(userId: string): Promise<{
        hourly: {
            used: number;
            limit: number;
            remaining: number;
        };
        daily: {
            used: number;
            limit: number;
            remaining: number;
        };
    }>;
    preCheckBatch(userId: string, requestedCount: number): Promise<{
        requestedCount: number;
        availableNow: number;
        availableLater: number;
        hourly: {
            used: number;
            limit: number;
            remaining: number;
            resetAt: number;
            waitMinutes: number;
        };
        daily: {
            used: number;
            limit: number;
            remaining: number;
            resetAt: number;
            waitMinutes: number;
        };
        recommendedAction: 'all_now' | 'partial' | 'all_wait';
        message: string;
    }>;
}
