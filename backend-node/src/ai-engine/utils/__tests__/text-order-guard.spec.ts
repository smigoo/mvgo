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
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../../../config/backend-root.js', () => {
  const cwd = process.cwd()
  return {
    backendRoot: cwd,
    projectRoot: cwd,
    workspaceRoot: cwd,
    customComponentsDir: cwd,
    vue3ComponentsDir: cwd,
    resolveFrontendWorkspacePath: () => cwd,
    frontendCustomComponentsDir: () => cwd,
    frontendVue3ComponentsDir: () => cwd,
    tempComponentsDir: cwd,
    dataDir: cwd,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: cwd,
    chatAttachmentsDir: cwd,
    apifoxZipsDir: cwd,
    apiCatalogsDir: cwd,
  }
}, { virtual: true })
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

describe('二维网格行主序（2026-10-20 · 84af4f8f 实锤：xRange>yRange 误判 horizontal ⇒ 列主序错错得正漏检）', () => {
  // 84af4f8f 真实形态缩减复刻：6 行 × 4 列 label/value 字段网格
  const T = (id: string, text: string, x: number, y: number) => ({
    type: 'TEXT',
    name: id,
    characters: text,
    absoluteBoundingBox: { x, y, width: 60, height: 14 },
  });
  const FIGMA_FIELD_GRID = {
    document: {
      type: 'FRAME',
      name: 'cp-device',
      children: [
        {
          type: 'GROUP',
          name: 'Group 2136638454',
          children: [
            // 第 1 行（y=100）
            T('36:1699', '所属产品', 0, 100),
            T('36:1710', '爆闪灯', 71, 100),
            T('36:1702', '产品厂家', 273, 100),
            T('36:1713', '感动科技', 344, 100),
            // 第 2 行（y=124）
            T('36:1701', '设备类型', 0, 124),
            T('36:1712', '具身机器人', 71, 124),
            T('36:1700', '所属路公司', 273, 124),
            T('36:1711', '江苏通行宝', 344, 124),
            // 第 3 行（y=148，行内 y 抖动 1px）
            T('36:1703', '链接分类', 0, 148),
            T('36:1714', '直连设备', 71, 147),
            T('36:1704', '父级设备', 273, 147),
            T('36:1715', 'AP12343', 344, 147),
          ],
        },
      ],
    },
  };
  const ROW_MAJOR = [
    '所属产品', '爆闪灯', '产品厂家', '感动科技',
    '设备类型', '具身机器人', '所属路公司', '江苏通行宝',
    '链接分类', '直连设备', '父级设备', 'AP12343',
  ];

  it('收集：2D 网格 ⇒ direction=grid，orderedTexts=行主序（y 分行容差 → 行内 x 升序）', () => {
    const groups = collectFigmaTextSiblingGroups(FIGMA_FIELD_GRID);
    expect(groups).toHaveLength(1);
    expect(groups[0].direction).toBe('grid');
    expect(groups[0].orderedTexts).toEqual(ROW_MAJOR);
  });

  it('🩺 阳性对照：旧二分法在该 fixture 产出列主序（证明修复确实改变判定）', () => {
    // 手工复刻旧算法：xRange>yRange ⇒ horizontal ⇒ 纯 x 升序
    const boxes = FIGMA_FIELD_GRID.document.children[0].children.map((c: any) => ({
      text: c.characters,
      ...c.absoluteBoundingBox,
    }));
    const xs = boxes.map((b: any) => b.x);
    const ys = boxes.map((b: any) => b.y);
    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    expect(xRange > yRange).toBe(true); // 旧逻辑会判 horizontal
    const legacy = [...boxes].sort((a: any, b: any) => a.x - b.x).map((b: any) => b.text);
    // 列主序：全部 x=0 的 label 在前 ⇒ 与行主序不同
    expect(legacy).not.toEqual(ROW_MAJOR);
    expect(legacy.slice(0, 3)).toEqual(['所属产品', '设备类型', '链接分类']);
  });

  it('检出+自愈：产物数组列主序残留（84af4f8f 形态）⇒ drift 检出 ⇒ fix 重排为行主序 ⇒ 复检零 drift', () => {
    const files = {
      'package/components/ContentSection3.vue': `<template>
  <div class="c-device-group-2136638454" data-section-id="81:7">
    <span v-for="item in gridItems" :key="item.id" :class="item.cls">{{ item.text }}</span>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const gridItems = ref([
  { id: 'l1', text: '所属产品', cls: 'lbl' }, { id: 'l2', text: '设备类型', cls: 'lbl' }, { id: 'l3', text: '链接分类', cls: 'lbl' },
  { id: 'v1', text: '爆闪灯', cls: 'val' }, { id: 'v2', text: '具身机器人', cls: 'val' }, { id: 'v3', text: '直连设备', cls: 'val' },
  { id: 'l4', text: '产品厂家', cls: 'lbl' }, { id: 'l5', text: '所属路公司', cls: 'lbl' }, { id: 'l6', text: '父级设备', cls: 'lbl' },
  { id: 'v4', text: '感动科技', cls: 'val' }, { id: 'v5', text: '江苏通行宝', cls: 'val' }, { id: 'v6', text: 'AP12343', cls: 'val' }
])
</script>`,
    };
    const drifts = detectTextOrderDrift(files, FIGMA_FIELD_GRID);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].expected).toEqual(ROW_MAJOR);
    expect(drifts[0].actual).not.toEqual(ROW_MAJOR);

    const healed = fixTextOrderDrift(files, FIGMA_FIELD_GRID);
    expect(healed.fixed).toHaveLength(1);
    expect(healed.remaining).toHaveLength(0);
    // 重排后数组首 4 项 = 第 1 行行主序
    const m = healed.files['package/components/ContentSection3.vue'].match(/gridItems = ref\(\[([\s\S]*?)\]\)/);
    expect(m).toBeTruthy();
    expect(m![1].indexOf('所属产品')).toBeLessThan(m![1].indexOf('爆闪灯'));
    expect(m![1].indexOf('爆闪灯')).toBeLessThan(m![1].indexOf('产品厂家'));
    expect(m![1].indexOf('产品厂家')).toBeLessThan(m![1].indexOf('感动科技'));
    // 复检零 drift（幂等）
    expect(detectTextOrderDrift(healed.files, FIGMA_FIELD_GRID)).toHaveLength(0);
  });

  it('不误报：产物已是行主序 ⇒ 零 drift', () => {
    const files = {
      'package/components/G.vue': `<template>
  <div><span v-for="i in items" :key="i.id">{{ i.text }}</span></div>
</template>
<script setup>
const items = [
  { id: '1', text: '所属产品' }, { id: '2', text: '爆闪灯' }, { id: '3', text: '产品厂家' }, { id: '4', text: '感动科技' },
  { id: '5', text: '设备类型' }, { id: '6', text: '具身机器人' }, { id: '7', text: '所属路公司' }, { id: '8', text: '江苏通行宝' },
  { id: '9', text: '链接分类' }, { id: '10', text: '直连设备' }, { id: '11', text: '父级设备' }, { id: '12', text: 'AP12343' }
]
</script>`,
    };
    expect(detectTextOrderDrift(files, FIGMA_FIELD_GRID)).toHaveLength(0);
  });

  it('🩺 阳性对照：单行 4 文本（tabs）仍走 horizontal、纵向单列表仍走 vertical（不误入 grid）', () => {
    const singleRow = {
      document: {
        type: 'FRAME',
        name: 'r',
        children: [
          {
            type: 'FRAME',
            name: 'tabs',
            children: [
              T('1', '甲一', 0, 100),
              T('2', '乙二', 80, 100),
              T('3', '丙三', 160, 100),
              T('4', '丁四', 240, 100),
            ],
          },
        ],
      },
    };
    expect(collectFigmaTextSiblingGroups(singleRow)[0].direction).toBe('horizontal');
    const singleCol = {
      document: {
        type: 'FRAME',
        name: 'r',
        children: [
          {
            type: 'FRAME',
            name: 'list',
            children: [
              T('1', '甲一', 0, 100),
              T('2', '乙二', 0, 124),
              T('3', '丙三', 0, 148),
              T('4', '丁四', 0, 172),
            ],
          },
        ],
      },
    };
    expect(collectFigmaTextSiblingGroups(singleCol)[0].direction).toBe('vertical');
  });

  it('门禁集成：网格乱序 ⇒ TEXT-001 BLOCK（fail-closed 升级生效）', () => {
    const files = {
      'package/components/G.vue': `<template>
  <div><span v-for="i in items" :key="i.id">{{ i.text }}</span></div>
</template>
<script setup>
const items = [
  { id: '1', text: '所属产品' }, { id: '5', text: '设备类型' }, { id: '9', text: '链接分类' },
  { id: '2', text: '爆闪灯' }, { id: '6', text: '具身机器人' }, { id: '10', text: '直连设备' },
  { id: '3', text: '产品厂家' }, { id: '7', text: '所属路公司' }, { id: '11', text: '父级设备' },
  { id: '4', text: '感动科技' }, { id: '8', text: '江苏通行宝' }, { id: '12', text: 'AP12343' }
]
</script>`,
    };
    const result = CodeStructureValidator.validate(
      Object.entries(files).map(([path, content]) => ({ path, content })),
      'mc-max-test',
      { target: 'microcode', figmaNodeData: FIGMA_FIELD_GRID },
    );
    expect(result.issues.filter((i: any) => i.id === 'TEXT-001').length).toBeGreaterThan(0);
  });
});
