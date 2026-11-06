"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TokenTrackerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenTrackerService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const token_usage_schema_1 = require("../schemas/token-usage.schema");
const MODEL_PRICING = [
    {
        model: 'claude-opus-4-8',
        modelType: 'text',
        inputPricePerMillion: 108,
        outputPricePerMillion: 540,
    },
    {
        model: 'claude-opus-4',
        modelType: 'text',
        inputPricePerMillion: 108,
        outputPricePerMillion: 540,
    },
    {
        model: 'claude-sonnet-4-6',
        modelType: 'text',
        inputPricePerMillion: 22,
        outputPricePerMillion: 110,
    },
    {
        model: 'claude-sonnet-4',
        modelType: 'text',
        inputPricePerMillion: 22,
        outputPricePerMillion: 110,
    },
    {
        model: 'claude-haiku-4',
        modelType: 'text',
        inputPricePerMillion: 5,
        outputPricePerMillion: 25,
    },
    {
        model: 'gpt-4o',
        modelType: 'text',
        inputPricePerMillion: 18,
        outputPricePerMillion: 72,
    },
    {
        model: 'gpt-4o-mini',
        modelType: 'text',
        inputPricePerMillion: 1,
        outputPricePerMillion: 4,
    },
    {
        model: 'qwen3.7-plus',
        modelType: 'vision',
        inputPricePerMillion: 0.8,
        outputPricePerMillion: 2.0,
    },
    {
        model: 'qwen-vl-plus',
        modelType: 'vision',
        inputPricePerMillion: 0.8,
        outputPricePerMillion: 2.0,
    },
    {
        model: 'deepseek-v3',
        modelType: 'text',
        inputPricePerMillion: 2,
        outputPricePerMillion: 8,
    },
    {
        model: 'gemini-2.5-pro',
        modelType: 'text',
        inputPricePerMillion: 10,
        outputPricePerMillion: 40,
    },
];
const DEFAULT_PRICING = {
    model: 'unknown',
    modelType: 'text',
    inputPricePerMillion: 10,
    outputPricePerMillion: 40,
};
let TokenTrackerService = TokenTrackerService_1 = class TokenTrackerService {
    tokenUsageModel;
    logger = new common_1.Logger(TokenTrackerService_1.name);
    constructor(tokenUsageModel) {
        this.tokenUsageModel = tokenUsageModel;
    }
    recordUsage(data) {
        setImmediate(async () => {
            try {
                await this.tokenUsageModel.create({
                    sessionId: data.sessionId,
                    nodeName: data.nodeName,
                    model: data.model,
                    modelType: data.modelType,
                    inputTokens: data.inputTokens,
                    outputTokens: data.outputTokens,
                    totalTokens: data.totalTokens,
                    duration: data.duration,
                    timestamp: data.timestamp || new Date(),
                    componentName: data.componentName,
                    fileKey: data.fileKey,
                    nodeId: data.nodeId,
                    userId: data.userId,
                    baseURL: data.baseURL,
                });
            }
            catch (err) {
                this.logger.warn(`Token 记录写入失败: ${err.message} (sessionId=${data.sessionId}, node=${data.nodeName})`);
            }
        });
    }
    async getTaskUsage(sessionId) {
        const records = await this.tokenUsageModel
            .find({ sessionId })
            .sort({ timestamp: 1 })
            .lean()
            .exec();
        const totalInputTokens = records.reduce((s, r) => s + r.inputTokens, 0);
        const totalOutputTokens = records.reduce((s, r) => s + r.outputTokens, 0);
        const totalTokens = records.reduce((s, r) => s + r.totalTokens, 0);
        const callCount = records.length;
        const avgDuration = callCount > 0
            ? Math.round(records.reduce((s, r) => s + (r.duration || 0), 0) / callCount)
            : 0;
        const nodeMap = new Map();
        for (const r of records) {
            const existing = nodeMap.get(r.nodeName) || { totalTokens: 0, callCount: 0 };
            existing.totalTokens += r.totalTokens;
            existing.callCount += 1;
            nodeMap.set(r.nodeName, existing);
        }
        let estimatedCost = 0;
        for (const r of records) {
            estimatedCost += this.estimateCost(r.model, r.inputTokens, r.outputTokens);
        }
        return {
            sessionId,
            records: records.map((r) => ({
                nodeName: r.nodeName,
                model: r.model,
                modelType: r.modelType,
                inputTokens: r.inputTokens,
                outputTokens: r.outputTokens,
                totalTokens: r.totalTokens,
                duration: r.duration,
                timestamp: r.timestamp,
            })),
            summary: {
                totalInputTokens,
                totalOutputTokens,
                totalTokens,
                callCount,
                avgDuration,
                estimatedCost: +estimatedCost.toFixed(4),
            },
            byNode: Array.from(nodeMap.entries()).map(([nodeName, v]) => ({
                nodeName,
                totalTokens: v.totalTokens,
                callCount: v.callCount,
            })),
        };
    }
    async getStats(query) {
        const days = query.days || 7;
        const startDate = this.computeStartDate(query.period, days);
        const result = await this.tokenUsageModel.aggregate([
            { $match: { timestamp: { $gte: startDate } } },
            {
                $facet: {
                    overall: [
                        {
                            $group: {
                                _id: null,
                                totalInputTokens: { $sum: '$inputTokens' },
                                totalOutputTokens: { $sum: '$outputTokens' },
                                totalTokens: { $sum: '$totalTokens' },
                                callCount: { $sum: 1 },
                                avgDuration: { $avg: '$duration' },
                            },
                        },
                    ],
                    byModel: [
                        {
                            $group: {
                                _id: '$model',
                                inputTokens: { $sum: '$inputTokens' },
                                outputTokens: { $sum: '$outputTokens' },
                                totalTokens: { $sum: '$totalTokens' },
                                callCount: { $sum: 1 },
                            },
                        },
                    ],
                    byNode: [
                        {
                            $group: {
                                _id: '$nodeName',
                                totalTokens: { $sum: '$totalTokens' },
                                callCount: { $sum: 1 },
                            },
                        },
                    ],
                    daily: [
                        {
                            $group: {
                                _id: {
                                    $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
                                },
                                totalTokens: { $sum: '$totalTokens' },
                                callCount: { $sum: 1 },
                                inputTokens: { $sum: '$inputTokens' },
                                outputTokens: { $sum: '$outputTokens' },
                            },
                        },
                        { $sort: { _id: 1 } },
                    ],
                    modelDetails: [
                        {
                            $group: {
                                _id: { model: '$model', inputTokens: '$inputTokens', outputTokens: '$outputTokens' },
                            },
                        },
                    ],
                },
            },
        ]);
        const facet = result[0] || {};
        const overallRaw = facet.overall?.[0] || {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            callCount: 0,
            avgDuration: 0,
        };
        const byModel = (facet.byModel || []).map((m) => {
            const cost = this.estimateCost(m._id, m.inputTokens, m.outputTokens);
            return {
                model: m._id,
                inputTokens: m.inputTokens,
                outputTokens: m.outputTokens,
                totalTokens: m.totalTokens,
                callCount: m.callCount,
                estimatedCost: +cost.toFixed(4),
            };
        });
        let overallCost = 0;
        for (const m of byModel) {
            overallCost += m.estimatedCost;
        }
        return {
            overall: {
                totalInputTokens: overallRaw.totalInputTokens || 0,
                totalOutputTokens: overallRaw.totalOutputTokens || 0,
                totalTokens: overallRaw.totalTokens || 0,
                callCount: overallRaw.callCount || 0,
                avgDuration: Math.round(overallRaw.avgDuration || 0),
                estimatedCost: +overallCost.toFixed(4),
            },
            byModel,
            byNode: (facet.byNode || []).map((n) => ({
                nodeName: n._id,
                totalTokens: n.totalTokens,
                callCount: n.callCount,
            })),
            daily: (facet.daily || []).map((d) => {
                const cost = this.estimateCost('unknown', d.inputTokens, d.outputTokens);
                return {
                    date: d._id,
                    totalTokens: d.totalTokens,
                    callCount: d.callCount,
                    estimatedCost: +cost.toFixed(4),
                };
            }),
        };
    }
    async getBudgetStatus(sessionId) {
        const budget = parseInt(process.env.TOKEN_BUDGET || '50000', 10);
        const warningThreshold = parseFloat(process.env.BUDGET_WARNING_THRESHOLD || '0.8');
        const result = await this.tokenUsageModel.aggregate([
            { $match: { sessionId } },
            { $group: { _id: null, used: { $sum: '$totalTokens' } } },
        ]);
        const used = result[0]?.used || 0;
        return {
            sessionId,
            used,
            budget,
            remaining: Math.max(0, budget - used),
            usagePercent: budget > 0 ? +((used / budget) * 100).toFixed(1) : 0,
            warning: used >= budget * warningThreshold,
            exceeded: used > budget,
            warningThreshold,
        };
    }
    getPricing() {
        return MODEL_PRICING;
    }
    estimateCost(model, inputTokens, outputTokens) {
        const pricing = MODEL_PRICING.find((p) => model?.toLowerCase().includes(p.model.toLowerCase())) ||
            DEFAULT_PRICING;
        const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
        const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
        return inputCost + outputCost;
    }
    computeStartDate(period, days = 7) {
        const now = new Date();
        if (period === 'monthly') {
            return new Date(now.getFullYear(), now.getMonth() - (days - 1), 1);
        }
        if (period === 'weekly') {
            const start = new Date(now);
            start.setDate(start.getDate() - days * 7);
            return start;
        }
        const start = new Date(now);
        start.setDate(start.getDate() - days);
        start.setHours(0, 0, 0, 0);
        return start;
    }
};
exports.TokenTrackerService = TokenTrackerService;
exports.TokenTrackerService = TokenTrackerService = TokenTrackerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(token_usage_schema_1.TokenUsage.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], TokenTrackerService);
//# sourceMappingURL=token-tracker.service.js.map