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
exports.TaskFeedbackSchema = exports.TaskFeedback = exports.FEEDBACK_CATEGORIES = exports.FEEDBACK_STATUSES = void 0;
const mongoose_1 = require("@nestjs/mongoose");
exports.FEEDBACK_STATUSES = ['pending', 'processing', 'resolved', 'rejected'];
exports.FEEDBACK_CATEGORIES = ['bug', 'quality', 'suggestion', 'other'];
let TaskFeedback = class TaskFeedback {
    sessionId;
    userId;
    username;
    category;
    description;
    status;
    snapshot;
    attachment;
    adminNote;
    handledBy;
    handledByName;
    handledAt;
    source;
    userAgent;
};
exports.TaskFeedback = TaskFeedback;
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "sessionId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "username", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, type: String, enum: exports.FEEDBACK_CATEGORIES, default: 'bug' }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "category", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: exports.FEEDBACK_STATUSES, default: 'pending' }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], TaskFeedback.prototype, "snapshot", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: null }),
    __metadata("design:type", Object)
], TaskFeedback.prototype, "attachment", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "adminNote", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "handledBy", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "handledByName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], TaskFeedback.prototype, "handledAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true, default: 'task-detail' }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "source", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], TaskFeedback.prototype, "userAgent", void 0);
exports.TaskFeedback = TaskFeedback = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'task_feedbacks' })
], TaskFeedback);
exports.TaskFeedbackSchema = mongoose_1.SchemaFactory.createForClass(TaskFeedback);
exports.TaskFeedbackSchema.index({ status: 1, createdAt: -1 });
exports.TaskFeedbackSchema.index({ sessionId: 1, userId: 1, createdAt: -1 });
exports.TaskFeedbackSchema.index({ userId: 1, createdAt: -1 });
//# sourceMappingURL=feedback.schema.js.map