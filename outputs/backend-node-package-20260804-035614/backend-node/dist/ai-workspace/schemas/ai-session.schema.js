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
exports.AiSessionSchema = exports.AiSession = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let AiSession = class AiSession {
    projectId;
    userId;
    title;
    modelProvider;
    modelName;
    messages;
    messageCount;
};
exports.AiSession = AiSession;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'AiProject', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AiSession.prototype, "projectId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AiSession.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '未命名会话' }),
    __metadata("design:type", String)
], AiSession.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], AiSession.prototype, "modelProvider", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], AiSession.prototype, "modelName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: [] }),
    __metadata("design:type", Array)
], AiSession.prototype, "messages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], AiSession.prototype, "messageCount", void 0);
exports.AiSession = AiSession = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], AiSession);
exports.AiSessionSchema = mongoose_1.SchemaFactory.createForClass(AiSession);
exports.AiSessionSchema.index({ userId: 1, projectId: 1 });
exports.AiSessionSchema.index({ userId: 1, updatedAt: -1 });
//# sourceMappingURL=ai-session.schema.js.map