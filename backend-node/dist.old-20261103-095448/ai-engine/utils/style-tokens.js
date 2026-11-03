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
 *      ⚠️ **2026-10-10 显式豁免（D8）**：仅当 `input.dualTruth` 双真值模式成立（浅色+深色
 *      两份 Figma 节点树均就绪且色板完整）时，三核心可取**设计稿真值**。单稿路径铁律 1 依旧生效，
 *      且真值必须同时写入 `theme-vars.less#dark` 与 `css-vars.js#dark`（M4-10 只查后者）。
 *   2. 原 UI 深色：defaultTheme=dark 且呈现以设计稿为准——Figma 深色真值作为自定义设计变量
 *      额外定义进 dark 槽位（命名避开框架预设 8 变量），须同步 cssVariableConfig 声明
 *   3. light 色值分源：原 UI 浅色 → Figma 确定性提取；原 UI 深色 → 确定性派生算法
 *      （主色沿用+中性色反转+WCAG AA 对比度兜底，非通用模板）
 *   4. fontSize 双管线统一 calc(var(--fontSize) * N)；微码 css-vars.js 必须 getCssSize()
 */

// 🛡️ 2026-10-09：`.common()` 颜色变量判据与门禁 / 自愈器**同源**（单一来源，不写正则副本）。
//   theme-color-guard.js 自身零 import → 不构成循环依赖。
import { isCommonColorConflictVar } from './theme-color-guard.js';
// 🆕 2026-10-12 N 主题：旧双真值结构 → 新 themes 数组的迁移函数。
//   让本模块能同时吃新旧两种入参，避免一次性改穿 5 个调用方。
import { themesFromLegacyDualTruth } from './multi-theme.js';

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
/**
 * 交互语义节点名（用于主色候选的语义加权）。
 * 只做「节点名」层面的确定性匹配，不依赖模型分析。
 */
const INTERACTIVE_NODE_RE =
  /(btn|button|tab|link|active|select|switch|toggle|checkbox|radio|input|dropdown|menu|tag|chip|badge|按钮|选项卡|链接|切换|选中|激活)/i;

/** 纯矢量图形类型：装饰性，不承载语义（零权重） */
const DECOR_VECTOR_TYPES = new Set([
  'VECTOR',
  'ELLIPSE',
  'LINE',
  'STAR',
  'POLYGON',
  'BOOLEAN_OPERATION',
]);

/**
 * 交互承载阈值：填充色承载分达到此值 ⇒ 视为「设计稿里明确的交互品牌色」。
 * 与 `fillSemanticWeight` 的交互权重**同源**（单一出处，不得各写一份）。
 */
export const INTERACTIVE_SEMANTIC_THRESHOLD = 5;

/**
 * 填充色的「语义承载分」。
 *
 * 🛡️ 2026-09-29（c-traffic-monitor-209472ff 实锤）：主色此前**只按面积**选取，
 *   导致大面积**装饰矢量**压过小面积**品牌/交互色**：
 *     `#00cccc` 8 处全是装饰（VECTOR 325×50 / Ellipse 6×6 / 14×2 细线）→ 面积 16405
 *     `#1990ff` 5 处全是语义（btn-active 背景 / 链接文字 / 标题图标底）→ 面积 3404
 *   面积法选中 `#00cccc` ⇒ css-vars `colorPrimary` 是装饰青，而设计稿的按钮/链接
 *   实为 `#1990ff` ⇒ 产物里所有 `var(--colorPrimary)` 引用（tab 激活态、链接）
 *   一律渲染成装饰色。色值是可算的，不该让装饰矢量参与「品牌色」判定。
 *
 * 权重：**交互承载 = 5** · 结构容器填充 = 1 · 矢量装饰 = 0
 *
 * ⚠️ 刻意**不**把「文字出现频次」计入权重：实测图表 series 数字文本
 *   （如 `825`/`831` 的 `#1588f8`）频次很高，会把**数据可视化色**抬成主色。
 *   语义只认「交互控件」这一件事，其余退回面积次序。
 */
function fillSemanticWeight(node) {
  if (!node) return 0;
  const t = String(node.type || '').toUpperCase();
  if (DECOR_VECTOR_TYPES.has(t)) return 0;
  if (INTERACTIVE_NODE_RE.test(String(node.name || ''))) return INTERACTIVE_SEMANTIC_THRESHOLD;
  return 1;
}

