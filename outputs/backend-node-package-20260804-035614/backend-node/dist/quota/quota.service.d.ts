export declare class QuotaService {
    private readonly logger;
    private readonly HOURLY_LIMIT;
    private readonly DAILY_LIMIT;
    private userQuotas;
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
}
