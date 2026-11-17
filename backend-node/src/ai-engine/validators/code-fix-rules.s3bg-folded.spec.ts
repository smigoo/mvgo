/**
 * 🛡️ S3-BG 折叠段归属兜底 + inline px 硬约束（2026-11-15 · 0fde9c29 实锤）
 *
 * 症状：`<div data-section-id="136:129" style="width: 140px; height: 74px;"></div>`
 *   —— 三卡折叠成 v-for 后原锚点消失，S3 归属兜底注入 3 个承载 div，M6-3a 再剥掉
 *   首子元素的 :style ⇒ 剩下无背景、无内容、带 inline px 尺寸的孤儿方块。
 *
 * 三道修复：
 *   ① 折叠段（plan 事实 / 产物 `-list` 锚点）⇒ 归属兜底整体跳过；
 *   ② v-for 数据驱动消费在别的 .vue 文件时也跳过（防双挂）；
 *   ③ 承载 div 的尺寸改 class + `<style>` less 规则（px2rem 可生效），DOM 上零 inline px。
 */
import { backstopMountBgOwnership } from './code-fix-rules.js';

const mkMapping = (ownerSectionId: string) => [
  {
    resourceFile: '../resources/images/bg-125.png',
    figmaNodeId: '136:125',
    ownerSectionId,
    targetDomSelector: `[data-section-id="${ownerSectionId}"]`,
    figmaBox: { x: 37, y: 984, width: 140, height: 74 },
    previewAnalysisRole: 'bg',
    recommendedUsage: 'backgroundBlock',
    downloadStatus: 'success',
    assignedVarName: 'bg1',
  },
];

const INDEX_WITH_IMPORT = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-x-slot-con" data-section-id="136:121">
      <div class="c-x-group" data-section-id="2:8023">
        <ListSection />
      </div>
    </div>
  </base-panel>
</template>
<script setup>
import bg1 from '../resources/images/bg-125.png'
import ListSection from './components/ListSection.vue'
</script>`;

describe('S3-BG 折叠段不再注入承载 div', () => {
  it('① plan 事实：foldedOwnerIds 命中 ⇒ 跳过，文件逐字不变', () => {
    const files = { 'package/index.vue': INDEX_WITH_IMPORT };
    const r = backstopMountBgOwnership(files, mkMapping('136:129'), {
      foldedOwnerIds: new Set(['136:129', '136:128', '136:127']),
    });
    expect(r.stats.skippedFoldedList).toBe(1);
    expect(r.stats.missingContainerInjected).toBe(0);
    expect(r.stats.importInjected).toBe(0);
    expect(r.files['package/index.vue']).toBe(INDEX_WITH_IMPORT);
  });

  it('② 产物事实：未透传 plan 时，`136:129-list` 锚点 + v-for 也能识别', () => {
    const files = {
      'package/index.vue': INDEX_WITH_IMPORT,
      'package/components/ListSection.vue': `<template>
  <div data-section-id="136:129-list" class="c-x-fg-list">
    <div v-for="(it, __i) in FG_LIST_ITEMS" :key="__i" :style="{ backgroundImage: it.bgVar ? 'url(' + it.bgVar + ')' : undefined }">{{ it.texts[0].t }}</div>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-125.png'
const FG_LIST_ITEMS = [{ texts: [{ t: '危化品车' }], bgVar: bg1 }]
</script>`,
    };
    const r = backstopMountBgOwnership(files, mkMapping('136:129'));
    expect(r.stats.skippedFoldedList).toBe(1);
    expect(r.stats.missingContainerInjected).toBe(0);
    expect(r.files['package/index.vue']).toBe(INDEX_WITH_IMPORT);
    expect(r.files['package/components/ListSection.vue']).toBe(
      files['package/components/ListSection.vue'],
    );
  });

  it('③ 跨文件数据驱动：import 在 index.vue、v-for 消费在 ListSection.vue ⇒ 跳过', () => {
    const list = `<template>
  <div class="c-x-fg-list">
    <div v-for="(it, __i) in FG_LIST_ITEMS" :key="__i" :style="{ backgroundImage: 'url(' + it.bgVar + ')' }">{{ it.t }}</div>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-125.png'
const FG_LIST_ITEMS = [{ t: '危化品车', bgVar: bg1 }]
</script>`;
    const files = { 'package/index.vue': INDEX_WITH_IMPORT, 'package/components/ListSection.vue': list };
    const r = backstopMountBgOwnership(files, mkMapping('136:199'));
    expect(r.stats.skippedDataDriven).toBe(1);
    expect(r.stats.missingContainerInjected).toBe(0);
    expect(r.files['package/components/ListSection.vue']).toBe(list);
  });

  it('④ 阴性回归：普通未折叠段仍按原逻辑注入承载 div', () => {
    const files = { 'package/index.vue': INDEX_WITH_IMPORT };
    const r = backstopMountBgOwnership(files, mkMapping('2:3660'));
    expect(r.stats.skippedFoldedList).toBe(0);
    expect(r.stats.missingContainerInjected).toBe(1);
    expect(r.files['package/index.vue']).toContain('data-section-id="2:3660"');
  });
});

describe('S3-BG 承载 div 尺寸：DOM 上零 inline px', () => {
  const files = { 'package/index.vue': INDEX_WITH_IMPORT };

  it('① 注入 div 只带 class，尺寸写进 <style> 段（px 由 px2rem 转换）', () => {
    const src = `${INDEX_WITH_IMPORT}\n<style lang="less" scoped>\n@import '../resources/styles/index.less';\n</style>`;
    const r = backstopMountBgOwnership({ 'package/index.vue': src }, mkMapping('2:3660'));
    const out = r.files['package/index.vue'];
    expect(r.stats.missingContainerInjected).toBe(1);
    expect(r.stats.carrierSizeRuleInjected).toBe(1);
    // DOM 上不得出现 inline 尺寸
    expect(out).not.toMatch(/<div[^>]*style="[^"]*(width|height)\s*:\s*\d+px/);
    expect(out).toContain('class="mc-bg-carrier-23660"');
    // 尺寸真值进 less 规则（2026-11-17 起 carrier 脱离 flex 流：absolute 三件套 + 尺寸）
    expect(out).toContain('.mc-bg-carrier-23660 { position:absolute; inset:0; pointer-events:none; width:140px; height:74px; }');
    // 背景仍是动态绑定（变量名可解析）
    expect(out).toContain("backgroundImage: 'url(' + bg1 + ')'");
  });

  it('② 文件无 <style> 段 ⇒ 自动补最小 lang="less" 块，仍无 inline px', () => {
    const r = backstopMountBgOwnership(files, mkMapping('2:3660'));
    const out = r.files['package/index.vue'];
    expect(out).toContain('<style lang="less" scoped>');
    expect(out).toContain('pointer-events:none; width:140px; height:74px; }');
    expect(out).not.toMatch(/style="width:\d+px/);
  });

  it('③ 幂等：规则已存在时不重复追加', () => {
    const once = backstopMountBgOwnership(files, mkMapping('2:3660')).files['package/index.vue'];
    const twice = backstopMountBgOwnership({ 'package/index.vue': once }, mkMapping('2:3660'));
    expect((twice.files['package/index.vue'].match(/mc-bg-carrier-23660 \{/g) || []).length).toBe(1);
    expect(twice.stats.carrierSizeRuleInjected).toBe(0);
  });
});
