/**
 * 离线验证：Lite 管线 N 主题真值注入（2026-10-12）
 *
 * 纯函数级证明（不调 LLM / 不调 Figma）：
 *   1. 单份色板 → Lite 的 7 个规范槽位（槽位名禁改，与 LLM 提示词 §13 一致）
 *   2. N 主题装配：list / slots / degraded 三者自洽
 *   3. 部分降级：某主题色板不合格只影响它自己
 *   4. theme-vars.less 扩展：N 套 mixin + .common() 保留 + light/dark 恒保留
 *   5. 🔴 真实 Less 编译（业务样式硬引用 .theme-light()/.theme-dark()，删了必炸）
 *   6. 零真值时**原样返回**（单稿路径零回归）
 *
 * 用法：node scripts/verify-lite-multi-theme.mjs
 */
import {
  buildLiteThemeSlots,
  assembleLiteThemes,
  expandThemeVarsLess,
  LITE_THEME_SLOTS,
} from '../dist/lite/utils/lite-multi-theme.js';
import { normalizeThemeInputs } from '../dist/ai-engine/utils/multi-theme.js';
import less from 'less';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// 造色板（模拟 extractFigmaColorPalette 的输出）
const P_LIGHT = { topPrimary: '#2f6bff', topText: '#546881', topBg: '#f5f7fa' };
const P_DARK = { topPrimary: '#44e4ff', topText: '#98c2f6', topBg: '#141a2e' };
const P_DUSK = { topPrimary: '#ff8c42', topText: '#ffe4cc', topBg: '#2b1a33' };

