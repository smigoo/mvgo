import { Model } from 'mongoose';
import { TokenUsageDocument } from '../schemas/token-usage.schema';
import { TokenUsageRecord, TaskUsageResponse, TokenStatsResponse, BudgetStatusResponse, StatsQuery, ModelPricing } from './dto/token-usage.dto';
export declare class TokenTrackerService {
    private tokenUsageModel;
    private readonly logger;
    constructor(tokenUsageModel: Model<TokenUsageDocument>);
    recordUsage(data: TokenUsageRecord): void;
    getTaskUsage(sessionId: string): Promise<TaskUsageResponse>;
    getStats(query: StatsQuery): Promise<TokenStatsResponse>;
    getBudgetStatus(sessionId: string): Promise<BudgetStatusResponse>;
    getPricing(): ModelPricing[];
    estimateCost(model: string, inputTokens: number, outputTokens: number): number;
    private computeStartDate;
}
