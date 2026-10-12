/**
 * Lite 管线 · N 主题真值注入（2026-10-12）
 *
 * 为什么需要这个模块（与 phase2 的关键差异，2026-10-12 摸底结论）：
 *   - **phase2**：`style-tokens.js` 确定性注入三核心 → 产出 `css-vars.js` +
 *     `theme-vars.less` 的 N 套 mixin，主题色**不采信 LLM**；
 *   - **Lite**：LLM 按**固定槽位名**产出 `.theme-light()/.theme-dark()`，
 *     平台（`LessVariableChecker`）只做「被引用但未定义」的补齐。
 *   ⇒ Lite 的 N 主题 = **槽位名完全不变**，把 theme-vars.less 从 2 套扩到 N 套，
 *     色值改由本模块从各稿 Figma 真值**确定性覆盖注入**（LLM 产的值不再作数）。
 *
 * 复用 phase2 的 `multi-theme.js`（规范化/明暗分组/key slug）与
 * `style-tokens.js` 的 `extractFigmaColorPalette`（色板提取），
 * 保证两条管线对「同一份稿」的明暗判定与主色提取**完全一致**（单一事实源）。
 */

/** Lite 的规范主题槽位（与 LLM 提示词 §13 约定的名字一致，禁改） */
export const LITE_THEME_SLOTS = [
  'colorTextBase',
  'colorTextInverse',
  'colorBgPanel',
  'colorPrimary',
  'colorSecondary',
  'colorDanger',
  'colorBorder',
];

/** 无真值时的兜底（沿用规范枚举，保证任何情况下都有可编译的两套） */
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

/** hex → rgba(…, alpha) */
function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 提亮/变暗（用于派生 secondary/danger 的可读变体） */
function shiftLightness(hex, delta) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '';
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = delta >= 0 ? c + (255 - c) * delta : c * (1 + delta);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** 色板形状（extractFigmaColorPalette 的输出子集） */
type Palette = {
  topPrimary?: string | null;
  topText?: string | null;
  topBg?: string | null;
};

/** 规范化后的主题项（normalizeThemeInputs 输出 + palette/brightness） */
export type LiteThemeEntry = {
  key: string;
  name: string;
  brightness: 'light' | 'dark';
  palette: Palette;
};

/** 主题清单项（写入 declare.json 的 themeConfig.list） */
export type LiteThemeListItem = {
  name: string;
  key: string;
  brightness: 'light' | 'dark';
  isTruth: boolean;
  legacyName?: string;
  order: number;
};

/**
 * 一份色板 → Lite 的 7 个规范槽位。
 *
 * @param {Palette} palette extractFigmaColorPalette 结果
 * @param {'light'|'dark'} brightness 该主题实测明暗（决定用哪套兜底）
 */
export function buildLiteThemeSlots(palette: Palette = {}, brightness: 'light' | 'dark' = 'dark') {
  const fb = FALLBACK_BY_BRIGHTNESS[brightness === 'light' ? 'light' : 'dark'];
  const primary = palette.topPrimary || '';
  const text = palette.topText || '';
  const bg = palette.topBg || '';
  // 深色稿的背景本身即面板底色；浅色稿用主色淡化，避免整页白底
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

/**
 * 从 `themeNodes` 装配 N 主题真值。
 *
 * @param {Array} themes 已规范化的主题项 `[{key, name, brightness, palette}]`
 * @returns {{list:Array, slots:Object, degraded:Array}}
 *   list   = declare.json 的 themeConfig.list（前端切换控件数据源）
 *   slots  = key → 7 槽位（渲染 theme-vars.less 的 N 套 mixin）
 *   degraded= 哪些主题色板不合格已退兜底（前端可提示）
 */
export function assembleLiteThemes(themes: LiteThemeEntry[] = []) {
  const list: LiteThemeListItem[] = [];
  const slots: Record<string, Record<string, string>> = {};
  const degraded: Array<{ key: string; name: string; missing: string[] }> = [];
  themes.forEach((t, i) => {
    const brightness = t.brightness === 'light' ? 'light' : 'dark';
    const palette = t.palette || {};
    // 色板不合格（提不出主色或文字色）⇒ 该主题退兜底，其余主题不受影响
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
      // 兼容既有两主题字段：key 为 light/dark 时沿用既有名字
      ...(t.key === 'light' ? { legacyName: '亮色主题' } : {}),
      ...(t.key === 'dark' ? { legacyName: '深色主题' } : {}),
      order: i,
    });
  });
  return { list, slots, degraded };
}

