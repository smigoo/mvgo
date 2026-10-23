/**
 * plan-orphan-guard · 刀 55 单测（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）
 *
 * 病灶：统计行真值 3 卡，产物出现两张「运行中/2」—— `ContentSection3.vue` **没有**
 * data-section-id，是 LLM 凭空复制 `43:4898` 的第 2 份。刀 53（按 plan section 接管）、
 * 刀 54（文本是真值，合法放行）、section-content-guard（`{{ statLabel }}` 删不掉）
 * 三道防线全不覆盖 ⇒ 需要「plan 外组件」这条新判据。
 *
 * 对照纪律：阳性必须配阴性，证明判据没有「见谁删谁」。
 */
import { assignSectionComponentNames } from '../section-tree.js';
import {
  detectOrphanDuplicateComponents,
  healOrphanDuplicateComponents,
  stripComponentFromIndex,
} from '../plan-orphan-guard.js';

/**
 * plan：两个 section。**组件名由 `assignSectionComponentNames` 推导**（命名不可假设，
 * 硬编码 fixture 会因 `decideBaseName` 的形态依赖而失配）。
 */
const PLAN = {
  effectiveSections: [
    { id: 's1', title: '甲', body: {}, sourceNodeIds: ['s1'] },
    { id: 's2', title: '乙', body: {}, sourceNodeIds: ['s2'] },
  ],
};
/** plan 认可的组件名（动态取，避免 fixture 与真实命名漂移） */
const PLAN_NAMES = [...assignSectionComponentNames(PLAN.effectiveSections).values()];
const IN_PLAN = PLAN_NAMES[0];
const IN_PLAN2 = PLAN_NAMES[1] || `${PLAN_NAMES[0]}2`;

const comp = (name, texts) => ({
  path: `package/components/${name}.vue`,
  content: `<template>\n${texts.map((t) => `  <span>${t}</span>`).join('\n')}\n</template>\n<script setup>\n</script>\n`,
});

const indexWith = (names) => `<template>
  <div>
${names.map((n) => `    <${n} style="flex:1;min-width:0;" />`).join('\n')}
  </div>
</template>

<script setup>
${names.map((n) => `import ${n} from './components/${n}.vue'`).join('\n')}
</script>
`;

describe('detectOrphanDuplicateComponents', () => {
  it('阳性：plan 外组件且文本是 plan 内组件的子集 ⇒ 判为编造副本', () => {
    const files = [
      { path: 'package/index.vue', content: indexWith([IN_PLAN, 'Ghost']) },
      comp(IN_PLAN, ['运行中', '2']),
      comp('Ghost', ['运行中', '2']),
    ];
    const r = detectOrphanDuplicateComponents({ files, plan: PLAN });
    expect(r.hits).toBe(1);
    expect(r.issues[0].orphanName).toBe('Ghost');
    expect(r.issues[0].duplicateOfName).toBe(IN_PLAN);
    expect(r.issues[0].texts.sort()).toEqual(['2', '运行中'].sort());
  });

  it('阴性：plan 外但**带来新内容**（文本不是任何 plan 内组件的子集）⇒ 不判', () => {
    const files = [
      comp(IN_PLAN, ['甲', '乙']),
      comp('Extra', ['全新文案', '另一句']),
    ];
    const r = detectOrphanDuplicateComponents({ files, plan: PLAN });
    expect(r.hits).toBe(0);
    expect(r.evaluated).toBeGreaterThan(0); // 证明确实扫到了，只是放行
  });

  it('阴性：无内容（空文本集合）的 plan 外组件 ⇒ 不判（无副本证据）', () => {
    const files = [comp(IN_PLAN, ['甲']), comp('Empty', [])];
    const r = detectOrphanDuplicateComponents({ files, plan: PLAN });
    expect(r.hits).toBe(0);
  });

  it('阴性：候选宿主不唯一（两个 plan 内组件都包含它）⇒ fail-open 不判', () => {
    const files = [
      comp(IN_PLAN, ['共用词']),
      comp(IN_PLAN2, ['共用词']),
      comp('Ghost', ['共用词']),
    ];
    const r = detectOrphanDuplicateComponents({ files, plan: PLAN });
    expect(r.hits).toBe(0);
  });

  it('fail-open：无 plan / 空 sections ⇒ 不判（无 plan 不能定义「编造」）', () => {
    const files = [comp(IN_PLAN, ['甲']), comp('Ghost', ['甲'])];
    const r = detectOrphanDuplicateComponents({ files, plan: null });
    expect(r.hits).toBe(0);
    expect(r.skippedReason).toBe('no-plan-sections');
  });
});

describe('healOrphanDuplicateComponents 处置', () => {
  it('删除副本文件 + 从 index.vue 摘掉标签与 import', () => {
    const files = [
      { path: 'package/index.vue', content: indexWith([IN_PLAN, 'Ghost']) },
      comp(IN_PLAN, ['运行中', '2']),
      comp('Ghost', ['运行中', '2']),
    ];
    const r = healOrphanDuplicateComponents({ files, plan: PLAN });
    expect(r.removed.length).toBe(1);
    expect(r.removed[0].path).toBe('package/components/Ghost.vue');
    const paths = r.files.map((f) => f.path);
    expect(paths).not.toContain('package/components/Ghost.vue');
    const idx = r.files.find((f) => f.path === 'package/index.vue').content;
    expect(idx).not.toContain('<Ghost');
    expect(idx).not.toContain("import Ghost");
    expect(idx).toContain(`<${IN_PLAN}`);
  });

  it('幂等：复跑零命中', () => {
    const files = [
      { path: 'package/index.vue', content: indexWith([IN_PLAN, 'Ghost']) },
      comp(IN_PLAN, ['运行中', '2']),
      comp('Ghost', ['运行中', '2']),
    ];
    const first = healOrphanDuplicateComponents({ files, plan: PLAN });
    const second = detectOrphanDuplicateComponents({ files: first.files, plan: PLAN });
    expect(second.hits).toBe(0);
  });

  it('validateSfc 拒绝 ⇒ 回退（沿用「引入新错误即回退」铁律）', () => {
    const files = [
      { path: 'package/index.vue', content: indexWith([IN_PLAN, 'Ghost']) },
      comp(IN_PLAN, ['运行中', '2']),
      comp('Ghost', ['运行中', '2']),
    ];
    const r = healOrphanDuplicateComponents({
      files,
      plan: PLAN,
      validateSfc: () => ({ valid: false, errors: ['模拟拒绝'] }),
    });
    expect(r.removed.length).toBe(0);
    expect(r.residual.length).toBe(1);
    expect(r.residual[0].reason).toBe('validateSfc-rejected');
    expect(r.files.map((f) => f.path)).toContain('package/components/Ghost.vue');
  });
});

describe('stripComponentFromIndex', () => {
  it('自闭合标签 + import 行都摘除，兄弟节点不受影响', () => {
    const src = indexWith(['A', 'B']);
    const out = stripComponentFromIndex(src, 'A');
    expect(out).not.toContain('<A');
    expect(out).not.toContain("import A from");
    expect(out).toContain('<B');
    expect(out).toContain("import B from");
  });

  it('成对标签也能摘除', () => {
    const src = '<template>\n  <A><span>x</span></A>\n  <B />\n</template>';
    const out = stripComponentFromIndex(src, 'A');
    expect(out).not.toContain('<A');
    expect(out).toContain('<B');
  });
});
