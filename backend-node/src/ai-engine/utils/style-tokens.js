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

/** 明度（0-1） */
function lightnessOf(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return rgbToHsl(rgb.r, rgb.g, rgb.b).l;
}

/** 绝对彩度 = (max-min)/255（0-1）—— 比 HSL 饱和度可靠：近白/近黑的 HSL-S 会虚高 */
function chromaOf(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b)) / 255;
}

/**
 * 是否为「鲜艳可用主色」：饱和度 + 明度带 + 绝对彩度三重判定。
 *
 * 🛡️ 2026-09-28（device-monitor e8c97bf8 实锤）：单用 HSL 饱和度会把**近白色**当主色 ——
 *   `#f0f5ff`（近白浅蓝）的 HSL-S = **1.0**（因分母 2-max-min 极小），轻松骗过 `>=0.15`，
 *   于是当选 light 主题 `@color-primary`；而业务把该槽当"蓝色"用（如 header 数值 #1990ff
 *   → var(--color-primary)）→ 实际渲染成近白 → 浅底上文字不可见。
 *   故叠加：明度带（排除近白 L>0.90 / 近黑 L<0.12）+ 绝对彩度 `(max-min)/255 >= 0.15`。
 *   对照：`#1990ff` L=0.55 彩度=0.90 ✅；`#f0f5ff` L=0.97 彩度=0.06 ❌。
 */
