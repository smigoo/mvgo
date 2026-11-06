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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var OperationLogService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationLogService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const axios_1 = __importDefault(require("axios"));
const operation_log_schema_1 = require("./operation-log.schema");
const runtime_env_1 = require("../config/runtime-env");
const JAVA_BACKEND_URL = (0, runtime_env_1.getJavaBackendUrl)();
let OperationLogService = OperationLogService_1 = class OperationLogService {
    model;
    logger = new common_1.Logger(OperationLogService_1.name);
    constructor(model) {
        this.model = model;
    }
    record(entry) {
        const payload = {
            userId: entry.userId ?? null,
            method: entry.method,
            path: entry.path,
            query: entry.query ?? undefined,
            body: entry.body ?? undefined,
            statusCode: entry.statusCode,
            ip: entry.ip,
            durationMs: entry.durationMs,
            userAgent: entry.userAgent,
            errorMessage: entry.errorMessage,
        };
        return axios_1.default
            .post(`${JAVA_BACKEND_URL}/operation-log`, payload, { timeout: 5000 })
            .catch((err) => {
            this.logger.warn(`[OperationLogService] 写入操作日志到 Java 失败: ${err?.message || err}`);
        })
            .then(() => undefined);
    }
};
exports.OperationLogService = OperationLogService;
exports.OperationLogService = OperationLogService = OperationLogService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(operation_log_schema_1.OperationLog.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], OperationLogService);
//# sourceMappingURL=operation-log.service.js.map