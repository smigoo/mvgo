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
exports.AiDocumentSchema = exports.AiDocument = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let AiDocument = class AiDocument {
    sessionId;
    projectId;
    userId;
    title;
    content;
    sortOrder;
    status;
    visibility;
    sharedUsers;
    sharedGroupIds;
    gitSynced;
    gitLastCommitSha;
};
exports.AiDocument = AiDocument;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'AiSession', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AiDocument.prototype, "sessionId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'AiProject', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AiDocument.prototype, "projectId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AiDocument.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '未命名文档' }),
    __metadata("design:type", String)
], AiDocument.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], AiDocument.prototype, "content", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], AiDocument.prototype, "sortOrder", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'active' }),
    __metadata("design:type", String)
], AiDocument.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'hidden' }),
    __metadata("design:type", String)
], AiDocument.prototype, "visibility", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: [] }),
    __metadata("design:type", Array)
], AiDocument.prototype, "sharedUsers", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_2.Types.ObjectId], ref: 'Group', default: [] }),
    __metadata("design:type", Array)
], AiDocument.prototype, "sharedGroupIds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], AiDocument.prototype, "gitSynced", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], AiDocument.prototype, "gitLastCommitSha", void 0);
exports.AiDocument = AiDocument = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], AiDocument);
exports.AiDocumentSchema = mongoose_1.SchemaFactory.createForClass(AiDocument);
exports.AiDocumentSchema.index({ sessionId: 1, sortOrder: 1 });
exports.AiDocumentSchema.index({ userId: 1, updatedAt: -1 });
exports.AiDocumentSchema.index({ projectId: 1, visibility: 1, status: 1 });
exports.AiDocumentSchema.index({ 'sharedUsers.userId': 1, status: 1 });
//# sourceMappingURL=ai-document.schema.js.map