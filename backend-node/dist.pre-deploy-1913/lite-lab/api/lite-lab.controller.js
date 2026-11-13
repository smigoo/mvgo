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
var LiteLabController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiteLabController = void 0;
const common_1 = require("@nestjs/common");
const optional_session_guard_1 = require("../../auth/optional-session.guard");
const session_guard_1 = require("../../auth/session.guard");
const lite_lab_dev_only_guard_1 = require("./lite-lab-dev-only.guard");
const lite_lab_service_1 = require("./lite-lab.service");
const run_lab_dto_1 = require("./dto/run-lab.dto");
let LiteLabController = LiteLabController_1 = class LiteLabController {
    service;
    logger = new common_1.Logger(LiteLabController_1.name);
    constructor(service) {
        this.service = service;
    }
    async run(dto, req) {
        try {
            const result = await this.service.run(dto, req.session?.userId);
            return { success: true, ...result };
        }
        catch (e) {
            const status = e?.status === 400 ? common_1.HttpStatus.BAD_REQUEST : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            throw new common_1.HttpException({ code: 'LAB_RUN_FAILED', message: e?.message || '启动失败' }, status);
        }
    }
    async report(sessionId, req) {
        try {
            const report = this.service.getReport(sessionId, req?.session?.userId ?? undefined);
            return { success: true, report };
        }
        catch (e) {
            const status = e?.status === 404 ? common_1.HttpStatus.NOT_FOUND : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            throw new common_1.HttpException({ code: 'LAB_REPORT_NOT_READY', message: e?.message }, status);
        }
    }
    async artifact(sessionId, relPath, req, res) {
        try {
            const { buffer, ext } = this.service.getArtifact(sessionId, relPath || '', req?.session?.userId ?? undefined);
            const mime = ext === '.png'
                ? 'image/png'
                : ext === '.jpg' || ext === '.jpeg'
                    ? 'image/jpeg'
                    : ext === '.svg'
                        ? 'image/svg+xml'
                        : ext === '.webp'
                            ? 'image/webp'
                            : ext === '.gif'
                                ? 'image/gif'
                                : ext === '.json'
                                    ? 'application/json'
                                    : 'text/plain; charset=utf-8';
            res.type(mime).send(buffer);
        }
        catch (e) {
            const status = e?.status === 404 ? common_1.HttpStatus.NOT_FOUND : e?.status === 400 ? common_1.HttpStatus.BAD_REQUEST : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            res.status(status).json({ success: false, code: 'LAB_ARTIFACT_FAILED', message: e?.message });
        }
    }
};
exports.LiteLabController = LiteLabController;
__decorate([
    (0, common_1.Post)('run'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [run_lab_dto_1.RunLabDto, Object]),
    __metadata("design:returntype", Promise)
], LiteLabController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('report/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LiteLabController.prototype, "report", null);
__decorate([
    (0, common_1.Get)('artifact/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Query)('path')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], LiteLabController.prototype, "artifact", null);
exports.LiteLabController = LiteLabController = LiteLabController_1 = __decorate([
    (0, common_1.Controller)('lite-lab'),
    (0, common_1.UseGuards)(lite_lab_dev_only_guard_1.LiteLabDevOnlyGuard, optional_session_guard_1.OptionalSessionGuard),
    __metadata("design:paramtypes", [lite_lab_service_1.LiteLabService])
], LiteLabController);
//# sourceMappingURL=lite-lab.controller.js.map