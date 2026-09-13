/**
 * styleTokens 契约模块（双管线共享事实源，2026-09-03）
 *
 * 职责：生成前确定性产出组件样式令牌契约，一份契约三处消费：
 *   1. 微码 resources/config/css-vars.js（buildCssVarsFile）
 *   2. declare.json themeConfig / cssVariableConfig（双向声明一致，M3-7/M3-8）
 *   3. vue3 resources/styles/theme-vars.less（模板渲染）
 *
 * 铁律（《微码管线改造方案-2026-09-03》5.3 定稿）：
 *   1. dark 核心三变量永远来自规范枚举（M4-10 硬约束），禁 LLM 生成、禁 Figma 提取——无论原 UI 明暗
 *   2. 原 UI 深色：defaultTheme=dark 且呈现以设计稿为准——Figma 深色真值作为自定义设计变量
 *      额外定义进 dark 槽位（命名避开框架预设 8 变量），须同步 cssVariableConfig 声明
 *   3. light 色值分源：原 UI 浅色 → Figma 确定性提取；原 UI 深色 → 确定性派生算法
 *      （主色沿用+中性色反转+WCAG AA 对比度兜底，非通用模板）
 *   4. fontSize 双管线统一 calc(var(--fontSize) * N)；微码 css-vars.js 必须 getCssSize()
 */

// ══════════════════════════════════════════════════════════════
// dark 主题色值枚举事实源（mc-check v1.0.20 darkThemeColorRules）
// file-writer.js 从此处 re-export（兼容 mc-health-validator 既有 import）。
// 规范升级时只改此表（2026-09-03 已从 v1.0.19-1 对齐 v1.0.20：
// colorPrimary #2f6bff→#44E4FF、colorPrimaryBg #12305f→#414141 等）。
// ══════════════════════════════════════════════════════════════
export const MC_DARK_THEME_COLOR_ENUM = {
  colorTextBase: '#ffffff',
  colorPrimary: '#44E4FF',
  colorPrimaryBg: '#414141',
  colorTextSecondary: '#D6D6D6',
  colorPrimaryHover: '#78ECFF',
  colorPrimaryActive: '#00BBFF',
  colorPrimaryBgHover: '#4B4B4B',
  // 🛡️ 治本 E2（2026-09-13）：通用语义色补齐——组件用 var(--colorDanger)/var(--colorWarning)
  // 等引用时，dark 槽位必须有对应值，否则主题切换下这些引用 fallback 兜底、语义色不响应。
  // 值参考 safeLessVarValue 既有约定（danger #f5222d / warning #faad14 / success #52c41a）
  // 按深色主题提亮（深底需更高亮度保证对比度）。
  colorDanger: '#ff5a50',
  colorWarning: '#ffb03c',
  colorSuccess: '#5cdb6b',
  colorBorder: '#4b4b4b',
  scrollbarTrackBg: '#424242',
  scrollbarThumbBg: '#646464',
};

/** M4-9 核心三变量（css-vars.js dark 对象最低要求） */
export const MC_DARK_THEME_COLOR_ENUM_CORE = {
  colorTextBase: MC_DARK_THEME_COLOR_ENUM.colorTextBase,
  colorPrimary: MC_DARK_THEME_COLOR_ENUM.colorPrimary,
  colorPrimaryBg: MC_DARK_THEME_COLOR_ENUM.colorPrimaryBg,
};

/** 框架预设 CSS 变量（cssVariableConfig 免声明清单）——设计变量命名必须避开 */
export const MC_FRAMEWORK_PRESET_VARS = [
  'fontSize',
  'fontWeightStrong',
  'colorTextBase',
  'colorPrimary',
  'colorPrimaryHover',
  'colorPrimaryActive',
  'colorPrimaryBg',
  'colorPrimaryBgHover',
  // 🛡️ 治本 E2：语义色纳入框架预设（免声明，供 var(--colorXxx) 引用）
  'colorTextSecondary',
  'colorDanger',
  'colorWarning',
  'colorSuccess',
  'colorBorder',
];

