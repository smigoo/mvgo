/**
 * 视觉序确定性装配（visual-order-assembler）单测
 * golden 数据来自 c-device-monitor-be31dcf3 真机实锤（2026-09-22）：
 *  - Figma 2:8437 cons：12 卡 GROUP，文档序列优先，视觉序行优先
 *  - Figma 89:39 tabs：6 tab，文档序末尾 …消防,交通诱导,供配电，y 序 …供配电,消防,交通诱导
 */
import { reorderArraysByFigmaVisualOrder } from '../visual-order-assembler.js';

// ── Figma 真值骨架（几何/文本与 be31dcf3 一致，结构精简） ──
function makeNode(id, name, x, y, w, h, children = [], type = 'GROUP', characters = null) {
  return {
    id,
    name,
    type,
    absoluteBoundingBox: { x, y, width: w, height: h },
    ...(characters ? { characters } : {}),
    ...(children.length ? { children } : {}),
  };
}

function consFigmaRoot() {
  // 文档序：列优先（第1列4卡 → 第2列 → 第3列），与真实 Figma 一致
  const col1 = [
    makeNode('2:8438', 'Group1', 1518, 550, 117, 64, [makeNode('t1', 'l', 0, 0, 1, 1, [], 'TEXT', '摄像机')]),
    makeNode('2:8467', 'Group2', 1518, 627, 117, 64, [makeNode('t2', 'l', 0, 0, 1, 1, [], 'TEXT', '烟道机器人')]),
    makeNode('2:8497', 'Group3', 1518, 704, 117, 64, [makeNode('t3', 'l', 0, 0, 1, 1, [], 'TEXT', 'CO/VI检测器')]),
    makeNode('2:8526', 'Group4', 1518, 781, 117, 64, [makeNode('t4', 'l', 0, 0, 1, 1, [], 'TEXT', '光照度变送器')]),
  ];
  const col2 = [
    makeNode('2:8584', 'Group5', 1643, 550, 117, 64, [makeNode('t5', 'l', 0, 0, 1, 1, [], 'TEXT', '风速风向仪')]),
    makeNode('2:8555', 'Group6', 1643, 627, 117, 64, [makeNode('t6', 'l', 0, 0, 1, 1, [], 'TEXT', '激光雷达')]),
    makeNode('2:8613', 'Group7', 1643, 704, 117, 64, [makeNode('t7', 'l', 0, 0, 1, 1, [], 'TEXT', '温湿度传感器')]),
    makeNode('2:8642', 'Group8', 1643, 781, 117, 64, [makeNode('t8', 'l', 0, 0, 1, 1, [], 'TEXT', '紧急电话')]),
  ];
  const col3 = [
    makeNode('2:8671', 'Group9', 1768, 550, 117, 64, [makeNode('t9', 'l', 0, 0, 1, 1, [], 'TEXT', '超高检测器')]),
    makeNode('2:8700', 'Group10', 1768, 627, 117, 64, [makeNode('t10', 'l', 0, 0, 1, 1, [], 'TEXT', 'CO2传感器')]),
    makeNode('2:8729', 'Group11', 1768, 704, 117, 64, [makeNode('t11', 'l', 0, 0, 1, 1, [], 'TEXT', '压力传感器')]),
    makeNode('2:8758', 'Group12', 1768, 781, 117, 64, [makeNode('t12', 'l', 0, 0, 1, 1, [], 'TEXT', '水质监测设备')]),
  ];
  return { document: makeNode('0:0', 'root', 0, 0, 800, 900, [makeNode('2:8437', 'cons', 1518, 550, 367, 295, [...col1, ...col2, ...col3], 'GROUP')]) };
}

function tabsFigmaRoot() {
  // 文档序 y 值故意乱序：监控538, 照明591, 通风638, 消防740, 交通诱导783, 供配电681
  const tabs = makeNode('89:39', 'tabs', 1475, 538, 46, 317, [
    makeNode('2:8825', 'tab-active', 1475, 538, 46, 54, [makeNode('t', 'l', 0, 0, 1, 1, [], 'TEXT', '监控')]),
    makeNode('2:8830', 'tab', 1475, 591, 37, 44, [makeNode('t', 'l', 0, 0, 1, 1, [], 'TEXT', '照明')]),
    makeNode('2:8836', 'tab', 1475, 638, 34, 40, [makeNode('t', 'l', 0, 0, 1, 1, [], 'TEXT', '通风')]),
    makeNode('2:8841', 'tab', 1475, 740, 34, 40, [makeNode('t', 'l', 0, 0, 1, 1, [], 'TEXT', '消防')]),
    makeNode('2:8846', 'tab', 1475, 783, 34, 72, [makeNode('t', 'l', 0, 0, 1, 1, [], 'TEXT', '交通诱导')]),
    makeNode('2:8851', 'tab', 1475, 681, 34, 56, [makeNode('t', 'l', 0, 0, 1, 1, [], 'TEXT', '供配电')]),
  ], 'FRAME');
  return { document: makeNode('0:0', 'root', 0, 0, 800, 900, [tabs]) };
}

