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
exports.TokenUsageSchema = exports.TokenUsage = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let TokenUsage = class TokenUsage {
    sessionId;
    nodeName;
    model;
    modelType;
    inputTokens;
    outputTokens;
    totalTokens;
    duration;
    timestamp;
    componentName;
    fileKey;
    nodeId;
};
exports.TokenUsage = TokenUsage;
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", String)
], TokenUsage.prototype, "sessionId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TokenUsage.prototype, "nodeName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TokenUsage.prototype, "model", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: ['vision', 'text'] }),
    __metadata("design:type", String)
], TokenUsage.prototype, "modelType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], TokenUsage.prototype, "inputTokens", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], TokenUsage.prototype, "outputTokens", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], TokenUsage.prototype, "totalTokens", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], TokenUsage.prototype, "duration", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: Date.now, index: true }),
    __metadata("design:type", Date)
], TokenUsage.prototype, "timestamp", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], TokenUsage.prototype, "componentName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], TokenUsage.prototype, "fileKey", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], TokenUsage.prototype, "nodeId", void 0);
exports.TokenUsage = TokenUsage = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], TokenUsage);
exports.TokenUsageSchema = mongoose_1.SchemaFactory.createForClass(TokenUsage);
exports.TokenUsageSchema.index({ sessionId: 1, timestamp: 1 });
exports.TokenUsageSchema.index({ timestamp: -1 });
//# sourceMappingURL=token-usage.schema.js.map