// ══════════════════════════════════════════════════════════════
// 颜色工具（纯函数，确定性）
// ══════════════════════════════════════════════════════════════

/** #rgb/#rrggbb → {r,g,b}（0-255）；非法输入返回 null */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** {r,g,b}(0-255) → {h:0-360, s:0-1, l:0-1} */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

/** {h:0-360, s:0-1, l:0-1} → {r,g,b}(0-255) */
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(f(h + 1 / 3) * 255),
    g: Math.round(f(h) * 255),
    b: Math.round(f(h - 1 / 3) * 255),
  };
}

/** WCAG 相对亮度（0-1） */
export function relativeLuminance({ r, g, b }) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 对比度（1-21） */
export function contrastRatio(rgb1, rgb2) {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = { r: 255, g: 255, b: 255 };

/**
 * 主色明度校正（5.3.2 派生算法第 1 步）：深色稿的亮主色铺白底对比度不足时，
 * 按 HSL 逐步降明度变深，直到对白色对比度 ≥ minRatio（图形/文本组件标准 3:1）。
 * 已是深色则原样返回。确定性迭代，上限 20 步。
 */
export function ensureContrastOnWhite(hex, minRatio = 3) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  if (contrastRatio(rgb, WHITE) >= minRatio) return rgbToHex(rgb.r, rgb.g, rgb.b);
  let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  for (let i = 0; i < 20 && l > 0.05; i++) {
    l = Math.max(0.05, l - 0.05);
    const cand = hslToRgb(h, s, l);
    if (contrastRatio(cand, WHITE) >= minRatio) return rgbToHex(cand.r, cand.g, cand.b);
  }
  const finalRgb = hslToRgb(h, s, l);
  return rgbToHex(finalRgb.r, finalRgb.g, finalRgb.b);
}

/** hex + 透明度 → rgba() 字符串（css-vars 值形态） */
export function hexToRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** HSL 明度偏移（Hover 提亮 / Active 压暗），返回 hex */
function shiftLightness(hex, delta) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const nl = Math.max(0, Math.min(1, l + delta));
  const out = hslToRgb(h, s, nl);
  return rgbToHex(out.r, out.g, out.b);
}

// ══════════════════════════════════════════════════════════════
// Figma 色板提取（确定性遍历，不依赖 LLM）
// ══════════════════════════════════════════════════════════════

function figmaColorToHex(c) {
  if (!c) return null;
  return rgbToHex(c.r * 255, c.g * 255, c.b * 255);
}

/** 饱和度（0-1），用于排除中性色找主色 */
function saturationOf(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return rgbToHsl(rgb.r, rgb.g, rgb.b).s;
}

/**
 * 提取 Figma 设计色板。
 * @param {Object} figmaNodeData Figma 节点树（含 children/fills/strokes/absoluteBoundingBox）
 * @returns {{
 *   textColors: Array<{hex:string,count:number}>,
 *   fillColors: Array<{hex:string,count:number,area:number}>,
 *   topText: string|null, topBg: string|null, topPrimary: string|null, topAccent: string|null
 * }}
 */
