/**
 * ensureSubComponentImport（刀 1）单测。
 * 2026-09-13 实锤：旧实现用 lazy /<template>([\s\S]*?)<\/template>/ 提取模板区，
 * 具名插槽的 </template> 提前截断，插槽后（slot-con）的子组件标签不可见 → ensure 漏补 import
 * → 三要素不齐备（0ca84358 家族缺陷）。改为 extractSfcTemplate 边界法后必须能补齐。
 */
import { ensureSubComponentImport } from '../resource-mounter.js';

describe('ensureSubComponentImport（extractSfcTemplate 边界法）', () => {
  test('具名插槽 #header-right 后的 slot-con 标签也能补 import', () => {
    const content = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="slot-con">
      <TabsSection />
      <ContentSection />
    </div>
  </base-panel>
</template>

<script setup>
import HeaderSection from './components/HeaderSection.vue'
</script>`;

    const out = ensureSubComponentImport(content);
    // slot-con 里的两个标签（旧 lazy 提取会被插槽 </template> 截断看不见）必须补上
    expect(out).toContain("import TabsSection from './components/TabsSection.vue'");
    expect(out).toContain("import ContentSection from './components/ContentSection.vue'");
    // 已声明的 HeaderSection 不得重复补
    expect(out.match(/import HeaderSection/g) || []).toHaveLength(1);
  });

  test('已完整声明（静态 import）→ 原样返回，不重复补', () => {
    const content = `<template>
  <base-panel><StatsSection /></base-panel>
</template>
<script setup>
import StatsSection from './components/StatsSection.vue'
</script>`;
    expect(ensureSubComponentImport(content)).toBe(content);
  });

  test('defineAsyncComponent 动态导入已声明 → 不再补静态 import（避免 already declared）', () => {
    const content = `<template>
  <base-panel><TotalTraffic /></base-panel>
</template>
<script setup>
import { defineAsyncComponent } from 'vue'
const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))
</script>`;
    const out = ensureSubComponentImport(content);
    // TotalTraffic 已是 const 声明，不得补静态 import
    expect(out).not.toContain("import TotalTraffic from './components/TotalTraffic.vue'");
  });

  test('无 <template> 或无子组件标签 → 原样返回', () => {
    const a = `<script setup>const x = 1</script>`;
    const b = `<template><div>x</div></template><script setup>const x = 1</script>`;
    expect(ensureSubComponentImport(a)).toBe(a);
    expect(ensureSubComponentImport(b)).toBe(b);
  });
});
