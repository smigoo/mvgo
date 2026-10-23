/**
 * 🛡️ 刀 53h（2026-10-23 · cd8938f8 实锤）——接管后**孤儿样式规则**处置 spec。
 *
 * 覆盖三面：
 *   ① 阳性：真机同形 fixture（`c-device-content-section4` / `-col` 双孤儿被精准删除 + 留痕）；
 *   ② 阴性（**不得误删**）：DOM 引用者 / 跨文件字面引用者 / 动态插值前缀同干者 /
 *      `-fg-` 接管命名空间 / Less mixin 定义 / 非类选择器 / 选择器内含 `${`；
 *   ③ 护栏：`.json`（元数据回显）与 `.css`（编译产物）**不进引用池**（否则「永不判孤儿」假绿）、
 *      未定义样式文件时留痕 `scannedFiles===0`、fail-open 不抛。
 *
 * 🔴 关键：**阳性对照必须打在真正生效的那一层**。本 spec 的阴性组里
 *   `dynamic-prefix` 一例刻意构造成「静态 DOM 事实里**没有**该变体 token」——
 *   若判据退化成 `referencedByDom`（依赖已有 token/bases），它就会被误删 ⇒ 测试变红。
 */
import {
  findOrphanStyleRules,
  dropOrphanStyleRules,
  detectDynamicClassBindings,
  collectDynamicClassPrefixes,
} from '../orphan-style-rule-guard.js';

/** 真机同形：`c-device-content-section4` 场景（表头 #bdd5ff / 数据格 #e2ecfe 值逐位一致，注释语义写错）。 */
const REAL_SHAPE = {
  'package/components/ContentSection4.vue': `<template>
  <div class="c-device-group-2136638436">
    <div class="c-device-legend-item"><span class="c-device-legend-dot"></span><span class="c-device-legend-text">图例</span></div>
  </div>
</template>
<script>export default { name: 'ContentSection4' };</script>
`,
  'package/index.vue': `<template><div class="c-device-slot-con"><ContentSection4 /></div></template>`,
  'resources/styles/common.less': `// ------------------------------------------------------------------
// 电量数据列（ContentSection4 —— 图元 #bdd5ff 表头 / #e2ecfe 数据格）
// ------------------------------------------------------------------
.c-device-content-section4 {
  width: 100%; flex: 1 1 0; min-height: 0;
  display: flex; flex-direction: column; box-sizing: border-box;
}
.c-device-content-section4-col {
  height: 44px; flex-shrink: 0; display: flex; flex-direction: row;
  align-items: center; justify-content: center; box-sizing: border-box;
  background: #e2ecfe; border: 1px solid #ffffff;
  &:first-child { background: #4a90d9; font-weight: 500; }
}
.c-device-group-2136638436 { display: flex; }
.c-device-legend-item { display: flex; }
.c-device-legend-dot { width: 8px; height: 8px; }
.c-device-legend-text { font-size: 12px; }
.c-device-slot-con { position: relative; }
`,
};

