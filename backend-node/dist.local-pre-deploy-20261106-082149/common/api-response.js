"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiResponse = exports.MV_CODE_MESSAGE = exports.MvCode = void 0;
var MvCode;
(function (MvCode) {
    MvCode[MvCode["SUCCESS"] = 200] = "SUCCESS";
    MvCode[MvCode["BAD_REQUEST"] = 400] = "BAD_REQUEST";
    MvCode[MvCode["UNAUTHORIZED"] = 401] = "UNAUTHORIZED";
    MvCode[MvCode["FORBIDDEN"] = 406] = "FORBIDDEN";
    MvCode[MvCode["NOT_FOUND"] = 404] = "NOT_FOUND";
    MvCode[MvCode["CONFLICT"] = 409] = "CONFLICT";
    MvCode[MvCode["PAYLOAD_TOO_LARGE"] = 413] = "PAYLOAD_TOO_LARGE";
    MvCode[MvCode["TOO_MANY_REQUESTS"] = 429] = "TOO_MANY_REQUESTS";
    MvCode[MvCode["INTERNAL_ERROR"] = 500] = "INTERNAL_ERROR";
    MvCode[MvCode["NOT_IMPLEMENTED"] = 501] = "NOT_IMPLEMENTED";
})(MvCode || (exports.MvCode = MvCode = {}));
exports.MV_CODE_MESSAGE = {
    [MvCode.SUCCESS]: '操作成功',
    [MvCode.BAD_REQUEST]: '请求参数错误',
    [MvCode.UNAUTHORIZED]: '授权未通过',
    [MvCode.FORBIDDEN]: '权限认证未通过',
    [MvCode.NOT_FOUND]: '资源不存在',
    [MvCode.CONFLICT]: '资源冲突',
    [MvCode.PAYLOAD_TOO_LARGE]: '请求体过大',
    [MvCode.TOO_MANY_REQUESTS]: '请求过于频繁',
    [MvCode.INTERNAL_ERROR]: '服务器内部错误',
    [MvCode.NOT_IMPLEMENTED]: '服务器不支持该请求功能',
};
const SOURCE = 'node';
exports.ApiResponse = {
    success(data, message = exports.MV_CODE_MESSAGE[MvCode.SUCCESS], code = MvCode.SUCCESS) {
        return { success: true, code, message, data, source: SOURCE };
    },
    error(code, message, detail) {
        return {
            success: false,
            code,
            message: message ?? exports.MV_CODE_MESSAGE[code] ?? '操作失败',
            data: null,
            source: SOURCE,
            ...(detail ? { detail } : {}),
        };
    },
};
//# sourceMappingURL=api-response.js.map