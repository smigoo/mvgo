/**
 * 🛡️ Tab UI 骨架注入游离根治本（2026-11-10 · 7cac7ab3 实锤）
 *
 * 病灶：injectMissingTabUi 旧实现 lazy 正则提取模板体被命名插槽 </template> 截断，
 * injectTabBarIntoTemplate 回退分支把 tab 栏插到 base-panel 之外 ⇒ 游离根落盘
 * （R11-A/B 均在写盘前，写盘出口注入后无人归位 ⇒ 预览左侧文字竖排）。
 * docs/2026-11-10-TabUI骨架注入制造游离根修复.md
 */
import { injectMissingTabUi } from './code-healer.js';
import { relocateStrayTemplateRoots } from '../../utils/stray-template-root-relocator.js';

const SCRIPT = `<script setup>
import { ref } from 'vue'
const tabs = ref([
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
])
const activeTab = ref('tunnel')
function handleTabChange(k) { activeTab.value = k }
</script>`;

/** 病灶同构 fixture：base-panel + 命名插槽（lazy 正则会被它的 </template> 截断）+ 无 tab 渲染 */
function fixture() {
  return `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <span class="c-x-capsule">86</span>
    </template>
    <div class="c-x-slot-con" style="display:flex;flex-direction:column;">
      <StatsSection />
    </div>
  </base-panel>
</template>
${SCRIPT}
`;
}

describe('Tab UI 骨架注入 · 游离根治本', () => {
  it('① 阳性：header-right 空插槽形态注入后 tab 栏必须在 base-panel 内（治本 A+B）', () => {
    // 2026-11-10 修订：header-right 非空时跳过（用例⑥）——本用例改为空插槽形态，
    // 保持原验证点「注入落 base-panel 内、归位器零改动」。
    const src = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <!-- 空 -->
    </template>
    <div class="c-x-slot-con" style="display:flex;flex-direction:column;">
      <StatsSection />
    </div>
  </base-panel>
</template>
${SCRIPT}
`;
    const out = injectMissingTabUi(src);
    expect(out).not.toBe(src); // 发生注入
    // 归位器复检：注入后不得再有 base-panel 外游离根（旧实现正是死在这里）
    const r = relocateStrayTemplateRoots(out);
    expect(r.changed).toBe(false);
    // tab 栏落点：base-panel 开标签之后（class 前缀由派生逻辑定，泛匹配 -tabs）
    const barM = out.match(/\bc-[\w-]*-tabs\b/);
    expect(barM).not.toBeNull();
    const panelIdx = out.indexOf('<base-panel');
    expect(out.indexOf(barM[0])).toBeGreaterThan(panelIdx);
  });

  it('② 注入位置优先 -root 容器（既有行为回归）', () => {
    const src = `<template>
  <div class="c-y-root" style="display:flex;">
    <StatsSection />
  </div>
</template>
${SCRIPT}
`;
    const out = injectMissingTabUi(src);
    expect(out).toContain('c-y-tabs');
    const barIdx = out.indexOf('c-y-tabs');
    const rootIdx = out.indexOf('c-y-root');
    expect(barIdx).toBeGreaterThan(rootIdx);
  });

  it('③ 已渲染 tabs（含 -tabs 类）幂等跳过', () => {
    const src = `<template>
  <base-panel panelKey="p">
    <div class="c-z-tabs" v-for="t in tabs">{{ t.label }}</div>
  </base-panel>
</template>
${SCRIPT}
`;
    expect(injectMissingTabUi(src)).toBe(src);
  });

  it('④ 全程离线重放 7cac7ab3 病灶形态：注入后归位器零改动（回归门）', () => {
    // 旧实现产物（磁盘实况）包含游离 tabs 块 —— 新实现产出的结果必须被归位器判干净
    const out = injectMissingTabUi(fixture());
    const r = relocateStrayTemplateRoots(out);
    expect(r.changed).toBe(false);
    expect(r.moved).toHaveLength(0);
  });

  it('⑤ 无 tabs 数组 / 无激活态：不注入（防误注入未声明绑定）', () => {
    const noTabs = `<template><base-panel><div class="c-w-root">x</div></base-panel></template>
<script setup>const a = 1</script>`;
    expect(injectMissingTabUi(noTabs)).toBe(noTabs);
  });

  it('⑥ 双份 tabs 阳性：header-right 已承载（HeaderSection 子组件形态）+ 无 v-for ⇒ 跳过注入', () => {
    // 7b4ae1d8 实锤形态：header-right 里 HeaderSection 承载 label 契约，模板无 v-for tabs
    const src = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-x-slot-con">
      <ContentSection />
    </div>
  </base-panel>
</template>
${SCRIPT}
`;
    expect(injectMissingTabUi(src)).toBe(src); // header 通道已占用 ⇒ 不注入（防双份）
  });

  it('⑦ 双份 tabs 阴性：header-right 为空（纯注释）时仍正常注入', () => {
    const src = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <!-- 空插槽 -->
    </template>
    <div class="c-x-slot-con">
      <ContentSection />
    </div>
  </base-panel>
</template>
${SCRIPT}
`;
    const out = injectMissingTabUi(src);
    expect(out).not.toBe(src); // 空插槽 ⇒ header 通道未占用 ⇒ 照常注入
  });
});
