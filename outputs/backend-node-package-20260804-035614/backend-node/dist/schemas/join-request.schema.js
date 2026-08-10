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
exports.JoinRequestSchema = exports.JoinRequest = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let JoinRequest = class JoinRequest {
    _id;
    groupId;
    userId;
    status;
    message;
    createdAt;
    processedAt;
    processedBy;
};
exports.JoinRequest = JoinRequest;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Group', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], JoinRequest.prototype, "groupId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], JoinRequest.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['pending', 'approved', 'rejected'], default: 'pending' }),
    __metadata("design:type", String)
], JoinRequest.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], JoinRequest.prototype, "message", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], JoinRequest.prototype, "createdAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], JoinRequest.prototype, "processedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], JoinRequest.prototype, "processedBy", void 0);
exports.JoinRequest = JoinRequest = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], JoinRequest);
exports.JoinRequestSchema = mongoose_1.SchemaFactory.createForClass(JoinRequest);
exports.JoinRequestSchema.index({ groupId: 1, status: 1 });
exports.JoinRequestSchema.index({ userId: 1, status: 1 });
//# sourceMappingURL=join-request.schema.js.map