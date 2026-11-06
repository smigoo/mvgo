/**
 * 🛡️ 刀56 · 装配唯一性 + label/value 方向 纯判据单测（2026-11-05）
 *
 * 实锤双案：
 * - c-env-monitor-1287c878：TabsSection（叶子）把 89:42 的 tabs 内容内联渲染一份
 *   （游离 tabs div + 独立 tabList），又 import TabsInteractionArea 再渲染一份
 *   ⇒ tabs 双行、32px 容器装 ~72px ⇒ 第二行（含 icon 操作区）被裁剪、icons「消失」。
 * - c-device-c0d64b92：属性字段 label/value 按 Figma 子树文档序机械落字
 *   ⇒ 「label=8088 / value=端口号」「label=118.782781 / value=设备精度」方向反转。
 *
 * 判据为假设（方案 §2），以真机重投验签；本组为纯函数阳性/阴性对照。
 */
import { jest } from '@jest/globals';

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  dataDir: process.cwd() + '/data',
}), { virtual: true });

import {
  findLeafInlineDuplicateEvidence,
  findLabelValueSwapEvidence,
  hasSubComponentImports,
} from './code-validator.js';

describe('刀56-A · 叶子装配唯一性（findLeafInlineDuplicateEvidence）', () => {
  // 1287c878 真机形态（简化）：叶子 TabsSection import 同级 TabsInteractionArea，
  // 游离 tabs div + 独立 tabList 与子组件文案重叠。
  const leafDuplicate = `
<template>
  <div class="c-env-monitor-sub-t-tabs" style="display:flex;gap:8px;">
    <div v-for="tab in tabList" :key="tab.key" class="c-env-monitor-sub-t-tab-item">{{ tab.label }}</div>
  </div>
  <div class="c-env-monitor-sub-t" data-section-id="89:42" v-bind="$attrs">
    <TabsInteractionArea @action="handleAction" />
  </div>
</template>
<script setup>
import TabsInteractionArea from './TabsInteractionArea.vue'
const tabList = ref([
  { key: 'co2', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' },
])
</script>`;

  const child = `
<template>
  <div class="c-env-monitor-tabs-area">
    <div class="c-env-monitor-tab">
      <div v-for="tab in tabList" :key="tab.key" class="c-env-monitor-tab-item">{{ tab.label }}</div>
    </div>
    <div class="c-env-monitor-icon"><img :src="icon2" /></div>
  </div>
</template>
<script setup>
const tabList = ref([
  { key: 'co2', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' },
])
</script>`;

  it('阳性：叶子 import 子组件且 ≥2 个文案重叠 ⇒ 命中并给出重叠文案', () => {
    const allFiles = {
      'package/components/TabsSection.vue': leafDuplicate,
      'package/components/TabsInteractionArea.vue': child,
    };
    const r = findLeafInlineDuplicateEvidence(
      'package/components/TabsSection.vue',
      leafDuplicate,
      allFiles,
    );
    expect(r).not.toBeNull();
    expect(r.overlapTexts.length).toBeGreaterThanOrEqual(2);
    expect(r.overlapTexts).toContain('一氧化碳');
  });

  it('阴性：import 子组件但文案不重叠（纯布局型父文件）⇒ null', () => {
    const layoutLeaf = `
<template>
  <div class="c-x-section" data-section-id="1:2" v-bind="$attrs"><Area /></div>
</template>
<script setup>
import Area from './Area.vue'
</script>`;
    const areaChild = `
<template><div class="c-x-area"><span> totally unrelated 中文内容完全不同 </span></div></template>`;
    const r = findLeafInlineDuplicateEvidence(
      'package/components/Section.vue',
      layoutLeaf,
      {
        'package/components/Section.vue': layoutLeaf,
        'package/components/Area.vue': areaChild,
      },
    );
    expect(r).toBeNull();
  });

  it('阴性：仅 1 个公共词重叠（领域词汇）⇒ 不足阈值 null', () => {
    const leaf = `
<template><div class="c-x-s"><Area /></div></template>
<script setup>
import Area from './Area.vue'
const title = ref('设备监测')
</script>`;
    const child = `<template><div class="c-x-a"><span>设备监测</span></div></template>`;
    const r = findLeafInlineDuplicateEvidence(
      'package/components/S.vue',
      leaf,
      { 'package/components/S.vue': leaf, 'package/components/Area.vue': child },
    );
    expect(r).toBeNull();
  });

  it('阴性：无子组件 import ⇒ null（checked 口径不计）', () => {
    const solo = `<template><div class="c-x"><span>一氧化碳 能见度</span></div></template>`;
    expect(hasSubComponentImports(solo)).toBe(false);
    expect(
      findLeafInlineDuplicateEvidence('package/components/Solo.vue', solo, {
        'package/components/Solo.vue': solo,
      }),
    ).toBeNull();
  });

  it('路径兜底：allFiles 键带前缀时 endsWith 解析子组件', () => {
    const r = findLeafInlineDuplicateEvidence(
      'pkg/components/TabsSection.vue',
      leafDuplicate,
      {
        'workspace/pkg/components/TabsInteractionArea.vue': child,
      },
    );
    expect(r).not.toBeNull();
  });
});

describe('刀56-B · label/value 方向（findLabelValueSwapEvidence）', () => {
  it('阳性：c0d64b92 形态 label=纯数值 ∧ value=中文 ⇒ 命中', () => {
    const vue = `
<template>
  <div class="c-device-attr-row">
    <span class="c-device-attr-label">8088</span>
    <span class="c-device-attr-value">端口号</span>
  </div>
  <div class="c-device-attr-row">
    <span class="c-device-attr-label">118.782781</span>
    <span class="c-device-attr-value">设备精度</span>
  </div>
</template>`;
    const hits = findLabelValueSwapEvidence(vue);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({ label: '8088', value: '端口号' });
    expect(hits[1]).toEqual({ label: '118.782781', value: '设备精度' });
  });

  it('阴性：真值方向 label=端口号（非纯数值）⇒ 不命中', () => {
    const vue = `
<template>
  <div class="c-device-attr-row">
    <span class="c-device-attr-label">端口号</span>
    <span class="c-device-attr-value">8088</span>
  </div>
</template>`;
    expect(findLabelValueSwapEvidence(vue)).toHaveLength(0);
  });

  it('阴性：label/value 均为正常语义（数值 value 不触发）⇒ 不命中', () => {
    const vue = `
<template>
  <div class="c-x-row">
    <span class="c-x-label">总设备</span>
    <span class="c-x-value">8</span>
  </div>
</template>`;
    expect(findLabelValueSwapEvidence(vue)).toHaveLength(0);
  });
});
