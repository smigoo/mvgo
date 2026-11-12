/**
 * 静态重复卡（无 v-for）列数真值落地回归。
 *
 * 真机实锤 mc-max-1794461835645-82b6cfaa（节点 38:3134 合作厂商弹窗 · 第一 section 统计区）：
 *   真值 2 列横向并排；产物把两张卡硬编码成两个同构 div（**无 v-for**），容器
 *   `.c-component-stats-cards` 的 `flex-direction:column` 写在 common.less 里
 *   ⇒ 两张卡上下堆叠（用户截图「第一 section 布局错误」）。
 *   旧 `enforceGridColumnTruth` 与 D-GRID 都以「有 v-for」为前提 ⇒ 静态 K 卡整条链路 fail-open。
 *
 * 本 spec 锁四件事：
 *   ① 阳性：vision 只给 `horizontal-2-columns`（无 gridColumns）+ 2 个同构兄弟 ⇒ 注入 2 列 grid；
 *   ② 阴性：兄弟数 ≠ K ⇒ 不动（防把正常纵向列表改成网格）；
 *   ③ 阴性：兄弟异构（class 不同）⇒ 不动；
 *   ④ 幂等：已声明 repeat(2) ⇒ 不改写。
 */
import { enforceGridColumnTruth } from './layout-truth-healer';

const SID = '38:3260';

function vueWith(inner: string, containerClass = 'c-component-stats-cards') {
  return `<template>
  <div class="c-component-stats-section" data-section-id="${SID}">
    <div class="${containerClass}">
${inner}
    </div>
  </div>
</template>

<script setup>
const x = 1
</script>
`;
}

const CARD = (i: number) =>
  `      <div class="c-component-stat-card"><span>卡${i}</span></div>`;

const sections = (layout: string) => [
  { id: SID, name: '合作厂商统计卡片', role: 'stat-card', layout },
];

describe('enforceGridColumnTruth · 静态重复卡（无 v-for）', () => {
  it('阳性：vision horizontal-2-columns + 2 个同构兄弟 ⇒ 容器注入 2 列 grid', () => {
    const files = { 'package/components/StatsSection.vue': vueWith(`${CARD(1)}\n${CARD(2)}`) };
    const r = enforceGridColumnTruth(files, { fullSections: sections('horizontal-2-columns') });
    const out = r.files['package/components/StatsSection.vue'] as string;
    expect(r.stats.scanned).toBe(1);
    expect(r.stats.fixed).toBe(1);
    expect(out).toContain(
      'display:grid;grid-template-columns:repeat(2, minmax(0, 1fr))',
    );
    // 段锚与卡内容逐字保留
    expect(out).toContain(`data-section-id="${SID}"`);
    expect(out).toContain('卡1');
    expect(out).toContain('卡2');
  });

  it('阴性：兄弟数 3 ≠ 真值 2 列 ⇒ 不动（防误改纵向列表）', () => {
    const files = {
      'package/components/StatsSection.vue': vueWith(`${CARD(1)}\n${CARD(2)}\n${CARD(3)}`),
    };
    const r = enforceGridColumnTruth(files, { fullSections: sections('horizontal-2-columns') });
    expect(r.stats.fixed).toBe(0);
    expect(r.stats.noVfor).toBe(1);
    expect(r.files['package/components/StatsSection.vue']).toBe(
      files['package/components/StatsSection.vue'],
    );
  });

  it('阴性：兄弟异构（class 不同）⇒ 不动', () => {
    const files = {
      'package/components/StatsSection.vue': vueWith(
        `      <div class="a"><span>1</span></div>\n      <div class="b"><span>2</span></div>`,
      ),
    };
    const r = enforceGridColumnTruth(files, { fullSections: sections('horizontal-2-columns') });
    expect(r.stats.fixed).toBe(0);
  });

  it('幂等：容器已声明 repeat(2) ⇒ 不改写', () => {
    const files = {
      'package/components/StatsSection.vue': vueWith(
        `${CARD(1)}\n${CARD(2)}`,
        'c-component-stats-cards',
      ).replace(
        '<div class="c-component-stats-cards">',
        '<div class="c-component-stats-cards" style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr))">',
      ),
    };
    const r = enforceGridColumnTruth(files, { fullSections: sections('horizontal-2-columns') });
    expect(r.stats.fixed).toBe(0);
    expect(r.stats.resolved).toBe(1);
  });

  it('阴性：段无 layout 声明也无 gridColumns ⇒ 整段 fail-open（不猜列数）', () => {
    const files = { 'package/components/StatsSection.vue': vueWith(`${CARD(1)}\n${CARD(2)}`) };
    const r = enforceGridColumnTruth(files, {
      fullSections: [{ id: SID, name: 'x', role: 'stat-card' }],
    });
    expect(r.stats.fixed).toBe(0);
    expect(r.changes.length).toBe(0);
  });
});
