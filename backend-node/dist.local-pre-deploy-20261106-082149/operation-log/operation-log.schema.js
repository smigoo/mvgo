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
exports.OperationLogSchema = exports.OperationLog = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let OperationLog = class OperationLog {
    userId;
    method;
    path;
    query;
    body;
    statusCode;
    ip;
    durationMs;
    userAgent;
    errorMessage;
};
exports.OperationLog = OperationLog;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', index: true, sparse: true }),
    __metadata("design:type", Object)
], OperationLog.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", String)
], OperationLog.prototype, "method", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", String)
], OperationLog.prototype, "path", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], OperationLog.prototype, "query", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], OperationLog.prototype, "body", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", Number)
], OperationLog.prototype, "statusCode", void 0);
__decorate([
    (0, mongoose_1.Prop)({ index: true, sparse: true }),
    __metadata("design:type", String)
], OperationLog.prototype, "ip", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], OperationLog.prototype, "durationMs", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], OperationLog.prototype, "userAgent", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], OperationLog.prototype, "errorMessage", void 0);
exports.OperationLog = OperationLog = __decorate([
    (0, mongoose_1.Schema)({ collection: 'operation_logs', timestamps: true })
], OperationLog);
exports.OperationLogSchema = mongoose_1.SchemaFactory.createForClass(OperationLog);
//# sourceMappingURL=operation-log.schema.js.map