/**
 * 🛡️ 文本兄弟顺序保真回归测试（TEXT-001 / N4c，2026-09-01）
 *
 * 事故实证 mc-max-1788251680480-98c9140b：
 * Figma tabs-list 视觉 x 序「一氧化碳/能见度/洞内照明/洞外光强」，
 * children 数组序与产物 v-for tabs 数组序均为「一氧化碳/洞内照明/洞外光强/能见度」
 * → 「能见度」从视觉第 2 位掉到末位；文案全对只有顺序错，全部既有门禁放行。
 *
 * 事实源铁律：视觉坐标排序（水平按 x / 垂直按 y），不用 children 数组序。
 */
import { describe, it, expect } from '@jest/globals';
import {
  collectFigmaTextSiblingGroups,
  detectTextOrderDrift,
  fixTextOrderDrift,
} from '../text-order-guard.js';
import { CodeStructureValidator } from '../../validators/code-structure-validator.js';

/** 事故样本复刻：tabs-list 的 4 个 TEXT（children 序≠视觉 x 序） */
const FIGMA_ACCIDENT = {
  document: {
    type: 'FRAME',
    name: 'cp-环境监测',
    children: [
      { type: 'RECTANGLE', name: 'bg' },
      {
        type: 'FRAME',
        name: 'tabs-list',
        children: [
          {
            type: 'TEXT',
            name: 't1',
            characters: '一氧化碳',
            absoluteBoundingBox: { x: 1509.8, y: 903, width: 60, height: 20 },
          },
          {
            type: 'TEXT',
            name: 't2',
            characters: '洞内照明',
            absoluteBoundingBox: { x: 1645, y: 903, width: 60, height: 20 },
          },
          {
            type: 'TEXT',
            name: 't3',
            characters: '洞外光强',
            absoluteBoundingBox: { x: 1717, y: 903, width: 60, height: 20 },
          },
          {
            type: 'TEXT',
            name: 't4',
            characters: '能见度',
            absoluteBoundingBox: { x: 1586.6, y: 903, width: 50, height: 20 },
          },
        ],
      },
    ],
  },
};

const EXPECTED_ORDER = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];

/** 事故样本产物形态：v-for 数组（顺序=children 序，漂移） */
const FILES_VFOR_DRIFT = {
  'package/components/MonitorTypeTabs.vue': `<template>
  <div class="tabs-wrapper">
    <div v-for="tab in tabs" :key="tab.value" :class="['tab-item', { active: activeTab === tab.value }]">
      {{ tab.label }}
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' },
  { label: '能见度', value: 'visibility' }
])
const activeTab = ref('co')
</script>`,
};

describe('collectFigmaTextSiblingGroups：事实源收集', () => {
  it('事故样本：视觉 x 序 ≠ children 数组序 → 按 x 排序（水平组）', () => {
    const groups = collectFigmaTextSiblingGroups(FIGMA_ACCIDENT);
    expect(groups).toHaveLength(1);
    expect(groups[0].parentName).toBe('tabs-list');
    expect(groups[0].direction).toBe('horizontal');
    expect(groups[0].orderedTexts).toEqual(EXPECTED_ORDER);
  });

  it('垂直组（y 跨度 > x 跨度）→ 按 y 排序', () => {
    const vertical = {
      document: {
        type: 'FRAME',
        name: 'side-menu',
        children: [
          {
            type: 'TEXT',
            characters: '设备',
            absoluteBoundingBox: { x: 10, y: 200, width: 40, height: 16 },
          },
          {
            type: 'TEXT',
            characters: '监测',
            absoluteBoundingBox: { x: 10, y: 100, width: 40, height: 16 },
          },
        ],
      },
    };
    const groups = collectFigmaTextSiblingGroups(vertical);
    expect(groups[0].direction).toBe('vertical');
    expect(groups[0].orderedTexts).toEqual(['监测', '设备']);
  });

  it('重复文本组 / 单文本组 / 无 bbox 组 → 跳过（防误伤）', () => {
    const dup = {
      document: {
        type: 'FRAME',
        name: 'dup-group',
        children: [
          {
            type: 'TEXT',
            characters: '--',
            absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
          },
          {
            type: 'TEXT',
            characters: '--',
            absoluteBoundingBox: { x: 50, y: 0, width: 10, height: 10 },
          },
        ],
      },
    };
    expect(collectFigmaTextSiblingGroups(dup)).toHaveLength(0);

    const single = {
      document: {
        type: 'FRAME',
        name: 'single',
        children: [
          {
            type: 'TEXT',
            characters: '唯一',
            absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
          },
        ],
      },
    };
    expect(collectFigmaTextSiblingGroups(single)).toHaveLength(0);
  });
});