export function extractFigmaColorPalette(figmaNodeData) {
  const textFreq = new Map(); // hex → count
  const fillFreq = new Map(); // hex → { count, area }

  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    const isText = node.type === 'TEXT';
    const bbox = node.absoluteBoundingBox || {};
    const area = Math.max(0, (bbox.width || 0) * (bbox.height || 0));

    const paints = [
      ...(Array.isArray(node.fills) ? node.fills : []),
      ...(Array.isArray(node.strokes) ? node.strokes : []),
    ];
    for (const p of paints) {
      if (!p || p.visible === false || p.type !== 'SOLID' || !p.color) continue;
      const hex = figmaColorToHex(p.color);
      if (!hex) continue;
      if (isText) {
        textFreq.set(hex, (textFreq.get(hex) || 0) + 1);
      } else {
        const cur = fillFreq.get(hex) || { count: 0, area: 0 };
        cur.count += 1;
        cur.area += area;
        fillFreq.set(hex, cur);
      }
    }
    for (const child of node.children || []) collect(child);
  };
  collect(figmaNodeData);

  const textColors = [...textFreq.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
  const fillColors = [...fillFreq.entries()]
    .map(([hex, v]) => ({ hex, count: v.count, area: v.area }))
    .sort((a, b) => b.area - a.area);

  const topText = textColors[0]?.hex || null;
  const topBg = fillColors[0]?.hex || null;

  // 主色：排除 topText/topBg/近中性色（饱和度 < 0.15）后最高频 fill 色
  const saturated = fillColors.filter(
    (f) => f.hex !== topText && f.hex !== topBg && saturationOf(f.hex) >= 0.15,
  );
  const topPrimary = saturated[0]?.hex || null;
  // 强调色：与主色色相差异 ≥ 30° 的次高频饱和色（可选）
  const primaryHsl = topPrimary ? rgbToHsl(...Object.values(hexToRgb(topPrimary))) : null;
  const topAccent =
    saturated.find((f) => {
      if (f.hex === topPrimary || !primaryHsl) return false;
      const hsl = rgbToHsl(...Object.values(hexToRgb(f.hex)));
      const dh = Math.min(Math.abs(hsl.h - primaryHsl.h), 360 - Math.abs(hsl.h - primaryHsl.h));
      return dh >= 30;
    })?.hex || null;

  return { textColors, fillColors, topText, topBg, topPrimary, topAccent };
}

// ══════════════════════════════════════════════════════════════
// light 槽位构建
// ══════════════════════════════════════════════════════════════

/** 原 UI 浅色：Figma 提取映射（缺项回退通用浅色值） */
function buildLightFromPalette(palette) {
  const primary = palette.topPrimary || '#1890ff';
  return {
    colorTextBase: palette.topText || '#333333',
    colorPrimary: primary,
    colorPrimaryBg: hexToRgba(primary, 0.12),
    colorPrimaryHover: shiftLightness(primary, 0.1),
    colorPrimaryActive: shiftLightness(primary, -0.1),
    colorPrimaryBgHover: hexToRgba(primary, 0.16),
  };
}

/**
 * 原 UI 深色 → light 槽位派生（5.3.2 三步算法）：
 * 1. 主色沿用品牌色 + ensureContrastOnWhite 明度校正（HSL 降 L 至白底 ≥3:1）
 * 2. 中性色反转：文字 #333333、主色背景 = 主色 10% 铺白
 * 3. 对比度兜底：colorTextBase 对主色浅底 WCAG AA（≥4.5:1），不达标文字继续加深
 */
function deriveLightFromDarkPalette(palette) {
  const primaryRaw = palette.topPrimary || '#1890ff';
  const primary = ensureContrastOnWhite(primaryRaw, 3);
  const light = {
    colorTextBase: '#333333',
    colorPrimary: primary,
    colorPrimaryBg: hexToRgba(primary, 0.1),
    colorPrimaryHover: shiftLightness(primary, 0.1),
    colorPrimaryActive: shiftLightness(primary, -0.1),
    colorPrimaryBgHover: hexToRgba(primary, 0.16),
  };
  // 对比度兜底：文字色在（主色 10% 铺白的）混合底上须 ≥4.5:1
  const bgRgb = hexToRgb(palette.topBg || '#ffffff');
  const mixRgb = bgRgb
    ? {
        r: bgRgb.r * 0.9 + hexToRgb(primary).r * 0.1,
        g: bgRgb.g * 0.9 + hexToRgb(primary).g * 0.1,
        b: bgRgb.b * 0.9 + hexToRgb(primary).b * 0.1,
      }
    : WHITE;
  // 文字色候选：#333 → 逐级加深至 #111
  const candidates = ['#333333', '#262626', '#1a1a1a', '#111111'];
  for (const c of candidates) {
    if (contrastRatio(hexToRgb(c), mixRgb) >= 4.5) {
      light.colorTextBase = c;
      break;
    }
  }
  return light;
}

