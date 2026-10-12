/**
 * 离线验证：N 主题渲染（2026-10-12）
 *
 * 证明 style-tokens 从「固定 light/dark」泛化到 N 主题后：
 *   1. 3 主题能产出 3 套槽位，且**互不串色**（每套拿自己那份稿的三核心）
 *   2. renderMicrocodeThemeVarsLess 真的 emit N 个 `.theme-<key>()` mixin
 *   3. mixin 名用 slug（中文可用、非法符号已剔除）
 *   4. 同明暗多主题（两个深色）也能各自成槽
 *   5. 兼容字段 light/dark/darkWithDesign 仍满足既有不对称契约
 *   6. 单稿路径**不受影响**（无 themeSlots ⇒ 仍只 emit 两个 mixin）
 *
 * 用法：node scripts/verify-multi-theme-render.mjs
 */
import { buildStyleTokens, renderMicrocodeThemeVarsLess } from '../src/ai-engine/utils/style-tokens.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * 造一份带明确主色/文字色/背景色的 Figma 节点树。
 *
 * ⚠️ 必须贴合 extractFigmaColorPalette 的真实提取口径（style-tokens.js:299）：
 *   文字色来自 `type:'TEXT'` 节点的 fills；主色来自**高饱和**（chroma>=0.15）填充。
 *   只给背景 fill 是提不出 topPrimary 的（fixture 必须模拟真实节点树）。
 */
function mkNode(name, primaryHex, textHex, bgHex) {
  const hx = (h) => {
    const n = parseInt(h.replace('#', ''), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  };
  const solid = (hex) => [{ type: 'SOLID', color: hx(hex), visible: true }];
  // 主色块：面积小但高饱和 → 被判为 topPrimary
  const primaryBlock = {
    id: `${name}-primary`,
    name: 'primary-block',
    type: 'RECTANGLE',
    absoluteBoundingBox: { x: 8, y: 8, width: 40, height: 40 },
    fills: solid(primaryHex),
    strokes: [],
    effects: [],
  };
  // 文字节点：面积大但低饱和 → 被判为 topText
  const textNode = {
    id: `${name}-text`,
    name: 'title',
    type: 'TEXT',
    characters: '标题文字',
    absoluteBoundingBox: { x: 8, y: 60, width: 300, height: 400 },
    fills: solid(textHex),
    strokes: [],
    effects: [],
  };
  return {
    id: `${name}-root`,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 510, height: 665 },
    fills: solid(bgHex),
    strokes: [],
    effects: [],
    styles: {},
    children: [primaryBlock, textNode],
  };
}

const LIGHT = mkNode('light', '#2f6bff', '#546881', '#f5f7fa');
const DARK = mkNode('dark', '#44e4ff', '#98c2f6', '#141a2e');
const DUSK = mkNode('dusk', '#ff8c42', '#ffe4cc', '#2b1a33'); // 深色底的「黄昏模式」
const TWILIGHT = mkNode('twilight', '#7b61ff', '#e8e4ff', '#f0edff'); // 浅色底

const logger = { info() {}, warn() {} };

console.log('\n═══ 1. 三主题贯通 ═══\n');
// ⚠️ key 必须是 ASCII（Less mixin 名不接受中文，2026-10-12 真机实测）；
//    显示名可以是中文 —— 这正是「key 与 name 分离」的用途。
const r3 = buildStyleTokens(
  {
    figmaNodeData: LIGHT,
    backgroundBrightness: 'light',
    dualTruth: {
      themes: [
        { key: 'light', name: '浅色', brightness: 'light', nodeData: LIGHT },
        { key: 'dark', name: '深色', brightness: 'dark', nodeData: DARK },
        { key: 'dusk', name: '黄昏模式', brightness: 'dark', nodeData: DUSK },
      ],
    },
  },
  { logger },
);