describe('detectTextOrderDrift：漂移检测（两种形态）', () => {
  it('事故复现：v-for 数组顺序=children 序 → kind=array drift（能见度掉末位）', () => {
    const drifts = detectTextOrderDrift(FILES_VFOR_DRIFT, FIGMA_ACCIDENT);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].kind).toBe('array');
    expect(drifts[0].file).toBe('package/components/MonitorTypeTabs.vue');
    expect(drifts[0].expected).toEqual(EXPECTED_ORDER);
    expect(drifts[0].actual).toEqual([
      '一氧化碳',
      '洞内照明',
      '洞外光强',
      '能见度',
    ]);
  });

  it('template 静态兄弟顺序漂移 → kind=template drift', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="tabs">
    <div class="tab">一氧化碳</div>
    <div class="tab">洞内照明</div>
    <div class="tab">洞外光强</div>
    <div class="tab">能见度</div>
  </div>
</template>`,
    };
    const drifts = detectTextOrderDrift(files, FIGMA_ACCIDENT);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].kind).toBe('template');
    expect(drifts[0].expected).toEqual(EXPECTED_ORDER);
  });

  it('正面对照：顺序与视觉序一致 → 无 drift', () => {
    const ok = {
      'package/components/MonitorTypeTabs.vue': `<template>
  <div class="tabs-wrapper"><div v-for="tab in tabs">{{ tab.label }}</div></div>
</template>
<script setup>
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])
</script>`,
    };
    expect(detectTextOrderDrift(ok, FIGMA_ACCIDENT)).toHaveLength(0);
  });

  it('文本集合不全（产物缺组文本）→ 忽略（别的区块）', () => {
    const partial = {
      'package/index.vue': `<template>
  <div>一氧化碳</div><div>洞内照明</div>
</template>`,
    };
    expect(detectTextOrderDrift(partial, FIGMA_ACCIDENT)).toHaveLength(0);
  });
});

describe('fixTextOrderDrift：N4c 自愈重排', () => {
  it('事故修复：v-for 数组按视觉序重排（对象元素整体交换，属性保留）', () => {
    const res = fixTextOrderDrift(FILES_VFOR_DRIFT, FIGMA_ACCIDENT);
    expect(res.fixed).toHaveLength(1);
    expect(res.remaining).toHaveLength(0);
    const out = res.files['package/components/MonitorTypeTabs.vue'];
    // 数组元素顺序 = 视觉序
    const labels = EXPECTED_ORDER.map((t) =>
      out.indexOf(t),
    );
    // expected 顺序的索引递增
    expect(labels).toEqual([...labels].sort((a, b) => a - b));
    // 每个对象的 value 属性仍绑定原 label（整体交换，非文本替换）
    expect(out).toContain("{ label: '能见度', value: 'visibility' }");
    expect(out).toContain("{ label: '一氧化碳', value: 'co' }");
    // 修复后无残留 drift
    expect(
      detectTextOrderDrift(
        [{ path: 'package/components/MonitorTypeTabs.vue', content: out }],
        FIGMA_ACCIDENT,
      ),
    ).toHaveLength(0);
  });

  it('template 静态兄弟：文本内容交换（元素结构/class 不动）', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="tabs">
    <div class="tab active">一氧化碳</div>
    <div class="tab">洞内照明</div>
    <div class="tab">洞外光强</div>
    <div class="tab">能见度</div>
  </div>
</template>`,
    };
    const res = fixTextOrderDrift(files, FIGMA_ACCIDENT);
    expect(res.fixed).toHaveLength(1);
    const out = res.files['package/index.vue'];
    // 位置 2（原洞内照明位置）应为「能见度」
    expect(out).toMatch(/<div class="tab">能见度<\/div>\s*<div class="tab">洞内照明<\/div>/);
    // active 仍在第一个位置
    expect(out).toMatch(/<div class="tab active">一氧化碳<\/div>/);
  });

  it('保守回退：数组含额外元素（组外项混入）→ 不修，remaining 交给门禁', () => {
    const files = {
      'package/components/Tabs.vue': `<template><div v-for="t in tabs">{{ t.label }}</div></template>
<script setup>
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' },
  { label: '能见度', value: 'visibility' },
  { label: '自定义', value: 'custom' }
]
</script>`,
    };
    const res = fixTextOrderDrift(files, FIGMA_ACCIDENT);
    expect(res.fixed).toHaveLength(0);
    expect(res.remaining).toHaveLength(1);
    expect(res.files['package/components/Tabs.vue']).toBe(
      files['package/components/Tabs.vue'],
    );
  });
});

