"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LITE_THEME_SLOTS = void 0;
exports.buildLiteThemeSlots = buildLiteThemeSlots;
exports.assembleLiteThemes = assembleLiteThemes;
exports.expandThemeVarsLess = expandThemeVarsLess;
exports.LITE_THEME_SLOTS = [
    'colorTextBase',
    'colorTextInverse',
    'colorBgPanel',
    'colorPrimary',
    'colorSecondary',
    'colorDanger',
    'colorBorder',
];
const FALLBACK_BY_BRIGHTNESS = {
    light: {
        colorTextBase: '#333333',
        colorTextInverse: '#ffffff',
        colorBgPanel: '#ffffff',
        colorPrimary: '#1890ff',
        colorSecondary: '#7b61ff',
        colorDanger: '#ff4d4f',
        colorBorder: '#e8e8e8',
    },
    dark: {
        colorTextBase: '#ffffff',
        colorTextInverse: '#1a1a1a',
        colorBgPanel: '#141a2e',
        colorPrimary: '#44e4ff',
        colorSecondary: '#7b61ff',
        colorDanger: '#ff7875',
        colorBorder: '#2a2f45',
    },
};
function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m)
        return '';
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
function shiftLightness(hex, delta) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m)
        return '';
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
        const v = delta >= 0 ? c + (255 - c) * delta : c * (1 + delta);
        return Math.max(0, Math.min(255, Math.round(v)));
    });
    return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
function buildLiteThemeSlots(palette = {}, brightness = 'dark') {
    const fb = FALLBACK_BY_BRIGHTNESS[brightness === 'light' ? 'light' : 'dark'];
    const primary = palette.topPrimary || '';
    const text = palette.topText || '';
    const bg = palette.topBg || '';
    const panelBg = brightness === 'dark' ? bg : primary ? hexToRgba(primary, 0.08) : bg;
    return {
        colorTextBase: text || fb.colorTextBase,
        colorTextInverse: fb.colorTextInverse,
        colorBgPanel: panelBg || fb.colorBgPanel,
        colorPrimary: primary || fb.colorPrimary,
        colorSecondary: primary ? shiftLightness(primary, 0.2) : fb.colorSecondary,
        colorDanger: fb.colorDanger,
        colorBorder: brightness === 'dark' && bg ? shiftLightness(bg, 0.12) : fb.colorBorder,
    };
}
function assembleLiteThemes(themes = []) {
    const list = [];
    const slots = {};
    const degraded = [];
    themes.forEach((t, i) => {
        const brightness = t.brightness === 'light' ? 'light' : 'dark';
        const palette = t.palette || {};
        const isTruth = !!(palette.topPrimary && palette.topText);
        if (!isTruth) {
            degraded.push({ key: t.key, name: t.name, missing: ['colorPrimary', 'colorTextBase'] });
        }
        const s = isTruth
            ? buildLiteThemeSlots(palette, brightness)
            : { ...FALLBACK_BY_BRIGHTNESS[brightness] };
        slots[t.key] = s;
        list.push({
            name: t.name || t.key,
            key: t.key,
            brightness,
            isTruth,
            ...(t.key === 'light' ? { legacyName: '亮色主题' } : {}),
            ...(t.key === 'dark' ? { legacyName: '深色主题' } : {}),
            ...(t.panelType ? { panelType: t.panelType } : {}),
            order: i,
        });
    });
    return { list, slots, degraded };
}
function expandThemeVarsLess(themeVarsLess, slots = {}, list = []) {
    const src = String(themeVarsLess || '');
    const commonMatch = src.match(/\.common\(\)\s*\{[\s\S]*?\n\}/);
    const commonBlock = commonMatch ? commonMatch[0] : '.common() {\n}';
    const emitMixin = (key, map) => {
        const name = key === 'light' ? 'theme-light' : key === 'dark' ? 'theme-dark' : `theme-${key}`;
        const body = Object.entries(map)
            .map(([k, v]) => `  @${k}: ${v};`)
            .join('\n');
        return `.${name}() {\n${body}\n}`;
    };
    const ordered = [
        ...list.filter((t) => t.key === 'light'),
        ...list.filter((t) => t.key === 'dark'),
        ...list.filter((t) => t.key !== 'light' && t.key !== 'dark'),
    ];
    const hasAnyTruth = Object.keys(slots || {}).length > 0;
    if (!hasAnyTruth)
        return src;
    const mixedins = [];
    const fallbackSlots = (brightness) => slots[brightness] || slots.light || slots.dark || FALLBACK_BY_BRIGHTNESS[brightness];
    mixedins.push(emitMixin('light', fallbackSlots('light')));
    mixedins.push(emitMixin('dark', fallbackSlots('dark')));
    for (const t of ordered) {
        if (t.key === 'light' || t.key === 'dark')
            continue;
        if (!slots[t.key])
            continue;
        mixedins.push(emitMixin(t.key, slots[t.key]));
    }
    const header = [
        '// 微码组件主题变量文件（Lite 管线 · N 主题真值注入，勿手改）',
        `// 主题数：${mixedins.length}（.theme-light/.theme-dark 为业务样式硬引用，恒保留）`,
        '// 槽位名与规范一致（禁改）；色值来自各主题 Figma 设计稿真值',
        '',
    ].join('\n');
    const tailMatch = src.match(/:root\s*\{[\s\S]*?\n\}/);
    return [
        header,
        commonBlock,
        '',
        mixedins.join('\n\n'),
        '',
        tailMatch ? tailMatch[0] : '',
        '',
    ]
        .filter((s) => s !== '')
        .join('\n');
}
//# sourceMappingURL=lite-multi-theme.js.map