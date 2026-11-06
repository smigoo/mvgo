"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPreviewBaseUrl = getPreviewBaseUrl;
exports.getFrontendCandidates = getFrontendCandidates;
exports.getJavaBackendUrl = getJavaBackendUrl;
exports.getMaxIterations = getMaxIterations;
exports.getQualityScoreThreshold = getQualityScoreThreshold;
exports.getMinIterations = getMinIterations;
exports.getVisualSimilarityThreshold = getVisualSimilarityThreshold;
exports.getMaxVisualIterations = getMaxVisualIterations;
exports.validateRuntimeEnv = validateRuntimeEnv;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
function normUrl(value) {
    const url = value?.trim();
    return url ? url.replace(/\/$/, '') : '';
}
function getPreviewBaseUrl() {
    const configured = normUrl(process.env.MC_PREVIEW_BASE_URL);
    if (configured)
        return configured;
    if (IS_PRODUCTION) {
        throw new Error('[启动失败] 生产环境必须设置 MC_PREVIEW_BASE_URL（前端真实根，含子路径，如 https://go.microvideo.cn/mvgo）。' +
            '不要写门户根或域名根，否则截图器会探测到门户而非前端。');
    }
    console.warn('[配置告警] 未设置 MC_PREVIEW_BASE_URL，开发环境回退到 http://127.0.0.1:2610');
    return 'http://127.0.0.1:2610';
}
function getFrontendCandidates() {
    const candidates = [getPreviewBaseUrl()];
    if (!IS_PRODUCTION) {
        candidates.push('http://127.0.0.1:2610', 'http://localhost:2610', 'http://127.0.0.1:2611', 'http://localhost:2611');
    }
    return candidates
        .map(normUrl)
        .filter((value, index, list) => value && list.indexOf(value) === index);
}
function getJavaBackendUrl() {
    const configured = normUrl(process.env.JAVA_BACKEND_URL);
    if (configured)
        return configured;
    if (IS_PRODUCTION) {
        return '';
    }
    console.warn('[配置告警] 未设置 JAVA_BACKEND_URL，开发环境回退到 http://localhost:8080/api');
    return 'http://localhost:8080/api';
}
function getMaxIterations() {
    return parseInt(process.env.MAX_ITERATIONS || '3', 10);
}
function getQualityScoreThreshold() {
    return parseInt(process.env.QUALITY_SCORE_THRESHOLD || '90', 10);
}
function getMinIterations() {
    return parseInt(process.env.MIN_ITERATIONS || '1', 10);
}
function getVisualSimilarityThreshold() {
    return parseInt(process.env.VISUAL_SIMILARITY_THRESHOLD || '95', 10);
}
function getMaxVisualIterations() {
    return parseInt(process.env.MAX_VISUAL_ITERATIONS || '1', 10);
}
function validateRuntimeEnv() {
    if (IS_PRODUCTION) {
        const required = [
            'MONGODB_URI',
            'SESSION_SECRET',
            'FIELD_ENCRYPTION_KEY',
            'MC_PREVIEW_BASE_URL',
            'JAVA_BACKEND_URL',
        ];
        const missing = required.filter((key) => !process.env[key]?.trim());
        if (missing.length) {
            throw new Error(`[启动失败] 生产环境缺失必填环境变量: ${missing.join(', ')}。请在部署脚本或 .env.production 中补齐后再部署。`);
        }
    }
    else {
        console.log('[配置] 运行环境变量已加载:', {
            NODE_ENV,
            MC_PREVIEW_BASE_URL: getPreviewBaseUrl(),
            JAVA_BACKEND_URL: getJavaBackendUrl(),
            MAX_ITERATIONS: getMaxIterations(),
            QUALITY_SCORE_THRESHOLD: getQualityScoreThreshold(),
            MIN_ITERATIONS: getMinIterations(),
            VISUAL_SIMILARITY_THRESHOLD: getVisualSimilarityThreshold(),
            MAX_VISUAL_ITERATIONS: getMaxVisualIterations(),
        });
    }
}
//# sourceMappingURL=runtime-env.js.map