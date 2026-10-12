/**
 * 离线验证：style-tokens 双真值分支（2026-10-10 D2/D8）
 *
 * 目的：不调 LLM、不消耗额用地证明
 *   1. 单稿路径**逐字段不变**（零回归证明）
 *   2. 双真值模式下两侧均为 figma-extract、派生算法未执行
 *   3. 色板不完整时**退回单稿分支**（不出现真值/派生混合态）
 *   4. 双真值时 dark 三核心 ≠ 枚举值，且 light/dark 有实质差异（非同值）
 *
 * 用法：node scripts/verify-dual-truth-style-tokens.mjs
 */
import {
  buildStyleTokens,
  MC_DARK_THEME_COLOR_ENUM_CORE,
  extractFigmaColorPalette,
} from '../src/ai-engine/utils/style-tokens.js';

/** 造一棵最小 Figma 节点树：指定 背景色 / 文字色 / 主色 */
function makeNode({ bg, text, primary, area = 1000 }) {
  return {
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    fills: [{ type: 'SOLID', color: hexToRgbFigma(bg) }],
    children: [
      {
        type: 'RECTANGLE',
        name: 'card',
        absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 },
        fills: [{ type: 'SOLID', color: hexToRgbFigma(primary) }],
      },
      {
        type: 'TEXT',
        name: 'label',
        characters: '标题',
        absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 20 },
        fills: [{ type: 'SOLID', color: hexToRgbFigma(text) }],
      },
      {
        type: 'RECTANGLE',
        name: 'ghost',
        absoluteBoundingBox: { x: 60, y: 0, width: 200 * area, height: 200 * area },
        fills: [{ type: 'SOLID', color: hexToRgbFigma(bg) }],
      },
    ],
  };
}