export function isVividColor(hex) {
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
      const effOpacity = typeof p.opacity === 'number' ? p.opacity : 1;
      if (isText) {
        textFreq.set(hex, (textFreq.get(hex) || 0) + 1);
      } else {
        const cur = fillFreq.get(hex) || { count: 0, area: 0, semantic: 0, maxOpacity: 0 };
        cur.count += 1;
        cur.area += area;
        cur.semantic += fillSemanticWeight(node);
        // 🛡️ 2026-10-20（5ef650ff 实锤）：记录该色的**最大不透明度**。
        //   面板底色 `#e2d084@0.20`（20% 透明 tint，604×161×3 块）面积碾压一切 ⇒
        //   topPrimary 曾被选成面板黄，真正的品牌/数字强调色落选。低透明度填充是
        //   「罩染/tint」不是主色 ⇒ 主色候选按 maxOpacity 过滤（见 saturated 处）。
        //   ⚠️ 只影响主色候选；fillFreq/topBg 仍统计全量（零回归）。
        cur.maxOpacity = Math.max(cur.maxOpacity, effOpacity);
        fillFreq.set(hex, cur);
      }
    }
    for (const child of node.children || []) collect(child);
  };
  collect(figmaNodeData);

  const textColors = [...textFreq.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
  // fillColors 保持**面积降序**（topBg = fillColors[0] 依赖「面积最大 = 背景」这一事实）
  const fillColors = [...fillFreq.entries()]
    .map(([hex, v]) => ({ hex, count: v.count, area: v.area, semantic: v.semantic || 0, maxOpacity: v.maxOpacity ?? 1 }))
    .sort((a, b) => b.area - a.area);

  const topText = textColors[0]?.hex || null;
  const topBg = fillColors[0]?.hex || null;

  // 主色候选：排除 topText/topBg/近中性色（饱和度 < 0.15）/低透明度罩染色（maxOpacity < 0.5）
  const saturated = fillColors.filter(
    (f) => f.hex !== topText && f.hex !== topBg && isVividColor(f.hex) && (f.maxOpacity ?? 1) >= 0.5,
  );
  // 🛡️ 主色选取 = **两级判定**（2026-09-29 · c-traffic-monitor-209472ff 实锤）
  //
  //   级别①「交互承载池」：存在承载分 ≥ 交互阈值的色（即确实有节点名匹配
  //     btn/tab/link/active… 的元素被这个色填充）⇒ 只在池内按**面积**选。
  //     例：#1990ff 同时填充 btn-active 背景 / 链接 / 标题图标底 ⇒ sem=8，胜出。
  //   级别②「面积回退」：一个交互承载色都没有 ⇒ **完全沿用原面积法**（零回归）。
  //
  //   为什么不用「语义分直接排序」：实测 sem 只差 1 分（结构容器数之差）就会翻主色
  //   （c-env-monitor / c-device-monitor 会把浅蓝装饰色 #a1ceff、#258dc8 选成主色）。
  //   语义只用来**判定「设计稿里到底有没有明确的交互品牌色」**这一个布尔事实，
  //   一旦有，池内仍以面积定序 —— 避免语义分噪声放大成主色抖动。
  const interactivePool = saturated.filter(
    (f) => (f.semantic || 0) >= INTERACTIVE_SEMANTIC_THRESHOLD,
  );
  const primaryPool = [...(interactivePool.length > 0 ? interactivePool : saturated)].sort(
    (a, b) => b.area - a.area,
  );
  const topPrimary = primaryPool[0]?.hex || null;
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

/**
 * 双真值槽位构建（2026-10-10 · 双主题 Figma 输入 D2/D8）。
 *
 * 背景：单稿模式下另一套主题靠 `deriveLightFromDarkPalette` 派生（主色沿用 +
 * 中性色反转 + WCAG 兜底），不是设计稿真值 → 「切主题像没切」。用户改为分别提供
 * 浅色/深色两份 Figma 节点链接后，**两侧都应是真值，派生算法完全不执行**。
 *
 * D8 裁定：真值**可占三核心槽位名**（`colorTextBase` / `colorPrimary` /
 * `colorPrimaryBg`），不再只走 designVars 附加轨。
 *
 * @param {Object} lightPalette 浅色稿 extractFigmaColorPalette 结果
 * @param {Object} darkPalette  深色稿 extractFigmaColorPalette 结果
 * @param {'light'|'dark'} designTheme 主稿明暗（决定 defaultTheme）
 * @returns {{light:Object, dark:Object}} light/dark 槽位（camelCase，与 tokens 同构）
 */
function buildDualTruthSlots(lightPalette, darkPalette, designTheme) {
  // 浅色槽位：浅色稿真值。缺失项**不猜**——留空由调用方回退既有分支，
  // 避免「一半真值一半猜」的混合态（那比全派生更难排查）。
  const lp = lightPalette || {};
  const dp = darkPalette || {};
  const lightPrimary = lp.topPrimary || '';
  const darkPrimary = dp.topPrimary || '';

  const light = buildThemeSlotsFromPalette(lp);
  const dark = buildThemeSlotsFromPalette(dp, { preferTopBg: true });

  return { light, dark, designTheme };
}

/**
 * 🆕 2026-10-12 N 主题：单份设计稿色板 → 一套槽位。
 *
 * 从原 `buildDualTruthSlots` 抽出（那份是「两份一起算」的包装，本函数是单份内核）。
 * 差别只在 `colorPrimaryBg`：
 *  - 浅色侧用主色 12% 透明（浅色稿的 topBg 是页面底色，不是卡片底）；
 *  - 深色侧用 topBg（深色稿的背景本身就是卡片底色）。
 *
 * ⚠️ 明暗是**每个主题独立判定**的（N 主题里「黄昏模式」也可能是深色底），
 *   所以 opts.preferTopBg 必须由调用方按该主题实测明暗传入，不能靠位置硬编码。
 *
 * @param {Object} p extractFigmaColorPalette 结果
 * @param {{preferTopBg?:boolean}} [opts]
 * @returns {Object} 槽位对象（已剔除空值）
 */
function buildThemeSlotsFromPalette(p = {}, opts = {}) {
  const primary = p.topPrimary || '';
  const preferTopBg = opts.preferTopBg === true;
  const slots = {
    colorTextBase: p.topText || '',
    colorPrimary: primary,
    colorPrimaryBg: preferTopBg
      ? p.topBg || ''
      : primary
        ? hexToRgba(primary, 0.12)
        : '',
    colorPrimaryHover: primary ? shiftLightness(primary, 0.1) : '',
    colorPrimaryActive: primary ? shiftLightness(primary, -0.1) : '',
    colorPrimaryBgHover: primary ? hexToRgba(primary, 0.16) : '',
  };
  // 抹掉空值：mcSlotsFromTokens 会跳过空串，但 tokens 对象本身会被 buildCssVarsFile
  // 直接消费，留空串会输出 `colorPrimary: ''` 到 css-vars.js ⇒ 变量 fallback 失效。
  const out = {};
  for (const [k, v] of Object.entries(slots)) {
    if (v === undefined || v === null || String(v).trim() === '') continue;
    out[k] = v;
  }
  return out;
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
 * @param {Object} [input.dualTruth] 🆕 双真值输入（2026-10-10 双主题 Figma 输入）
 * @param {Object|null} [input.dualTruth.lightNodeData] 浅色稿 Figma 节点树
 * @param {Object|null} [input.dualTruth.darkNodeData]  深色稿 Figma 节点树
 * @param {Object} [options]
 * @param {Object} [options.logger] 安全日志（缺省 no-op）
 * @returns {{
 *   fontSize: string,
 *   defaultTheme: ('dark'|'light'),
 *   themes: string[],
 *   light: Object,
 *   dark: Object,            // 标准变量轨（枚举三核心 / 双真值时为设计真值）
 *   designVars: Array<{key:string,name:string,type:string,value:string}>, // 设计变量轨
 *   darkWithDesign: Object,  // dark + 设计变量（css-vars.js dark 槽位渲染用）
 *   palette: Object,         // 色板（诊断/调试用）
 *   dualTruth: null|{        // 🆕 双真值诊断信息（单稿恒为 null）
 *     enabled: boolean, lightSource: string, darkSource: string,
 *     primaryBrightness: string, secondaryBrightness: string,
 *     lightCore: Object, darkCore: Object, missingSlots: string[]
 *   }
 * }}
 */
export function buildStyleTokens(input = {}, options = {}) {
  const logger = options.logger || { info() {}, warn() {} };
  const {
    figmaNodeData = null,
    backgroundBrightness = 'dark',
    componentCategory = 'business',
    fontSize = '14',
    dualTruth = null,
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

  // 🆕 多真值分支（2026-10-12，从双真值泛化）：N 份稿都来自 Figma，派生算法**完全不执行**。
  //   兼容两种入参：
  //   - 新结构 `themes: [{key, name, brightness, nodeData}]`（N 主题）
  //   - 旧结构 `{lightNodeData, darkNodeData}`（存量双主题，由 themesFromLegacyDualTruth 迁移）
  //   成立条件：至少一份稿节点树在，且每份能提取出主色（否则退现有分支，
  //   避免「一半真值一半猜」的混合态）。
  const _multi = themesFromLegacyDualTruth(dualTruth);
  const themeEntries = Array.isArray(_multi) ? _multi : [];
  const dualReady = themeEntries.length >= 2 && themeEntries.every((t) => t.nodeData);
  let dualInfo = null;

  if (dualReady) {
    // 每份稿独立提色板 → 独立算槽位（N 份就是 N 套）
    const perTheme = themeEntries.map((t) => {
      const p = extractFigmaColorPalette(t.nodeData);
      // 🔴 明暗按**该主题实测值**决定用哪套底色逻辑，不能硬编码 light/dark
      //   （N 主题里「黄昏模式」也可能是深色底）。
      const brightness = t.brightness || resolveBackgroundBrightness(t.nodeData, defaultTheme);
      const slots = buildThemeSlotsFromPalette(p, { preferTopBg: brightness === 'dark' });
      return {
        key: t.key,
        name: t.name || t.key,
        brightness,
        // 🔴 2026-10-13：透传 Figma 源（任务详情页「多稿缩略图」/「跳转设计稿」的数据前提；
        //   ⚠️ perTheme/themeMeta 都是白名单式构造，不显式透传就静默丢弃——
        //   与 2026-10-10 secondaryNode 丢失、2026-10-12 previewImageUrl 丢失同类坑）
        fileKey: t.fileKey || null,
        nodeId: t.nodeId || null,
        palette: p,
        slots,
        designVars: buildDesignVars(p),
        // 🔴 2026-10-12：透传该主题的预览图文件名（前端「填URL 阶段强制预览」的图，
        //   已由 graph 的 fetchThemeNodes 落盘为 `mc-preview-<key>.png`）。
        //   ⚠️ 必须显式透传 —— perTheme 是白名单式构造，不spread 原始 themeEntry。
        previewImageName: t.previewImageName || null,
        // 🔴 2026-10-19：透传该主题用户自选的面板（themeMeta → declare themeConfig.list）。
        panelType: t.panelType || null,
      };
    });

    // 逐主题判定色板是否合格（缺主色或文字色 ⇒ 该主题不可作真值）。
    //
    // 🔴 2026-10-12 策略修订（真机实测暴露）：原策略是「全部 or 全无」——
    //   任一主题不合格就让**所有**主题退回派生。在 N 主题下不合理：用户配了 3 个
    //   主题，第 3 个误选了纯色矩形，前两个真值会被一起丢掉。
    //   改为**部分真值 + 显式标注**：合格主题走设计真值，不合格主题按其明暗
    //   从 `figmaNodeData` 的派生算法补齐，并在 dualInfo.degradedThemes 留痕、
    //   由 normalizeDeclareJson 写进 declare.json 供前端提示。
    const perThemeStatus = perTheme.map((t) => {
      const missing = [];
      if (!t.slots.colorPrimary) missing.push('colorPrimary');
      if (!t.slots.colorTextBase) missing.push('colorTextBase');
      return { ...t, missing, ok: missing.length === 0 };
    });
    const degradedThemes = perThemeStatus.filter((t) => !t.ok);
    const missingSlots = perThemeStatus.flatMap((t) =>
      t.missing.map((m) => `${t.key}.${m}`),
    );

    // 至少要有 1 个合格主题才值得走多真值分支（全部不合格 ⇒ 与退现有分支等价）
    if (perThemeStatus.some((t) => t.ok)) {
      // D8：真值可占三核心槽位名。
      //
      // 🔴 设计变量轨必须**按主题分开**（2026-10-10 修正）：设计变量名是 camelCase 的
      //   `colorBgDesign` / `colorPrimaryDesign` 等，同名槽位在 css-vars.js 里**只有一个值**，
      //   若把多稿 designVars 合并进同一个对象，某主题会读到别稿的设计色
      //   （如深色主题读到浅色稿的 colorBgDesign=#F5F7FA）⇒ 深色模式出现浅色底。
      //
      // 🔴 buildDesignVars 返回的是**描述符数组** `{key,name,type,value}`，不能直接
      //   展开进槽位对象（那会把键写成 `key`/`value`/`name`）。必须经 kvOf 转成
      //   `key → value` 映射后再合并 —— 否则设计变量永远进不了产物。
      const kvOf = (list) => {
        const o = {};
        for (const v of list || []) {
          if (v && v.key && v.value) o[v.key] = v.value;
        }
        return o;
      };
      // themeSlots: key → { 槽位, designVars 合并后 }（渲染与 css-vars.js 都读它）
      //
      // 🔴 不合格主题（色板提不出主色/文字色）在这里用**派生算法**补槽：
      //   浅色侧走 buildLightFromPalette(主稿色板)，深色侧走枚举三核心 ——
      //   即该主题退化为「派生值」，但在 declare.json / themeConfig 里显式标注，
      //   不再让一个废稿把其余真值主题一起拖下水。
      const deriveFallbackSlots = (brightness) =>
        brightness === 'light'
          ? buildLightFromPalette(palette)
          : { ...MC_DARK_THEME_COLOR_ENUM_CORE };

      const themeSlots = {};
      const designVarUnion = [];
      const seenDesignKey = new Set();
      for (const t of perThemeStatus) {
        const kv = kvOf(t.designVars);
        const base = t.ok ? t.slots : deriveFallbackSlots(t.brightness);
        themeSlots[t.key] = { ...base, ...kv };
        if (!t.ok) {
          logger.warn(
            `🎨 主题「${t.name}」色板不合格（缺 ${t.missing.join('、')}），该主题退回派生值`,
          );
        }
        for (const v of t.designVars) {
          if (seenDesignKey.has(v.key)) continue;
          seenDesignKey.add(v.key);
          designVarUnion.push(v);
        }
      }
      const designVars = designVarUnion;

      const lightEntries = perThemeStatus.filter((t) => t.brightness === 'light');
      const darkEntries = perThemeStatus.filter((t) => t.brightness === 'dark');

      // 兼容字段（存量消费方：buildCssVarsFile / renderMicrocodeThemeVarsLess /
      //   declare.json 归一 / 门禁）：
      //   light            = 浅色三核心 **+ 浅色该主题的 designVars**
      //   dark             = 深色三核心（纯，不含 designVars —— 原契约）
      //   darkWithDesign   = 深色三核心 **+ 深色该主题的 designVars**
      // ⚠️ 这三个字段的「不对称」是**既有契约**（2026-10-10 定），断言
      //   verify-dual-truth-style-tokens.mjs §3b 正在守护它：
      //   浅色侧必须带自己的 designVars，深色侧必须只带深色的 —— 否则会串色。
      const lightKey = lightEntries[0]?.key || perThemeStatus[0]?.key;
      const darkKey =
        darkEntries[0]?.key || perThemeStatus[perThemeStatus.length - 1]?.key;
      // 🔴 三核心从 `perThemeStatus[i].slots` 取（**不含 designVars**）——
      //   ① 满足「dark 只含三核心、designVars 在 darkWithDesign」的原契约；
      //   ② 降级主题的 slots 为空，需回退到 deriveFallbackSlots，否则 dark 会是空对象。
      const pickCoreSlots = (t) =>
        (t && t.ok ? t.slots : deriveFallbackSlots(t?.brightness || 'dark')) || {};
      const lightEntry = lightEntries[0] || perThemeStatus[0];
      const darkEntry = darkEntries[0] || perThemeStatus[perThemeStatus.length - 1];
      // light 带自己的 designVars（既有不对称契约，§3b 守护）
      const light = {
        ...pickCoreSlots(lightEntry),
        ...kvOf(lightEntry?.designVars || []),
      };
      const dark = pickCoreSlots(darkEntry);

      dualInfo = {
        enabled: true,
        lightSource: 'figma-extract',
        darkSource: 'figma-extract',
        primaryBrightness: defaultTheme,
        secondaryBrightness: defaultTheme === 'light' ? 'dark' : 'light',
        lightCore: { ...light },
        darkCore: { ...dark },
        // ⚠️ 仅**全部**主题不合格时才非空（那种情况已在下方退现有分支）。
        //   N 主题下允许部分降级：degradedThemes 列出哪些主题用了派生值。
        missingSlots: [],
        degradedThemes: degradedThemes.map((t) => ({
          key: t.key,
          name: t.name,
          missing: t.missing,
        })),
        // 🆕 N 主题：逐主题诊断（key / 显示名 / 明暗 / 主色 / 文字色 / 是否真值）
        themeMeta: perThemeStatus.map((t) => ({
          key: t.key,
          name: t.name,
          brightness: t.brightness,
          fileKey: t.fileKey || null,
          nodeId: t.nodeId || null,
          primary: t.slots.colorPrimary || null,
          textBase: t.slots.colorTextBase || null,
          isTruth: t.ok,
          // 🔴 2026-10-12：主题预览图文件名（下游 declare.json themeConfig[].previewName）
          previewImageName: t.previewImageName || null,
          // 🔴 2026-10-19：用户自选面板（下游 declare.json themeConfig[].panelType）
          panelType: t.panelType || null,
        })),
      };
      logger.info(
        `🎨 styleTokens 多真值契约已构建（派生算法未执行，${perThemeStatus.length} 个主题）`,
        {
          defaultTheme,
          themeCount: perThemeStatus.length,
          degradedCount: degradedThemes.length,
          themes: perThemeStatus.map((t) => ({
            key: t.key,
            name: t.name,
            brightness: t.brightness,
            primary: t.slots.colorPrimary || '(派生)',
            truth: t.ok,
          })),
        },
      );
      return {
        fontSize: String(fontSize),
        defaultTheme,
        // 🆕 themes 改为**逐主题 key 列表**（原来只有 light/dark 两个）
        themes: perThemeStatus.map((t) => t.key),
// 兼容字段（存量消费方：buildCssVarsFile / renderMicrocodeThemeVarsLess /
      //   declare.json 归一 / 门禁）——语义是「浅色/深色组的第一个主题」
      //   ⚠️ light/dark 保持**只含三核心**（原契约），设计变量留在 themeSlots /
      //   darkWithDesign 里，避免下游读到语义不纯的对象。
      light,
      dark,
      darkWithDesign: themeSlots[darkKey] || dark,
        // 🆕 新字段：key → 完整槽位（含该主题的设计变量），渲染 N 套 mixin 读它
        themeSlots,
        themeMeta: perThemeStatus.map((t) => ({
          key: t.key,
          name: t.name,
          brightness: t.brightness,
          fileKey: t.fileKey || null,
          nodeId: t.nodeId || null,
          isTruth: t.ok,
          // 🔴 2026-10-12：主题预览图文件名（下游 declare.json themeConfig[].previewName）
          previewImageName: t.previewImageName || null,
          // 🔴 2026-10-19：用户自选面板（下游 declare.json themeConfig[].panelType）
          panelType: t.panelType || null,
        })),
        // 设计变量轨按主题分开 + 全局并集（declare.json 双向声明用）
        lightDesign: perThemeStatus.filter((t) => t.brightness === 'light').flatMap((t) => t.designVars),
        darkDesign: perThemeStatus.filter((t) => t.brightness === 'dark').flatMap((t) => t.designVars),
        designVars,
        palette,
        dualTruth: dualInfo,
      };
    }

    logger.warn('🎨 双真值色板不完整，退回单稿分支（避免真值/派生混合态）', {
      missingSlots,
    });
    dualInfo = {
      enabled: false,
      lightSource: 'unavailable',
      darkSource: 'unavailable',
      primaryBrightness: defaultTheme,
      secondaryBrightness: defaultTheme === 'light' ? 'dark' : 'light',
      lightCore: {},
      darkCore: {},
      missingSlots,
    };
  }

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
    // 设计变量轨按主题分开（单稿模式只有一侧有，与双真值契约同形，下游无需分支）
    lightDesign: isLight ? designVars : [],
    darkDesign: isLight ? [] : designVars,
    designVars,
    darkWithDesign,
    palette,
    dualTruth: dualInfo,
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
export const MC_CANONICAL_COLOR_SLOTS = {
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

/**
 * 🛡️ 2026-10-09 治本：把 `.common()` 里的**颜色变量**切分出来。
 *
 * 根因：LESS 的 mixin 变量「首个定义者胜出」。产物 `index.less` / `themes/dark.less` /
 * `themes/light.less` 均为 `.common(); .theme-X();` 顺序调用，故 `.common()` 里一旦定义
 * `@colorX`，随后 `.theme-light()` / `.theme-dark()` 的同名定义被**静默忽略**
 * → `.dark` 与 `.light` 展开出的 CSS 完全相同，主题开关零生效。
 * （实测：c-traffic-monitor-140cbd45、c-cb2cdd-cb2cdd82；全语料近 7 天 8/23 命中。）
 *
 * 判据**复用门禁同一函数**（`isCommonColorConflictVar`），不在此处另写一份正则：
 *   - 值以 `var(` 开头 → **不算颜色冲突**。`@fontSize: var(--fontSize)` /
 *     `@colorTextBase: var(--colorTextBase)` 是「接入主题变量」的透传映射，
 *     必须留在 `.common()`（移走反而断掉平台运行期注入通道）；
 *   - 变量名是颜色语义（`@color-error` / `@color-predict-line` / `@color-tab-bg`…）→ 颜色；
 *   - 值含颜色字面量（`#hex` / `rgb()` / `hsl()`）→ 颜色。
 *
 * @param {Object} common 解析出的 `.common()` `@key: value` 表
 * @returns {{kept: Object, moved: Object}} kept 留在 `.common()`；moved 注入两套主题 mixin
 */
export function splitCommonColorVars(common = {}) {
  const kept = {};
  const moved = {};
  for (const [k, v] of Object.entries(common || {})) {
    if (isCommonColorConflictVar(k, v)) moved[k] = v;
    else kept[k] = v;
  }
  return { kept, moved };
}

/**
 * 🔴🔴 2026-10-12 治本：`.common()` 里的 **`var()` 尺寸变量**降级为字面量。
 *
 * 现象：生成后 LESS 门禁报 `resources/styles/common.less:NNN:3 Operation on an invalid type`，
 *   定位到业务写的 `@fontSize * 1.5`。
 * 根因：`@fontSize: var(--fontSize)` —— **Less 变量一旦是 `var()` 形式就不能参与算术运算**。
 *   实测（2026-10-12，`less.render` 三组对照）：
 *     `@fontSize: var(--fontSize)`        → `@fontSize * 1.5` **FAIL: invalid type**
 *     `@fontSize: var(--fontSize, 12px)`  → `@fontSize * 1.5` **同样 FAIL**（fallback 不参与 Less 求值）
 *     `@fontSize: 12px`                   → `@fontSize * 1.5` OK（18px）
 *   而平台自己的规范就是让业务写 `calc(var(--fontSize) * N)` / `@fontSize * N`（style-tokens.js:18），
 *   与「.common() 用 var() 透传」**内在矛盾**。文件头还写着「禁止 CSS 变量」，自相矛盾。
 *
 * 修法：把尺寸类变量的 `var()` 换成 **fallback 字面量**（有 fallback 就用fallback；
 *   没有则按变量名推断一个设计基准值）。
 *   ⚠️ 只处理**尺寸/字重**类（fontSize/spacing/radius/lineHeight…）—— 颜色槽位由
 *   `splitCommonColorVars` 移到主题 mixin，不走这里。
 *   ⚠️ 不动 `@fontWeightStrong: var(--fontWeightStrong, 600)` 这种**不参与运算**的
 *   （Less 允许它透传），改动它反而会破坏「框架预设透传」契约。
 */
const MC_SIZE_LITERAL_DEFAULTS = {
  fontSize: '12px',
  fontWeightStrong: '600',
  lineHeight: '1.5',
  borderRadius: '4px',
  borderRadiusBase: '8px',
  borderRadiusSmall: '4px',
  spacing: '4px',
  spacingXs: '4px',
  spacingSm: '8px',
  spacingMd: '12px',
  spacingLg: '16px',
  spacingXl: '24px',
};

/** 变量名 → 规范化匹配（大小写/连字符不敏感，`@font-size` 与 `@fontSize` 同名） */
function matchSizeVarName(name) {
  const norm = String(name || '')
    .replace(/^@/, '')
    .replace(/[-_]/g, '')
    .toLowerCase();
  for (const key of Object.keys(MC_SIZE_LITERAL_DEFAULTS)) {
    if (key.toLowerCase() === norm) return key;
  }
  return null;
}

/** 参与算术运算的 Less 变量：若值是 `var()` 且不在豁免名单，返回字面量 */
export function deVarMathLessVars(common = {}) {
  const out = {};
  const rewritten = [];
  // ⚠️ 豁免：不参与运算的框架预设透传（改了会破坏既有契约，见函数注释）
  //
  // 🔴🔴 2026-10-12：`fontSize` **必须豁免** —— 加进来时我漏了它，导致
  //   mc-check M5-6 直接判死（实测：官方全绿 demo `38/0`，只把 `@fontSize: var(--fontSize)`
  //   改成 `12px` 就掉到 `37/1`）：
  //     [M5-6] theme-vars.less 缺少 @fontSize: var(--fontSize) 映射声明
  //   （判据位置 `mc-check.cjs:1122-1134`，正则**硬性要求** var() 形式，不接受替代写法。）
  //
  //   Less 算术问题（`@fontSize * 1.5` 报invalid type）的**正确解法不是改变量形态**，
  //   而是要求业务样式写 `calc(@fontSize * N)` —— Less 不求值 calc，整段透传给浏览器，
  //   此时 `@fontSize` 保持 `var()` 也能编译（已实测：两种定义形式 + calc 都能编译）。
  //   官方 demo 的做法也是在 common.less 写 `& { font-size: @fontSize; }`（直接用，不做运算）。
  const exempt = new Set(['fontWeightStrong', 'fontSize']);
  for (const [k, v] of Object.entries(common || {})) {
    const s = typeof v === 'string' ? v.trim() : v;
    if (typeof s !== 'string' || !s.startsWith('var(')) {
      out[k] = v;
      continue;
    }
    if (exempt.has(k)) {
      out[k] = v;
      continue;
    }
    // 优先取 CSS var() 自带的 fallback（`var(--x, 12px)`）
    const fb = /,\s*([^,()]+(?:\([^()]*\))?[^,()]*)\)\s*$/.exec(s);
    const fallback = fb ? fb[1].trim() : '';
    const canonical = matchSizeVarName(k);
    const literal = /^-?[\d.]+(px|rem|em|%|vh|vw|s|ms)$/.test(fallback)
      ? fallback
      : canonical
        ? MC_SIZE_LITERAL_DEFAULTS[canonical]
        : '';
    if (!literal) {
      // 非尺寸类且无字面量 fallback ⇒ 保持原样（不猜，避免猜错改坏视觉）
      out[k] = v;
      continue;
    }
    out[k] = literal;
    rewritten.push(`${k}: ${s} → ${literal}`);
  }
  return { vars: out, rewritten };
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
  // 🛡️ 2026-10-09 治本：`.common()` 只留「尺寸/字重/var() 透传」，颜色变量移到主题 mixin
  const { kept: commonKept, moved: commonMovedColors } = splitCommonColorVars(p.common);
  // 🔴 2026-10-12 治本：尺寸类 `var()` 变量降级为字面量 ——
  //   Less 变量只要是 `var()` 就**不能参与算术运算**（`@fontSize * 1.5` 会报
  //   `Operation on an invalid type`），而平台规范恰恰要求业务这么写。
  //   详见 deVarMathLessVars 的注释与三组 less.render 对照实测。
  const { vars: commonDeVarred, rewritten: deVarRewrites } = deVarMathLessVars(commonKept);
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
  // 🛡️ 2026-10-09 治本：`.common()` 里的颜色变量**移出**，改注入两套主题 mixin。
  //   （根因见 splitCommonColorVars 注释；此处只做「仅缺失时补写」，主题已给真值则保留真值。）
  //   补写进两侧后，下面的 deriveCounterpartCustomSlots 才能看到「两套同值」并做确定性深浅派生，
  //   从而既不再抢定义、又不丢变量（业务样式引用它仍可编译）。
  const injectMovedCommonColors = (target) => {
    const out = { ...target };
    for (const [k, v] of Object.entries(commonMovedColors)) {
      if (k in out) continue;
      out[k] = v;
    }
    return out;
  };
  // 🛡️ 2026-09-26 治本 0.3-b：专属槽位深浅派生（「缺的主题系统补」）
  const derived = deriveCounterpartCustomSlots(
    styleTokens,
    injectMovedCommonColors(lightCarried),
    injectMovedCommonColors(darkCarried),
  );
  const lightFinal = derived.light;
  // 🔴🔴 2026-10-12 A8-2：`.theme-dark()` 的**三核心强制落 M4-10 枚举值**。
  //
  //   mc-check M4-10（mc-check.cjs:794-820）锁死 dark 三核心色值，且是**纯文件判定**；
  //   官方新版 c-mc-demo 的做法与此完全一致（`#333`→`#44E4FF`、`#090b22`→`#414141`，
  //   即让 demo 迁就枚举）。
  //   ⚠️ 必须与 `file-writer.js#buildCssVarsFile` 的 A8-2 **同口径**，
  //   否则 `theme-vars.less` 与 `css-vars.js` 的 dark 会不一致（M4-9 只查 css-vars.js，
  //   但视觉上会出现「切到 dark 时主色跳变」）。
  //   用户深色稿的真值落在用户自定义 key（theme_2 等）上，不受此约束。
  const darkFinal = {
    ...(derived.dark || {}),
    ...MC_DARK_THEME_COLOR_ENUM_CORE,
  };
  // 🔴 2026-10-12：用去 var() 后的集合（`var()` 尺寸变量会破坏 Less 算术运算）
  const commonKV =
    Object.keys(commonDeVarred).length > 0 ? commonDeVarred : MC_COMMON_FALLBACK;
  if (deVarRewrites.length > 0) {
    // ⚠️ 本模块没有 logger 句柄（历史上都是静默产出），用 console 而非 logger
    console.warn('[style-tokens] .common() 尺寸变量 var() → 字面量（Less 运算兼容）', {
      rewrites: deVarRewrites,
    });
  }

  const emitCommon = `.common() {\n${Object.entries(commonKV)
    .map(([k, v]) => `  @${k}: ${v};`)
    .join('\n')}\n}`;
  const emitMixin = (name, map) =>
    `.${name}() {\n${Object.entries(map)
      .map(([k, v]) => `  @${k}: ${v};`)
      .join('\n')}\n}`;

  // ══════════════════════════════════════════════════════════════
  // 🆕 2026-10-12 N 主题：按 styleTokens.themeSlots 循环 emit 全部主题 mixin。
  //
  // 为什么不能只 emit light/dark：第 3+ 个主题（如「黄昏模式」）有独立三核心真值，
  //   不落成 mixin 就等于该主题在产物里不存在。
  //
  // 兼容：无 themeSlots（单稿路径）⇒ 行为与改动前逐字节一致（只 emit 两个）。
  // ══════════════════════════════════════════════════════════════
  const themeSlots = styleTokens.themeSlots;
  const themeMeta = Array.isArray(styleTokens.themeMeta) ? styleTokens.themeMeta : [];
  let themeMixins = '';
  if (themeSlots && typeof themeSlots === 'object') {
    const metaByKey = new Map(themeMeta.map((m) => [m.key, m]));
    themeMixins = themeMeta
      .map((m) => {
        const slots = themeSlots[m.key];
        if (!slots) return '';
        // 每个主题都从 common() 的迁出变量补齐（否则引用它们的业务样式编译不过）
        // 🔴 2026-10-12 A8-2：用户自定义的深色 key（theme_2「黄昏模式」等）**真值照常写** ——
        //   M4-10 只查 css-vars.js 里名为 `dark` 的那个对象，不查自定义 key。
        //   用户深色色值正是靠这些自定义 key 保留（见 file-writer.js A8-2 注释）。
        let merged = injectMovedCommonColors({
          ...mcSlotsFromTokens(slots),
        });
        // 🔴🔴 2026-10-13（真机实锤 c-aiot-dpjh-bsjd-fca166e8）：系统占位 `dark`
        //   槽位必须落 M4-10 枚举三核心（与下方 darkFinal 同口径）。
        //   A8-1 会在 themeConfig.list 补系统占位 dark ⇒ themeMeta 循环里
        //   `themeSlots.dark` 也会 emit `.theme-dark()` —— 若其真值是深色稿的
        //   自定义值（如 theme_2 的 #071f3d），hasMixin('theme-dark') 随即为 true
        //   ⇒ 下方「补 darkFinal」被跳过 ⇒ theme-vars.less 的 dark 三核心
        //   ≠ css-vars.js 的 dark（M4-10 只查后者，漏网）
        //   ⇒ 用户视觉「dark 和主题2 一样」（dark 编译值被 theme_2 顶掉）。
        if (m.key === 'dark') {
          merged = { ...merged, ...MC_DARK_THEME_COLOR_ENUM_CORE };
        }
        const brightnessLabel = m.brightness === 'dark' ? '深色' : '浅色';
        return [
          `// ${m.name || m.key}（${brightnessLabel}）`,
          emitMixin(`theme-${m.key}`, merged),
        ].join('\n');
      })
      .filter(Boolean)
      .join('\n\n');

    // 🔴🔴 2026-10-12 补真机回归：N 主题分支曾**整体替换** themeMixins，
    //   只产出 themeMeta 里的 key ⇒ **丢掉了 `theme-light` / `theme-dark`**。
    //   而 A8-1 会在 themeConfig.list 补系统占位 `dark` ⇒ `themes/dark.less`
    //   引用 `.theme-dark()` ⇒ LESS 编译门禁阻断：
    //     「最终 LESS 编译门禁阻断: resources/styles/themes/dark.less:4:3
    //       .theme-dark is undefined」（真机 session mc-max-1791797093585-3b06a019 实锤）
    //
    //   正解：本分支产出**全部** themeMeta 的 mixin，**再补齐 light/dark 两个系统占位**。
    //   - `theme-light`：取 themeMeta 里 brightness==='light' 的第一个（无则用 lightFinal）
    //   - `theme-dark`：用 darkFinal（**A8-2 已把三核心强制为 M4-10 枚举值**，过检需要）
    const hasMixin = (name) => new RegExp(`\\.${name}\\s*\\(\\s*\\)\\s*\\{`).test(themeMixins);
    if (!hasMixin('theme-light')) {
      themeMixins += `${themeMixins ? '\n\n' : ''}// 内置浅色占位（宿主注入 .light 时生效）\n${emitMixin('theme-light', lightFinal)}`;
    }
    if (!hasMixin('theme-dark')) {
      // 🔴 dark 必须用 darkFinal（三核心 = M4-10 枚举值），否则 M4-10 判死
      themeMixins += `\n\n// 内置深色占位（宿主注入 .dark 时生效；三核心为 M4-10 枚举值）\n${emitMixin('theme-dark', darkFinal)}`;
    }
  }
  // 单稿兜底：沿用既有两套（含 deriveCounterpartCustomSlots 的结果）
  const fallbackMixins = [
    emitMixin('theme-light', lightFinal),
    emitMixin('theme-dark', darkFinal),
  ].join('\n\n');

  const body = themeMixins || fallbackMixins;
  const mixinCount = themeMixins
    ? themeMeta.filter((m) => themeSlots[m.key]).length
    : 2;

  return [
    '// 微码组件主题变量文件（系统确定性生成；§3 核心槽位值由 buildStyleTokens 注入，勿手改）',
    `// 结构：${mixinCount + 1} 个 mixin（.common() + ${mixinCount} 个主题）`,
    '// 约束：mixin 内仅允许 @变量 定义，禁止任何 CSS 属性；禁止 CSS 变量',
    '',
    emitCommon,
    '',
    body,
    '',
    '// 写盘门禁自动补全缺失变量',
    '@fontWeightStrong: 400;',
    '',
    '// 自动添加：将各 mixin 中的 Less 变量暴露到全局作用域',
    ':root {',
    '  .common();',
    // 🔴🔴 2026-10-12 修真机回归（session mc-max-1791797316689-bc707da1 编译阻断）：
    //   暴露段**只调`.common()`** ⇒ 颜色变量拿不到全局值。
    //   而`less-variable-checker.addMissingVariables` 按规范把**颜色变量放进主题 mixin**
    //   （`:361-364` 明确：颜色类禁止进 .common()，否则会挡住主题覆盖）⇒ 两处自相矛盾
    //   ⇒ `common.less` 在根作用域引用 `@color-bg-container`（只定义在 .theme-dark() 内）
    //   ⇒「variable @color-bg-container is undefined」编译阻断。
    //
    //   正解：暴露段依次调用**全部**主题 mixin（common 优先，主题者覆盖它）。
    //
    // 🔴🔴 R21（2026-10-21 · c-a6c6fb-a6c6fbd3 实锤，**实测推翻错误直觉**）：
    //   **mixin 注入的变量是「先调用者胜出」**（less 4.x 真编译实测；而普通重复赋值
    //   `@c:#000;@c:#fff;` 才是后者胜出——两者语义相反）。
    //   ⇒ 默认主题必须**最先**列出，否则 `:root` 会取到其它主题的值。
    //   ⚠️ 另注：本块只把变量注入 `:root` 作用域，**不会**泄漏给 `common.less`（兄弟规则不可见）；
    //   真正决定 `common.less` 根取值的是 `index.less` 的顶层调用。
    ..._allThemeMixinNamesForExposure(body, styleTokens.defaultTheme || 'light'),
    '}',
    '',
  ].join('\n');
}

/**
 * 🔴 2026-10-12：从 body 里取出全部 `.theme-<key>()` mixin 名（供 `:root` 暴露段调用）。
 *
 * 🔴 R21（2026-10-21 · c-a6c6fb-a6c6fbd3 实锤，实测推翻了「后赋值覆盖」的直觉）：
 *   **mixin 注入的变量是「先调用者胜出」** —— `m1(); m2();` 两者都定义 `@c` 时，
 *   `@c` 取 `m1` 的值（less 4.x 真编译实测）。而普通重复赋值 `@c:#000;@c:#fff;`
 *   才是后者胜出。**两种语义相反**，是本文件最容易踩的坑。
 *   ⇒ 默认主题必须**排在第一个**（其余主题随后只为补缺失变量，不覆盖已定义者）。
 *
 * @param {string} body theme-vars.less 的 mixin 区
 * @param {string} defaultKey 默认主题 key（如 'light'）
 * @returns {string[]} 形如 ['  .theme-light();', '  .theme-dark();']
 */
function _allThemeMixinNamesForExposure(body, defaultKey = 'light') {
  const names = new Set();
  const re = /\.([a-zA-Z_][a-zA-Z0-9_-]*)\s*\(\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(body))) {
    const n = m[1];
    if (n === 'theme-vars' || !/^theme-/.test(n)) continue;
    names.add(n);
  }
  const defaultMixin = `theme-${defaultKey}`;
  // 默认主题**最先**（mixin 注入 = 先调用者胜出）；其余按稳定字母序补齐
  const rest = [...names].filter((n) => n !== defaultMixin).sort();
  const ordered = names.has(defaultMixin) ? [defaultMixin, ...rest] : rest;
  return ordered.map((n) => `  .${n}();`);
}