function isVividColor(hex) {
  if (saturationOf(hex) < 0.15) return false;
  const l = lightnessOf(hex);
  if (l > 0.9 || l < 0.12) return false;
  return chromaOf(hex) >= 0.15;
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
    (f) => f.hex !== topText && f.hex !== topBg && isVividColor(f.hex),
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

/**
 * 确定性亮度判定：用 Figma 实测背景色覆盖 Vision 的 backgroundBrightness 误判。
 *
 * 背景（2026-09-16 · c-traffic-monitor-a9a8edc9 实锤）：vision 把浅色背景（#edf4fb，亮度 244）
 * 误判为 dark → index.less 根作用域走 .theme-dark() → @color-text-base=白，叠加 Figma 真值
 * 黑字 #333 → 「黑白各一套」。vision 亮度判定不可靠，而 Figma 实测背景色是确定性真值。
 *
 * 规则：取面积最大的填充色（= 背景），算 WCAG 相对亮度，≥0.5 判 light、<0.5 判 dark；
 * 与 vision 一致则保持，矛盾则以实测为准（确定性，不猜）。
 *
 * @param {object|null} figmaNodeData Figma 节点树
 * @param {('dark'|'light')} [visionBrightness='dark'] vision 判定
 * @returns {'dark'|'light'}
 */
export function resolveBackgroundBrightness(figmaNodeData, visionBrightness = 'dark') {
  const vb = visionBrightness === 'light' ? 'light' : 'dark';
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return vb;
  try {
    const palette = extractFigmaColorPalette(figmaNodeData);
    const bgHex = palette.topBg || palette.fillColors?.[0]?.hex;
    if (!bgHex) return vb;
    const rgb = hexToRgb(bgHex);
    if (!rgb) return vb;
    const measured = relativeLuminance(rgb) >= 0.5 ? 'light' : 'dark';
    return measured === vb ? vb : measured;
  } catch {
    return vb;
  }
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

// ══════════════════════════════════════════════════════════════
// microcode theme-vars.less 确定性渲染（2026-09-26 治本 0.1）
//
// 与 vue3 的差异：microcode 槽位用 **kebab-case**（@color-text-base），vue3 用 camelCase。
//
// 契约（与用户决策「以设计为准；缺的主题系统补」一致）：
//  - **§3 核心槽位**（color-text-base / color-primary* / color-bg-container / color-border …）
//    → 值**以 styleTokens 为准**（设计主题 = Figma 提取；缺的主题 = 确定性派生）；
//  - **组件专属槽位**（tab/ring/legend/divider/area…，规范 §3 明确允许"专色"）
//    → **沿用 prior（LLM）原声明**（其值来自设计/视觉，本函数不臆造）；
//  - `.common()` 非颜色令牌 → 沿用 prior。
// 这样既消灭"核心槽位被 LLM 写错（如浅色 base=白）"，又不破坏组件专属槽位（避免编译失败）。
// ══════════════════════════════════════════════════════════════

/** camelCase → kebab-case（colorTextBase → color-text-base） */
function mcKebabize(s) {
  return String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** §3 规范核心槽位默认值（kebab）；styleTokens 中有对应值者覆盖 */
const MC_CANONICAL_COLOR_SLOTS = {
  light: {
    'color-text-base': '#333333',
    'color-text-secondary': '#666666',
    'color-primary': '#1890ff',
    'color-primary-hover': '#40a9ff',
    'color-primary-active': '#096dd9',
    'color-primary-bg': 'rgba(24, 144, 255, 0.1)',
    'color-primary-bg-hover': 'rgba(24, 144, 255, 0.16)',
    'color-bg-container': '#ffffff',
    'color-border': '#e8e8e8',
    // 🛡️ 2026-09-26（0.3-a 收口）：框架语义色也是「免声明预设」（§4 明列 colorDanger/Warning/Success），
    //   业务样式常写 var(--colorDanger) 等 → 必须存在同名槽位，否则 healer 无法映射、门禁必报。
    'color-danger': '#f5222d',
    'color-warning': '#faad14',
    'color-success': '#52c41a',
  },
  dark: {
    'color-text-base': '#ffffff',
    'color-text-secondary': 'rgba(255, 255, 255, 0.8)',
    'color-primary': '#44E4FF',
    'color-primary-hover': '#78ECFF',
    'color-primary-active': '#00BBFF',
    'color-primary-bg': '#414141',
    'color-primary-bg-hover': '#4B4B4B',
    'color-bg-container': '#1f1f1f',
    'color-border': '#4b4b4b',
    // 语义色（与 MC_DARK_THEME_COLOR_ENUM 同源：深底提亮以保证对比度）
    'color-danger': MC_DARK_THEME_COLOR_ENUM.colorDanger,
    'color-warning': MC_DARK_THEME_COLOR_ENUM.colorWarning,
    'color-success': MC_DARK_THEME_COLOR_ENUM.colorSuccess,
  },
};

/** `.common()` 兜底（prior 缺省时） */
const MC_COMMON_FALLBACK = {
  fontSize: 'var(--fontSize)',
  'font-size-base': '14px',
  'font-size-small': '12px',
  'font-size-large': '18px',
  'font-size-title': '20px',
  'font-weight-strong': '600',
  'border-radius-base': '8px',
  'border-radius-small': '4px',
  'spacing-base': '16px',
  'spacing-small': '8px',
  'spacing-large': '24px',
  fontWeightStrong: 'var(--fontWeightStrong)',
};

/** 解析某个 mixin 的 `@key: value;` 表 */
function mcParseMixin(src, name) {
  const out = {};
  const m = String(src || '').match(
    new RegExp(`\\.${name}\\(\\)\\s*\\{([\\s\\S]*?)\\n?\\}`, 'i'),
  );
  if (!m) return out;
  for (const mm of m[1].matchAll(/@([A-Za-z][\w-]*)\s*:\s*([^;]+);/g)) {
    out[mm[1]] = mm[2].trim();
  }
  return out;
}

/** 解析既有 theme-vars.less（llm 产物）的三个 mixin */
export function parseThemeVarsLess(prior) {
  return {
    common: mcParseMixin(prior, 'common'),
    dark: mcParseMixin(prior, 'theme-dark'),
    light: mcParseMixin(prior, 'theme-light'),
  };
}

/** tokens 的颜色对象 → kebab 槽位表（跳过空值） */
function mcSlotsFromTokens(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || String(v).trim() === '') continue;
    o[mcKebabize(k)] = String(v);
  }
  return o;
}

// ── 0.3-b：专属槽位的深浅派生 ────────────────────────────────────────────────

/** 解析纯色（#rgb/#rrggbb/rgb()/rgba()）→ {rgb,a,hex}；渐变/其它 → null */
function mcParseColor(v) {
  const s = String(v || '').trim();
  let m = s.match(/^#([0-9a-fA-F]{6})$/);
  if (m) {
    const n = parseInt(m[1], 16);
    return { rgb: { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }, a: 1, hex: s.toLowerCase() };
  }
  m = s.match(/^#([0-9a-fA-F]{3})$/);
  if (m) {
    const h = m[1];
    return mcParseColor('#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]);
  }
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (m) {
    const rgb = { r: +m[1], g: +m[2], b: +m[3] };
    return { rgb, a: m[4] == null ? 1 : +m[4], hex: rgbToHex(rgb.r, rgb.g, rgb.b) };
  }
  return null;
}

const MC_BG_SLOT_RE = /(^|-)(bg|background|surface|card|panel|container|fill|mask|shade)(-|$)/i;
const MC_TEXT_SLOT_RE = /(^|-)(text|label|title|value|tick|axis)(-|$)/i;
const MC_BORDER_SLOT_RE = /(^|-)(border|line|divider|stroke|separator|ring)(-|$)/i;

/**
 * 在给定背景上把颜色调到达标对比度（确定性、有界 24 步）。
 * 🛡️ 强制**至少偏移一步**（`i > 0` 才允许提前返回）——否则「已达标的槽位」在另一主题里会
 * 保持原值 → 两套 mixin 仍同值 → THEME-MIXINS-IDENTICAL 依旧命中。
 * 白/黑无余量（clamp 后不变）时**反向兜底**再试一次。
 */
function mcAdjustForContrast(rgb, bgRgb, target, toLight) {
  const step = (dir) => {
    let cur = rgb;
    for (let i = 0; i < 24; i++) {
      if (i > 0 && contrastRatio(cur, bgRgb) >= target) return cur;
      const hsl = rgbToHsl(cur.r, cur.g, cur.b);
      const nl = Math.max(0, Math.min(1, hsl.l + dir * 0.05));
      if (nl === hsl.l) break; // 到头（纯白/纯黑）
      cur = hslToRgb(hsl.h, hsl.s, nl);
    }
    return cur;
  };
  const key = (c) => rgbToHex(c.r, c.g, c.b);
  const primary = step(toLight ? 1 : -1);
  if (key(primary) !== key(rgb)) return primary;
  return step(toLight ? -1 : 1);
}

/**
 * 0.3-b：对「两套 mixin 同值」的**非核心（专属）**槽位做确定性深浅派生。
 *
 * 背景（实测 2026-09-26）：LLM 只按**设计主题**填一套值并照抄进 `.theme-light()` 与
 * `.theme-dark()`（实测 `c-traffic-ffe52508` 两套全是深色值、`c-device-monitor-10a9a1a2`
 * 两套全是浅色值）→ 主题开关彻底失效（语料 392/451 = 86.9% 命中）。
 *
 * 规则（用户决策「以设计为准；设计没覆盖的那套由系统补」）：
 *  - **设计主题**：保留 LLM 原值（那是设计真值）；
 *  - **另一主题**：按**该主题的背景**确定性派生——
 *    · 背景类槽（bg/card/panel/container/fill…）→ 保留色相、把亮度推到与目标背景同侧；
 *    · 文本类槽（text/label/title…）→ 对比度 ≥ 4.5；
 *    · 边框/线类（border/line/ring…）→ ≥ 1.6；其余（强调色/图例/点）→ ≥ 3；
 *  - 非纯色（渐变等）与原值不可解析者**不动**；已存在差异的槽位**不动**。
 *
 * @returns {{light:Object, dark:Object, changed:string[], design:string, other:string}}
 */
export function deriveCounterpartCustomSlots(
  styleTokens = {},
  lightSlots = {},
  darkSlots = {},
) {
  const canonical = new Set([
    ...Object.keys(MC_CANONICAL_COLOR_SLOTS.light),
    ...Object.keys(MC_CANONICAL_COLOR_SLOTS.dark),
  ]);
  const design = styleTokens?.defaultTheme === 'light' ? 'light' : 'dark';
  const other = design === 'light' ? 'dark' : 'light';
  const out = { light: { ...lightSlots }, dark: { ...darkSlots } };
  const changed = [];
  const bgOf = (t) =>
    mcParseColor(out[t]['color-bg-container'])?.rgb ||
    (t === 'light' ? { r: 255, g: 255, b: 255 } : { r: 31, g: 31, b: 31 });

  for (const k of Object.keys(out[design] || {})) {
    if (!(k in out[other])) continue;
    if (out[design][k] !== out[other][k]) continue; // 已有差异 → 不动
    if (canonical.has(k)) continue; // 核心槽位由 tokens 负责
    const c = mcParseColor(out[other][k]);
    if (!c) continue; // 渐变/非纯色 → 不动
    const bg = bgOf(other);
    const flat = {
      r: Math.round(c.rgb.r * c.a + bg.r * (1 - c.a)),
      g: Math.round(c.rgb.g * c.a + bg.g * (1 - c.a)),
      b: Math.round(c.rgb.b * c.a + bg.b * (1 - c.a)),
    };
    let rgb;
    if (MC_BG_SLOT_RE.test(k)) {
      const targetL = other === 'light' ? 0.97 : 0.12;
      const hsl = rgbToHsl(c.rgb.r, c.rgb.g, c.rgb.b);
      rgb = hslToRgb(hsl.h, Math.min(hsl.s, 0.35), targetL);
    } else {
      const target = MC_TEXT_SLOT_RE.test(k) ? 4.5 : MC_BORDER_SLOT_RE.test(k) ? 1.6 : 3;
      const toLight = relativeLuminance(bg) < 0.5;
      rgb = mcAdjustForContrast(flat, bg, target, toLight);
    }
    out[other][k] = rgbToHex(rgb.r, rgb.g, rgb.b);
    changed.push(k);
  }
  return { light: out.light, dark: out.dark, changed, design, other };
}

/**
 * 确定性渲染 microcode 的 theme-vars.less（见文件头契约）。
 * @param {Object} styleTokens buildStyleTokens 契约
 * @param {string} prior 既有（LLM）theme-vars.less 内容；组件专属槽位与 .common() 由此沿用
 * @returns {string}
 */
export function renderMicrocodeThemeVarsLess(styleTokens = {}, prior = '') {
  const p = parseThemeVarsLess(prior);
  const light = {
    ...MC_CANONICAL_COLOR_SLOTS.light,
    ...mcSlotsFromTokens(styleTokens.light),
  };
  const dark = {
    ...MC_CANONICAL_COLOR_SLOTS.dark,
    ...mcSlotsFromTokens(styleTokens.darkWithDesign || styleTokens.dark),
  };
  // 组件专属槽位：沿用 prior 中「非核心」的声明（核心槽位以 tokens 为准）
  const carryCustom = (canonical, base, priorSlot) => {
    const out = { ...base };
    for (const [k, v] of Object.entries(priorSlot || {})) {
      if (k in canonical) continue;
      if (k in out) continue;
      out[k] = v;
    }
    return out;
  };
  const lightCarried = carryCustom(MC_CANONICAL_COLOR_SLOTS.light, light, p.light);
  const darkCarried = carryCustom(MC_CANONICAL_COLOR_SLOTS.dark, dark, p.dark);
  // 🛡️ 2026-09-26 治本 0.3-b：专属槽位深浅派生（「缺的主题系统补」）
  const derived = deriveCounterpartCustomSlots(styleTokens, lightCarried, darkCarried);
  const lightFinal = derived.light;
  const darkFinal = derived.dark;
  const commonKV =
    Object.keys(p.common).length > 0 ? p.common : MC_COMMON_FALLBACK;

  const emitCommon = `.common() {\n${Object.entries(commonKV)
    .map(([k, v]) => `  @${k}: ${v};`)
    .join('\n')}\n}`;
  const emitMixin = (name, map) =>
    `.${name}() {\n${Object.entries(map)
      .map(([k, v]) => `  @${k}: ${v};`)
      .join('\n')}\n}`;

  return [
    '// 微码组件主题变量文件（系统确定性生成；§3 核心槽位值由 buildStyleTokens 注入，勿手改）',
    '// 结构：三个 mixin（.common() / .theme-dark() / .theme-light()）',
    '// 约束：mixin 内仅允许 @变量 定义，禁止任何 CSS 属性；禁止 CSS 变量',
    '',
    emitCommon,
    '',
    emitMixin('theme-light', lightFinal),
    '',
    emitMixin('theme-dark', darkFinal),
    '',
    '// 写盘门禁自动补全缺失变量',
    '@fontWeightStrong: 400;',
    '',
    '// 自动添加：将 .common() 中的 Less 变量暴露到全局作用域',
    ':root {',
    '  .common();',
    '}',
    '',
  ].join('\n');
}