describe('刀 53h 孤儿样式规则判定（findOrphanStyleRules）', () => {
  it('阳性①：真机同形 —— 双孤儿被删、DOM 引用者全保留、residual 0', () => {
    const { stats } = findOrphanStyleRules(REAL_SHAPE);
    const removedSelectors = stats.removed.map((r) => r.selector);

    // 恰好两条业务孤儿（不是「删多了」也不是「删少了」）
    expect(removedSelectors.sort()).toEqual([
      '.c-device-content-section4',
      '.c-device-content-section4-col',
    ]);
    // 被 DOM 真实引用的一个都不能删
    const keptSelectors = stats.kept.map((r) => r.selector);
    expect(keptSelectors).toContain('.c-device-group-2136638436');
    expect(keptSelectors).toContain('.c-device-legend-item');
    expect(keptSelectors).toContain('.c-device-legend-dot');
    expect(keptSelectors).toContain('.c-device-legend-text');
    expect(keptSelectors).toContain('.c-device-slot-con');
    expect(stats.kept.every((r) => r.reason === 'dom-referenced')).toBe(true);
    // 留痕：有 styles、有候选，可辩驳（7 = 8 个顶层规则 − 注释头不构成块）
    expect(stats.scannedFiles).toBe(1);
    expect(stats.candidates).toBe(7);
    expect(stats.removed.length).toBe(2);
  });

  it('阳性②：dropOrphanStyleRules 真删块（含嵌套 `&:first-child`）+ 只回灌发生变化的文件', () => {
    const { map, stats } = dropOrphanStyleRules(REAL_SHAPE);
    expect([...map.keys()]).toEqual(['resources/styles/common.less']);
    const after = map.get('resources/styles/common.less');
    // 孤儿选择器消失
    expect(after).not.toMatch(/\.c-device-content-section4[\s-]/);
    // 🔴 嵌套块随父块一并移除（不是只删块头）
    expect(after).not.toContain('&:first-child');
    expect(after).not.toContain('background: #e2ecfe');
    // ⚠️ 已知残留（本刀不处理，仅记录）：**注释横幅不属于块**（`splitTopLevelClassBlocks`
    //   会剥离行注释、不并入块文本）⇒ 语义写错的注释会留下。它零视觉影响，只是误导人工诊断。
    expect(after).toContain('// 电量数据列');
    // 引用者仍在
    expect(after).toContain('.c-device-legend-item');
    // 复检 0 残留（块删除口径 === 块枚举口径）
    expect(stats.residual).toBe(0);
    // 原输入未被改动（纯函数）
    expect(REAL_SHAPE['resources/styles/common.less']).toContain('.c-device-content-section4 {');
  });

  it('阴性①：`-fg-` 接管命名空间不越界（职责归 stripFgTakeoverRules）', () => {
    const files = {
      'package/index.vue': `<template><div class="c-x-root"></div></template>`,
      'resources/styles/common.less': `.c-x-fg-table-434785 { display: flex; }
.c-x-root { display: block; }
`,
    };
    const { stats } = findOrphanStyleRules(files);
    expect(stats.removed.map((r) => r.selector)).not.toContain('.c-x-fg-table-434785');
    expect(stats.skipped.some((r) => r.reason === 'fg-takeover-namespace')).toBe(true);
  });

  it('阴性②：Less mixin 定义不删（`.common()` / `.theme-dark()`）', () => {
    const files = {
      'resources/styles/themes/theme-vars.less': `.common() { font-size: 14px; }
.theme-dark() { color: #fff; }
.theme-light() { color: #000; }
`,
    };
    const { stats } = findOrphanStyleRules(files);
    expect(stats.candidates).toBe(0);
    expect(stats.removed.length).toBe(0);
    expect(stats.skipped.filter((r) => r.reason === 'less-mixin').length).toBe(3);
  });

  it('阴性③：跨文件字面引用 → 保留（reason=literal-elsewhere）', () => {
    const files = {
      'package/index.vue': `<template><div class="c-x-root"></div></template>`,
      'package/utils.js': `export const CLS = 'c-x-lit-only';`,
      'resources/styles/common.less': `.c-x-lit-only { color: #123456; }
.c-x-root { color: #654321; }
`,
    };
    const { stats } = findOrphanStyleRules(files);
    const kept = stats.kept.find((r) => r.selector === '.c-x-lit-only');
    expect(kept).toBeTruthy();
    expect(kept.reason).toBe('literal-elsewhere');
    expect(stats.removed.length).toBe(0);
  });

  it('🔴 阴性④（阳性对照）：动态插值前缀变体不得误删 —— 静态 DOM 里**没有**该变体 token', () => {
    const files = {
      // 插值生成 `c-x-card--active` / `c-x-card--idle`，静态 token 白名单会整段丢弃
      'package/index.vue': `<template>
  <div class="c-x-root">
    <span :class="[\`c-x-card--\${card.key}\`]" />
  </div>
</template>`,
      'resources/styles/common.less': `.c-x-card--active { background: #e2ecfe; }
.c-x-card--idle { background: #ffffff; }
.c-x-root { display: flex; }
`,
    };
    // 前置断言：判据面对的是「DOM 事实缺失」这一真实形态
    expect(collectDynamicClassPrefixes(files)).toEqual(['c-x-card--']);
    const { stats } = findOrphanStyleRules(files);
    const keptSelectors = stats.kept.map((r) => r.selector);
    expect(keptSelectors).toContain('.c-x-card--active');
    expect(keptSelectors).toContain('.c-x-card--idle');
    expect(stats.kept.filter((r) => r.reason === 'dynamic-prefix').length).toBe(2);
    expect(stats.removed.length).toBe(0);
  });

  it('阴性⑤：选择器内含 `${`（动态选择器）一律不碰', () => {
    const files = {
      'package/index.vue': `<template><div class="c-x-root"></div></template>`,
      'resources/styles/common.less': `.c-x-\${dyn} { color: #000; }
.c-x-root { color: #fff; }
`,
    };
    const { stats } = findOrphanStyleRules(files);
    expect(stats.skipped.some((r) => r.reason === 'dynamic-selector')).toBe(true);
    expect(stats.removed.length).toBe(0);
  });

  it('🔴 阴性⑥（防假绿）：`.json` 元数据回显与 `.css` 编译产物**不算引用**', () => {
    const files = {
      'package/index.vue': `<template><div class="c-x-root"></div></template>`,
      // component-meta.json 会列出类名（实测）；index.css 是编译产物
      'component-meta.json': `{"classNames":["c-x-orphan"]}`,
      'resources/styles/index.css': `.c-x-orphan{color:#000}`,
      'resources/styles/common.less': `.c-x-orphan { color: #000; }
.c-x-root { color: #fff; }
`,
    };
    const { stats } = findOrphanStyleRules(files);
    // 若把 .json/.css 纳入引用池 ⇒ 这里会是 0（「永不判孤儿」假绿）
    expect(stats.removed.map((r) => r.selector)).toContain('.c-x-orphan');
  });

  it('护栏：无业务样式文件时留痕 scannedFiles=0（区分「无样式」与「有样式无孤儿」）', () => {
    const { stats } = findOrphanStyleRules({
      'package/index.vue': `<template><div class="c-x-root"></div></template>`,
    });
    expect(stats.scannedFiles).toBe(0);
    expect(stats.removed.length).toBe(0);
  });

  it('护栏：分组选择器 `.a, .b {}` 有一个被引用 → 整块保留', () => {
    const files = {
      'package/index.vue': `<template><div class="c-x-keep"></div></template>`,
      'resources/styles/common.less': `.c-x-keep, .c-x-gone { color: #000; }
`,
    };
    const { stats } = findOrphanStyleRules(files);
    expect(stats.removed.length).toBe(0);
    expect(stats.kept.some((r) => r.selector === '.c-x-keep')).toBe(true);
  });

  it('fail-open：非法输入不抛、返回空 map + 带 error 留痕', () => {
    expect(() => dropOrphanStyleRules(undefined as any)).not.toThrow();
    const { map } = dropOrphanStyleRules(undefined as any);
    expect(map.size).toBe(0);
    // 数组形态入参同样可用
    const asArray = Object.entries(REAL_SHAPE).map(([path, content]) => ({ path, content }));
    const r2 = dropOrphanStyleRules(asArray);
    expect(r2.stats.removed.length).toBe(2);
  });

  it('detectDynamicClassBindings：只认模板内插值 class 绑定', () => {
    expect(
      detectDynamicClassBindings({
        'package/a.vue': `<template><i :class="\`x-\${k}\`" /></template>`,
        'package/b.vue': `<template><i :class="{ 'x-a': on }" /></template>`,
        'package/c.vue': `<template><i class="x-static" /></template>`,
      }),
    ).toEqual(['package/a.vue']);
  });
});
