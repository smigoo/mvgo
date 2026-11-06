import { TokenTrackerService } from './token-tracker.service';
import { TaskUsageResponse, TokenStatsResponse, BudgetStatusResponse, PricingTableResponse } from './dto/token-usage.dto';
export declare class TokenUsageController {
    private readonly tokenTrackerService;
    constructor(tokenTrackerService: TokenTrackerService);
    getTaskUsage(sessionId: string): Promise<{
        success: boolean;
        data: TaskUsageResponse;
    }>;
    getStats(period?: string, days?: string): Promise<{
        success: boolean;
        data: TokenStatsResponse;
    }>;
    getBudgetStatus(sessionId: string): Promise<{
        success: boolean;
        data: BudgetStatusResponse;
    }>;
    getPricing(): {
        success: boolean;
        data: PricingTableResponse;
    };
}
