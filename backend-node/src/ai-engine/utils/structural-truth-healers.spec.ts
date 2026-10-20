/**
 * 结构真值三刀 spec（刀 32 rowPeers 包裹 / 刀 33 双源归一 / 刀 34 插槽重复移除）。
 * fixture 复刻 477e185d 真实形态（纯结构，无任务名依赖）。
 */
import {
  healRowPeersWrap,
  healDupClassDirectionConflicts,
  healSlotDuplicateRender,
  healVForOverflowRow,
  healStructuralTruth,
} from './structural-truth-healers.js';

const NOOP_LOGGER = { info() {}, warn() {}, error() {}, debug() {} };

// ── 真实形态 fixture（477e185d 复刻）──
const IDX_TWO_CARDS_COLUMN = `<template>
  <base-panel panelKey="default-panel">
    <div class="x-slot-con" style="display:flex;flex-direction:column;">
      <div class="x-icon-con" data-section-id="796:3" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div class="x-card-a" data-section-id="38:3260" style="flex:0.096;min-height:0;display:flex;flex-direction:row;">
          <ContentIcon style="flex:none;" />
        </div>
        <div class="x-card-b" data-section-id="38:3282" style="flex:0.096;min-height:0;display:flex;flex-direction:row;">
          <ContentIcon2 style="flex:none;" />
        </div>
        <div class="x-panel" data-section-id="38:3137" style="flex:0.204;min-height:0;display:flex;flex-direction:column;"></div>
      </div>
    </div>
  </base-panel>
</template>
<script setup>
</script>
`;

const SECTIONS_PEERS = [
  {
    id: '796:3',
    children: [
      { id: '38:3260', rowPeerIds: ['38:3282'] },
      { id: '38:3282', rowPeerIds: ['38:3260'] },
      { id: '38:3137' },
    ],
  },
];

const FIGMA_ROOT = {
  document: {
    id: 'root',
    children: [
      { id: '38:3260', absoluteBoundingBox: { x: 100, y: 0, width: 265, height: 76 } },
      { id: '38:3282', absoluteBoundingBox: { x: 429, y: 0, width: 265, height: 76 } },
    ],
  },
};