// ══════════════════════════════════════════════════════════════
// 设计变量轨（原 UI 深色时，Figma 深色真值 → 自定义变量）
// 命名避开框架预设 8 变量（MC_FRAMEWORK_PRESET_VARS）
// ══════════════════════════════════════════════════════════════

const DESIGN_VAR_DEFS = [
  { key: 'colorBgDesign', name: '设计稿背景色', pick: (p) => p.topBg },
  { key: 'colorTextDesign', name: '设计稿文字色', pick: (p) => p.topText },
  { key: 'colorPrimaryDesign', name: '设计稿主色', pick: (p) => p.topPrimary },
  { key: 'colorAccentDesign', name: '设计稿强调色', pick: (p) => p.topAccent },
];

function buildDesignVars(palette) {
  const vars = [];
  for (const def of DESIGN_VAR_DEFS) {
    if (MC_FRAMEWORK_PRESET_VARS.includes(def.key)) continue; // 双保险：绝不与预设同名
    const value = def.pick(palette);
    if (!value) continue;
    vars.push({ key: def.key, name: def.name, type: 'color', value });
  }
  return vars;
}

// ══════════════════════════════════════════════════════════════
// 主入口
// ══════════════════════════════════════════════════════════════

/**
 * 构建 styleTokens 契约。
 * @param {Object} input
 * @param {Object} [input.figmaNodeData] Figma 节点树（缺省时色板为空，light 走通用回退）
 * @param {('dark'|'light')} [input.backgroundBrightness='dark'] Vision 明暗判定（决定 defaultTheme）
 * @param {('business'|'service')} [input.componentCategory='business'] service 组件可豁免 dark
 * @param {string} [input.fontSize='14'] 基准字号（px 数值字符串）
 * @param {Object} [options]
 * @param {Object} [options.logger] 安全日志（缺省 no-op）
 * @returns {{
 *   fontSize: string,
 *   defaultTheme: ('dark'|'light'),
 *   themes: string[],
 *   light: Object,
 *   dark: Object,            // 标准变量轨（枚举三核心）
 *   designVars: Array<{key:string,name:string,type:string,value:string}>, // 设计变量轨
 *   darkWithDesign: Object,  // dark + 设计变量（css-vars.js dark 槽位渲染用）
 *   palette: Object          // 色板（诊断/调试用）
 * }}
 */
export function buildStyleTokens(input = {}, options = {}) {
  const logger = options.logger || { info() {}, warn() {} };
  const {
    figmaNodeData = null,
    backgroundBrightness = 'dark',
    componentCategory = 'business',
    fontSize = '14',
  } = input;

  const isLight = backgroundBrightness === 'light';
  const defaultTheme = isLight ? 'light' : 'dark';
  const themes =
    componentCategory === 'service'
      ? [defaultTheme] // 服务组件豁免 dark（M3-13 不适用）
      : isLight
        ? ['light', 'dark']
        : ['dark', 'light'];

  const palette = figmaNodeData
    ? extractFigmaColorPalette(figmaNodeData)
    : { textColors: [], fillColors: [], topText: null, topBg: null, topPrimary: null, topAccent: null };

  // light 槽位分源（铁律 3）
  const light = isLight
    ? buildLightFromPalette(palette)
    : deriveLightFromDarkPalette(palette);

  // dark 槽位：标准变量轨（枚举三核心，铁律 1）+ 设计变量轨（原 UI 深色时，铁律 2）
  const dark = { ...MC_DARK_THEME_COLOR_ENUM_CORE };
  const designVars = isLight ? [] : buildDesignVars(palette);
  const darkWithDesign = { ...dark };
  for (const v of designVars) darkWithDesign[v.key] = v.value;

  logger.info('🎨 styleTokens 契约已构建', {
    defaultTheme,
    themes,
    lightSource: isLight ? 'figma-extract' : 'derive-from-dark',
    lightPrimary: light.colorPrimary,
    designVarCount: designVars.length,
  });

  return {
    fontSize: String(fontSize),
    defaultTheme,
    themes,
    light,
    dark,
    designVars,
    darkWithDesign,
    palette,
  };
}

