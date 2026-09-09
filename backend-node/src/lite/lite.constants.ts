/**
 * 轻量组件生成 — 统一协议常量（Phase 0）
 *
 * 这些常量被 lite 模块的控制器、服务、DTO 共用，
 * 也是前端/后端字段对齐的单一事实来源。
 *
 * 锁定规则（来自产品边界确认）：
 * - sourceType: screenshot/html 固定 Lite；figma 默认 Max 但可切 Lite
 * - componentType: 仅 vue3 / microcode 两套规范
 * - generationTier: lite / max
 */

export type LiteSourceType = 'screenshot' | 'figma' | 'html';
export type LiteComponentType = 'vue3' | 'microcode';
export type LiteGenerationTier = 'lite' | 'max';

/**
 * 轻量任务状态机（较 Figma 完整流程更短）：
 * precheck → analyzing → generating → success | failed
 */
export type LiteTaskStatus =
  | 'precheck'
  | 'analyzing'
  | 'generating'
  | 'success'
  | 'failed';

export enum LiteErrorCode {
  INVALID_IMAGE = 'INVALID_IMAGE',
  INVALID_HTML = 'INVALID_HTML',
  INVALID_FIGMA_URL = 'INVALID_FIGMA_URL',
  FIGMA_EXPORT_FAILED = 'FIGMA_EXPORT_FAILED',
  UNSUPPORTED_COMPONENT_TYPE = 'UNSUPPORTED_COMPONENT_TYPE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',
  GENERATION_FAILED = 'GENERATION_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** 截图预检硬限制（Phase 1 首批仅做基础校验） */
export const LITE_PRECHECK = {
  MAX_IMAGE_BYTES: 10 * 1024 * 1024, // 10MB
  MIN_DIMENSION: 64, // 单边最小像素
  ALLOWED_MIME: ['image/png', 'image/jpeg', 'image/webp'] as const,
};

/** 错误码 -> 用户可读文案 */
export const LITE_ERROR_MESSAGES: Record<LiteErrorCode, string> = {
  [LiteErrorCode.INVALID_IMAGE]:
    '截图无效：格式、尺寸或文件大小不符合要求（支持 PNG/JPEG/WebP，单边 ≥ 64px，≤ 10MB）',
  [LiteErrorCode.INVALID_HTML]:
    'HTML 文件无效：仅支持自包含的 HTML/HTM 文件，文件大小不超过 2MB',
  [LiteErrorCode.INVALID_FIGMA_URL]:
    'Figma 链接无效：请确保链接格式正确且包含 node-id 参数',
  [LiteErrorCode.FIGMA_EXPORT_FAILED]:
    'Figma 图片导出失败：请检查 Figma Token 权限或节点是否可导出',
  [LiteErrorCode.UNSUPPORTED_COMPONENT_TYPE]:
    '不支持的组件类型，仅支持 vue3 或 microcode',
  [LiteErrorCode.QUOTA_EXCEEDED]: '今日/每小时生成配额已用尽，请稍后重试',
  [LiteErrorCode.ANALYSIS_FAILED]: '截图分析失败，请更换更清晰的截图后重试',
  [LiteErrorCode.GENERATION_FAILED]: '组件代码生成失败，请重试',
  [LiteErrorCode.INTERNAL_ERROR]: '服务内部错误',
};

/** 截图来源固定为 Lite（产品锁定规则） */
export const LITE_SCREENSHOT_TIER: LiteGenerationTier = 'lite';

/** HTML 上传限制：单个自包含文件，最大 2MB */
export const LITE_HTML_MAX_BYTES = 2 * 1024 * 1024;
