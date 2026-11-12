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
exports.MeetingController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../auth/session.guard");
const meeting_dev_only_guard_1 = require("./meeting-dev-only.guard");
const meeting_service_1 = require("./meeting.service");
const meeting_dto_1 = require("./dto/meeting.dto");
let MeetingController = class MeetingController {
    service;
    constructor(service) {
        this.service = service;
    }
    createRun(dto, req) {
        return this.service.createRun(dto, req?.session?.userId ?? undefined);
    }
    attachAudio(id, dto, req) {
        return this.service.attachAudio(id, dto, req?.session?.userId ?? undefined);
    }
    getRun(id, req) {
        return this.service.getRun(id, req?.session?.userId ?? undefined);
    }
    retryRun(id, req) {
        return this.service.retryRun(id, req?.session?.userId ?? undefined);
    }
    getDraft(id, req) {
        return this.service.getDraft(id, req?.session?.userId ?? undefined);
    }
    patchField(id, fieldId, dto, req) {
        return this.service.patchField(id, fieldId, dto, req?.session?.userId ?? undefined);
    }
    publishRun(id, req) {
        return this.service.publishRun(id, req?.session?.userId ?? undefined);
    }
    exportRun(id, format, req) {
        return this.service.exportRun(id, format, req?.session?.userId ?? undefined);
    }
    composeRun(id, dto, req) {
        return this.service.composeRun(id, dto, req?.session?.userId ?? undefined);
    }
    declareConsent(id, dto, req) {
        return this.service.declareConsent(id, dto, req?.session?.userId ?? undefined);
    }
    submitConsentDecisions(id, dto, req) {
        return this.service.submitConsentDecisions(id, dto, req?.session?.userId ?? undefined);
    }
    getConsent(id, req) {
        return this.service.getConsent(id, req?.session?.userId ?? undefined);
    }
    withdrawConsent(id, dto, req) {
        return this.service.withdrawConsent(id, dto, req?.session?.userId ?? undefined);
    }
    getConsentAudit(id, req) {
        return this.service.getConsentAudit(id, req?.session?.userId ?? undefined);
    }
    getRetentionPolicy() {
        return this.service.getRetentionPolicy();
    }
    setRetentionPolicy(dto, req) {
        return this.service.setRetentionPolicy(dto, req?.session?.userId ?? undefined);
    }
    purgeRetention(dto, req) {
        return this.service.purgeRetention(dto, req?.session?.userId ?? undefined);
    }
    getRetentionAudit(req) {
        return this.service.getRetentionAudit(req?.session?.userId ?? undefined);
    }
};
exports.MeetingController = MeetingController;
__decorate([
    (0, common_1.Post)('runs'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [meeting_dto_1.CreateRunDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "createRun", null);
__decorate([
    (0, common_1.Post)('runs/:id/audio'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, meeting_dto_1.AttachAudioDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "attachAudio", null);
__decorate([
    (0, common_1.Get)('runs/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "getRun", null);
__decorate([
    (0, common_1.Post)('runs/:id/retry'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "retryRun", null);
__decorate([
    (0, common_1.Get)('runs/:id/draft'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "getDraft", null);
__decorate([
    (0, common_1.Patch)('runs/:id/draft/fields/:fieldId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('fieldId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, meeting_dto_1.PatchFieldDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "patchField", null);
__decorate([
    (0, common_1.Post)('runs/:id/publish'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "publishRun", null);
__decorate([
    (0, common_1.Get)('runs/:id/export'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('format')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "exportRun", null);
__decorate([
    (0, common_1.Post)('runs/:id/compose'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, meeting_dto_1.ComposeDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "composeRun", null);
__decorate([
    (0, common_1.Post)('runs/:id/consent/disclosure'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, meeting_dto_1.DeclareConsentDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "declareConsent", null);
__decorate([
    (0, common_1.Post)('runs/:id/consent/decisions'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, meeting_dto_1.ConsentDecisionsDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "submitConsentDecisions", null);
__decorate([
    (0, common_1.Get)('runs/:id/consent'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "getConsent", null);
__decorate([
    (0, common_1.Post)('runs/:id/consent/withdraw'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, meeting_dto_1.WithdrawConsentDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "withdrawConsent", null);
__decorate([
    (0, common_1.Get)('runs/:id/consent/audit'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "getConsentAudit", null);
__decorate([
    (0, common_1.Get)('retention/policy'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "getRetentionPolicy", null);
__decorate([
    (0, common_1.Put)('retention/policy'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [meeting_dto_1.SetRetentionDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "setRetentionPolicy", null);
__decorate([
    (0, common_1.Post)('retention/purge'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [meeting_dto_1.PurgeRetentionDto, Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "purgeRetention", null);
__decorate([
    (0, common_1.Get)('retention/audit'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MeetingController.prototype, "getRetentionAudit", null);
exports.MeetingController = MeetingController = __decorate([
    (0, common_1.Controller)('meeting'),
    (0, common_1.UseGuards)(meeting_dev_only_guard_1.MeetingDevOnlyGuard, session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [meeting_service_1.MeetingService])
], MeetingController);
//# sourceMappingURL=meeting.controller.js.map