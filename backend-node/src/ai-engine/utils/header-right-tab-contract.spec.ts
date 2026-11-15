import {
  recoverHeaderSlotContract,
  promoteHeaderRightTabs,
} from './header-right-tab-contract.js';
import { buildSectionStructureContract } from './section-structure-contract.js';

const tabStyles = (active: boolean) => ({
  backgroundColor: active ? 'rgba(25,144,255,0.1)' : 'transparent',
  color: active ? '#1990ff' : 'rgba(102,128,160,0.34)',
  fontSize: 13,
  borderRadius: '9px',
  padding: '2px 10px',
  height: '19px',
});

const layoutStructure = {
  layout: {
    sections: [
      {
        id: '136:120',
        name: 'header',
        slotCandidate: 'header-right',
        headerRelation: 'title-same-row',
        body: {
          children: [
            { id: '2:7955', type: 'tab', text: '江阴靖江长江隧道', active: true, styles: tabStyles(true) },
            { id: '2:7957', type: 'tab', text: '江阴大桥', active: false, styles: tabStyles(false) },
          ],
        },
      },
      { id: '136:122', name: '今日累计', body: { children: [] } },
    ],
  },
};

const figmaNodeData = {
  document: {
    id: 'root',
    children: [
      {
        id: '2:7955',
        type: 'FRAME',
        fills: [{ type: 'SOLID', color: { r: 0.098, g: 0.565, b: 1, a: 1 } }],
        children: [
          {
            id: '2:7956',
            type: 'TEXT',
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
            style: { fontSize: 14, fontWeight: 500, lineHeightPx: 21 },
          },
        ],
      },
      {
        id: '2:7957',
        type: 'FRAME',
        fills: [{ type: 'SOLID', opacity: 0.34, color: { r: 0.4, g: 0.5, b: 0.628, a: 1 } }],
        children: [
          {
            id: '2:7958',
            type: 'TEXT',
            fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
            style: { fontSize: 14, fontWeight: 400, lineHeightPx: 21 },
          },
        ],
      },
    ],
  },
};

const input = () => ({
  headerSlots: [] as any[],
  layoutStructure: JSON.parse(JSON.stringify(layoutStructure)),
  interactions: [{ type: 'tab-switch', target: '江阴靖江长江隧道 Tab' }],
  figmaNodeData: JSON.parse(JSON.stringify(figmaNodeData)),
});

const INDEX_VUE = `<template>
  <base-panel panelKey="default-panel">
    <div class="slot-con" style="display:flex;flex-direction:column;height:100%;min-height:0">
      <div data-section-id="136:120" style="flex:0.175;min-height:0">
        <TabsSection style="min-height:0;" />
        <ContentMonitor />
      </div>
      <ContentSection style="flex:0.343;min-height:0;" />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import TabsSection from './components/TabsSection.vue'
import ContentMonitor from './components/ContentMonitor.vue'
import ContentSection from './components/ContentSection.vue'
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
.slot-con { min-height: 0; }
</style>
`;

const TABS_VUE = `<template>
  <div data-section-id="2:7954" class="tabs">
    <div v-for="(it, i) in items" :key="i"><span>{{ it.text }}</span></div>
  </div>
</template>
<script setup>
const items = [{ text: '江阴靖江长江隧道' }, { text: '江阴大桥' }]
</script>
`;

const files = () => ({
  'package/index.vue': INDEX_VUE,
  'package/components/TabsSection.vue': TABS_VUE,
  'package/components/ContentMonitor.vue': '<template><div>装饰</div></template>',
  'package/components/ContentSection.vue': '<template><div>今日累计</div></template>',
});

