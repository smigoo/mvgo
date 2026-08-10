export interface TokenUsageRecord {
    sessionId: string;
    nodeName: string;
    model: string;
    modelType: 'vision' | 'text';
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    duration: number;
    timestamp?: string | Date;
    componentName?: string;
    fileKey?: string;
    nodeId?: string;
}
export interface TaskUsageResponse {
    sessionId: string;
    records: Array<{
        nodeName: string;
        model: string;
        modelType: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        duration: number;
        timestamp: Date;
    }>;
    summary: {
        totalInputTokens: number;
        totalOutputTokens: number;
        totalTokens: number;
        callCount: number;
        avgDuration: number;
        estimatedCost: number;
    };
    byNode: Array<{
        nodeName: string;
        totalTokens: number;
        callCount: number;
    }>;
}
export interface StatsQuery {
    period?: 'daily' | 'weekly' | 'monthly';
    days?: number;
}
export interface TokenStatsResponse {
    overall: {
        totalInputTokens: number;
        totalOutputTokens: number;
        totalTokens: number;
        callCount: number;
        avgDuration: number;
        estimatedCost: number;
    };
    byModel: Array<{
        model: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        callCount: number;
        estimatedCost: number;
    }>;
    byNode: Array<{
        nodeName: string;
        totalTokens: number;
        callCount: number;
    }>;
    daily: Array<{
        date: string;
        totalTokens: number;
        callCount: number;
        estimatedCost: number;
    }>;
}
export interface BudgetStatusResponse {
    sessionId: string;
    used: number;
    budget: number;
    remaining: number;
    usagePercent: number;
    warning: boolean;
    exceeded: boolean;
    warningThreshold: number;
}
export interface ModelPricing {
    model: string;
    modelType: 'vision' | 'text';
    inputPricePerMillion: number;
    outputPricePerMillion: number;
}
export interface PricingTableResponse {
    models: ModelPricing[];
    currency: string;
}