console.log('\n═══ 1. 单份色板 → 7 个规范槽位 ═══\n');
const sDark = buildLiteThemeSlots(P_DARK, 'dark');
check('恰好 7 个槽位', Object.keys(sDark).length === 7, JSON.stringify(Object.keys(sDark)));
check(
  '槽位名与规范完全一致（禁改，防 THEME-VAR-NAME-MISMATCH）',
  JSON.stringify(Object.keys(sDark).sort()) === JSON.stringify([...LITE_THEME_SLOTS].sort()),
  JSON.stringify(Object.keys(sDark)),
);
check('主色取稿真值', sDark.colorPrimary === '#44e4ff', sDark.colorPrimary);
check('文字色取稿真值', sDark.colorTextBase === '#98c2f6', sDark.colorTextBase);
check('深色稿面板底 = topBg', sDark.colorBgPanel === '#141a2e', sDark.colorBgPanel);
const sLight = buildLiteThemeSlots(P_LIGHT, 'light');
check('浅色稿面板底 = 主色淡化（非白底）', /^rgba\(/.test(sLight.colorBgPanel), sLight.colorBgPanel);

console.log('\n═══ 2. N 主题装配 ═══\n');
const norm = normalizeThemeInputs([
  { fileKey: 'F1', nodeId: '1:1', name: 'light' },
  { fileKey: 'F2', nodeId: '1:2', name: 'dark' },
  { fileKey: 'F3', nodeId: '1:3', name: 'dusk-mode' },
]);
const entries = norm.themes.map((t, i) => ({
  ...t,
  brightness: i === 0 ? 'light' : 'dark',
  palette: [P_LIGHT, P_DARK, P_DUSK][i],
}));
const asm = assembleLiteThemes(entries);
check('list 长度 = 3', asm.list.length === 3, `got ${asm.list.length}`);
check('slots 含 3 个 key', Object.keys(asm.slots).length === 3, JSON.stringify(Object.keys(asm.slots)));
check('无降级', asm.degraded.length === 0, JSON.stringify(asm.degraded));
check(
  '三套主色互不相同（各取各稿真值）',
  new Set(Object.values(asm.slots).map((s) => s.colorPrimary)).size === 3,
  JSON.stringify(Object.values(asm.slots).map((s) => s.colorPrimary)),
);
check('list 每项含 name/key/brightness', asm.list.every((t) => t.name && t.key && t.brightness));

console.log('\n═══ 3. 部分降级（色板不合格只影响它自己）═══\n');
const asmBad = assembleLiteThemes([
  { key: 'light', name: '浅色', brightness: 'light', palette: P_LIGHT },
  { key: 'bad', name: '废稿', brightness: 'dark', palette: {} }, // 提不出主色
  { key: 'dark', name: '深色', brightness: 'dark', palette: P_DARK },
]);
check('降级 1 个', asmBad.degraded.length === 1 && asmBad.degraded[0].key === 'bad', JSON.stringify(asmBad.degraded));
check('真值主题未受影响', asmBad.slots.light.colorPrimary === '#2f6bff', asmBad.slots.light.colorPrimary);
check('降级主题落兜底（非空）', !!asmBad.slots.bad.colorPrimary, asmBad.slots.bad?.colorPrimary);
check('后一个真值主题也未受影响', asmBad.slots.dark.colorPrimary === '#44e4ff', asmBad.slots.dark.colorPrimary);

console.log('\n═══ 4. theme-vars.less 扩展 ═══\n');
// 模拟 LLM 产出的既有 theme-vars.less
const LLM_LESS = `// LLM 产出
.common() {
  @panelType: default-panel;
  @radius: 8px;
}

.theme-light() {
  @colorPrimary: #123456;
  @colorTextBase: #abcdef;
}

.theme-dark() {
  @colorPrimary: #654321;
  @colorTextBase: #fedcba;
}

:root {
  .common();
}
`;
const expanded = expandThemeVarsLess(LLM_LESS, asm.slots, asm.list);
check('.common() 保留', /@panelType: default-panel/.test(expanded), 'LLM 的非主题变量必须保住');
check(':root 暴露保留', /:root\s*\{/.test(expanded));
check('产出 3 套 mixin', (expanded.match(/^\.theme-[a-zA-Z0-9_-]+\(\) \{/gm) || []).length === 3, `got ${(expanded.match(/^\.theme-[a-zA-Z0-9_-]+\(\) \{/gm) || []).length}`);
check('.theme-light() 存在（业务硬引用）', /\.theme-light\(\) \{/.test(expanded));
check('.theme-dark() 存在（业务硬引用）', /\.theme-dark\(\) \{/.test(expanded));
check('自定义主题 mixin 存在', /\.theme-dusk_mode\(\) \{/.test(expanded), expanded.split('\n').filter((l) => /^\.theme-/.test(l)).join(' | '));
check('LLM 的假主题色已被真值覆盖（不再是 #123456）', !/#123456/.test(expanded));
check('深色真值已写入', /@colorPrimary: #44e4ff;/.test(expanded));
check('黄昏真值已写入', /@colorPrimary: #ff8c42;/.test(expanded));

console.log('\n═══ 5. 🔴 真实 Less 编译（删掉 light/dark 会直接炸）═══\n');
const BIZ = `
.component { .theme-light(); color: @colorPrimary; background: @colorBgPanel; }
.comp-dark { .theme-dark(); color: @colorPrimary; }
.comp-dusk { .theme-dusk_mode(); color: @colorPrimary; }
`;
try {
  const out = await less.render(`${expanded}\n${BIZ}`);
  check('扩展后 theme-vars.less 可被 Less 编译', true);
  check('浅色规则产出主色', out.css.includes('#2f6bff') || out.css.includes('#2f6bff'), '期望浅色真值');
  check('深色规则产出主色', out.css.includes('#44e4ff'), '期望深色真值');
  check('黄昏规则产出主色', out.css.includes('#ff8c42'), '期望黄昏真值');
} catch (e) {
  check('扩展后 theme-vars.less 可被 Less 编译', false, `${e.message} @line ${e.line}`);
}

console.log('\n═══ 6. key 非 light/dark 时仍保留两套（防编译炸）═══\n');
const asmNoLd = assembleLiteThemes([
  { key: 'dusk_mode', name: '黄昏模式', brightness: 'dark', palette: P_DUSK },
  { key: 'night', name: '夜间', brightness: 'dark', palette: P_DARK },
]);
const exp2 = expandThemeVarsLess(LLM_LESS, asmNoLd.slots, asmNoLd.list);
check('仍产出 .theme-light()', /\.theme-light\(\) \{/.test(exp2));
check('仍产出 .theme-dark()', /\.theme-dark\(\) \{/.test(exp2));
try {
  await less.render(`${exp2}\n.x { .theme-light(); .theme-dark(); }`);
  check('无 light/dark key 时仍可编译', true);
} catch (e) {
  check('无 light/dark key 时仍可编译', false, `${e.message} @line ${e.line}`);
}

console.log('\n═══ 7. 零真值 ⇒ 原样返回（单稿路径零回归）═══\n');
const same = expandThemeVarsLess(LLM_LESS, {}, []);
check('slots 为空时逐字节返回原文件', same === LLM_LESS);
const same2 = expandThemeVarsLess(LLM_LESS, undefined, undefined);
check('入参 undefined 时也原样返回', same2 === LLM_LESS);

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);