describe('recoverHeaderSlotContract · header-right 契约断供恢复', () => {
  it('空 headerSlots + slotCandidate/tab children ⇒ 恢复 1 条 header-right 契约与 1 个 tab 模型', () => {
    const r = recoverHeaderSlotContract(input());
    expect(r.stats.recovered).toBe(1);
    expect(r.stats.tabGroups).toBe(1);
    expect(r.stats.tabItems).toBe(2);
    expect(r.stats.hasTabSwitch).toBe(true);
    expect(r.headerSlots).toHaveLength(1);
    expect(r.headerSlots[0]).toMatchObject({
      slotType: 'header-right',
      elementType: 'tab',
      content: '江阴靖江长江隧道 江阴大桥',
    });
    expect(r.models[0]).toMatchObject({
      nodeId: '136:120',
      activeId: '2:7955',
      items: [
        { id: '2:7955', text: '江阴靖江长江隧道' },
        { id: '2:7957', text: '江阴大桥' },
      ],
    });
  });

  it('Figma SOLID 填充 / TEXT 色是上位真值，覆盖视觉近似值', () => {
    const r = recoverHeaderSlotContract(input());
    expect(r.models[0].activeStyle.backgroundColor).toBe('#1990ff');
    expect(r.models[0].activeStyle.color).toBe('#ffffff');
    expect(r.models[0].activeStyle.fontSize).toBe('14px');
    expect(r.models[0].activeStyle.fontWeight).toBe('500');
    expect(r.models[0].inactiveStyle.backgroundColor).toBe('rgba(102,128,160,0.34)');
    expect(r.models[0].inactiveStyle.color).toBe('#333333');
  });

  it('已有 header-right 契约 ⇒ 幂等，不新增条目，只补 tab 结构证据', () => {
    const p = input();
    p.headerSlots = [
      { slotType: 'header-right', elementType: 'label', figmaNodeId: '2:7954', sectionId: '136:120', content: '江阴靖江长江隧道 江阴大桥' },
    ];
    const r = recoverHeaderSlotContract(p);
    expect(r.headerSlots).toHaveLength(1);
    expect(r.stats.recovered).toBe(0);
    expect(r.models).toHaveLength(1);
    expect(r.headerSlots[0].tabs).toHaveLength(2);
  });

  it('active 数不为 1 ⇒ skippedAmbiguous，不恢复（防臆造默认选中项）', () => {
    const p = input();
    p.layoutStructure.layout.sections[0].body.children[1].active = true;
    const r = recoverHeaderSlotContract(p);
    expect(r.stats.skippedAmbiguous).toBeGreaterThan(0);
    expect(r.stats.tabGroups).toBe(0);
    expect(r.headerSlots).toHaveLength(0);
  });

  it('无 header-right 证据且无 tab-switch ⇒ 不恢复（fail-open 零副作用）', () => {
    const p = input();
    p.layoutStructure.layout.sections[0].slotCandidate = null;
    p.layoutStructure.layout.sections[0].headerRelation = null;
    p.interactions = [];
    const r = recoverHeaderSlotContract(p);
    expect(r.stats.tabGroups).toBe(0);
    expect(r.headerSlots).toHaveLength(0);
  });

  it('layoutStructure.headerSlots 可作文字契约断供时的兜底搬运', () => {
    const p = input();
    p.layoutStructure.headerSlots = [
      { slotType: 'header-right', elementType: 'label', content: '设备总数 68562', figmaNodeId: '2:9000' },
    ];
    p.layoutStructure.layout.sections = [];
    const r = recoverHeaderSlotContract(p);
    expect(r.stats.recovered).toBe(1);
    expect(r.headerSlots[0].content).toBe('设备总数 68562');
  });
});

