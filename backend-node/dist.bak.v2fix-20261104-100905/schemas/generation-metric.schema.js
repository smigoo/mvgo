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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerationMetricSchema = exports.GenerationMetric = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let GenerationMetric = class GenerationMetric {
    sessionId;
    userId;
    username;
    uid;
    deptName;
    orgName;
    target;
    sourceType;
    generationTier;
    taskType;
    status;
    cancelReason;
    componentId;
    componentName;
    startTime;
    endTime;
    duration;
    error;
    qualityGate;
    textModel;
    visionModel;
    textRootDomain;
    visionRootDomain;
    rootDomains;
    gates;
    excluded;
    excludedReason;
};
exports.GenerationMetric = GenerationMetric;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, index: true }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "sessionId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ index: true, sparse: true }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "username", void 0);
__decorate([
    (0, mongoose_1.Prop)({ index: true, sparse: true }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "uid", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "deptName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "orgName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['microcode', 'vue3'], index: true }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "target", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['figma', 'screenshot', 'html'], index: true }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "sourceType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['max', 'lite'] }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "generationTier", void 0);
__decorate([
    (0, mongoose_1.Prop)({ index: true }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "taskType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: ['completed', 'failed', 'cancelled'], index: true }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "cancelReason", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "componentId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "componentName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ index: true }),
    __metadata("design:type", Number)
], GenerationMetric.prototype, "startTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], GenerationMetric.prototype, "endTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], GenerationMetric.prototype, "duration", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "error", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['passed', 'warned'] }),
    __metadata("design:type", String)
], GenerationMetric.prototype, "qualityGate", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "textModel", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "visionModel", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "textRootDomain", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "visionRootDomain", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [], index: true }),
    __metadata("design:type", Array)
], GenerationMetric.prototype, "rootDomains", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Object], default: [] }),
    __metadata("design:type", Array)
], GenerationMetric.prototype, "gates", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false, index: true }),
    __metadata("design:type", Boolean)
], GenerationMetric.prototype, "excluded", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], GenerationMetric.prototype, "excludedReason", void 0);
exports.GenerationMetric = GenerationMetric = __decorate([
    (0, mongoose_1.Schema)({ collection: 'generation_metrics', timestamps: true })
], GenerationMetric);
exports.GenerationMetricSchema = mongoose_1.SchemaFactory.createForClass(GenerationMetric);
exports.GenerationMetricSchema.index({ startTime: -1 });
exports.GenerationMetricSchema.index({ userId: 1, startTime: -1 });
exports.GenerationMetricSchema.index({ deptName: 1, startTime: -1 });
//# sourceMappingURL=generation-metric.schema.js.map