describe('刀 32：rowPeers 互挂兄弟被父 column 堆叠 → 包 row 容器', () => {
  it('真实形态：两卡被包裹进 row 容器（gap=figma 真值 64px、flex 相加迁移、子块 flex:1）', () => {
    const files = { 'package/index.vue': IDX_TWO_CARDS_COLUMN };
    const { files: out, changes } = healRowPeersWrap(files, {
      effectiveSections: SECTIONS_PEERS,
      figmaRoot: FIGMA_ROOT,
    });
    const applied = changes.filter((c) => !c.skipped);
    expect(applied).toHaveLength(1);
    const html = out['package/index.vue'];
    expect(html).toContain('data-rowpeers-wrap');
    expect(html).toMatch(/flex-direction:row;gap:64px;/);
    // flex 迁移：0.096×2 → 包裹层 0.192
    expect(html).toMatch(/data-rowpeers-wrap style="flex:0\.192;/);
    // 子块改 flex:1 + min-width:0（属性顺序不敏感，各自独立断言）
    const cardA = /data-section-id="38:3260" style="([^"]*)"/.exec(html)?.[1] || '';
    const cardB = /data-section-id="38:3282" style="([^"]*)"/.exec(html)?.[1] || '';
    expect(cardA).toMatch(/flex:1/);
    expect(cardA).toContain('min-width:0');
    expect(cardB).toMatch(/flex:1/);
    expect(cardB).toContain('min-width:0');
    // 面板兄弟不被卷入
    expect(html.indexOf('data-rowpeers-wrap')).toBeLessThan(html.indexOf('38:3137'));
  });

  it('阳性对照：父已是 row → 不动（无包裹、零改动）', () => {
    const parentRow = IDX_TWO_CARDS_COLUMN.replace(
      'data-section-id="796:3" style="flex:1;min-height:0;display:flex;flex-direction:column;"',
      'data-section-id="796:3" style="flex:1;min-height:0;display:flex;flex-direction:row;"',
    );
    const files = { 'package/index.vue': parentRow };
    const { files: out, changes } = healRowPeersWrap(files, {
      effectiveSections: SECTIONS_PEERS,
      figmaRoot: FIGMA_ROOT,
    });
    expect(changes.filter((c) => !c.skipped)).toHaveLength(0);
    expect(out['package/index.vue']).not.toContain('data-rowpeers-wrap');
    expect(out['package/index.vue']).toBe(parentRow);
  });

  it('无真值（fail-open）→ 不动', () => {
    const files = { 'package/index.vue': IDX_TWO_CARDS_COLUMN };
    const { files: out, changes } = healRowPeersWrap(files, {});
    expect(changes.filter((c) => !c.skipped)).toHaveLength(0);
    expect(out['package/index.vue']).toBe(IDX_TWO_CARDS_COLUMN);
  });

  it('两卡不相邻（中间隔面板）→ 不动', () => {
    const separated = IDX_TWO_CARDS_COLUMN.replace(
      /(<div class="x-card-a" data-section-id="38:3260"[\s\S]*?<\/div>\n)/,
      '$1        <div class="x-mid" data-section-id="99:1" style="flex:0.05;"></div>\n',
    );
    const files = { 'package/index.vue': separated };
    const { files: out, changes } = healRowPeersWrap(files, {
      effectiveSections: SECTIONS_PEERS,
      figmaRoot: FIGMA_ROOT,
    });
    expect(changes.filter((c) => !c.skipped)).toHaveLength(0);
    expect(out['package/index.vue']).not.toContain('data-rowpeers-wrap');
  });

  it('幂等：包裹后再跑零改动', () => {
    const first = healRowPeersWrap(
      { 'package/index.vue': IDX_TWO_CARDS_COLUMN },
      { effectiveSections: SECTIONS_PEERS, figmaRoot: FIGMA_ROOT },
    );
    const second = healRowPeersWrap(first.files, {
      effectiveSections: SECTIONS_PEERS,
      figmaRoot: FIGMA_ROOT,
    });
    expect(second.changes.filter((c) => !c.skipped)).toHaveLength(0);
    expect(second.files['package/index.vue']).toBe(first.files['package/index.vue']);
  });
});

describe('刀 33：SFC × common.less 同名类布局属性归一（SFC 为唯一语义源）', () => {
  const SFC = `<template><div class="c-x-header-text">t</div></template>
<style lang="less" scoped>
.c-x-header-text {
  width: 100%;
  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 6px;
}
</style>
`;
  const COMMON = `.c-x-header-text {height: 100%;

  display: flex;
  align-items: center;
  font-size: calc(@fontSize * 1.143);
  white-space: nowrap;
  width: 100%;
  flex-direction: column;
  justify-content: center;
  flex-shrink: 0;
}

.c-x-other {
  flex-direction: column;
  justify-content: center;
}
`;

  it('真实形态：冲突属性覆写为 SFC 值 + SFC 未声明的 justify-content:center 删除', () => {
    const files = { 'package/components/HeaderText.vue': SFC, 'package/resources/styles/common.less': COMMON };
    const { files: out, changes } = healDupClassDirectionConflicts(files);
    const html = out['package/resources/styles/common.less'];
    expect(changes.some((c) => c.cls === 'c-x-header-text' && c.prop === 'flex-direction' && c.to === 'row')).toBe(true);
    expect(changes.some((c) => c.cls === 'c-x-header-text' && c.prop === 'justify-content' && c.to === null)).toBe(true);
    expect(html).toMatch(/\.c-x-header-text \{[^}]*flex-direction: row;/s);
    expect(html).not.toMatch(/\.c-x-header-text \{[^}]*justify-content/s);
    // 无 SFC 定义的类不动（阳性对照）
    expect(out['package/resources/styles/common.less']).toMatch(/\.c-x-other \{[^}]*flex-direction: column;/s);
  });

  it('两侧一致 → 不动', () => {
    const commonSame = COMMON.replace('flex-direction: column;\n  justify-content: center;\n  flex-shrink: 0;', 'flex-direction: row;\n  flex-shrink: 0;');
    const files = { 'package/components/HeaderText.vue': SFC, 'package/resources/styles/common.less': commonSame };
    const { files: out, changes } = healDupClassDirectionConflicts(files);
    expect(changes).toHaveLength(0);
    expect(out['package/resources/styles/common.less']).toBe(commonSame);
  });
});