/**
 * 把既有 theme-vars.less 扩展/替换为 N 套主题 mixin。
 *
 * 策略（保守，不破坏既有 LLM 产出）：
 *   - `.common()` **原样保留**（LLM 产的非主题变量都在这里）；
 *   - 已存在的 `.theme-<key>()` 整块**替换**为真值（LLM 产的主题色不作数）；
 *   - 新增的 key 追加到文件末尾；
 *   - `.theme-light()` / `.theme-dark()` **始终保留** ——
 *     业务 `<style>` 与 index.less 里已硬引用这两个 mixin（LLM 提示词 §13
 *     要求按这两个名字写），删掉会直接编译失败。
 *
 * @param {string} themeVarsLess 既有 theme-vars.less 全文
 * @param {Object} slots key → 7 槽位
 * @param {Array} list 主题清单（决定 mixin 顺序）
 * @returns {string} 新的 theme-vars.less 全文
 */
export function expandThemeVarsLess(
  themeVarsLess: string,
  slots: Record<string, Record<string, string>> = {},
  list: LiteThemeListItem[] = [],
): string {
  const src = String(themeVarsLess || '');
  // 只留 .common() 与非主题内容；主题 mixin 全部按真值重建
  const commonMatch = src.match(/\.common\(\)\s*\{[\s\S]*?\n\}/);
  const commonBlock = commonMatch ? commonMatch[0] : '.common() {\n}';

  const emitMixin = (key, map) => {
    const name = key === 'light' ? 'theme-light' : key === 'dark' ? 'theme-dark' : `theme-${key}`;
    const body = Object.entries(map)
      .map(([k, v]) => `  @${k}: ${v};`)
      .join('\n');
    return `.${name}() {\n${body}\n}`;
  };

  // 顺序：.theme-light → .theme-dark → 其余自定义主题（保证既有引用在前、行为不变）
  const ordered = [
    ...list.filter((t) => t.key === 'light'),
    ...list.filter((t) => t.key === 'dark'),
    ...list.filter((t) => t.key !== 'light' && t.key !== 'dark'),
  ];

  // 🔴 零真值 ⇒ **原样返回**（单稿路径零回归，绝不凭空造两套覆盖 LLM 产出）。
  //   这条优先于「light/dark 恒产出」—— 后者只在**确有真值**时生效。
  const hasAnyTruth = Object.keys(slots || {}).length > 0;
  if (!hasAnyTruth) return src;

  // ⚠️ `.theme-light()` / `.theme-dark()` **恒产出**，即使 themeNodes 里没有
  //   名为 light/dark 的 key —— 业务 `<style>` 与 index.less 硬引用这两个 mixin
  //   （LLM 提示词 §13 要求按这两个名字写），缺一个就是编译期报错。
  //   缺真值时用规范兜底（取自第一套真实主题，优先与设计稿同源）。
  const mixedins: string[] = [];
  const fallbackSlots = (brightness: 'light' | 'dark') =>
    slots[brightness] || slots.light || slots.dark || FALLBACK_BY_BRIGHTNESS[brightness];
  mixedins.push(emitMixin('light', fallbackSlots('light')));
  mixedins.push(emitMixin('dark', fallbackSlots('dark')));
  for (const t of ordered) {
    if (t.key === 'light' || t.key === 'dark') continue;
    if (!slots[t.key]) continue;
    mixedins.push(emitMixin(t.key, slots[t.key]));
  }
  const header = [
    '// 微码组件主题变量文件（Lite 管线 · N 主题真值注入，勿手改）',
    `// 主题数：${mixedins.length}（.theme-light/.theme-dark 为业务样式硬引用，恒保留）`,
    '// 槽位名与规范一致（禁改）；色值来自各主题 Figma 设计稿真值',
    '',
  ].join('\n');

  // 保留 .common() 之后的非 mixin 内容（如 :root 暴露等）
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
