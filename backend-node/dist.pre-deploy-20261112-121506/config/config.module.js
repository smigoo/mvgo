"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiConfigModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const config_controller_1 = require("./config.controller");
const config_service_1 = require("./config.service");
const config_test_service_1 = require("./config-test.service");
const user_ai_config_service_1 = require("./user-ai-config.service");
const user_ai_config_schema_1 = require("../schemas/user-ai-config.schema");
const user_schema_1 = require("../schemas/user.schema");
let AiConfigModule = class AiConfigModule {
};
exports.AiConfigModule = AiConfigModule;
exports.AiConfigModule = AiConfigModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: user_ai_config_schema_1.UserAiConfig.name, schema: user_ai_config_schema_1.UserAiConfigSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
            ]),
        ],
        controllers: [config_controller_1.AiConfigController],
        providers: [config_service_1.AiConfigService, config_test_service_1.ConfigTestService, user_ai_config_service_1.UserAiConfigService],
        exports: [config_service_1.AiConfigService, config_test_service_1.ConfigTestService, user_ai_config_service_1.UserAiConfigService],
    })
], AiConfigModule);
//# sourceMappingURL=config.module.js.map