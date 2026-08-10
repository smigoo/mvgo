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
exports.TokenUsageController = void 0;
const common_1 = require("@nestjs/common");
const token_tracker_service_1 = require("./token-tracker.service");
let TokenUsageController = class TokenUsageController {
    tokenTrackerService;
    constructor(tokenTrackerService) {
        this.tokenTrackerService = tokenTrackerService;
    }
    async getTaskUsage(sessionId) {
        if (!sessionId) {
            throw new common_1.HttpException('sessionId is required', common_1.HttpStatus.BAD_REQUEST);
        }
        const data = await this.tokenTrackerService.getTaskUsage(sessionId);
        return { success: true, data };
    }
    async getStats(period, days) {
        const query = {
            period: period || 'daily',
            days: days ? parseInt(days, 10) : 7,
        };
        const data = await this.tokenTrackerService.getStats(query);
        return { success: true, data };
    }
    async getBudgetStatus(sessionId) {
        if (!sessionId) {
            throw new common_1.HttpException('sessionId is required', common_1.HttpStatus.BAD_REQUEST);
        }
        const data = await this.tokenTrackerService.getBudgetStatus(sessionId);
        return { success: true, data };
    }
    getPricing() {
        return {
            success: true,
            data: {
                models: this.tokenTrackerService.getPricing(),
                currency: 'CNY',
            },
        };
    }
};
exports.TokenUsageController = TokenUsageController;
__decorate([
    (0, common_1.Get)('task/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TokenUsageController.prototype, "getTaskUsage", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Query)('period')),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TokenUsageController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('budget/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TokenUsageController.prototype, "getBudgetStatus", null);
__decorate([
    (0, common_1.Get)('pricing'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], TokenUsageController.prototype, "getPricing", null);
exports.TokenUsageController = TokenUsageController = __decorate([
    (0, common_1.Controller)('token-usage'),
    __metadata("design:paramtypes", [token_tracker_service_1.TokenTrackerService])
], TokenUsageController);
//# sourceMappingURL=token-usage.controller.js.map