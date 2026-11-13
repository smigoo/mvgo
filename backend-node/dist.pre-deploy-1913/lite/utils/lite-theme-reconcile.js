"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME_BASELINE = exports.PERCEIVED_LUM_WEIGHTS = exports.THEME_LUM_LIGHT_MIN = exports.THEME_LUM_DARK_MAX = void 0;
exports.perceivedLuminance = perceivedLuminance;
exports.reconcileBriefTheme = reconcileBriefTheme;
exports.THEME_LUM_DARK_MAX = 0.45;
exports.THEME_LUM_LIGHT_MIN = 0.55;
exports.PERCEIVED_LUM_WEIGHTS = { r: 0.299, g: 0.587, b: 0.114 };
exports.THEME_BASELINE = {
    light: {
        background: '#F5F8FC',
        surface: '#FFFFFF',
        text: '#1F2329',
        border: '#E5E6EB',
    },
    dark: {
        background: '#1A1A2E',
        surface: '#2D2D3F',
        text: '#FFFFFF',
        border: '#3A3A4E',
    },
};
const GLOBAL_BG_RX = /整体背景|页面背景|根容器|内容区域|卡片.*背景|面板.*背景/;
const DARK_WORD_RX = /深蓝|深色|黑色|暗色|深灰|深色半透明|dark/i;
const LIGHT_WORD_RX = /浅色|白色|浅灰|亮色|白底|light/i;
function parseHexColor(input) {
    if (typeof input !== 'string')
        return null;
    const s = input.trim();
    const matched = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
    if (!matched)
        return null;
    let hex = matched[1];
    if (hex.length === 3)
        hex = hex.split('').map((c) => c + c).join('');
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
    ];
}
function perceivedLuminance(color) {
    const rgb = parseHexColor(color);
    if (!rgb)
        return null;
    return ((exports.PERCEIVED_LUM_WEIGHTS.r * rgb[0] +
        exports.PERCEIVED_LUM_WEIGHTS.g * rgb[1] +
        exports.PERCEIVED_LUM_WEIGHTS.b * rgb[2]) /
        255);
}
function reconcileBriefTheme(brief, theme) {
    const unchanged = (reason) => ({
        brief,
        applied: false,
        reason,
        conflicts: [],
    });
    if (theme !== 'light' && theme !== 'dark')
        return unchanged('not-applicable');
    if (!brief || typeof brief !== 'object' || Array.isArray(brief))
        return unchanged('not-applicable');
    const colors = brief.colors;
    if (!colors || typeof colors !== 'object' || Array.isArray(colors))
        return unchanged('not-applicable');
    const bgLum = perceivedLuminance(colors.background);
    if (bgLum === null)
        return unchanged('not-applicable');
    const conflict = (theme === 'light' && bgLum < exports.THEME_LUM_DARK_MAX) ||
        (theme === 'dark' && bgLum > exports.THEME_LUM_LIGHT_MIN);
    if (!conflict)
        return unchanged('no-conflict');
    const baseline = exports.THEME_BASELINE[theme];
    const next = JSON.parse(JSON.stringify(brief));
    const conflicts = [];
    for (const field of ['background', 'surface', 'text', 'border']) {
        const from = String(next.colors[field] ?? '');
        const to = baseline[field];
        if (from.toUpperCase() !== to.toUpperCase()) {
            conflicts.push({ field, from, to });
        }
        next.colors[field] = to;
    }
    const wordRx = theme === 'light' ? DARK_WORD_RX : LIGHT_WORD_RX;
    if (Array.isArray(next.visualDetails)) {
        next.visualDetails = next.visualDetails.filter((line) => typeof line !== 'string' || !(GLOBAL_BG_RX.test(line) && wordRx.test(line)));
    }
    next._themePaletteSource = 'pixel-reconciled';
    return { brief: next, applied: true, reason: 'reconciled', conflicts };
}
//# sourceMappingURL=lite-theme-reconcile.js.map