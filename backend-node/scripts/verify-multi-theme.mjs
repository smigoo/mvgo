/**
 * 离线验证：多主题规范化与装配（N 主题 · 2026-10-12）
 *
 * 目的：不调 Figma、不渲截图，纯函数级证明
 *   1. slug 派生（中文/空格/特殊符号/空名/冲突）
 *   2. 主题规范化（默认名、去重、空行剔除、错误收集、��量）
 *   3. 明暗分组 + 自定义名（决策 2：「黄昏模式」可以是深色底）
 *   4. 默认主题选择
 *   5. themeConfig 形状（与既有 light/dark 同构，存量前端不必分叉）
 *   6. 旧双真值结构迁移（让 buildStyleTokens 能吃新旧两种输入）
 *
 * 用法：node scripts/verify-multi-theme.mjs
 */
import {
  normalizeThemeInputs,
  slugifyThemeName,
  groupThemesByBrightness,
  pickDefaultTheme,
  buildThemeConfig,
  themesFromLegacyDualTruth,
  MULTI_THEME_ERROR_CODES as C,
  MAX_THEMES,
} from '../src/ai-engine/utils/multi-theme.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const node = (fileKey, nodeId) => ({ fileKey, nodeId });

console.log('\n═══ 1. slug 派生 ═══\n');
// 🔴 key 同时受**两处**约束，缺一即炸（都是真机踩出来的）：
//    ① Less mixin 名不接受中文 → `Missing closing ')'`
//    ② **JS 标识符不接受连字符** → `const theme_1 = {}` 语法错误
//       ⇒ 变量静默注入失败（现象：切换控件能点，但颜色不变）
check('中文名 → 回退 theme_1（key 不含中文）', slugifyThemeName('浅色', 0) === 'theme_1', `got ${slugifyThemeName('浅色', 0)}`);
check('回退 key 仍是合法标识符', /^[a-zA-Z][a-zA-Z0-9_]*$/.test(slugifyThemeName('黄昏模式', 2)));
check('纯中文名按序号回退', slugifyThemeName('黄昏模式', 2) === 'theme_3', `got ${slugifyThemeName('黄昏模式', 2)}`);
check('中英混合 → 只留 ASCII 部分', slugifyThemeName('dark 模式', 0) === 'dark', `got ${slugifyThemeName('dark 模式', 0)}`);
check('空格转 _', slugifyThemeName('night mode', 0) === 'night_mode', `got ${slugifyThemeName('night mode', 0)}`);
check('点号/连字符均转 _（JS 标识符无连字符）', slugifyThemeName('night-mode.v2', 0) === 'night_mode_v2', `got ${slugifyThemeName('night-mode.v2', 0)}`);
check('特殊符号剔除', slugifyThemeName('mode@#1!', 0) === 'mode1', `got ${slugifyThemeName('mode@#1!', 0)}`);
check('连续分隔符合并 + 去首尾', slugifyThemeName('__dark__mode__', 0) === 'dark_mode');
check('空名回退 theme_1', slugifyThemeName('', 0) === 'theme_1');
check('纯符号回退', slugifyThemeName('@@@', 2) === 'theme_3');
check('英文大小写保留', slugifyThemeName('DarkMode', 0) === 'DarkMode');
check('🔴 全部产出均为合法 JS 标识符（回归守护）',
  ['浅色', '黄昏模式', '主题 3', 'night mode', 'night-mode.v2', 'DarkMode', '1st-theme', '@x#']
    .every((n, i) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(slugifyThemeName(n, i))),
  ['浅色', '黄昏模式', '主题 3', 'night mode', 'night-mode.v2', 'DarkMode', '1st-theme', '@x#']
    .map((n, i) => slugifyThemeName(n, i)).join(','),
);
// 🔴 真实 JS 解析验证（不能只靠正则 —— 正则可能与 JS 标识符规则不一致）
for (const sample of ['浅色', 'night-mode', '1st-theme', '黄昏模式']) {
  const k = slugifyThemeName(sample, 0);
  let ok = true;
  try { new Function(`const ${k} = {}; return ${k};`); } catch { ok = false; }
  check(`「${sample}」→ ${k} 可作 const 声明`, ok);
}

console.log('\n═══ 2. 主题规范化 ═══\n');
const r1 = normalizeThemeInputs([node('AAA', '1:1'), node('BBB', '2:2')]);
check('两主题 → 2 条', r1.themes.length === 2);
check('第 1 个默认名「浅色」', r1.themes[0].name === '浅色');
check('第 2 个默认名「深色」', r1.themes[1].name === '深色');
// ⚠️ 默认名是纯中文 ⇒ key 回退为 theme-N（Less 不接受中文 mixin 名，见 §1）
check('默认名（纯中文）→ key 回退 theme_1/theme_2',
  r1.themes[0].key === 'theme_1' && r1.themes[1].key === 'theme_2',
  `got ${r1.themes[0].key}/${r1.themes[1].key}`);
check('无错误', r1.errors.length === 0);

