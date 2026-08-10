"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiSessionsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const ai_session_schema_1 = require("../schemas/ai-session.schema");
const sessions_controller_1 = require("./sessions.controller");
const sessions_service_1 = require("./sessions.service");
let AiSessionsModule = class AiSessionsModule {
};
exports.AiSessionsModule = AiSessionsModule;
exports.AiSessionsModule = AiSessionsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: ai_session_schema_1.AiSession.name, schema: ai_session_schema_1.AiSessionSchema }]),
        ],
        controllers: [sessions_controller_1.AiSessionsController],
        providers: [sessions_service_1.AiSessionsService],
        exports: [sessions_service_1.AiSessionsService],
    })
], AiSessionsModule);
//# sourceMappingURL=sessions.module.js.map