check('themes 长度 = 3', r3.themes.length === 3, `got ${r3.themes.length}`);
check('themeSlots 含 3 个 key', Object.keys(r3.themeSlots || {}).length === 3, `got ${Object.keys(r3.themeSlots || {}).join(',')}`);
check('dualTruth.enabled = true', r3.dualTruth?.enabled === true);
check('themeMeta 带 3 条', r3.themeMeta?.length === 3);

console.log('\n═══ 2. 三套槽位互不串色（核心）═══\n');
check(
  '浅色槽主色 = 浅色稿真值',
  (r3.themeSlots['light']?.colorPrimary || '').toLowerCase() === '#2f6bff',
  `got ${r3.themeSlots['light']?.colorPrimary}`,
);
check(
  '深色槽主色 = 深色稿真值',
  (r3.themeSlots['dark']?.colorPrimary || '').toLowerCase() === '#44e4ff',
  `got ${r3.themeSlots['dark']?.colorPrimary}`,
);
check(
  '黄昏槽主色 = 黄昏稿真值（未串到深色）',
  (r3.themeSlots['dusk']?.colorPrimary || '').toLowerCase() === '#ff8c42',
  `got ${r3.themeSlots['dusk']?.colorPrimary}`,
);
check(
  '黄昏槽文字色 = 黄昏稿真值',
  (r3.themeSlots['dusk']?.colorTextBase || '').toLowerCase() === '#ffe4cc',
  `got ${r3.themeSlots['dusk']?.colorTextBase}`,
);
check(
  '黄昏（深色底）用 topBg 作卡片底',
  (r3.themeSlots['dusk']?.colorPrimaryBg || '').toLowerCase() === '#2b1a33',
  `got ${r3.themeSlots['dusk']?.colorPrimaryBg}`,
);
check(
  '浅色槽用主色透明作卡片底（非 topBg 页面底）',
  String(r3.themeSlots['light']?.colorPrimaryBg || '').startsWith('rgba'),
  `got ${r3.themeSlots['light']?.colorPrimaryBg}`,
);

console.log('\n═══ 3. 同明暗多主题（两个深色）═══\n');
const rSame = buildStyleTokens(
  {
    figmaNodeData: DARK,
    backgroundBrightness: 'dark',
    dualTruth: {
      themes: [
        { key: 'dark', name: '深色', brightness: 'dark', nodeData: DARK },
        { key: 'dusk', name: '黄昏模式', brightness: 'dark', nodeData: DUSK },
      ],
    },
  },
  { logger },
);
check('两个深色主题各自成槽', !!rSame.themeSlots['dark'] && !!rSame.themeSlots['dusk']);
check(
  '两个深色主题主色不同（没被合并覆盖）',
  rSame.themeSlots['dark'].colorPrimary?.toLowerCase() !== rSame.themeSlots['dusk'].colorPrimary?.toLowerCase(),
  `${rSame.themeSlots['dark']?.colorPrimary} vs ${rSame.themeSlots['dusk']?.colorPrimary}`,
);
check(
  '兼容字段 dark 取「深色组首个」',
  (rSame.dark?.colorPrimary || '').toLowerCase() === '#44e4ff',
  `got ${rSame.dark?.colorPrimary}`,
);

console.log('\n═══ 4. 兼容字段不对称契约（§3b 守护）═══\n');
check('dark 只含三核心（无 designVars）', !('colorBgDesign' in (r3.dark || {})));
check('darkWithDesign 含深色 designVars', 'colorBgDesign' in (r3.darkWithDesign || {}));
check('light 含浅色 designVars', 'colorBgDesign' in (r3.light || {}));
check(
  'darkWithDesign.colorPrimaryDesign = 深色稿（非浅色稿）',
  (r3.darkWithDesign?.colorPrimaryDesign || '').toLowerCase() === '#44e4ff',
  `got ${r3.darkWithDesign?.colorPrimaryDesign}`,
);
check(
  'light.colorPrimaryDesign = 浅色稿',
  (r3.light?.colorPrimaryDesign || '').toLowerCase() === '#2f6bff',
  `got ${r3.light?.colorPrimaryDesign}`,
);

