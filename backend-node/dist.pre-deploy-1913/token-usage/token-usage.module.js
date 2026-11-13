"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenUsageModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const token_usage_schema_1 = require("../schemas/token-usage.schema");
const token_usage_controller_1 = require("./token-usage.controller");
const token_tracker_service_1 = require("./token-tracker.service");
let TokenUsageModule = class TokenUsageModule {
};
exports.TokenUsageModule = TokenUsageModule;
exports.TokenUsageModule = TokenUsageModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: token_usage_schema_1.TokenUsage.name, schema: token_usage_schema_1.TokenUsageSchema },
            ]),
        ],
        controllers: [token_usage_controller_1.TokenUsageController],
        providers: [token_tracker_service_1.TokenTrackerService],
        exports: [token_tracker_service_1.TokenTrackerService],
    })
], TokenUsageModule);
//# sourceMappingURL=token-usage.module.js.map