const CONS_VUE = `<template>
  <div class="c-device-monitor-cons" data-section-id="2:8437" v-bind="$attrs">
    <div v-for="item in deviceList" :key="item.label" class="c-device-monitor-card">
      <span class="label">{{ item.label }}</span>
      <span class="value">{{ item.value }}</span>
    </div>
  </div>
</template>

<script setup>
const deviceList = [
  { label: '摄像机', value: '(2/484)' },
  { label: '烟道机器人', value: '(0/484)' },
  { label: 'CO/VI检测器', value: '(0/484)' },
  { label: '光照度变送器', value: '(0/484)' },
  { label: '激光雷达', value: '(0/484)' },
  { label: '风速风向仪', value: '(1/484)' },
  { label: '温湿度传感器', value: '(0/484)' },
  { label: '紧急电话', value: '(0/484)' },
  { label: '超高检测器', value: '(0/484)' },
  { label: 'CO2传感器', value: '(0/484)' },
  { label: '压力传感器', value: '(0/484)' },
  { label: '水质监测设备', value: '(0/484)' }
]
</script>

<style lang="less" scoped>
.c-device-monitor-cons {
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  display: grid;
}
</style>
`;

const TABS_VUE = `<template>
  <div class="c-device-monitor-tabs-section" v-bind="$attrs">
    <div v-for="tab in tabs" :key="tab.key" class="tab-item">
      <span>{{ tab.label }}</span>
    </div>
  </div>
</template>

<script setup>
const tabs = [
  { key: 'monitor', label: '监控' },
  { key: 'lighting', label: '照明' },
  { key: 'ventilation', label: '通风' },
  { key: 'fire', label: '消防' },
  { key: 'traffic', label: '交通诱导' },
  { key: 'power', label: '供配电' }
]
</script>

<style lang="less" scoped>
.c-device-monitor-tabs-section {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
`;

