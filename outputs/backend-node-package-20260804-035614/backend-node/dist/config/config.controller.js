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
exports.AiConfigController = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("./config.service");
let AiConfigController = class AiConfigController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    getAi() {
        return { success: true, config: this.svc.getAiConfig() };
    }
    saveAi(body) {
        const saved = this.svc.saveAiConfig(body || {});
        return { success: true, config: saved };
    }
};
exports.AiConfigController = AiConfigController;
__decorate([
    (0, common_1.Get)('ai'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiConfigController.prototype, "getAi", null);
__decorate([
    (0, common_1.Put)('ai'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AiConfigController.prototype, "saveAi", null);
exports.AiConfigController = AiConfigController = __decorate([
    (0, common_1.Controller)('config'),
    __metadata("design:paramtypes", [config_service_1.AiConfigService])
], AiConfigController);
//# sourceMappingURL=config.controller.js.map