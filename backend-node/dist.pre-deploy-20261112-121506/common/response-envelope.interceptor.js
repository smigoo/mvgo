"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ResponseEnvelopeInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseEnvelopeInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
let ResponseEnvelopeInterceptor = class ResponseEnvelopeInterceptor {
    static { ResponseEnvelopeInterceptor_1 = this; }
    static SOURCE = 'node';
    static OK_MESSAGE = 'ok';
    intercept(_context, next) {
        return next.handle().pipe((0, operators_1.map)((data) => this.toEnvelope(data)));
    }
    toEnvelope(data) {
        if (data === undefined || data === null)
            return data;
        if (typeof data === 'string' || Buffer.isBuffer(data))
            return data;
        if (data instanceof common_1.StreamableFile)
            return data;
        if (data && typeof data.pipe === 'function')
            return data;
        if (typeof data !== 'object')
            return data;
        if (Array.isArray(data)) {
            return { success: true, code: 200, message: ResponseEnvelopeInterceptor_1.OK_MESSAGE, data, source: ResponseEnvelopeInterceptor_1.SOURCE };
        }
        const obj = data;
        if ('data' in obj) {
            return {
                success: typeof obj.success === 'boolean' ? obj.success : true,
                code: 200,
                message: typeof obj.message === 'string' ? obj.message : ResponseEnvelopeInterceptor_1.OK_MESSAGE,
                data: obj.data ?? null,
                source: ResponseEnvelopeInterceptor_1.SOURCE,
            };
        }
        const { success, code, message, source, ...rest } = obj;
        return {
            success: typeof success === 'boolean' ? success : true,
            code: 200,
            message: typeof message === 'string' ? message : ResponseEnvelopeInterceptor_1.OK_MESSAGE,
            data: rest,
            source: ResponseEnvelopeInterceptor_1.SOURCE,
        };
    }
};
exports.ResponseEnvelopeInterceptor = ResponseEnvelopeInterceptor;
exports.ResponseEnvelopeInterceptor = ResponseEnvelopeInterceptor = ResponseEnvelopeInterceptor_1 = __decorate([
    (0, common_1.Injectable)()
], ResponseEnvelopeInterceptor);
//# sourceMappingURL=response-envelope.interceptor.js.map