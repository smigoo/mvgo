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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStatsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const token_usage_schema_1 = require("../schemas/token-usage.schema");
const user_schema_1 = require("../schemas/user.schema");
const admin_service_1 = require("../admin/admin.service");
const tasks_service_1 = require("../tasks/tasks.service");
const task_code_snapshot_service_1 = require("../tasks/task-code-snapshot.service");
const usage_export_1 = require("../admin/usage-export");
const fs_1 = require("fs");
const path_1 = require("path");
const modelPricingPath = (0, path_1.join)(__dirname, '../config/model-pricing.json');
let modelPricing = { pricing: { default: { input: 0.004, output: 0.012 } } };
try {
    modelPricing = JSON.parse((0, fs_1.readFileSync)(modelPricingPath, 'utf-8'));
}
catch (err) {
    console.warn('[task-stats] Failed to load model-pricing.json, using defaults');
}
let TaskStatsService = class TaskStatsService {
    adminService;
    tasksService;
    snapshotService;
    tokenUsageModel;
    userModel;
    constructor(adminService, tasksService, snapshotService, tokenUsageModel, userModel) {
        this.adminService = adminService;
        this.tasksService = tasksService;
        this.snapshotService = snapshotService;
        this.tokenUsageModel = tokenUsageModel;
        this.userModel = userModel;
    }
    async assertAdmin(userId) {
        await this.adminService.assertAdmin(userId);
    }
    async backfillTokenBaseURLs() {
        const result = { scanned: 0, updated: 0, skipped: 0, errors: 0 };
        const tokensWithoutBaseURL = await this.tokenUsageModel
            .find({ baseURL: { $exists: false } })
            .lean()
            .exec();
        result.scanned = tokensWithoutBaseURL.length;
        const tokensBySession = new Map();
        for (const token of tokensWithoutBaseURL) {
            if (!tokensBySession.has(token.sessionId)) {
                tokensBySession.set(token.sessionId, []);
            }
            tokensBySession.get(token.sessionId).push(token);
        }
        for (const [sessionId, tokens] of tokensBySession) {
            try {
                const task = this.tasksService.getTask(sessionId);
                if (!task) {
                    result.skipped += tokens.length;
                    continue;
                }
                const configSnapshot = task.configSnapshot || {};
                const textModel = configSnapshot.textModel;
                const visionModel = configSnapshot.visionModel;
                const textBaseURL = configSnapshot.textBaseURL;
                const visionBaseURL = configSnapshot.visionBaseURL;
                for (const token of tokens) {
                    let baseURL;
                    if (token.model === textModel && textBaseURL) {
                        baseURL = textBaseURL;
                    }
                    else if (token.model === visionModel && visionBaseURL) {
                        baseURL = visionBaseURL;
                    }
                    if (baseURL) {
                        await this.tokenUsageModel.updateOne({ _id: token._id }, { $set: { baseURL } });
                        result.updated++;
                    }
                    else {
                        result.skipped++;
                    }
                }
            }
            catch (err) {
                result.errors += tokens.length;
            }
        }
        return result;
    }
    classifyFailure(error) {
        const e = (error || '').toLowerCase();
        if (!e)
            return 'other';
        if (/(服务重启|重启|超时|timeout|api\s*key|key\s*错误|图片格式|图片|视觉识别未完成|视觉能力尚未检测|视觉能力|尚未检测不支持|未检测不支持)/.test(e)) {
            return 'env';
        }
        if (/(质量检查|质量门禁|编译门禁|less|分块生成失败|合规\s*json|无法解析|超出单次生成上限|超出当前模型能力|模型生成代码存在缺陷|引用了未定义变量|unexpected|unrecognised|截断)/.test(e)) {
            return 'quality';
        }
        if (/(is not defined|未定义|cannot find module|找不到模块)/.test(e)) {
            return 'other';
        }
        return 'other';
    }
    resolveWindow(tasks, filter) {
        if (!filter || (!filter.preset && !filter.from && !filter.to)) {
            return { filtered: tasks, windowLabel: '全部时间' };
        }
        try {
            const { current } = (0, usage_export_1.resolveWindows)({
                preset: filter.preset || 'week',
                from: filter.from,
                to: filter.to,
            });
            const filtered = tasks.filter((t) => {
                const ts = Number(t?.startTime);
                return Number.isFinite(ts) && ts > 0 && (0, usage_export_1.inWindow)(ts, current);
            });
            return { filtered, windowLabel: current.label };
        }
        catch (err) {
            return { filtered: tasks, windowLabel: `时间窗无效：${err?.message || err}` };
        }
    }
    async listAllTasks(filter) {
        const all = this.tasksService.getAllTasks(undefined, { slim: true });
        const { filtered, windowLabel } = this.resolveWindow(all, filter);
        const tokenRows = await this.tokenUsageModel.aggregate([
            {
                $group: {
                    _id: '$sessionId',
                    totalTokens: { $sum: '$totalTokens' },
                    callCount: { $sum: 1 },
                },
            },
        ]);
        const tokenMap = new Map();
        for (const r of tokenRows) {
            tokenMap.set(r._id, {
                totalTokens: r.totalTokens || 0,
                callCount: r.callCount || 0,
            });
        }
        const userIds = [...new Set(filtered.map((t) => t.userId).filter(Boolean))];
        const userMap = new Map();
        if (userIds.length > 0) {
            const users = await this.userModel
                .find({ _id: { $in: userIds } })
                .select('_id username')
                .lean()
                .exec();
            for (const u of users) {
                userMap.set(u._id.toString(), u.username);
            }
        }
        const list = filtered.map((task) => {
            const cs = task.configSnapshot || {};
            const cm = task.completionModels || {};
            const tok = tokenMap.get(task.sessionId);
            const snap = this.snapshotService.getLatestManifest(task.sessionId);
            const files = snap?.files || [];
            const hasLines = files.some((f) => typeof f.lines === 'number');
            const lineCount = hasLines
                ? files.reduce((s, f) => s + (f.lines || 0), 0)
                : undefined;
            return {
                sessionId: task.sessionId,
                userId: task.userId || '',
                username: userMap.get(task.userId) || task.userId || '',
                status: task.status,
                target: task.target || 'microcode',
                startTime: task.startTime,
                duration: task.duration,
                textModel: cs.textModel || cm.textModel || undefined,
                visionModel: cs.visionModel || cm.visionModel || undefined,
                textBaseURL: cs.textBaseURL || undefined,
                visionBaseURL: cs.visionBaseURL || undefined,
                totalTokens: tok?.totalTokens || 0,
                callCount: tok?.callCount || 0,
                fileCount: files.length,
                lineCount,
                componentName: task.componentName || undefined,
                failType: task.status === 'failed'
                    ? this.classifyFailure(task.error || task.reason)
                    : undefined,
                failReason: task.status === 'failed'
                    ? task.error || task.reason || ''
                    : undefined,
            };
        });
        return { list, count: list.length, windowLabel };
    }
    async modelCompare(filter) {
        const all = this.tasksService.getAllTasks(undefined, { slim: true });
        const { filtered, windowLabel } = this.resolveWindow(all, filter);
        const tokenByModel = await this.tokenUsageModel.aggregate([
            {
                $group: {
                    _id: {
                        model: '$model',
                        baseURL: { $ifNull: ['$baseURL', ''] },
                    },
                    totalTokens: { $sum: '$totalTokens' },
                    callCount: { $sum: 1 },
                },
            },
        ]);
        const tokenMap = new Map();
        for (const r of tokenByModel) {
            tokenMap.set(`${r._id.model}:${r._id.baseURL}`, {
                totalTokens: r.totalTokens || 0,
                callCount: r.callCount || 0,
            });
        }
        const tokenBySession = await this.tokenUsageModel.aggregate([
            {
                $group: {
                    _id: '$sessionId',
                    totalTokens: { $sum: '$totalTokens' },
                },
            },
        ]);
        const tokenSessionMap = new Map();
        for (const r of tokenBySession) {
            tokenSessionMap.set(r._id, r.totalTokens || 0);
        }
        const buckets = new Map();
        for (const task of filtered) {
            if (task.status === 'cancelled')
                continue;
            if (task.status === 'running' || task.status === 'pending')
                continue;
            const cs = task.configSnapshot || {};
            const pairs = [
                { type: 'text', model: cs.textModel, baseURL: cs.textBaseURL },
                { type: 'vision', model: cs.visionModel, baseURL: cs.visionBaseURL },
            ];
            let taskLineCount;
            if (task.status === 'completed') {
                const snap = this.snapshotService.getLatestManifest(task.sessionId);
                const files = snap?.files || [];
                const hasLines = files.some((f) => typeof f.lines === 'number');
                if (hasLines) {
                    taskLineCount = files.reduce((s, f) => s + (f.lines || 0), 0);
                }
            }
            for (const p of pairs) {
                if (!p.model)
                    continue;
                const key = `${p.type}:${p.model}:${p.baseURL || ''}`;
                let b = buckets.get(key);
                if (!b) {
                    b = {
                        type: p.type,
                        model: p.model,
                        baseURL: p.baseURL || '',
                        total: 0,
                        completed: 0,
                        qualityFail: 0,
                        envFail: 0,
                        otherFail: 0,
                        durations: [],
                        lineCounts: [],
                        efficiencySamples: [],
                    };
                    buckets.set(key, b);
                }
                b.total++;
                if (task.status === 'completed') {
                    b.completed++;
                    if (task.duration && task.duration > 0)
                        b.durations.push(task.duration);
                    if (taskLineCount && taskLineCount > 0)
                        b.lineCounts.push(taskLineCount);
                    if (task.duration && task.duration > 0 && taskLineCount && taskLineCount > 0) {
                        b.efficiencySamples.push({
                            durationMs: task.duration,
                            lineCount: taskLineCount,
                            tokens: tokenSessionMap.get(task.sessionId) || 0,
                        });
                    }
                }
                else if (task.status === 'failed') {
                    const ft = this.classifyFailure(task.error || task.reason);
                    if (ft === 'quality')
                        b.qualityFail++;
                    else if (ft === 'env')
                        b.envFail++;
                    else
                        b.otherFail++;
                }
            }
        }
        const list = [...buckets.values()]
            .map((b) => {
            const tok = tokenMap.get(`${b.model}:${b.baseURL}`) ||
                tokenMap.get(`${b.model}:`);
            const ok = b.completed;
            const qualityFail = b.qualityFail;
            const envFail = b.envFail;
            const otherFail = b.otherFail;
            const totalFail = qualityFail + envFail + otherFail;
            const totalDenom = ok + totalFail;
            const qualityDenom = ok + qualityFail;
            const efficiencySamples = b.efficiencySamples;
            let secPer100LinesP50 = null;
            let secPer100LinesP90 = null;
            let tokenKPer100LinesP50 = null;
            let tokenKPer100LinesP90 = null;
            if (efficiencySamples.length > 0) {
                const secPer100Arr = efficiencySamples
                    .map((s) => (s.durationMs / s.lineCount) * 100 / 1000)
                    .sort((a, b) => a - b);
                const tokenKPer100Arr = efficiencySamples
                    .map((s) => (s.tokens / s.lineCount) * 100 / 1000)
                    .sort((a, b) => a - b);
                secPer100LinesP50 = (0, usage_export_1.percentileMs)(secPer100Arr, 50);
                secPer100LinesP90 = (0, usage_export_1.percentileMs)(secPer100Arr, 90);
                tokenKPer100LinesP50 = (0, usage_export_1.percentileMs)(tokenKPer100Arr, 50);
                tokenKPer100LinesP90 = (0, usage_export_1.percentileMs)(tokenKPer100Arr, 90);
            }
            return {
                type: b.type,
                model: b.model,
                baseURL: b.baseURL,
                taskCount: b.total,
                completed: ok,
                failed: totalFail,
                qualityFail,
                envFail,
                otherFail,
                successRate: totalDenom > 0 ? +(ok / totalDenom).toFixed(4) : null,
                qualitySuccessRate: qualityDenom > 0 ? +(ok / qualityDenom).toFixed(4) : null,
                durationP50Ms: (0, usage_export_1.percentileMs)(b.durations, 50),
                durationP90Ms: (0, usage_export_1.percentileMs)(b.durations, 90),
                componentCount: ok,
                totalTokens: tok?.totalTokens || 0,
                callCount: tok?.callCount || 0,
                avgLineCount: b.lineCounts.length > 0
                    ? Math.round(b.lineCounts.reduce((s, n) => s + n, 0) / b.lineCounts.length)
                    : 0,
                secPer100LinesP50,
                secPer100LinesP90,
                tokenKPer100LinesP50,
                tokenKPer100LinesP90,
                efficiencySampleCount: efficiencySamples.length,
                smallSample: b.total < 3,
            };
        })
            .sort((a, b) => (b.successRate ?? -1) - (a.successRate ?? -1) ||
            b.taskCount - a.taskCount);
        return { list, count: list.length, windowLabel };
    }
    async trends(filter, metric = 'successRate', granularity = 'day') {
        const all = this.tasksService.getAllTasks(undefined, { slim: true });
        const { filtered, windowLabel } = this.resolveWindow(all, filter);
        const buckets = new Map();
        const tokenBySession = await this.tokenUsageModel.aggregate([
            {
                $group: {
                    _id: '$sessionId',
                    totalTokens: { $sum: '$totalTokens' },
                },
            },
        ]);
        const tokenMap = new Map();
        for (const r of tokenBySession) {
            tokenMap.set(r._id, r.totalTokens || 0);
        }
        for (const task of filtered) {
            if (task.status === 'cancelled')
                continue;
            const startTime = Number(task.startTime);
            if (!Number.isFinite(startTime) || startTime <= 0)
                continue;
            const date = new Date(startTime);
            let bucketKey;
            let bucketTimestamp;
            if (granularity === 'week') {
                const dayOfWeek = date.getDay();
                const monday = new Date(date);
                monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                monday.setHours(0, 0, 0, 0);
                bucketKey = monday.toISOString().split('T')[0];
                bucketTimestamp = monday.getTime();
            }
            else {
                bucketKey = date.toISOString().split('T')[0];
                const dayStart = new Date(date);
                dayStart.setHours(0, 0, 0, 0);
                bucketTimestamp = dayStart.getTime();
            }
            let bucket = buckets.get(bucketKey);
            if (!bucket) {
                bucket = {
                    timestamp: bucketTimestamp,
                    total: 0,
                    completed: 0,
                    durations: [],
                    tokens: 0,
                };
                buckets.set(bucketKey, bucket);
            }
            bucket.total++;
            if (task.status === 'completed') {
                bucket.completed++;
                if (task.duration && task.duration > 0) {
                    bucket.durations.push(task.duration);
                }
            }
            bucket.tokens += tokenMap.get(task.sessionId) || 0;
        }
        const series = [...buckets.values()]
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((bucket) => {
            const totalDenom = bucket.total;
            const successRate = totalDenom > 0 ? +(bucket.completed / totalDenom).toFixed(4) : null;
            const durationP50 = (0, usage_export_1.percentileMs)(bucket.durations, 50);
            const durationP90 = (0, usage_export_1.percentileMs)(bucket.durations, 90);
            return {
                timestamp: bucket.timestamp,
                taskCount: bucket.total,
                completed: bucket.completed,
                successRate,
                durationP50Ms: durationP50,
                durationP90Ms: durationP90,
                totalTokens: bucket.tokens,
            };
        });
        return {
            series,
            metric,
            granularity,
            count: series.length,
            windowLabel,
        };
    }
    async userStats(filter) {
        const all = this.tasksService.getAllTasks(undefined, { slim: true });
        const { filtered, windowLabel } = this.resolveWindow(all, filter);
        const userIds = [...new Set(filtered.map((t) => t.userId).filter(Boolean))];
        const userMap = new Map();
        if (userIds.length > 0) {
            const users = await this.userModel
                .find({ _id: { $in: userIds } })
                .select('_id username portalInfo')
                .lean()
                .exec();
            for (const u of users) {
                const dept = u.portalInfo?.deptName || u.portalInfo?.department || u.portalInfo?.orgName || '';
                userMap.set(u._id.toString(), {
                    username: u.username,
                    department: dept,
                });
            }
        }
        const userBuckets = new Map();
        for (const task of filtered) {
            const userId = task.userId || '';
            if (!userId)
                continue;
            let bucket = userBuckets.get(userId);
            if (!bucket) {
                const userInfo = userMap.get(userId);
                bucket = {
                    userId,
                    username: userInfo?.username || userId,
                    department: userInfo?.department || '',
                    total: 0,
                    completed: 0,
                    failed: 0,
                    cancelled: 0,
                    durations: [],
                    lastUsedAt: 0,
                    models: new Map(),
                };
                userBuckets.set(userId, bucket);
            }
            bucket.total++;
            if (task.status === 'completed') {
                bucket.completed++;
                if (task.duration && task.duration > 0) {
                    bucket.durations.push(task.duration);
                }
            }
            else if (task.status === 'failed') {
                bucket.failed++;
            }
            else if (task.status === 'cancelled') {
                bucket.cancelled++;
            }
            const startTime = Number(task.startTime);
            if (Number.isFinite(startTime) && startTime > bucket.lastUsedAt) {
                bucket.lastUsedAt = startTime;
            }
            const cs = task.configSnapshot || {};
            if (cs.textModel) {
                bucket.models.set(cs.textModel, (bucket.models.get(cs.textModel) || 0) + 1);
            }
            if (cs.visionModel) {
                bucket.models.set(cs.visionModel, (bucket.models.get(cs.visionModel) || 0) + 1);
            }
        }
        const list = [...userBuckets.values()]
            .map((b) => {
            const totalDenom = b.completed + b.failed;
            const successRate = totalDenom > 0 ? +(b.completed / totalDenom).toFixed(4) : null;
            const topModels = [...b.models.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([model, count]) => ({ model, count }));
            return {
                userId: b.userId,
                username: b.username,
                department: b.department,
                taskCount: b.total,
                completed: b.completed,
                failed: b.failed,
                cancelled: b.cancelled,
                successRate,
                durationP50Ms: (0, usage_export_1.percentileMs)(b.durations, 50),
                durationP90Ms: (0, usage_export_1.percentileMs)(b.durations, 90),
                lastUsedAt: b.lastUsedAt,
                topModels,
                smallSample: b.total < 3,
            };
        })
            .sort((a, b) => b.taskCount - a.taskCount);
        const deptMap = new Map();
        for (const item of list) {
            const dept = item.department || '未分配部门';
            let deptBucket = deptMap.get(dept);
            if (!deptBucket) {
                deptBucket = {
                    department: dept,
                    userCount: 0,
                    taskCount: 0,
                    completed: 0,
                    failed: 0,
                    durations: [],
                };
                deptMap.set(dept, deptBucket);
            }
            deptBucket.userCount++;
            deptBucket.taskCount += item.taskCount;
            deptBucket.completed += item.completed;
            deptBucket.failed += item.failed;
            if (item.durationP50Ms)
                deptBucket.durations.push(item.durationP50Ms);
        }
        const departments = [...deptMap.values()]
            .map((d) => {
            const totalDenom = d.completed + d.failed;
            const successRate = totalDenom > 0 ? +(d.completed / totalDenom).toFixed(4) : null;
            return {
                department: d.department,
                userCount: d.userCount,
                taskCount: d.taskCount,
                completed: d.completed,
                failed: d.failed,
                successRate,
                durationP50Ms: (0, usage_export_1.percentileMs)(d.durations, 50),
            };
        })
            .sort((a, b) => b.taskCount - a.taskCount);
        return { list, departments, count: list.length, windowLabel };
    }
    async dashboard(filter) {
        const all = this.tasksService.getAllTasks(undefined, { slim: true });
        const defaultFilter = filter?.preset || filter?.from || filter?.to
            ? filter
            : { preset: 'd30' };
        const { filtered, windowLabel } = this.resolveWindow(all, defaultFilter);
        const tokenBySession = await this.tokenUsageModel.aggregate([
            {
                $group: {
                    _id: '$sessionId',
                    totalTokens: { $sum: '$totalTokens' },
                    inputTokens: { $sum: '$inputTokens' },
                    outputTokens: { $sum: '$outputTokens' },
                    models: { $addToSet: '$model' },
                },
            },
        ]);
        const tokenSessionMap = new Map();
        const costSessionMap = new Map();
        for (const r of tokenBySession) {
            tokenSessionMap.set(r._id, r.totalTokens || 0);
            const model = r.models?.[0] || 'default';
            const pricing = modelPricing.pricing[model] || modelPricing.pricing.default;
            const cost = ((r.inputTokens || 0) * pricing.input + (r.outputTokens || 0) * pricing.output) / 1000;
            costSessionMap.set(r._id, cost);
        }
        const userIds = [...new Set(filtered.map((t) => t.userId).filter(Boolean))];
        const userMap = new Map();
        if (userIds.length > 0) {
            const users = await this.userModel
                .find({ _id: { $in: userIds } })
                .select('_id username portalInfo')
                .lean()
                .exec();
            for (const u of users) {
                const dept = u.portalInfo?.deptName || u.portalInfo?.department || u.portalInfo?.orgName || '';
                userMap.set(u._id.toString(), {
                    username: u.username,
                    department: dept,
                });
            }
        }
        let totalTasks = 0;
        let completedTasks = 0;
        let failedTasks = 0;
        let totalDuration = 0;
        let totalTokens = 0;
        let totalCost = 0;
        let firstTrySuccessCount = 0;
        const activeUserIds = new Set();
        const failBreakdown = { quality: 0, env: 0, other: 0 };
        for (const task of filtered) {
            if (task.status === 'cancelled')
                continue;
            totalTasks++;
            activeUserIds.add(task.userId);
            if (task.status === 'completed') {
                completedTasks++;
                if (task.duration && task.duration > 0) {
                    totalDuration += task.duration;
                }
                totalTokens += tokenSessionMap.get(task.sessionId) || 0;
                totalCost += costSessionMap.get(task.sessionId) || 0;
                if (!task.retryCount || task.retryCount === 0) {
                    firstTrySuccessCount++;
                }
            }
            else if (task.status === 'failed') {
                failedTasks++;
                const ft = this.classifyFailure(task.error || task.reason);
                failBreakdown[ft]++;
            }
        }
        const overview = {
            totalTasks,
            completedTasks,
            failedTasks,
            successRate: totalTasks > 0 ? +(completedTasks / totalTasks).toFixed(4) : null,
            firstTrySuccessRate: completedTasks > 0 ? +(firstTrySuccessCount / completedTasks).toFixed(4) : null,
            avgDurationMs: completedTasks > 0 ? Math.round(totalDuration / completedTasks) : 0,
            totalTokens,
            totalCost: +totalCost.toFixed(2),
            avgCostPerTask: completedTasks > 0 ? +(totalCost / completedTasks).toFixed(4) : 0,
            activeUsers: activeUserIds.size,
            windowLabel,
        };
        const modelCompareResult = await this.modelCompare(defaultFilter);
        const modelRanking = modelCompareResult.list
            .filter((m) => !m.smallSample)
            .slice(0, 10)
            .map((m) => ({
            type: m.type,
            model: m.model,
            baseURL: m.baseURL,
            taskCount: m.taskCount,
            successRate: m.successRate,
            qualitySuccessRate: m.qualitySuccessRate,
            secPer100LinesP50: m.secPer100LinesP50,
            tokenKPer100LinesP50: m.tokenKPer100LinesP50,
        }));
        const modelScatterData = modelCompareResult.list
            .filter((m) => !m.smallSample)
            .map((m) => {
            const pricing = modelPricing.pricing[m.model] || modelPricing.pricing.default;
            const avgCostPer100Lines = (m.tokenKPer100LinesP50 || 0) * (pricing.input + pricing.output) / 2;
            return {
                model: m.model,
                type: m.type,
                taskCount: m.taskCount,
                successRate: m.successRate,
                avgCostPer100Lines: +avgCostPer100Lines.toFixed(4),
                secPer100LinesP50: m.secPer100LinesP50,
                tokenKPer100LinesP50: m.tokenKPer100LinesP50,
            };
        })
            .filter((m) => (m.successRate ?? 0) > 0 && (m.avgCostPer100Lines ?? 0) > 0);
        const trendsResult = await this.trends(defaultFilter, 'successRate', 'day');
        const trends = trendsResult.series.map((p) => ({
            timestamp: p.timestamp,
            successRate: p.successRate,
            durationP50Ms: p.durationP50Ms,
            taskCount: p.taskCount,
        }));
        const failTotal = failBreakdown.quality + failBreakdown.env + failBreakdown.other;
        const failDetails = {
            quality: [],
            env: [],
            other: [],
        };
        for (const task of filtered) {
            if (task.status !== 'failed')
                continue;
            const ft = this.classifyFailure(task.error || task.reason);
            failDetails[ft].push({
                sessionId: task.sessionId,
                componentName: task.componentName || task.sessionId,
                error: task.error || task.reason || '未知错误',
                startTime: task.startTime,
            });
        }
        const failDistribution = {
            quality: failBreakdown.quality,
            qualityRate: failTotal > 0 ? +(failBreakdown.quality / failTotal).toFixed(4) : 0,
            qualityDetails: failDetails.quality.slice(0, 20),
            env: failBreakdown.env,
            envRate: failTotal > 0 ? +(failBreakdown.env / failTotal).toFixed(4) : 0,
            envDetails: failDetails.env.slice(0, 20),
            other: failBreakdown.other,
            otherRate: failTotal > 0 ? +(failBreakdown.other / failTotal).toFixed(4) : 0,
            otherDetails: failDetails.other.slice(0, 20),
            total: failTotal,
        };
        const userStatsResult = await this.userStats(defaultFilter);
        const departmentSummary = userStatsResult.departments;
        return {
            overview,
            modelRanking,
            modelScatterData,
            trends,
            failDistribution,
            departmentSummary,
            windowLabel,
        };
    }
    async myDashboard(userId, filter) {
        const all = this.tasksService.getAllTasks(undefined, { slim: true });
        const defaultFilter = filter?.preset || filter?.from || filter?.to
            ? filter
            : { preset: 'd30' };
        const { filtered, windowLabel } = this.resolveWindow(all, defaultFilter);
        const myTasks = filtered.filter((t) => t.userId === userId);
        const tokenBySession = await this.tokenUsageModel.aggregate([
            {
                $match: { userId },
                $group: {
                    _id: '$sessionId',
                    totalTokens: { $sum: '$totalTokens' },
                    inputTokens: { $sum: '$inputTokens' },
                    outputTokens: { $sum: '$outputTokens' },
                    models: { $addToSet: '$model' },
                },
            },
        ]);
        const tokenSessionMap = new Map();
        const costSessionMap = new Map();
        for (const r of tokenBySession) {
            tokenSessionMap.set(r._id, r.totalTokens || 0);
            const model = r.models?.[0] || 'default';
            const pricing = modelPricing.pricing[model] || modelPricing.pricing.default;
            const cost = ((r.inputTokens || 0) * pricing.input + (r.outputTokens || 0) * pricing.output) / 1000;
            costSessionMap.set(r._id, cost);
        }
        let totalTasks = 0;
        let completedTasks = 0;
        let failedTasks = 0;
        let totalDuration = 0;
        let totalTokens = 0;
        let totalCost = 0;
        let firstTrySuccessCount = 0;
        const modelUsage = new Map();
        for (const task of myTasks) {
            if (task.status === 'cancelled')
                continue;
            totalTasks++;
            const model = task.configSnapshot?.textModel || task.configSnapshot?.visionModel || 'unknown';
            if (!modelUsage.has(model)) {
                modelUsage.set(model, { count: 0, success: 0 });
            }
            const modelStat = modelUsage.get(model);
            modelStat.count++;
            if (task.status === 'completed') {
                completedTasks++;
                modelStat.success++;
                if (task.duration && task.duration > 0) {
                    totalDuration += task.duration;
                }
                totalTokens += tokenSessionMap.get(task.sessionId) || 0;
                totalCost += costSessionMap.get(task.sessionId) || 0;
                if (!task.retryCount || task.retryCount === 0) {
                    firstTrySuccessCount++;
                }
            }
            else if (task.status === 'failed') {
                failedTasks++;
            }
        }
        const overview = {
            totalTasks,
            completedTasks,
            failedTasks,
            successRate: totalTasks > 0 ? +(completedTasks / totalTasks).toFixed(4) : null,
            firstTrySuccessRate: completedTasks > 0 ? +(firstTrySuccessCount / completedTasks).toFixed(4) : null,
            avgDurationMs: completedTasks > 0 ? Math.round(totalDuration / completedTasks) : 0,
            totalTokens,
            totalCost: +totalCost.toFixed(2),
            avgCostPerTask: completedTasks > 0 ? +(totalCost / completedTasks).toFixed(4) : 0,
            windowLabel,
        };
        const myModels = Array.from(modelUsage.entries())
            .map(([model, stat]) => ({
            model,
            taskCount: stat.count,
            successCount: stat.success,
            successRate: stat.count > 0 ? +(stat.success / stat.count).toFixed(4) : 0,
        }))
            .sort((a, b) => b.taskCount - a.taskCount)
            .slice(0, 10);
        return {
            overview,
            myModels,
            windowLabel,
        };
    }
};
exports.TaskStatsService = TaskStatsService;
exports.TaskStatsService = TaskStatsService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, mongoose_1.InjectModel)(token_usage_schema_1.TokenUsage.name)),
    __param(4, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        tasks_service_1.TasksService,
        task_code_snapshot_service_1.TaskCodeSnapshotService,
        mongoose_2.Model,
        mongoose_2.Model])
], TaskStatsService);
//# sourceMappingURL=task-stats.service.js.map