describe('刀 34：插槽 × 主体重复渲染 → 删插槽侧', () => {
  const IDX_WITH_SLOT = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderText />
    </template>
    <div class="x-slot-con">
      <HeaderText style="flex:0.2;" />
      <ContentIcon />
    </div>
  </base-panel>
</template>
`;

  it('真实形态：#header-right 内 HeaderText 与主体重复 → 插槽块删除', () => {
    const files = { 'package/index.vue': IDX_WITH_SLOT };
    const { files: out, changes } = healSlotDuplicateRender(files);
    expect(changes).toEqual([{ slot: '#header-right', comps: ['HeaderText'] }]);
    const html = out['package/index.vue'];
    expect(html).not.toContain('#header-right');
    expect(html).toContain('<HeaderText style="flex:0.2;" />');
    expect(html).toContain('<ContentIcon />');
  });

  it('插槽组件主体未出现（合法用法）→ 保留', () => {
    const legal = IDX_WITH_SLOT.replace('<HeaderText style="flex:0.2;" />\n      ', '');
    const files = { 'package/index.vue': legal };
    const { files: out, changes } = healSlotDuplicateRender(files);
    expect(changes).toHaveLength(0);
    expect(out['package/index.vue']).toContain('#header-right');
  });

  it('无插槽 → 不动', () => {
    const bare = '<template>\n  <div class="x-slot-con"><HeaderText /></div>\n</template>\n';
    const files = { 'package/index.vue': bare };
    const { files: out, changes } = healSlotDuplicateRender(files);
    expect(changes).toHaveLength(0);
    expect(out['package/index.vue']).toBe(bare);
  });
});

describe('刀 35：row 容器 × v-for × item width:100% 数学矛盾 → 翻转 column（真值缺位兜底）', () => {
  // ae911370 真实形态复刻：v-for 卡列表挂进单卡横排容器
  const CS_SFC = `<template>
  <div data-section-id="48:5801" class="c-x-content-section" v-bind="$attrs">
    <div v-for="(node, index) in nodeList" :key="node.name" class="c-x-group-card">
      <span>{{ node.name }}</span>
    </div>
  </div>
</template>
<script setup>
const nodeList = ref([{ name: 'a' }, { name: 'b' }]);
</script>
<style lang="less" scoped>
.c-x-content-section {  display: flex;
  flex-direction: row;
  width: 100%;
}
.c-x-group-card {
  align-items: center;
  width: 100%;
  min-height: 72px;
  display: flex;
  flex-direction: row;
}
</style>
`;
  const CS_COMMON = `.c-x-content-section {height: 100%;

  display: flex;
  flex-direction: row;
  width: 100%;
  overflow-y: auto;
}

.c-x-group-card {
  width: 100%;
  flex-shrink: 0;
}
`;

  it('真实形态：SFC 与 common.less 双源同翻 row→column', () => {
    const files = {
      'package/components/ContentSection.vue': CS_SFC,
      'package/resources/styles/common.less': CS_COMMON,
    };
    const { files: out, changes } = healVForOverflowRow(files);
    expect(changes).toHaveLength(2);
    const sfc = out['package/components/ContentSection.vue'];
    const common = out['package/resources/styles/common.less'];
    // 双源 content-section 都翻 column
    expect(sfc).toMatch(/\.c-x-content-section \{[^}]*flex-direction: column;/s);
    expect(common).toMatch(/\.c-x-content-section \{[^}]*flex-direction: column;/s);
    // 卡自身 row 不被误翻（它不是容器，是 item）
    expect(sfc).toMatch(/\.c-x-group-card \{[^}]*flex-direction: row;/s);
    // 数据/结构不动
    expect(sfc).toContain('v-for=');
  });

  it('阳性对照：item 非 100% 宽（合法横向流）→ 不翻', () => {
    const sfc = CS_SFC.replace('  width: 100%;\n  min-height: 72px;', '  width: 30%;\n  min-height: 72px;');
    const common = CS_COMMON.replace('  width: 100%;\n  flex-shrink: 0;', '  width: 30%;\n  flex-shrink: 0;');
    const files = {
      'package/components/ContentSection.vue': sfc,
      'package/resources/styles/common.less': common,
    };
    const { files: out, changes } = healVForOverflowRow(files);
    expect(changes).toHaveLength(0);
    expect(out['package/components/ContentSection.vue']).toBe(sfc);
  });

  it('阳性对照：子级非 v-for（单元素 100% 合法）→ 不翻', () => {
    const sfc = CS_SFC.replace(' v-for="(node, index) in nodeList" :key="node.name"', '');
    const files = {
      'package/components/ContentSection.vue': sfc,
      'package/resources/styles/common.less': CS_COMMON,
    };
    const { files: out, changes } = healVForOverflowRow(files);
    expect(changes).toHaveLength(0);
    expect(out['package/components/ContentSection.vue']).toBe(sfc);
  });

  it('幂等：翻转后再跑零改动', () => {
    const first = healVForOverflowRow({
      'package/components/ContentSection.vue': CS_SFC,
      'package/resources/styles/common.less': CS_COMMON,
    });
    const second = healVForOverflowRow(first.files);
    expect(second.changes).toHaveLength(0);
  });

  it('统一入口接线：刀 35 命中进 summary.vforOverflowRow', () => {
    const files = {
      'package/components/ContentSection.vue': CS_SFC,
      'package/resources/styles/common.less': CS_COMMON,
    };
    const { summary } = healStructuralTruth(files, {}, { logger: NOOP_LOGGER });
    expect(summary.vforOverflowRow).toBe(2);
  });
});

describe('统一入口 healStructuralTruth', () => {
  it('三刀叠加：477e185d 全形态一次治愈', () => {
    const files = {
      'package/index.vue': `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderText />
    </template>
    <div class="x-slot-con" style="display:flex;flex-direction:column;">
      <div class="x-icon-con" style="display:flex;flex-direction:column;">
        <div data-section-id="38:3260" style="flex:0.096;min-height:0;display:flex;flex-direction:row;"></div>
        <div data-section-id="38:3282" style="flex:0.096;min-height:0;display:flex;flex-direction:row;"></div>
        <HeaderText style="flex:0.2;" />
      </div>
    </div>
  </base-panel>
</template>
`,
      'package/components/HeaderText.vue': `<template><div class="c-x-header-text">t</div></template>
<style lang="less" scoped>
.c-x-header-text { display: flex; flex-direction: row; align-items: center; }
</style>
`,
      'package/resources/styles/common.less': `.c-x-header-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
`,
    };
    const { files: out, summary } = healStructuralTruth(
      files,
      { effectiveSections: SECTIONS_PEERS, figmaRoot: FIGMA_ROOT },
      { logger: NOOP_LOGGER },
    );
    expect(summary.slotDupRender).toBe(1);
    expect(summary.rowpeersWrap).toBe(1);
    expect(summary.dupClassDirection).toBeGreaterThan(0);
    expect(out['package/index.vue']).not.toContain('#header-right');
    expect(out['package/index.vue']).toContain('data-rowpeers-wrap');
    expect(out['package/resources/styles/common.less']).toMatch(/flex-direction: row;/);
    expect(out['package/resources/styles/common.less']).not.toMatch(/justify-content/);
  });

  it('健康产物零误伤（无真值/无冲突/无插槽）', () => {
    const healthy = {
      'package/index.vue': '<template>\n  <div class="x-slot-con"><ContentIcon /></div>\n</template>\n',
      'package/resources/styles/common.less': '.c-a { display: flex; flex-direction: column; }\n',
    };
    const { files: out, summary } = healStructuralTruth(healthy, {}, { logger: NOOP_LOGGER });
    expect(summary.rowpeersWrap).toBe(0);
    expect(summary.dupClassDirection).toBe(0);
    expect(summary.slotDupRender).toBe(0);
    expect(out['package/index.vue']).toBe(healthy['package/index.vue']);
    expect(out['package/resources/styles/common.less']).toBe(healthy['package/resources/styles/common.less']);
  });
});
