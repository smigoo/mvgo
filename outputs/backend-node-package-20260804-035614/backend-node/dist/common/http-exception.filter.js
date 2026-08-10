"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const SENSITIVE_DIAGNOSTIC_KEY = /stack|token|secret|password|authorization|cookie/i;
function sanitizeDiagnosticValue(value, depth = 0) {
    if (depth > 6)
        return '[truncated]';
    if (typeof value === 'string')
        return value.slice(0, 4000);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null)
        return value;
    if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => sanitizeDiagnosticValue(item, depth + 1));
    }
    if (typeof value !== 'object' || !value)
        return undefined;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !SENSITIVE_DIAGNOSTIC_KEY.test(key))
        .map(([key, item]) => [key, sanitizeDiagnosticValue(item, depth + 1)])
        .filter(([, item]) => item !== undefined));
}
function extractSafeDetails(payload) {
    if (!payload || typeof payload !== 'object')
        return {};
    const source = payload;
    const details = {};
    if (typeof source.code === 'string')
        details.code = source.code;
    if (source.runtimeGate && typeof source.runtimeGate === 'object') {
        details.runtimeGate = sanitizeDiagnosticValue(source.runtimeGate);
    }
    if (source.lessCompileGate && typeof source.lessCompileGate === 'object') {
        details.lessCompileGate = sanitizeDiagnosticValue(source.lessCompileGate);
    }
    if (source.codeValidationResult && typeof source.codeValidationResult === 'object') {
        details.codeValidationResult = sanitizeDiagnosticValue(source.codeValidationResult);
    }
    if (Array.isArray(source.parameterIssues)) {
        details.parameterIssues = sanitizeDiagnosticValue(source.parameterIssues);
    }
    return details;
}
let HttpExceptionFilter = class HttpExceptionFilter {
    logger = new common_1.Logger('ExceptionFilter');
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let safeDetails = {};
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'string') {
                message = res;
            }
            else {
                const resObj = res;
                message = resObj.message || resObj.error || exception.message;
            }
            safeDetails = extractSafeDetails(res);
        }
        else if (exception instanceof Error) {
            message = exception.message;
            this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
        }
        response.status(status).json({
            success: false,
            error: message,
            statusCode: status,
            path: request.url,
            ...safeDetails,
        });
    }
};
exports.HttpExceptionFilter = HttpExceptionFilter;
exports.HttpExceptionFilter = HttpExceptionFilter = __decorate([
    (0, common_1.Catch)()
], HttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map