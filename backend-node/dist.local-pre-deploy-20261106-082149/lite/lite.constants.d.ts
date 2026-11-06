export type LiteSourceType = 'screenshot' | 'figma' | 'html';
export type LiteComponentType = 'vue3' | 'microcode';
export type LiteGenerationTier = 'lite' | 'max';
export type LiteTaskStatus = 'precheck' | 'analyzing' | 'generating' | 'success' | 'failed';
export declare enum LiteErrorCode {
    INVALID_IMAGE = "INVALID_IMAGE",
    INVALID_HTML = "INVALID_HTML",
    INVALID_FIGMA_URL = "INVALID_FIGMA_URL",
    FIGMA_EXPORT_FAILED = "FIGMA_EXPORT_FAILED",
    UNSUPPORTED_COMPONENT_TYPE = "UNSUPPORTED_COMPONENT_TYPE",
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
    ANALYSIS_FAILED = "ANALYSIS_FAILED",
    GENERATION_FAILED = "GENERATION_FAILED",
    INTERNAL_ERROR = "INTERNAL_ERROR"
}
export declare const LITE_PRECHECK: {
    MAX_IMAGE_BYTES: number;
    MIN_DIMENSION: number;
    ALLOWED_MIME: readonly ["image/png", "image/jpeg", "image/webp"];
};
export declare const LITE_ERROR_MESSAGES: Record<LiteErrorCode, string>;
export declare const LITE_SCREENSHOT_TIER: LiteGenerationTier;
export declare const LITE_HTML_MAX_BYTES: number;
