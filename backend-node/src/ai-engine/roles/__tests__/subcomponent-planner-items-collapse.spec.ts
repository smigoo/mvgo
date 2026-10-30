/**
 * 刀 20a（2026-10-28 · mc-max-1793174936204-657661ca 实锤）：planner 容器分支
 * 「vision items 轨 + 确定性重建 children 轨」撞名时的坍缩修复。
 *
 * 病灶：48:5798 既是 vision 列表段（body.items=6 张卡）又是 Figma 首卡 frame
 * （children=[卡1 子树]）；容器分支白名单重建丢 body.items ⇒ 列表坍缩成 1 卡。
 * 判据：items ≥2 且富卡 + 现有 children 的 id 全部落在 items 节点引用集内 ⇒
 * children 替换为单个 collapsed list 叶（走叶子分支既有 collapsed 透传链）。
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}))

import { subcomponentPlanner, buildEffectiveSection } from '../subcomponent-planner.js';
import { indexFigmaNodes } from '../../utils/section-tree.js';

// 🛡️ 2026-10-30 第2步：默认结构骨架已切 vision（用户拍板「结构骨架=vision」）。
// 本套件判据针对 E1（Figma 树骨架）路径（容器坍缩 / 折叠叶几何透传），
// 统一锁定 structureSource='figma' 以保留该路径的回归防护，断言语义不变。
const planE1 = (layout: any, opts: any = {}) =>
  subcomponentPlanner.plan(layout, { structureSource: 'figma', ...opts });
const mkItem = (id, iconNode, name) => ({
  id,
  layout: 'horizontal',
  repeatedFill: '#ffffff',
  icon: { placeholder: 'ic', figmaNode: iconNode, position: 'left', resource: '../resources/images/ic.png', width: 40, height: 40 },
  content: {
    layout: 'vertical', position: 'right',
    elements: [
      { type: 'label', text: name, figmaNode: id, position: 'top', styles: { fontSize: 16, color: '#333' } },
      { type: 'label', text: `地址-${name}`, figmaNode: id, position: 'bottom', styles: { fontSize: 12, color: '#666' } },
    ],
  },
});

const FIGMA = {
  id: 'root', name: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
  children: [
    { id: '10:1', name: 'list', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 180 }, children: [
      { id: '10:2', name: 'card1', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 72 }, children: [
        { id: '10:3', name: 'icon', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 16, width: 40, height: 40 }, children: [] },
      ] },
      { id: '10:5', name: 'card2', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 92, width: 400, height: 72 }, children: [
        { id: '10:6', name: 'icon', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 108, width: 40, height: 40 }, children: [] },
      ] },
    ] },
  ],
};

function mkLayout(children) {
  return {
    layout: {
      type: 'vertical-stack', direction: 'vertical',
      sections: [
        {
          id: '10:1', name: '节点列表', role: '常驻', layout: 'vertical',
          ...(children ? { children } : {}),
          body: { layout: 'vertical', items: [mkItem('10:2', '10:3', '甲节点'), mkItem('10:5', '10:6', '乙节点')] },
        },
      ],
    },
  };
}

function find(list, pred) {
  for (const s of list || []) {
    if (pred(s)) return s;
    const r = find(s.children, pred);
    if (r) return r;
  }
  return null;
}

describe('刀20a planner：vision items 轨容器坍缩修复', () => {
  it('⭐ 实锤复刻：children（卡1 子树 id 落在 items 引用集内）⇒ 替换为 collapsed list 叶', () => {
    const res = planE1(mkLayout([{ id: '10:3', name: '图标', layout: 'horizontal' }]), { figmaNodeData: FIGMA });
    const leaf = find(res.effectiveSections, (s) => s.id === '10:1-list');
    expect(leaf).toBeTruthy();
    expect(leaf.collapsed).toBe(true);
    expect(leaf.renderHint).toBe('v-for');
    expect(leaf.items).toHaveLength(2);
    expect(leaf.items[1].content.elements[0].text).toBe('乙节点');
    // 原 children 轨（卡1 子树）不得残留
    expect(find(res.effectiveSections, (s) => s.id === '10:3')).toBeNull();
  });

  it('反向：容器 figma 子树含 items 之外的真实内容 ⇒ 不替换（宁可多渲染不可漏渲染）', () => {
    // 10:1 的 figma 子树多一个带文本的「底栏」（10:10 不在任何 item 引用集内）
    const figma = JSON.parse(JSON.stringify(FIGMA));
    figma.children[0].children.push({
      id: '10:9', name: 'footer-bar', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 172, width: 400, height: 20 },
      children: [
        { id: '10:10', name: '说明', type: 'TEXT', characters: '底部说明',
          absoluteBoundingBox: { x: 10, y: 174, width: 80, height: 16 } },
      ],
    });
    const res = planE1(mkLayout(null), { figmaNodeData: figma });
    expect(find(res.effectiveSections, (s) => s.id === '10:1-list')).toBeNull();
    // 卡片与底栏都必须仍在树上（不坍缩、不丢失）
    expect(find(res.effectiveSections, (s) => s.id === '10:2')).toBeTruthy();
    expect(find(res.effectiveSections, (s) => s.id === '10:9')).toBeTruthy();
  });

  it('反向：body.items 是扁平文本清单（非富卡）⇒ 不触发', () => {
    const ls = mkLayout([{ id: '10:3', name: '图标' }]);
    ls.layout.sections[0].body.items = [{ text: '甲' }, { text: '乙' }];
    const res = planE1(ls, { figmaNodeData: FIGMA });
    expect(find(res.effectiveSections, (s) => s.id === '10:1-list' && s.collapsed === true)).toBeNull();
  });
});

describe('刀21a planner：vision 直接把列表收成叶子（body.items 富卡、无 children、无折叠标记）', () => {
  // mc-max-1793181937804-3e301cdb 实锤形态：item 无 id/figmaNode，
  // stat 是对象映射 {online:{value,unit,styles}}，icon 只有 resource。
  const mkLeafItem = (name, addr, online) => ({
    layout: 'horizontal',
    repeatedFill: '#a6ceff',
    icon: { placeholder: 'icon-node', position: 'left', resource: 'icon-5808.png' },
    content: {
      layout: 'vertical', position: 'right',
      elements: [
        { type: 'label', text: name, position: 'top', styles: { fontSize: 16, color: 'rgba(0,0,0,1)', fontWeight: 'bold' } },
        { type: 'label', text: addr, position: 'bottom', styles: { fontSize: 12, color: 'rgba(102,102,102,1)' } },
      ],
    },
    stat: { online: { value: online, unit: '在线', styles: { fontSize: 20, color: 'rgba(0,200,0,1)', fontWeight: 'bold' } } },
  });
  // figma 10:1 子树为空 ⇒ section 保持叶子（E1 无可重建 children）
  const LEAF_FIGMA = {
    id: 'root', name: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
    children: [
      { id: '10:1', name: 'list', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 180 }, children: [] },
    ],
  };
  const mkLeafLayout = (items) => ({
    layout: {
      type: 'vertical-stack', direction: 'vertical',
      sections: [
        { id: '10:1', name: '节点列表', role: '常驻', layout: 'vertical', body: { layout: 'vertical', items } },
      ],
    },
  });

  it('⭐ 实锤复刻：叶子 + body.items 富卡（stat 映射形态）⇒ 归一 collapsed list（items 顶层透传）', () => {
    const res = planE1(
      mkLeafLayout([mkLeafItem('甲节点', '地址甲', '3,792'), mkLeafItem('乙节点', '地址乙', '128')]),
      { figmaNodeData: LEAF_FIGMA },
    );
    const leaf = find(res.effectiveSections, (s) => s.id === '10:1');
    expect(leaf).toBeTruthy();
    expect(leaf.collapsed).toBe(true);
    expect(leaf.renderHint).toBe('v-for');
    expect(leaf.type).toBe('list');
    expect(leaf.itemCount).toBe(2);
    expect(Array.isArray(leaf.items)).toBe(true);
    expect(leaf.items).toHaveLength(2);
    expect(leaf.items[1].content.elements[0].text).toBe('乙节点');
    // body.items 原始轨道仍保留（互补双轨，供文本真值清单消费）
    expect(leaf.body?.items).toHaveLength(2);
  });

  it('反向：叶子 + 扁平文本清单（非富卡）⇒ 不归一（collapsed=false）', () => {
    const res = planE1(
      mkLeafLayout([{ text: '甲' }, { text: '乙' }]),
      { figmaNodeData: LEAF_FIGMA },
    );
    const leaf = find(res.effectiveSections, (s) => s.id === '10:1');
    expect(leaf).toBeTruthy();
    expect(leaf.collapsed).toBe(false);
    expect(leaf.renderHint).toBeUndefined();
  });

  it('反向：叶子无 body.items ⇒ 行为不变（collapsed=false）', () => {
    const ls = mkLeafLayout(null);
    delete ls.layout.sections[0].body;
    const res = planE1(ls, { figmaNodeData: LEAF_FIGMA });
    const leaf = find(res.effectiveSections, (s) => s.id === '10:1');
    expect(leaf).toBeTruthy();
    expect(leaf.collapsed).toBe(false);
  });
});

describe('刀21c planner：collapseSectionsDeep 折叠产物（顶层 items + 残留首卡 children）不得进容器分支', () => {
  // mc-max-1793181937804-3e301cdb 实锤：E1 重建 6 卡 → collapser 折成 48:5798-list
  // （顶层 items 契约 + 残留首卡 children）→ 被 isLayoutContainerSection 判成容器 ⇒
  // 容器分支白名单重建丢 items/renderHint、collapsed 硬写 false ⇒ 又坍缩成首卡。
  // 判据 isCollapsedListSection（顶层 items 轨，与 20a 的 body.items 轨互补）。
  // 直测 buildEffectiveSection（E1 会整树替代 vision sections，plan 入口无法稳定复现该形态）。
  const mkRichItem = (name, addr) => ({
    layout: 'horizontal', repeatedFill: '#a6ceff',
    icon: { placeholder: 'ic', position: 'left', resource: 'icon-5808.png' },
    content: { layout: 'vertical', position: 'right', elements: [
      { type: 'label', text: name, position: 'top', styles: { fontSize: 16, color: '#000', fontWeight: 'bold' } },
      { type: 'label', text: addr, position: 'bottom', styles: { fontSize: 12, color: '#666' } },
    ] },
    stat: { online: { value: '3,792', unit: '在线', styles: { fontSize: 20, color: '#0c0', fontWeight: 'bold' } } },
  });
  const CTX = { allInternalSubcomponents: [], figmaIndex: null };

  it('⭐ 实锤复刻：折叠产物（顶层 items + 残留 children）⇒ 叶子口径（collapsed/items/renderHint 全保）', () => {
    const collapsedProduct = {
      id: '48:5798-list', name: '节点列表', type: 'list', layout: 'vertical',
      collapsed: true, renderHint: 'v-for', itemCount: 3,
      items: [mkRichItem('甲节点', '地址甲'), mkRichItem('乙节点', '地址乙'), mkRichItem('丙节点', '地址丙')],
      sourceNodeIds: ['48:5801', '48:5816', '48:5831'],
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 512 },
      // buildCollapsedSection 是 `...first` 透传：首卡若是容器，容器标记与 children
      // 原样残留到折叠产物上（真实病灶正是这个形态）
      isLayoutContainer: true,
      children: [{ id: '48:5801', name: 'card1', layout: 'horizontal' }],
    };
    const out = buildEffectiveSection(collapsedProduct, 0, CTX);
    expect(out.isLayoutContainer).toBeFalsy();
    expect(out.collapsed).toBe(true);
    expect(out.renderHint).toBe('v-for');
    expect(out.itemCount).toBe(3);
    expect(Array.isArray(out.items)).toBe(true);
    expect(out.items).toHaveLength(3);
    expect(out.items[2].content.elements[0].text).toBe('丙节点');
    // 残留首卡不得透传为子 section（叶子分支只透传 collapsed 子项）
    expect(out.children).toBeUndefined();
  });

  it('反向：普通容器（无 items 轨、非折叠）⇒ 仍走容器分支', () => {
    const out = buildEffectiveSection({
      id: '10:1', name: '容器', layout: 'vertical', isLayoutContainer: true,
      children: [{ id: '10:2', name: '甲', text: '甲' }, { id: '10:3', name: '乙', text: '乙' }],
    }, 0, CTX);
    expect(out.isLayoutContainer).toBe(true);
    expect(out.collapsed).toBe(false);
    expect(out.type).toBe('container');
  });
});

describe('刀21e planner：collapsed 列表叶豁免 plainTextItems 覆盖 body.items', () => {
  // 实锤：折叠产物残留首卡 children 递归出 plainTextItems ⇒ 把 vision 富卡
  // body.items（content.elements/stat 全结构）覆盖成扁平 [{text,figmaNode}] ⇒
  // 下游 detectListLeaf 内容轨全空 ⇒ emptyItem。collapsed 叶文本真值由顶层
  // items 专职透传，body.items 必须保留 vision 富卡轨。
  const richOf = (name) => ({
    layout: 'horizontal', repeatedFill: '#a6ceff',
    icon: { placeholder: 'ic', position: 'left', resource: 'icon-5808.png' },
    content: { layout: 'vertical', position: 'right', elements: [
      { type: 'label', text: name, position: 'top', styles: { fontSize: 16 } },
    ] },
  });
  const CTX = { allInternalSubcomponents: [], figmaIndex: null };

  it('⭐ 阳性：collapsed 叶 + 残留带文本 children ⇒ body.items 保留富卡轨不被覆盖', () => {
    const out = buildEffectiveSection({
      id: '48:5798-list', name: '节点列表', type: 'list', layout: 'vertical',
      collapsed: true, renderHint: 'v-for', itemCount: 2,
      items: [richOf('甲'), richOf('乙')],
      body: { layout: 'vertical', items: [richOf('甲'), richOf('乙')] },
      children: [{ id: '48:5801', name: 'c1', children: [
        { id: '48:5806', text: '残留文本', absoluteBoundingBox: { x: 72, y: 12, width: 100, height: 18 } },
      ] }],
    }, 0, CTX);
    expect(out.collapsed).toBe(true);
    expect(Array.isArray(out.body?.items)).toBe(true);
    expect(out.body.items).toHaveLength(2);
    expect(out.body.items[0].content.elements[0].text).toBe('甲');
  });

  it('反向：非 collapsed 叶 ⇒ plainTextItems 覆盖行为不变', () => {
    const out = buildEffectiveSection({
      id: '9:1', name: '普通叶', layout: 'vertical',
      body: { layout: 'vertical', items: [{ text: '旧' }] },
      children: [{ id: '9:2', text: '新文本', absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 14 } }],
    }, 0, CTX);
    expect(out.collapsed).toBe(false);
    expect(out.body.items.some((it) => it.text === '新文本')).toBe(true);
  });
});

describe('刀21a 方向闸：horizontal/grid 富卡叶子不归一（爆炸半径审计实锤）', () => {
  // 87 任务审计：horizontal/grid 富卡叶子 17 例全是横向统计卡/属性网格，
  // fg-list 是纵列 v-for 接管，归一会改错布局；layout 缺事实（null）同不归一。
  const mkHzItem = (name) => ({
    layout: 'horizontal', repeatedFill: '#fff',
    icon: { placeholder: 'ic', position: 'left', resource: 'ic.png' },
    content: { layout: 'vertical', position: 'right', elements: [
      { type: 'label', text: name, position: 'top', styles: { fontSize: 16 } },
      { type: 'label', text: '副-' + name, position: 'bottom', styles: { fontSize: 12 } },
    ] },
  });
  const HZ_FIGMA = {
    id: 'root', name: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
    children: [{ id: '20:1', name: 'cards', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 90 }, children: [] }],
  };
  const mkHz = (layout) => ({
    layout: { type: 'vertical-stack', direction: 'vertical', sections: [
      { id: '20:1', name: '顶部统计卡', role: '常驻', ...(layout != null ? { layout } : {}),
        body: { items: [mkHzItem('卡A'), mkHzItem('卡B')] } },
    ] },
  });

  it('反向：layout=horizontal-2-columns ⇒ 不归一（collapsed=false）', () => {
    const res = planE1(mkHz('horizontal-2-columns'), { figmaNodeData: HZ_FIGMA });
    const leaf = find(res.effectiveSections, (s) => s.id === '20:1');
    expect(leaf).toBeTruthy();
    expect(leaf.collapsed).toBe(false);
  });

  it('反向：layout=grid ⇒ 不归一', () => {
    const res = planE1(mkHz('grid'), { figmaNodeData: HZ_FIGMA });
    expect(find(res.effectiveSections, (s) => s.id === '20:1')?.collapsed).toBe(false);
  });

  it('反向：layout 缺事实（无字段）⇒ 不归一', () => {
    const res = planE1(mkHz(null), { figmaNodeData: HZ_FIGMA });
    expect(find(res.effectiveSections, (s) => s.id === '20:1')?.collapsed).toBe(false);
  });
});

describe('刀23 planner：body.items 混合（富卡 + 杂项）⇒ 过滤归一（杂项由其它 section 承载）', () => {
  // b2086a9c 实锤：vision 把 6 张 children 子树卡 + 尾部文本 + 滚动条装饰混在
  // 同一 body.items（9 项）。旧 every 全富判据 ⇒ 整轨漏判。过滤语义：富卡 ≥2
  // ⇒ 归一 collapsed list，杂项不进列表（footer 段自有承载，不丢内容）。
  const mkSubtreeCard = (name) => ({
    id: '48:x', name, role: 'stat-card', layout: 'horizontal', repeatedFill: '#a6ceff',
    children: [
      { id: '48:x', role: 'icon', style: { width: '40px', height: '40px' } },
      { id: '48:x', role: '常驻', children: [
        { id: '48:x', type: 'text', text: name, style: { fontSize: '16px' } },
      ] },
    ],
  });
  const CTX9 = { allInternalSubcomponents: [], figmaIndex: null };

  it('⭐ 实锤复刻：6 子树卡 + 文本杂项 + 装饰杂项 ⇒ collapsed list 且 items=6（杂项被过滤）', () => {
    const out = buildEffectiveSection({
      id: '48:5798', name: '节点列表', layout: 'vertical',
      body: { layout: 'vertical', items: [
        mkSubtreeCard('甲节点'), mkSubtreeCard('乙节点'), mkSubtreeCard('丙节点'),
        mkSubtreeCard('丁节点'), mkSubtreeCard('戊节点'), mkSubtreeCard('己节点'),
        { id: '48:5798', type: 'text', text: '共 6 个节点' },
        { id: '48:5798', role: '装饰', type: 'decoration' },
        { id: '48:5798', role: '装饰', type: 'decoration' },
      ] },
    }, 0, CTX9);
    expect(out.collapsed).toBe(true);
    expect(out.renderHint).toBe('v-for');
    expect(out.items).toHaveLength(6);
    expect(out.items.every((it) => Array.isArray(it.children))).toBe(true);
  });

  it('反向：富卡仅 1 项（其余全杂项）⇒ 不归一', () => {
    const out = buildEffectiveSection({
      id: '48:5798', name: 'x', layout: 'vertical',
      body: { items: [mkSubtreeCard('甲节点'), { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    }, 0, CTX9);
    expect(out.collapsed).toBe(false);
  });
});

describe('刀28c/28③ planner：collapsed 叶几何透传 + sourceNodeIds 全成员子树（4cc3d366/54ae6ee3 实锤）', () => {
  // 病灶①（28c）：rawListLeaf 带整列并集几何，但叶子分支白名单重建丢几何字段 ⇒
  //   容器分支「刀20a 配套」宿主补丁读 children[0].figmaBox 恒 undefined ⇒
  //   宿主仍按自身 bbox（首卡 72px）申报 ⇒ 列表挤进 72px 壳。
  // 病灶②（28③）：折叠段 src 只含首卡子树 ⇒ 装配 claimedIds 缺卡 2-6 ⇒
  //   刀7 absorbed-bg 双份渲染。
  it('⭐ 阳性：折叠叶几何透传 + 宿主几何被并集覆盖 + src 含全部成员子树', () => {
    const res = planE1(mkLayout([{ id: '10:3', name: '图标', layout: 'horizontal' }]), { figmaNodeData: FIGMA });
    const leaf = find(res.effectiveSections, (s) => s.id === '10:1-list');
    expect(leaf).toBeTruthy();
    // 28c：整列并集几何透传（两卡 0..72 / 92..164 ⇒ 并集高 164）
    expect(leaf.absoluteBoundingBox).toMatchObject({ x: 0, y: 0, width: 400, height: 164 });
    expect(leaf.figmaBox?.height).toBe(164);
    // 28c：宿主容器几何被刀20a 配套补丁覆盖为整列并集（不再按自身 figma bbox）
    const host = find(res.effectiveSections, (s) => s.id === '10:1');
    expect(host?.figmaBox?.height ?? host?.absoluteBoundingBox?.height).toBe(164);
    // 28③：sourceNodeIds 含全部成员卡组子树（claimedIds 精确匹配消费）
    for (const id of ['10:2', '10:3', '10:5', '10:6']) {
      expect(leaf.sourceNodeIds).toContain(id);
    }
  });

  it('反向：figma 索引缺失成员 ⇒ 至少保留锚点 id（fail-open 不猜）', () => {
    // 直调 buildEffectiveSection：figma 树只含卡1（10:2 子树），卡2（10:5）索引缺失
    const partial = {
      id: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
      children: [
        { id: '10:2', name: 'card1', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 72 }, children: [
          { id: '10:3', name: 'icon', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 16, width: 40, height: 40 }, children: [] },
        ] },
      ],
    };
    const sec = {
      id: '10:1', name: '节点列表', layout: 'vertical', isLayoutContainer: true,
      children: [{ id: '10:3', name: '图标', layout: 'horizontal' }],
      body: { layout: 'vertical', items: [mkItem('10:2', '10:3', '甲节点'), mkItem('10:5', '10:6', '乙节点')] },
    };
    const out = buildEffectiveSection(sec, 0, {
      figmaIndex: indexFigmaNodes(partial),
      allInternalSubcomponents: [],
    });
    const leaf = (out.children || []).find((c) => c.id === '10:1-list');
    expect(leaf).toBeTruthy();
    // 索引可解析成员 ⇒ 子树全展开；缺失成员（10:5）⇒ 锚点 id 兜底保留
    expect(leaf.sourceNodeIds).toContain('10:2');
    expect(leaf.sourceNodeIds).toContain('10:3');
    expect(leaf.sourceNodeIds).toContain('10:5');
  });
});