const r2 = normalizeThemeInputs([node('AAA', '1:1'), { name: '' }, { fileKey: '', nodeId: '' }]);
check('空行静默剔除', r2.themes.length === 1, `got ${r2.themes.length}`);
check('空行不报错', r2.errors.length === 0);

const r3 = normalizeThemeInputs([node('AAA', '1:1'), node('AAA', '1:1')]);
check('同稿重复被拒', r3.themes.length === 1);
check(
  '同稿错误码 DUPLICATE_NODE',
  r3.errors[0]?.code === C.DUPLICATE_NODE,
  `got ${r3.errors[0]?.code}`,
);

const r4 = normalizeThemeInputs([node('AAA', '1:1'), { ...node('BBB', '2:2'), name: '浅色' }]);
check('同名被拒', r4.themes.length === 1);
check(
  '同名错误码 DUPLICATE_NAME',
  r4.errors[0]?.code === C.DUPLICATE_NAME,
  `got ${r4.errors[0]?.code}`,
);

const r5 = normalizeThemeInputs([node('AAA', '1:1'), { fileKey: 'BBB' }]);
check('缺 nodeId 被拒', r5.themes.length === 1);
check(
  '缺 nodeId 错误码',
  r5.errors[0]?.code === C.MISSING_NODE_ID,
  `got ${r5.errors[0]?.code}`,
);
check(
  '缺 nodeId 的 detail 指明缺哪项',
  r5.errors[0]?.detail === '缺少 node-id',
  `got ${r5.errors[0]?.detail}`,
);

const many = Array.from({ length: 12 }, (_, i) => node(`K${i}`, `1:${i}`));
const r6 = normalizeThemeInputs(many);
check(`超 ${MAX_THEMES} 个被截断`, r6.themes.length === MAX_THEMES, `got ${r6.themes.length}`);
check(
  '超限有 TOO_MANY 错误',
  r6.errors.some((e) => e.code === C.TOO_MANY),
);

console.log('\n═══ 3. slug 冲突（不同名撞同一 slug）═══\n');
const r7 = normalizeThemeInputs([
  { ...node('AAA', '1:1'), name: '深色' },
  { ...node('BBB', '2:2'), name: '深 色' },
]);
check('两个主题都保留', r7.themes.length === 2, `got ${r7.themes.length}`);
check(
  '第二个 slug 加了序号后缀（不静默覆盖）',
  r7.themes[1].key !== r7.themes[0].key,
  `keys=${r7.themes.map((t) => t.key).join(',')}`,
);
check('显示名仍保留原文', r7.themes[1].name === '深 色');

console.log('\n═══ 4. 明暗分组（决策 2：自定义名 + 自动判明暗）═══\n');
// ⚠️ 用**英文名**做 key（纯中文名会 slug 成 theme-N，按 key 索引就取不到节点数据）。
//   中文显示名的场景在 §4b 单独测。
const n4 = normalizeThemeInputs([
  node('A', '1:1'),
  node('B', '2:2'),
  { ...node('C', '3:3'), name: 'high-contrast' },
  { ...node('D', '4:4'), name: 'dusk-mode' },
]);
const nodeDataByKey = {
  'theme_1': { __b: 'light' },
  'theme_2': { __b: 'dark' },
  'high_contrast': { __b: 'light' },
  'dusk_mode': { __b: 'dark' }, // 名字带 dusk 但实测是深色底
};
const resolve = (nd, fb) => (nd && nd.__b ? nd.__b : fb);
const g = groupThemesByBrightness(n4.themes, resolve, nodeDataByKey);
check('4 个主题全部归组', g.entries.length === 4);
check('light 组 2 个', g.light.length === 2, `got ${g.light.length}`);
check('dark 组 2 个', g.dark.length === 2, `got ${g.dark.length}`);
check('带连字符的显示名 → key 转为下划线（JS 标识符要求）', g.entries[2].key === 'high_contrast', );
const dusk = g.entries.find((e) => e.name === 'dusk-mode');
check('dusk-mode 归入 dark 组（实测深色底，非按名字猜）', dusk?.brightness === 'dark', `got ${dusk?.brightness}`);
check('dusk-mode 显示名未被改写', dusk?.name === 'dusk-mode');

console.log('\n═══ 4b. 纯中文显示名 → key 回退但功能完整 ═══\n');
const nCn = normalizeThemeInputs([
  node('A', '1:1'),
  { ...node('B', '2:2'), name: '黄昏模式' },
]);
check('中文名 key 回退 theme_2', nCn.themes[1].key === 'theme_2', `got ${nCn.themes[1].key}`);
check('中文名 key 不含中文', !/[\u4e00-\u9fa5]/.test(nCn.themes[1].key));
check('中文名显示名完整保留', nCn.themes[1].name === '黄昏模式');
const gCn = groupThemesByBrightness(
  nCn.themes,
  (nd, fb) => (nd && nd.__b ? nd.__b : fb),
  { 'theme_1': { __b: 'light' }, 'theme_2': { __b: 'dark' } },
);
check('中文名主题仍能正确分组', gCn.dark.length === 1 && gCn.light.length === 1);
const tcCn = buildThemeConfig(gCn.entries, pickDefaultTheme(gCn.entries));
check('themeConfig 里 key 可用、name 为中文', tcCn.list[1].key === 'theme_2' && tcCn.list[1].name === '黄昏模式');