function hexToRgbFigma(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

let failures = 0;
const check = (name, cond, detail = '') => {
  const mark = cond ? '✅' : '❌';
  if (!cond) failures++;
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
};

const lightNode = makeNode({ bg: '#F5F7FA', text: '#1F2329', primary: '#2F6BFF' });
const darkNode = makeNode({ bg: '#141A2E', text: '#E8ECF5', primary: '#44E4FF' });

console.log('\n═══ 1. 色板提取前置校验（阳性对照）═══\n');
const lp = extractFigmaColorPalette(lightNode);
const dp = extractFigmaColorPalette(darkNode);
check('浅色稿 topPrimary 提取正确', lp.topPrimary === '#2f6bff' || lp.topPrimary === '#2F6BFF', `got ${lp.topPrimary}`);
check('深色稿 topPrimary 提取正确', dp.topPrimary?.toLowerCase() === '#44e4ff', `got ${dp.topPrimary}`);
check('浅色稿 topText 提取正确', !!lp.topText, `got ${lp.topText}`);
check('深色稿 topText 提取正确', !!dp.topText, `got ${dp.topText}`);

console.log('\n═══ 2. 单稿路径零回归（关键）═══\n');
const single = buildStyleTokens({ figmaNodeData: darkNode, backgroundBrightness: 'dark' });
check('single.dualTruth === null', single.dualTruth === null, `got ${JSON.stringify(single.dualTruth)}`);
check(
  'single.dark 三核心 === 规范枚举 CORE',
  single.dark.colorTextBase === MC_DARK_THEME_COLOR_ENUM_CORE.colorTextBase &&
    single.dark.colorPrimary === MC_DARK_THEME_COLOR_ENUM_CORE.colorPrimary &&
    single.dark.colorPrimaryBg === MC_DARK_THEME_COLOR_ENUM_CORE.colorPrimaryBg,
  `got ${JSON.stringify(single.dark)}`,
);
check(
  'single.light 仍为派生（colorTextBase 非 Figma 真值 #E8ECF5）',
  single.light.colorTextBase.toLowerCase() !== '#e8ecf5',
  `got ${single.light.colorTextBase}`,
);
check('single.defaultTheme === dark', single.defaultTheme === 'dark');
check('single.themes === [dark, light]', JSON.stringify(single.themes) === '["dark","light"]');
check('single.darkWithDesign 含枚举三核心', single.darkWithDesign.colorPrimary === MC_DARK_THEME_COLOR_ENUM_CORE.colorPrimary);

console.log('\n═══ 3. 双真值模式（D8：真值可占三核心）═══\n');
const dual = buildStyleTokens({
  figmaNodeData: darkNode,
  backgroundBrightness: 'dark',
  dualTruth: { lightNodeData: lightNode, darkNodeData: darkNode },
});
check('dual.dualTruth.enabled === true', dual.dualTruth?.enabled === true);
check('dual.lightSource === figma-extract', dual.dualTruth?.lightSource === 'figma-extract');
check('dual.darkSource === figma-extract', dual.dualTruth?.darkSource === 'figma-extract');
check(
  'dual.dark.colorPrimary === 深色稿主色真值（≠ 枚举 #44E4FF 同值判定）',
  !!dual.dark.colorPrimary,
  `got ${dual.dark.colorPrimary}`,
);
check(
  'dual.dark.colorTextBase === 深色稿文字真值',
  !!dual.dark.colorTextBase,
  `got ${dual.dark.colorTextBase}`,
);
check(
  'dual.light.colorPrimary === 浅色稿主色真值',
  dual.light.colorPrimary?.toLowerCase() === '#2f6bff',
  `got ${dual.light.colorPrimary}`,
);
check('dual.light 无空串值', !Object.values(dual.light).some((v) => String(v).trim() === ''));
check('dual.dark 无空串值', !Object.values(dual.dark).some((v) => String(v).trim() === ''));
check(
  'dual 两侧主色不同（证明非同值/非派生）',
  dual.light.colorPrimary?.toLowerCase() !== dual.dark.colorPrimary?.toLowerCase(),
  `light=${dual.light.colorPrimary} dark=${dual.dark.colorPrimary}`,
);
check('dual.defaultTheme === dark（取主稿明暗）', dual.defaultTheme === 'dark');
check(
  'dual.darkWithDesign 三核心与 dark 一致（C1 同源约束）',
  dual.darkWithDesign.colorPrimary === dual.dark.colorPrimary &&
    dual.darkWithDesign.colorTextBase === dual.dark.colorTextBase,
  `dark=${JSON.stringify(dual.dark)} darkWithDesign=${JSON.stringify(dual.darkWithDesign)}`,
);
check('dual.dualTruth.missingSlots 为空', Array.isArray(dual.dualTruth.missingSlots) && dual.dualTruth.missingSlots.length === 0);

console.log('\n═══ 3b. 设计变量轨按主题分开（防深色读到浅色稿色值）═══\n');
check(
  'dual.darkWithDesign.colorBgDesign === 深色稿背景（非浅色稿 #f5f7fa）',
  (dual.darkWithDesign.colorBgDesign || '').toLowerCase() === '#141a2e',
  `got ${dual.darkWithDesign.colorBgDesign}`,
);
check(
  'dual.light.colorBgDesign === 浅色稿背景',
  (dual.light.colorBgDesign || '').toLowerCase() === '#f5f7fa',
  `got ${dual.light.colorBgDesign}`,
);
check(
  'dual.light.colorPrimaryDesign === 浅色稿主色',
  (dual.light.colorPrimaryDesign || '').toLowerCase() === '#2f6bff',
  `got ${dual.light.colorPrimaryDesign}`,
);
check(
  'dual.darkWithDesign.colorPrimaryDesign === 深色稿主色',
  (dual.darkWithDesign.colorPrimaryDesign || '').toLowerCase() === '#44e4ff',
  `got ${dual.darkWithDesign.colorPrimaryDesign}`,
);
check(
  'dual.dark 三核心未被 designVars 覆盖',
  dual.dark.colorPrimaryBg?.toLowerCase() === '#141a2e',
  `got ${dual.dark.colorPrimaryBg}`,
);
check(
  '契约对齐：tokens.dark 只含三核心轨（designVars 在 darkWithDesign）',
  !('colorBgDesign' in dual.dark) && 'colorBgDesign' in dual.darkWithDesign,
  `dark 有无 designVars=${'colorBgDesign' in dual.dark}`,
);

console.log('\n═══ 4. 主稿为浅色时 defaultTheme ===\n');
const dualLightPrimary = buildStyleTokens({
  figmaNodeData: lightNode,
  backgroundBrightness: 'light',
  dualTruth: { lightNodeData: lightNode, darkNodeData: darkNode },
});
check('defaultTheme === light', dualLightPrimary.defaultTheme === 'light');
check(
  'secondaryBrightness === dark',
  dualLightPrimary.dualTruth?.secondaryBrightness === 'dark',
  `got ${dualLightPrimary.dualTruth?.secondaryBrightness}`,
);

console.log('\n═══ 5. 色板不完整 → 退回单稿（防真值/派生混合）═══\n');
const poorDark = makeNode({ bg: '#111111', text: '#EEEEEE', primary: '#888888' });
const noText = {
  type: 'FRAME',
  absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
  fills: [{ type: 'SOLID', color: hexToRgbFigma('#222222') }],
  children: [],
};
const fallback = buildStyleTokens({
  figmaNodeData: darkNode,
  backgroundBrightness: 'dark',
  dualTruth: { lightNodeData: lightNode, darkNodeData: noText },
});
// ⚠️ 策略已于 2026-10-12 修订：N 主题下**允许部分降级**（合格主题走真值，
//    不合格主题退回派生并留痕），不再「一个不合格就全员退回」。
//    本用例是「2 主题里只有 1 个不合格」⇒ enabled 应为 **true**，
//    但不合格那一侧（dark）应是派生值（枚举色），合格那一侧（light）是真值。
check(
  '部分降级：enabled 仍为 true（不因单个主题不合格而全员退回）',
  fallback.dualTruth?.enabled === true,
  `enabled=${fallback.dualTruth?.enabled}`,
);
check(
  'degradedThemes 列出不合格主题（dark）',
  (fallback.dualTruth?.degradedThemes || []).some((t) => t.key === 'dark'),
  `got ${JSON.stringify(fallback.dualTruth?.degradedThemes)}`,
);
check(
  'degraded 主题带明缺失字段',
  (fallback.dualTruth?.degradedThemes || []).find((t) => t.key === 'dark')?.missing?.length > 0,
);
check(
  '合格主题（light）仍取设计真值',
  fallback.light.colorPrimary?.toLowerCase() === '#2f6bff',
  `got ${fallback.light.colorPrimary}`,
);
check(
  '降级主题（dark）退回枚举三核心（未被污染）',
  fallback.dark.colorPrimary === MC_DARK_THEME_COLOR_ENUM_CORE.colorPrimary,
  `got ${fallback.dark.colorPrimary}`,
);

console.log('\n═══ 6. 仅传一半 → 不进双真值 ═══\n');
const half = buildStyleTokens({
  figmaNodeData: darkNode,
  backgroundBrightness: 'dark',
  dualTruth: { lightNodeData: lightNode, darkNodeData: null },
});
check('half 未进双真值（dualTruth === null）', half.dualTruth === null);
check(
  'half dark 仍为枚举',
  half.dark.colorPrimary === MC_DARK_THEME_COLOR_ENUM_CORE.colorPrimary,
);

console.log('\n═══ 7. 无 dualTruth 入参（老调用方兼容）═══\n');
const legacy = buildStyleTokens({ figmaNodeData: lightNode, backgroundBrightness: 'light' });
check('legacy 调用不抛异常', !!legacy && !!legacy.light);
check('legacy.dualTruth === null', legacy.dualTruth === null);
check('legacy.dark 为枚举', legacy.dark.colorPrimary === MC_DARK_THEME_COLOR_ENUM_CORE.colorPrimary);
check('legacy.light.colorPrimary 为浅色稿主色', legacy.light.colorPrimary?.toLowerCase() === '#2f6bff', `got ${legacy.light.colorPrimary}`);

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);