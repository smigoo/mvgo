"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LITE_HTML_MAX_BYTES = exports.LITE_SCREENSHOT_TIER = exports.LITE_ERROR_MESSAGES = exports.LITE_PRECHECK = exports.LiteErrorCode = void 0;
var LiteErrorCode;
(function (LiteErrorCode) {
    LiteErrorCode["INVALID_IMAGE"] = "INVALID_IMAGE";
    LiteErrorCode["INVALID_HTML"] = "INVALID_HTML";
    LiteErrorCode["INVALID_FIGMA_URL"] = "INVALID_FIGMA_URL";
    LiteErrorCode["FIGMA_EXPORT_FAILED"] = "FIGMA_EXPORT_FAILED";
    LiteErrorCode["UNSUPPORTED_COMPONENT_TYPE"] = "UNSUPPORTED_COMPONENT_TYPE";
    LiteErrorCode["QUOTA_EXCEEDED"] = "QUOTA_EXCEEDED";
    LiteErrorCode["ANALYSIS_FAILED"] = "ANALYSIS_FAILED";
    LiteErrorCode["GENERATION_FAILED"] = "GENERATION_FAILED";
    LiteErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
})(LiteErrorCode || (exports.LiteErrorCode = LiteErrorCode = {}));
exports.LITE_PRECHECK = {
    MAX_IMAGE_BYTES: 10 * 1024 * 1024,
    MIN_DIMENSION: 64,
    ALLOWED_MIME: ['image/png', 'image/jpeg', 'image/webp'],
};
exports.LITE_ERROR_MESSAGES = {
    [LiteErrorCode.INVALID_IMAGE]: '截图无效：格式、尺寸或文件大小不符合要求（支持 PNG/JPEG/WebP，单边 ≥ 64px，≤ 10MB）',
    [LiteErrorCode.INVALID_HTML]: 'HTML 文件无效：仅支持自包含的 HTML/HTM 文件，文件大小不超过 2MB',
    [LiteErrorCode.INVALID_FIGMA_URL]: 'Figma 链接无效：请确保链接格式正确且包含 node-id 参数',
    [LiteErrorCode.FIGMA_EXPORT_FAILED]: 'Figma 图片导出失败：请检查 Figma Token 权限或节点是否可导出',
    [LiteErrorCode.UNSUPPORTED_COMPONENT_TYPE]: '不支持的组件类型，仅支持 vue3 或 microcode',
    [LiteErrorCode.QUOTA_EXCEEDED]: '今日/每小时生成配额已用尽，请稍后重试',
    [LiteErrorCode.ANALYSIS_FAILED]: '截图分析失败，请更换更清晰的截图后重试',
    [LiteErrorCode.GENERATION_FAILED]: '组件代码生成失败，请重试',
    [LiteErrorCode.INTERNAL_ERROR]: '服务内部错误',
};
exports.LITE_SCREENSHOT_TIER = 'lite';
exports.LITE_HTML_MAX_BYTES = 2 * 1024 * 1024;
//# sourceMappingURL=lite.constants.js.map