describe('promoteHeaderRightTabs · 终写前交互 Tab 提升', () => {
  it('注入 #header-right + @click + ref active + less 规则，且无 inline px 尺寸', () => {
    const r = promoteHeaderRightTabs(files(), input());
    const idx = r.files['package/index.vue'];
    expect(r.stats.injected).toBe(1);
    expect(idx).toContain('<template #header-right>');
    expect(idx).toMatch(/@click="__mcActiveHeaderTab_\w+ = tab\.id"/);
    expect(idx).toMatch(/const __mcActiveHeaderTab_\w+ = ref\(["']2:7955["']\)/);
    expect(idx).toContain('import { onMounted, ref } from');
    expect(idx).toContain('.mc-header-tab--active');
    expect(idx).toContain('background: #1990ff');
    expect(idx).not.toMatch(/style="[^"]*(?:width|height|font-size)\s*:\s*\d+px/);
  });

  it('摘掉 body 里重复的静态 tab 组件：标签 + import + 文件', () => {
    const r = promoteHeaderRightTabs(files(), input());
    const idx = r.files['package/index.vue'];
    expect(r.stats.removedTags).toBe(1);
    expect(r.stats.removedImports).toBe(1);
    expect(r.stats.removedFiles).toBe(1);
    expect(idx).not.toMatch(/<TabsSection\b/);
    expect(idx).not.toMatch(/import\s+TabsSection\b/);
    expect(r.files['package/components/TabsSection.vue']).toBeUndefined();
    expect(idx).toContain('<ContentMonitor />');
    expect(idx).toContain('<ContentSection');
  });

  it('幂等：复跑不重复注入、不重复声明、index.vue 逐字一致', () => {
    const first = promoteHeaderRightTabs(files(), input());
    const second = promoteHeaderRightTabs(first.files, {
      ...input(),
      headerSlots: recoverHeaderSlotContract(input()).headerSlots,
    });
    expect(second.files['package/index.vue']).toBe(first.files['package/index.vue']);
    expect(second.stats.scriptInjected).toBe(0);
    expect(second.stats.lessInjected).toBe(0);
    expect(second.stats.removedTags).toBe(0);
    expect((second.files['package/index.vue'].match(/@click=/g) || []).length).toBe(1);
  });

  it('已有非兜底的 #header-right 内容 ⇒ 不覆盖 LLM 成果', () => {
    const f = files();
    f['package/index.vue'] = INDEX_VUE.replace(
      '<base-panel panelKey="default-panel">',
      '<base-panel panelKey="default-panel">\n    <template #header-right><span>自定义统计</span></template>',
    );
    const r = promoteHeaderRightTabs(f, input());
    expect(r.stats.skippedExistingSlot).toBe(1);
    expect(r.files['package/index.vue']).toContain('自定义统计');
    expect(r.stats.injected).toBe(0);
  });

  it('替换 T09 自己的纯文本兜底块（带系统标记）', () => {
    const f = files();
    f['package/index.vue'] = INDEX_VUE.replace(
      '<base-panel panelKey="default-panel">',
      '<base-panel panelKey="default-panel">\n    <template #header-right>\n      <!-- 由生成器按 Figma headerSlots 确定性补齐 -->\n      <span>江阴靖江长江隧道 江阴大桥</span>\n    </template>',
    );
    const r = promoteHeaderRightTabs(f, input());
    expect(r.stats.injected).toBe(1);
    expect(r.files['package/index.vue']).toContain('@click=');
    expect((r.files['package/index.vue'].match(/<template #header-right>/g) || []).length).toBe(1);
  });

  it('无 tab 模型 ⇒ 零改动（fail-open）', () => {
    const f = files();
    const r = promoteHeaderRightTabs(f, {
      headerSlots: [],
      layoutStructure: { layout: { sections: [] } },
      interactions: [],
    });
    expect(r.stats.models).toBe(0);
    expect(r.files['package/index.vue']).toBe(INDEX_VUE);
    expect(Object.keys(r.files)).toHaveLength(4);
  });

  it('缺 index.vue ⇒ 不抛错，skippedNoIndex=1', () => {
    const f = files();
    delete (f as any)['package/index.vue'];
    const r = promoteHeaderRightTabs(f, input());
    expect(r.stats.skippedNoIndex).toBe(1);
  });
});

describe('buildSectionStructureContract · 自身锚命中（693c8d17）', () => {
  const tree = [
    { id: '136:120', type: 'content', sourceNodeIds: [], body: { children: [] } },
    { id: '136:122', type: 'content', sourceNodeIds: [], body: { children: [] } },
    { id: '2:8023', type: 'content', sourceNodeIds: [], body: { children: [] } },
  ];

  it('headerSlots 为空 ⇒ headerSlotsEmitted=0（旧行为，header 全落 body）', () => {
    const c = buildSectionStructureContract(tree as any, { headerSlots: [] });
    expect(c.stats.headerSlotsEmitted).toBe(0);
    expect(c.stats.bodyRoots).toBe(3);
  });

  it('契约 sectionId 命中段自身 id ⇒ headerSlotsEmitted=1、bodyRoots 少 1', () => {
    const c = buildSectionStructureContract(tree as any, {
      headerSlots: [
        { slotType: 'header-right', figmaNodeId: '2:7954', sectionId: '136:120' },
      ],
    });
    expect(c.stats.headerSlotsEmitted).toBe(1);
    expect(c.headerLeaves[0].id).toBe('136:120');
    expect(c.stats.bodyRoots).toBe(2);
    expect(c.byId.get('136:120')?.placement).toBe('header-right');
  });
});