describe('TEXT-001 L0-B 门禁集成（code-structure-validator）', () => {
  const toFileArray = (files: Record<string, string>) =>
    Object.entries(files).map(([path, content]) => ({ path, content }));

  it('残留漂移（自愈不可判定/未跑自愈）→ TEXT-001 BLOCK，fail-closed', () => {
    const result = CodeStructureValidator.validate(
      toFileArray(FILES_VFOR_DRIFT),
      'mc-max-test',
      { target: 'microcode', figmaNodeData: FIGMA_ACCIDENT },
    );
    expect(result.pass).toBe(false);
    const textIssues = result.issues.filter((i) => i.id === 'TEXT-001');
    expect(textIssues).toHaveLength(1);
    expect(textIssues[0].severity).toBe('BLOCK');
    expect(textIssues[0].file).toBe('package/components/MonitorTypeTabs.vue');
    expect(textIssues[0].message).toContain('一氧化碳 → 能见度 → 洞内照明 → 洞外光强');
    expect(textIssues[0].message).toContain('一氧化碳 → 洞内照明 → 洞外光强 → 能见度');
  });

  it('自愈后产物 → 无 TEXT-001 issue（门禁与自愈同源，不重复阻断）', () => {
    const healed = fixTextOrderDrift(FILES_VFOR_DRIFT, FIGMA_ACCIDENT);
    const result = CodeStructureValidator.validate(
      toFileArray(healed.files),
      'mc-max-test',
      { target: 'microcode', figmaNodeData: FIGMA_ACCIDENT },
    );
    expect(result.issues.filter((i) => i.id === 'TEXT-001')).toHaveLength(0);
  });

  it('未传 figmaNodeData → TEXT-001 不参与判定（快照/纯文本链路零影响）', () => {
    const result = CodeStructureValidator.validate(
      toFileArray(FILES_VFOR_DRIFT),
      'mc-max-test',
      { target: 'microcode' },
    );
    expect(result.issues.filter((i) => i.id === 'TEXT-001')).toHaveLength(0);
  });
});