// ══════════════════════════════════════════════════════════════
// Vue3 theme-vars.less 契约渲染（1.4：styleTokens 第 3 消费轨）
// docs C2.1 混合模式：.common() var() 接收框架 CSS 变量；
//   .theme-dark()/.theme-light() 硬编码槽位值（供 Less 颜色函数）
// ══════════════════════════════════════════════════════════════

/** .common() 框架预设 8 变量（var() 接收，fallback 保证框架未注入时可见） */
function buildVue3CommonBody(styleTokens) {
  const fontSize = styleTokens?.fontSize ? `${styleTokens.fontSize}px` : '14px';
  const E = MC_DARK_THEME_COLOR_ENUM;
  return [
    `  @fontSize: var(--fontSize, ${fontSize});`,
    `  @fontWeightStrong: var(--fontWeightStrong, 600);`,
    `  @colorTextBase: var(--colorTextBase, ${E.colorTextBase});`,
    `  @colorPrimary: var(--colorPrimary, ${E.colorPrimary});`,
    `  @colorPrimaryHover: var(--colorPrimaryHover, ${E.colorPrimaryHover});`,
    `  @colorPrimaryActive: var(--colorPrimaryActive, ${E.colorPrimaryActive});`,
    `  @colorPrimaryBg: var(--colorPrimaryBg, ${E.colorPrimaryBg});`,
    `  @colorPrimaryBgHover: var(--colorPrimaryBgHover, ${E.colorPrimaryBgHover});`,
  ].join('\n');
}

/**
 * 渲染单个主题 mixin 定义块（.theme-dark()/.theme-light()），供「缺哪个补哪个」场景。
 * - theme-dark 槽位 = styleTokens.darkWithDesign（枚举三核心 + 设计变量轨），缺省回退枚举三核心
 * - theme-light 槽位 = styleTokens.light（Figma 提取 / 派生算法）
 * 槽位为空返回 null（不输出空壳 mixin）。
 * @param {'theme-dark'|'theme-light'} mixinName
 * @param {Object} [styleTokens]
 * @returns {string|null}
 */
export function buildVue3ThemeMixinSnippet(mixinName, styleTokens = {}) {
  let slot;
  if (mixinName === 'theme-dark') {
    slot =
      (styleTokens && typeof styleTokens === 'object' && styleTokens.darkWithDesign) ||
      MC_DARK_THEME_COLOR_ENUM_CORE;
  } else if (mixinName === 'theme-light') {
    slot = styleTokens && styleTokens.light;
  } else {
    return null;
  }
  const entries = Object.entries(slot || {});
  if (entries.length === 0) return null;
  const lines = entries.map(([k, v]) => `  @${k}: ${v};`);
  return `.${mixinName}() {\n${lines.join('\n')}\n}`;
}

/**
 * 渲染 Vue3 theme-vars.less 完整兜底模板（styleTokens 契约 → 确定性模板）。
 * - .common()：接收框架注入的 CSS 变量（8 预设全量，fallback 见枚举）
 * - .theme-dark()/.theme-light()：硬编码契约槽位值
 * 与真实产物形态一致：只定义 mixin、不在根级调用（phase2 sanitizeLess 的
 * :root 包裹只针对模型误写的根级调用；本模板不触发）。
 * @param {Object} [styleTokens] buildStyleTokens 契约（可缺省，回退枚举兜底）
 * @returns {string}
 */
export function buildVue3ThemeVarsLess(styleTokens = {}) {
  const parts = [
    '// theme-vars.less（系统契约兜底渲染 2026-09-03，勿手改）',
    '// .common() 接收框架 CSS 变量；.theme-dark()/.theme-light() 为硬编码槽位值（供 Less 颜色函数）',
    '',
    '.common() {',
    buildVue3CommonBody(styleTokens),
    '}',
  ];
  const dark = buildVue3ThemeMixinSnippet('theme-dark', styleTokens);
  if (dark) parts.push('', dark);
  const light = buildVue3ThemeMixinSnippet('theme-light', styleTokens);
  if (light) parts.push('', light);
  return parts.join('\n') + '\n';
}
