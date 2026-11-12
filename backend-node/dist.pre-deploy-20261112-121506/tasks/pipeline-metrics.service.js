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
var PipelineMetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineMetricsService = void 0;
exports.rootDomainOf = rootDomainOf;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const generation_metric_schema_1 = require("../schemas/generation-metric.schema");
const user_schema_1 = require("../schemas/user.schema");
const TWO_LEVEL_TLDS = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'co.jp', 'co.uk'];
function rootDomainOf(url) {
    if (!url || typeof url !== 'string')
        return undefined;
    try {
        const host = new URL(url).hostname;
        const parts = host.split('.');
        if (parts.length <= 2)
            return host;
        const last2 = parts.slice(-2).join('.');
        return TWO_LEVEL_TLDS.includes(last2) ? parts.slice(-3).join('.') : last2;
    }
    catch {
        return undefined;
    }
}
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
let PipelineMetricsService = PipelineMetricsService_1 = class PipelineMetricsService {
    metricModel;
    userModel;
    logger = new common_1.Logger(PipelineMetricsService_1.name);
    constructor(metricModel, userModel) {
        this.metricModel = metricModel;
        this.userModel = userModel;
    }
    excludedUids() {
        return (process.env.PIPELINE_METRICS_EXCLUDE_UIDS ?? 'dev-local')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    recordTerminal(task, status, opts = {}) {
        if (!this.metricModel || !task?.sessionId)
            return;
        void this.write(task, status, opts).catch((err) => {
            this.logger.warn(`指标宽表写入失败: ${err?.message || err} (sessionId=${task?.sessionId})`);
        });
    }
    recordRevert(sessionId) {
        if (!this.metricModel || !sessionId)
            return;
        void this.metricModel
            .deleteOne({ sessionId })
            .exec()
            .catch((err) => {
            this.logger.warn(`指标宽表回滚失败: ${err?.message || err} (sessionId=${sessionId})`);
        });
    }
    async write(task, status, opts) {
        let username;
        let uid;
        let deptName;
        let orgName;
        if (task.userId && OBJECT_ID_RE.test(String(task.userId)) && this.userModel) {
            try {
                const user = await this.userModel.findById(task.userId).lean().exec();
                if (user) {
                    username = user.username || undefined;
                    uid = user.uid || undefined;
                    const portal = (user.portalInfo || {});
                    deptName = portal.deptName || undefined;
                    orgName = portal.orgName || undefined;
                }
            }
            catch (err) {
                this.logger.warn(`指标宽表用户快照失败: ${err?.message || err} (userId=${task.userId})`);
            }
        }
        const cs = task.configSnapshot || {};
        const completion = task.completionModels || {};
        const unified = cs.modelMode === 'unified';
        const textModel = completion.textModel || (unified ? cs.unifiedModel : cs.textModel) || undefined;
        const visionModel = completion.visionModel || (unified ? cs.unifiedModel : cs.visionModel) || undefined;
        const textRootDomain = rootDomainOf(unified ? cs.unifiedBaseURL : cs.textBaseURL);
        const visionRootDomain = rootDomainOf(unified ? cs.unifiedBaseURL : cs.visionBaseURL);
        const rootDomains = Array.from(new Set([textRootDomain, visionRootDomain].filter(Boolean)));
        const excludedUids = this.excludedUids();
        const excluded = Boolean(uid && excludedUids.includes(uid));
        const doc = {
            sessionId: task.sessionId,
            userId: task.userId ? String(task.userId) : undefined,
            username,
            uid,
            deptName,
            orgName,
            target: task.target || undefined,
            sourceType: task.sourceType || undefined,
            generationTier: task.generationTier || undefined,
            taskType: task.taskType || undefined,
            status,
            cancelReason: opts.cancelReason,
            componentId: task.componentId || undefined,
            componentName: task.componentName || task.displayName || undefined,
            startTime: task.startTime || undefined,
            endTime: task.endTime || undefined,
            duration: task.duration || undefined,
            error: typeof task.error === 'string' ? task.error : undefined,
            qualityGate: task.qualityGate || undefined,
            textModel,
            visionModel,
            textRootDomain,
            visionRootDomain,
            rootDomains,
            gates: task.gates || [],
            excluded,
            excludedReason: excluded ? `uid 在排除清单内（${excludedUids.join(',')}）` : undefined,
        };
        await this.metricModel
            .updateOne({ sessionId: task.sessionId }, { $set: doc }, { upsert: true })
            .exec();
    }
};
exports.PipelineMetricsService = PipelineMetricsService;
exports.PipelineMetricsService = PipelineMetricsService = PipelineMetricsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, mongoose_1.InjectModel)(generation_metric_schema_1.GenerationMetric.name)),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], PipelineMetricsService);
//# sourceMappingURL=pipeline-metrics.service.js.map