describe('reorderArraysByFigmaVisualOrder', () => {
  it('grid 模式：列优先文档序 → 行优先 (y,x) 序重排 deviceList', () => {
    const result = reorderArraysByFigmaVisualOrder(CONS_VUE, consFigmaRoot(), {
      fileName: 'ContentCons.vue',
    });
    expect(result).not.toBeNull();
    expect(result.mode).toBe('grid');
    expect(result.reordered).toEqual(['deviceList']);
    // 行优先序断言（与 Figma y,x 完全一致）
    expect(result.labels).toEqual([
      '摄像机', '风速风向仪', '超高检测器',
      '烟道机器人', '激光雷达', 'CO2传感器',
      'CO/VI检测器', '温湿度传感器', '压力传感器',
      '光照度变送器', '紧急电话', '水质监测设备',
    ]);
    // 产物中数组的顺序 = labels 顺序
    const arrMatch = result.content.match(/const deviceList = \[([\s\S]*?)\n\]/);
    expect(arrMatch).not.toBeNull();
    const labelsInProduct = [...arrMatch[1].matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    expect(labelsInProduct).toEqual(result.labels);
  });

  it('tabs 模式：文档序 → y 序重排 tabs 数组（供配电提前到消防前）', () => {
    const result = reorderArraysByFigmaVisualOrder(TABS_VUE, tabsFigmaRoot(), {
      fileName: 'TabsSection.vue',
    });
    expect(result).not.toBeNull();
    expect(result.mode).toBe('tabs');
    expect(result.labels).toEqual(['监控', '照明', '通风', '供配电', '消防', '交通诱导']);
    const arrMatch = result.content.match(/const tabs = \[([\s\S]*?)\n\]/);
    const labelsInProduct = [...arrMatch[1].matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    expect(labelsInProduct).toEqual(['监控', '照明', '通风', '供配电', '消防', '交通诱导']);
  });

  it('幂等：顺序已正确的产物零改动', () => {
    const orderedVue = CONS_VUE.replace(
      /const deviceList = \[[\s\S]*?\n\]/,
      `const deviceList = [
  { label: '摄像机', value: '(2/484)' },
  { label: '风速风向仪', value: '(1/484)' },
  { label: '超高检测器', value: '(0/484)' },
  { label: '烟道机器人', value: '(0/484)' },
  { label: '激光雷达', value: '(0/484)' },
  { label: 'CO2传感器', value: '(0/484)' },
  { label: 'CO/VI检测器', value: '(0/484)' },
  { label: '温湿度传感器', value: '(0/484)' },
  { label: '压力传感器', value: '(0/484)' },
  { label: '光照度变送器', value: '(0/484)' },
  { label: '紧急电话', value: '(0/484)' },
  { label: '水质监测设备', value: '(0/484)' }
]`,
    );
    const result = reorderArraysByFigmaVisualOrder(orderedVue, consFigmaRoot(), {
      fileName: 'ContentCons.vue',
    });
    expect(result).toBeNull(); // 顺序已正确 → 无需处理
  });

  it('保守放弃：数组长度与 Figma 卡数不符（缺一卡）不重排', () => {
    const brokenVue = CONS_VUE.replace(
      /  \{ label: '水质监测设备', value: '\(0\/484\)' \}\n/,
      '',
    );
    const result = reorderArraysByFigmaVisualOrder(brokenVue, consFigmaRoot(), {
      fileName: 'ContentCons.vue',
    });
    expect(result).toBeNull();
  });

  it('2026-09-22 放宽：无 data-section-id 时走标签双射锚定仍触发 grid 重排（e875f162 实锤）', () => {
    const noAnchorVue = CONS_VUE.replace(' data-section-id="2:8437"', '');
    const result = reorderArraysByFigmaVisualOrder(noAnchorVue, consFigmaRoot(), {
      fileName: 'ContentCons.vue',
    });
    // 标签双射：12 卡标签集合与 Figma cons GROUP 内容卡完全双射 → 唯一命中 → 重排
    expect(result).not.toBeNull();
    expect(result.mode).toBe('grid');
    expect(result.labels[0]).toBe('摄像机');
    expect(result.labels[1]).toBe('风速风向仪');
  });

  it('保守放弃：标签双射歧义（两个容器标签集合相同）时不触发', () => {
    const dupRoot = consFigmaRoot();
    // 复制一份 cons GROUP → 全树两个容器标签集合相同 → 双射歧义 → 放弃
    const consNode = dupRoot.document.children[0];
    dupRoot.document.children.push(JSON.parse(JSON.stringify(consNode)));
    const noAnchorVue = CONS_VUE.replace(' data-section-id="2:8437"', '');
    const result = reorderArraysByFigmaVisualOrder(noAnchorVue, dupRoot, {
      fileName: 'ContentCons.vue',
    });
    expect(result).toBeNull();
  });

  it('保守放弃：Figma 树有多个 name=tabs 节点时不触发（唯一性防误绑）', () => {
    const dupRoot = tabsFigmaRoot();
    dupRoot.document.children.push(
      makeNode('99:99', 'tabs', 0, 0, 10, 10, [], 'FRAME'),
    );
    const result = reorderArraysByFigmaVisualOrder(TABS_VUE, dupRoot, {
      fileName: 'TabsSection.vue',
    });
    expect(result).toBeNull();
  });

  it('tabs-static 模式：静态手写 tab div（无数组）按 y 序重排模板块（e875f162 实锤）', () => {
    const STATIC_TABS_VUE = `<template>
  <div class="c-device-monitor-tabs" v-bind="$attrs">
    <div class="c-device-monitor-tab c-device-monitor-tab-active">
      <div class="c-device-monitor-tab-text">监控</div>
    </div>
    <div class="c-device-monitor-tab">
      <div class="c-device-monitor-tab-text">照明</div>
      <div class="c-device-monitor-tab-badge">3</div>
    </div>
    <div class="c-device-monitor-tab">
      <div class="c-device-monitor-tab-text">通风</div>
    </div>
    <div class="c-device-monitor-tab">
      <div class="c-device-monitor-tab-text">消防</div>
    </div>
    <div class="c-device-monitor-tab">
      <div class="c-device-monitor-tab-text">交通诱导</div>
    </div>
    <div class="c-device-monitor-tab">
      <div class="c-device-monitor-tab-text">供配电</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
</script>

<style lang="less" scoped>
.c-device-monitor-tabs {
  display: flex;
  flex-direction: column;
}
</style>
`;
    const result = reorderArraysByFigmaVisualOrder(STATIC_TABS_VUE, tabsFigmaRoot(), {
      fileName: 'TabsSection.vue',
    });
    expect(result).not.toBeNull();
    expect(result.mode).toBe('tabs-static');
    // 验证产物模板顺序 = y 序（监控,照明,通风,供配电,消防,交通诱导）
    const texts = [...result.content.matchAll(/tab-text">([^<]+)</g)].map((m) => m[1]);
    expect(texts).toEqual(['监控', '照明', '通风', '供配电', '消防', '交通诱导']);
  });
});
