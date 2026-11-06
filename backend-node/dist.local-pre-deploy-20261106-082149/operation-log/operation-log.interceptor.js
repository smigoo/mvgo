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
var OperationLogInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationLogInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const operation_log_service_1 = require("./operation-log.service");
const SENSITIVE_KEY = /password|token|secret|api[_-]?key|authorization|cookie|figma|apifox/i;
const BODY_LIMIT = 2000;
function maskSensitive(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value))
        return value.map(maskSensitive);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (SENSITIVE_KEY.test(k) && typeof v === 'string' && v) {
                out[k] = v.length <= 8 ? '****' : `${v.slice(0, 6)}****${v.slice(-4)}`;
            }
            else {
                out[k] = maskSensitive(v);
            }
        }
        return out;
    }
    return value;
}
let OperationLogInterceptor = OperationLogInterceptor_1 = class OperationLogInterceptor {
    logService;
    logger = new common_1.Logger(OperationLogInterceptor_1.name);
    skipPaths;
    enabled;
    constructor(logService) {
        this.logService = logService;
        this.enabled = (process.env.OPERATION_LOG_ENABLED ?? 'true') !== 'false';
        this.skipPaths = (process.env.OPERATION_LOG_SKIP_PATHS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (this.enabled) {
            this.logger.log(`[OperationLogInterceptor] 已启用，跳过路径: ${this.skipPaths.join(', ') || '(无)'}`);
        }
        else {
            this.logger.log('[OperationLogInterceptor] 已禁用（OPERATION_LOG_ENABLED=false）');
        }
    }
    intercept(context, next) {
        if (!this.enabled)
            return next.handle();
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const path = (request.path || request.url?.split('?')[0] || '').split('?')[0];
        if (this.skipPaths.some((p) => path.startsWith(p))) {
            return next.handle();
        }
        const start = Date.now();
        const method = (request.method || '').toUpperCase();
        const ip = request.headers['x-forwarded-for'] || request.ip || '';
        const userAgent = request.headers['user-agent'] || '';
        let body = undefined;
        if (request.body && typeof request.body === 'object') {
            const raw = JSON.stringify(request.body);
            if (raw.length <= BODY_LIMIT) {
                body = maskSensitive(request.body);
            }
            else {
                body = { _omitted: `body too large (${raw.length} bytes)` };
            }
        }
        const query = maskSensitive(request.query || {});
        const finish = (err) => {
            const durationMs = Date.now() - start;
            const statusCode = (err && typeof err.getStatus === 'function' && err.getStatus()) ||
                response.statusCode ||
                500;
            const userId = request.session?.userId || null;
            this.logService
                .record({
                userId,
                method,
                path,
                query,
                body,
                statusCode,
                ip,
                durationMs,
                userAgent,
                errorMessage: err ? String(err.message || '').slice(0, 200) : undefined,
            })
                .catch(() => { });
        };
        return next.handle().pipe((0, operators_1.tap)(() => finish(null)), (0, operators_1.catchError)((err) => {
            finish(err);
            throw err;
        }));
    }
};
exports.OperationLogInterceptor = OperationLogInterceptor;
exports.OperationLogInterceptor = OperationLogInterceptor = OperationLogInterceptor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [operation_log_service_1.OperationLogService])
], OperationLogInterceptor);
//# sourceMappingURL=operation-log.interceptor.js.map