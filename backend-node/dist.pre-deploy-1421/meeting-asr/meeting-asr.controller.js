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
exports.MeetingAsrController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const session_guard_1 = require("../auth/session.guard");
const meeting_asr_config_1 = require("./meeting-asr.config");
const meeting_asr_service_1 = require("./meeting-asr.service");
let MeetingAsrController = class MeetingAsrController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    status() {
        return (0, meeting_asr_config_1.describeMeetingAsrConfig)();
    }
    async transcribe(file, body) {
        if (!file?.buffer?.length) {
            throw new common_1.HttpException({ code: 'asr_bad_audio', message: '缺少上传文件 file（音频）' }, 400);
        }
        try {
            const result = await this.svc.transcribe(file.buffer, {
                mime: file.mimetype || 'audio/wav',
                language: String(body?.language || '').trim() || undefined,
                fileName: file.originalname,
            });
            return result;
        }
        catch (err) {
            throw this.toHttpException(err);
        }
    }
    toHttpException(err) {
        if (err instanceof meeting_asr_service_1.MeetingAsrError) {
            return new common_1.HttpException({ code: err.code, message: err.message }, err.httpStatus);
        }
        const message = err instanceof Error ? err.message : String(err);
        return new common_1.HttpException({ code: 'asr_upstream_error', message }, 500);
    }
};
exports.MeetingAsrController = MeetingAsrController;
__decorate([
    (0, common_1.Get)('status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MeetingAsrController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('transcribe'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 10 * 1024 * 1024 } })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MeetingAsrController.prototype, "transcribe", null);
exports.MeetingAsrController = MeetingAsrController = __decorate([
    (0, common_1.Controller)('meeting-asr'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [meeting_asr_service_1.MeetingAsrService])
], MeetingAsrController);
//# sourceMappingURL=meeting-asr.controller.js.map