describe('TEXT-001 误报治理：同一数组元素内的字段顺序 ≠ 兄弟顺序（2026-09-02 实锤）', () => {
  /**
   * 事故实证 mc-max-1788280167414-49dfbe7d：
   * Figma 每个 Group 含「设备名(上) + (0/484)(下)」两个 TEXT；产物把 N 张卡片展平进
   * **一个数组**，每个元素是对象字面量 `{ count: '(0/484)', name: 'CO/VI检测器' }`
   * —— 组内两个文本落在**同一个数组元素内部**。
   *
   * 这是「对象字段顺序」，不是「兄弟元素渲染顺序」：DOM 顺序由 <template> 决定，
   * 不由 script 对象字面量的字段先后决定。原实现按文本首次出现位置排序 → 误判漂移；
   * 自愈因「元素数(7) ≠ 组文本数(2)」被保守检查拒绝 → 7 条全丢给门禁 →
   * BLOCK=9 → 重试耗尽 → 整个组件无法发布。
   */
  const mkGroup = (name: string, y: number, label: string) => ({
    type: 'GROUP',
    name,
    children: [
      {
        type: 'TEXT',
        characters: label,
        absoluteBoundingBox: { x: 0, y, width: 90, height: 20 },
      },
      {
        type: 'TEXT',
        characters: '(0/484)',
        absoluteBoundingBox: { x: 0, y: y + 20, width: 90, height: 20 },
      },
    ],
  });

  const FIGMA_DEVICE_GRID = {
    document: {
      type: 'FRAME',
      name: 'cp-设备监测',
      children: [
        {
          type: 'FRAME',
          name: 'DeviceGrid',
          children: [
            mkGroup('g1', 100, 'CO/VI检测器'),
            mkGroup('g2', 200, '激光雷达'),
          ],
        },
      ],
    },
  };

  const FILES_DEVICE_GRID = {
    'package/components/DeviceGrid.vue': `<template>
  <div class="device-grid">
    <div v-for="d in devices" :key="d.name" class="device-card">
      <span class="d-name">{{ d.name }}</span>
      <span class="d-count">{{ d.count }}</span>
    </div>
  </div>
</template>
<script setup>
const devices = [
  { count: '(0/484)', name: 'CO/VI检测器' },
  { count: '(0/484)', name: '激光雷达' }
]
</script>`,
  };

  it('⭐ 组内文本同属一个数组元素 → 不产生 drift（消除误报）', () => {
    const drifts = detectTextOrderDrift(FILES_DEVICE_GRID, FIGMA_DEVICE_GRID);
    expect(drifts).toHaveLength(0);
  });

  it('⭐ 门禁同源：不报 TEXT-001 BLOCK', () => {
    const result = CodeStructureValidator.validate(
      Object.entries(FILES_DEVICE_GRID).map(([path, content]) => ({ path, content })),
      'mc-max-test',
      { target: 'microcode', figmaNodeData: FIGMA_DEVICE_GRID },
    );
    expect(result.issues.filter((i) => i.id === 'TEXT-001')).toHaveLength(0);
  });

  it('⭐ 防误伤：跨元素的真漂移仍要检出并可自愈', () => {
    // 每张卡片只有 1 个独有文本（无重复文本），卡片顺序反了 → 真正的兄弟顺序漂移
    const figma = {
      document: {
        type: 'FRAME',
        name: 'root',
        children: [
          {
            type: 'FRAME',
            name: 'cards',
            children: [
              {
                type: 'TEXT',
                characters: 'CO/VI检测器',
                absoluteBoundingBox: { x: 0, y: 100, width: 90, height: 20 },
              },
              {
                type: 'TEXT',
                characters: '激光雷达',
                absoluteBoundingBox: { x: 0, y: 200, width: 90, height: 20 },
              },
            ],
          },
        ],
      },
    };
    const files = {
      'package/components/Cards.vue': `<template>
  <div><span v-for="c in cards" :key="c">{{ c }}</span></div>
</template>
<script setup>
const cards = ['激光雷达', 'CO/VI检测器']
</script>`,
    };

    const drifts = detectTextOrderDrift(files, figma);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].expected).toEqual(['CO/VI检测器', '激光雷达']);
    expect(drifts[0].actual).toEqual(['激光雷达', 'CO/VI检测器']);

    const healed = fixTextOrderDrift(files, figma);
    expect(healed.fixed).toHaveLength(1);
    expect(healed.remaining).toHaveLength(0);
    expect(healed.files['package/components/Cards.vue']).toContain(
      "['CO/VI检测器', '激光雷达']",
    );
  });
});
