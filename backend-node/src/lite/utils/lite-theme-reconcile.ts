/**
 * 🛡️ 主题 / 色板一致性归一（2026-11-11 治本，装配层）
 *
 * 病灶（实锤 mv-lite-1794403659262-b1813771）：
 *   截图源没有 `sampleEdgeColor()` 的确定性取色（该函数只对 figma 源安全：截图可能带 OS 边框）。
 *   视觉模型把白/浅蓝设计稿判成 `theme=dark` 并给出整套深色色板；
 *   `sampleRootBrightness()` 只用像素明暗把 `brief.theme` 覆盖成 `light`，**不碰 colors/visualDetails**
 *   ⇒ brief 自相矛盾：`theme=light` + `colors.background=#0B1221` + 「整体背景为深蓝色渐变」。
 *   codegen 拿到具体 hex 与文字描述后照抄，产物整页深色（checkpoint 原始 vueCode 已含 #0B1221，
 *   最终产物 hex 集合与原始逐字节一致 ⇒ 不是拆分器 / LESS 门禁 / 预览主题改的色）。
 *
 * 本模块在 brief 注入 prompt **之前**按「已生效的 theme」做确定性归一：
 *   - 明暗阈值与 `lite.service.ts#sampleRootBrightness` 的 0.45 / 0.55 同源；
 *   - 亮度公式与其 R/G/B 感知亮度加权同源（spec 用源码文本断言，不另立判据）；
 *   - 只改 brief，**产物零改写**、不调用视觉模型、不增加 codegen 输出长度。
 *
 * 诚实边界：本次根治的是「明暗一致性 / 消除自相矛盾」；精确色相还原仍是未做的根治项
 *   （截图源因 OS 边框不启用像素边缘取色，目前只有 figma 源 `sampleEdgeColor` 具备）。
 *   因此矛盾时色板取主题基线值（与 prompt 主题锚点里的示例同源），保留模型给的 primary 强调色。
 */

/** 与 sampleRootBrightness 的 dark / light 判定阈值同源：median < 0.45 / > 0.55 */
export const THEME_LUM_DARK_MAX = 0.45;
export const THEME_LUM_LIGHT_MIN = 0.55;

/** 与 sampleRootBrightness 的 R/G/B 感知亮度加权公式同源 */
export const PERCEIVED_LUM_WEIGHTS = { r: 0.299, g: 0.587, b: 0.114 } as const;

/**
 * 主题基线色板：light 的 background / text / surface 取自 prompt 主题锚点
 * （`#FFFFFF / #F5F8FC`、`#1F2329 / #333333`），dark 取自演示面板覆盖示例
 * （`#1a1a2e / #2d2d3f` + 浅色正文）。spec 会断言这些值在 lite.service.ts 里同源存在。
 */
export const THEME_BASELINE = {
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
} as const;

export type LiteTheme = 'light' | 'dark';

/** 只有「整体/页面/卡片背景」级别的矛盾描述才剔除，避免误删「悬浮提示框为白色背景」这类局部真值 */
const GLOBAL_BG_RX = /整体背景|页面背景|根容器|内容区域|卡片.*背景|面板.*背景/;
const DARK_WORD_RX = /深蓝|深色|黑色|暗色|深灰|深色半透明|dark/i;
const LIGHT_WORD_RX = /浅色|白色|浅灰|亮色|白底|light/i;

export interface ThemeConflict {
  field: string;
  from: string;
  to: string;
}

export type ReconcileReason = 'not-applicable' | 'no-conflict' | 'reconciled';

export interface ReconcileResult {
  /** 未触发时严格返回传入的同一个对象引用（阴性对照可断言零改动） */
  brief: any;
  applied: boolean;
  reason: ReconcileReason;
  conflicts: ThemeConflict[];
}

function parseHexColor(input: unknown): [number, number, number] | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  // 允许 "#F0F4F8 (半透明叠加后)" 这类 vision 附注入参，只取首个 hex
  const matched = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
  if (!matched) return null;
  let hex = matched[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** 感知亮度（与 lite.service.ts#sampleRootBrightness 同一公式），非法色值返回 null */
export function perceivedLuminance(color: unknown): number | null {
  const rgb = parseHexColor(color);
  if (!rgb) return null;
  return (
    (PERCEIVED_LUM_WEIGHTS.r * rgb[0] +
      PERCEIVED_LUM_WEIGHTS.g * rgb[1] +
      PERCEIVED_LUM_WEIGHTS.b * rgb[2]) /
    255
  );
}

/**
 * 按最终生效的 theme 归一 brief 的色板与矛盾描述。
 *
 * - theme 非 light/dark、colors 缺失、background 非法、亮度落在 0.45~0.55 灰色地带 → 原样不动
 *   （与 sampleRootBrightness「灰色地带返回 null 保留模型自报」口径一致）
 * - theme=light 且 background 明度 < 0.45，或 theme=dark 且 > 0.55 → 判定矛盾并归一
 * - 归一只覆盖 background/surface/text/border，保留 primary 及 colors 其它键；
 *   剔除 visualDetails 中「整体背景级 + 反向明暗词」的条目；写 _themePaletteSource 便于真机追溯
 */
export function reconcileBriefTheme(brief: any, theme: unknown): ReconcileResult {
  const unchanged = (reason: ReconcileReason): ReconcileResult => ({
    brief,
    applied: false,
    reason,
    conflicts: [],
  });

  if (theme !== 'light' && theme !== 'dark') return unchanged('not-applicable');
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return unchanged('not-applicable');
  const colors = brief.colors;
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return unchanged('not-applicable');

  const bgLum = perceivedLuminance(colors.background);
  if (bgLum === null) return unchanged('not-applicable');

  const conflict =
    (theme === 'light' && bgLum < THEME_LUM_DARK_MAX) ||
    (theme === 'dark' && bgLum > THEME_LUM_LIGHT_MIN);
  if (!conflict) return unchanged('no-conflict');

  const baseline = THEME_BASELINE[theme as LiteTheme];
  const next: any = JSON.parse(JSON.stringify(brief));
  const conflicts: ThemeConflict[] = [];

  for (const field of ['background', 'surface', 'text', 'border'] as const) {
    const from = String(next.colors[field] ?? '');
    const to = baseline[field];
    if (from.toUpperCase() !== to.toUpperCase()) {
      conflicts.push({ field, from, to });
    }
    next.colors[field] = to;
  }

  const wordRx = theme === 'light' ? DARK_WORD_RX : LIGHT_WORD_RX;
  if (Array.isArray(next.visualDetails)) {
    next.visualDetails = next.visualDetails.filter(
      (line: unknown) =>
        typeof line !== 'string' || !(GLOBAL_BG_RX.test(line) && wordRx.test(line)),
    );
  }

  next._themePaletteSource = 'pixel-reconciled';
  return { brief: next, applied: true, reason: 'reconciled', conflicts };
}