console.log('\n═══ 5. renderMicrocodeThemeVarsLess emit N 个 mixin ═══\n');
const less3 = renderMicrocodeThemeVarsLess(r3, '');
check('emit 浅色 mixin', less3.includes('.theme-light()'));
check('emit 深色 mixin', less3.includes('.theme-dark()'));
check('emit 黄昏模式 mixin', less3.includes('.theme-dusk()'));
check('mixin 计数为 3', (less3.match(/\.theme-[^\s(]+\(\) \{/g) || []).length === 3, `got ${(less3.match(/\.theme-[^\s(]+\(\) \{/g) || []).length}`);
check('头部注释声明主题数', /3 个主题/.test(less3), `got ${less3.split('\n')[1]}`);
check('.common() 仍存在', less3.includes('.common()'));
check(
  '黄昏 mixin 内主色为黄昏真值',
  /theme-dusk\(\) \{[\s\S]*?@color-primary: #ff8c42;/.test(less3),
);
check(
  '黄昏 mixin 与深色 mixin 值不同（未串色）',
  /theme-dark\(\) \{[\s\S]*?@color-primary: #44e4ff;/.test(less3),
);

console.log('\n═══ 6. 🔴 mixin 名必须是纯 ASCII（Less 不接受中文）═══\n');
// 2026-10-12 真机实测：`.theme-light()` 编译报 `Missing closing ')'`。
// CSS 类名能过不代表 Less mixin 能过 —— 这条断言专门守护它。
const less = (await import('less')).default;
const mixinNames = (less3.match(/^\.(theme-[^\s(]+)\(\) \{/gm) || []).map((s) =>
  s.replace(/^\./, '').replace(/\(\) \{$/, ''),
);
check('提取到 3 个 mixin 名', mixinNames.length === 3, `got ${mixinNames.join(', ')}`);
check(
  '全部 mixin 名为纯 ASCII（无中文）',
  mixinNames.every((n) => /^[\x20-\x7e]+$/.test(n) && !/[^\x20-\x7e]/.test(n)),
  `got ${mixinNames.join(', ')}`,
);
// 真实编译一次（把 mixin 调用加上，验证整段可编译）
try {
  await less.render(`${less3}\n.probe { .${mixinNames[0]}(); color: @color-primary; }`);
  check('含 N 个 mixin 的 theme-vars.less 可被 Less 编译', true);
} catch (e) {
  check('含 N 个 mixin 的 theme-vars.less 可被 Less 编译', false, `${e.message} @line ${e.line}`);
}

console.log('\n═══ 7. 单稿路径零影响 ═══\n');
const r1 = buildStyleTokens({ figmaNodeData: DARK, backgroundBrightness: 'dark' }, { logger });
check('单稿无 themeSlots', !r1.themeSlots || Object.keys(r1.themeSlots).length === 0);
check('单稿 dualTruth = null', r1.dualTruth === null);
const less1 = renderMicrocodeThemeVarsLess(r1, '');
check(
  '单稿仍只 emit 2 个 mixin',
  (less1.match(/\.theme-[^\s(]+\(\) \{/g) || []).length === 2,
  `got ${(less1.match(/\.theme-[^\s(]+\(\) \{/g) || []).length}`,
);
check('单稿仍有 theme-light/theme-dark', less1.includes('.theme-light()') && less1.includes('.theme-dark()'));

console.log('\n═══ 7. 旧双真值入参仍可用（向后兼容）═══\n');
const rLegacy = buildStyleTokens(
  { figmaNodeData: LIGHT, backgroundBrightness: 'light', dualTruth: { lightNodeData: LIGHT, darkNodeData: DARK } },
  { logger },
);
check('旧结构 themes = [light, dark]', JSON.stringify(rLegacy.themes) === '["light","dark"]', `got ${JSON.stringify(rLegacy.themes)}`);
check('旧结构仍 enabled', rLegacy.dualTruth?.enabled === true);
check('旧结构 dark 主色 = 深色稿', (rLegacy.dark?.colorPrimary || '').toLowerCase() === '#44e4ff');

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);