console.log('\n═══ 5. 默认主题选择 ═══\n');
const d1 = pickDefaultTheme(g.entries, null);
check('未指定 → 第一份设计稿', d1.key === g.entries[0].key);
const d2 = pickDefaultTheme(g.entries, 'dusk_mode');
check('指定主稿 → 命中', d2.key === 'dusk_mode', `got ${d2.key}`);
check('指定主稿带出明暗', d2.brightness === 'dark');
const d3 = pickDefaultTheme(g.entries, '不存在的key');
check('指定不存在的 key → 退回第一份', d3.key === g.entries[0].key);
const d4 = pickDefaultTheme([], null);
check('空数组 → 兜底 dark', d4.key === 'dark' && d4.brightness === 'dark');

console.log('\n═══ 6. themeConfig 形状（与既有 light/dark 同构）═══\n');
const tc = buildThemeConfig(g.entries, d2);
check('default = 主稿 key', tc.default === 'dusk_mode', `got ${tc.default}`);
check('list 长度 = 4', tc.list.length === 4);
check('list[].key/name/brightness 齐备', !!tc.list[0].key && !!tc.list[0].name && !!tc.list[0].brightness);
check('multiTheme = true', tc.multiTheme === true);
check('themeCount = 4', tc.themeCount === 4);
check('dualTruth = true（语义推广：全为真值）', tc.dualTruth === true);
check('primaryBrightness 已带出', tc.primaryBrightness === 'dark');

const tc1 = buildThemeConfig([g.entries[0]], d1);
check('单主题时 dualTruth = false', tc1.dualTruth === false, `got ${tc1.dualTruth}`);

console.log('\n═══ 7. 旧双真值结构迁移（兼容存量调用方）═══\n');
check('null → null', themesFromLegacyDualTruth(null) === null);
const legacy = themesFromLegacyDualTruth({
  lightNodeData: { a: 1 },
  darkNodeData: { b: 2 },
});
check('旧 light+dark → 2 条', legacy.length === 2);
check('迁移后 key 为 light/dark', legacy[0].key === 'light' && legacy[1].key === 'dark');
check('迁移保留 nodeData', legacy[0].nodeData?.a === 1);
check('迁移带出明暗', legacy[0].brightness === 'light' && legacy[1].brightness === 'dark');
const already = { themes: [{ key: 'x' }] };
check('已是新结构则原样返回', themesFromLegacyDualTruth(already) === already.themes);
check('空对象 → null', themesFromLegacyDualTruth({}) === null);
const half = themesFromLegacyDualTruth({ lightNodeData: { a: 1 } });
check('只有一侧 → 1 条', half.length === 1);

console.log('\n═══ 8. 1 稿 / 3 稿 / N 稿 通用性 ═══\n');
// ⚠️ 用**真实明暗语义**（节点树自带标记）而非序号 —— 与
// resolveBackgroundBrightness(nodeData, fallback) 的真实签名一致。
const resolveReal = (nd, fb) => (nd && nd.__b ? nd.__b : fb);
for (const n of [1, 3, 5, MAX_THEMES]) {
  const arr = Array.from({ length: n }, (_, i) => ({
    ...node(`K${i}`, `1:${i}`),
    name: `主题${i + 1}`,
  }));
  const rr = normalizeThemeInputs(arr);
  // 交替给浅/深标记，验证分组真的按明暗拆开（而不是全落一侧）
  const ndMap = {};
  rr.themes.forEach((t, i) => {
    ndMap[t.key] = { __b: i % 2 === 0 ? 'light' : 'dark' };
  });
  const gg = groupThemesByBrightness(rr.themes, resolveReal, ndMap);
  const tt = buildThemeConfig(gg.entries, pickDefaultTheme(gg.entries));
  const expectedLight = Math.ceil(n / 2);
  const expectedDark = Math.floor(n / 2);
  check(
    `${n} 稿贯通：${rr.themes.length} 主题 / light=${gg.light.length} dark=${gg.dark.length} / list=${tt.list.length}`,
    rr.themes.length === n &&
      tt.list.length === n &&
      gg.light.length === expectedLight &&
      gg.dark.length === expectedDark,
  );
}

// 缺 nodeData 时必须落到 fallback，不能「猜」
const noNd = groupThemesByBrightness(
  normalizeThemeInputs([{ ...node('A', '1:1'), name: '无稿主题' }]).themes,
  resolveReal,
  {},
);
check('缺 nodeData → 落 fallback（dark）', noNd.entries[0].brightness === 'dark', `got ${noNd.entries[0].brightness}`);

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);