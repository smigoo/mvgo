/**
 * 刀 20b（2026-10-28 · mc-max-1793174936204-657661ca 实锤）：同构列表接管单测。
 *
 * 病灶：vision items 轨给出「节点列表 body.items = 6 张同构卡」，LLM 只渲染第 1 张，
 * 其余 5 张文本全丢、卡面 rect 被刀 7 吸收成空壳 ⇒「除了第一条下面都是空的」。
 * 判据全部来自真值（collapsed/v-for 契约 + enriched items + figma 几何回查），零硬编码。
 */
import {
  detectListLeaf,
  renderFoldedGridLeafVue,
  collectFoldedGridTakeover,
} from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';
import { validateVueSfc } from '../sfc-syntax-validation.js';

const mkItem = (id, iconNode, name, fill) => ({
  id,
  layout: 'horizontal',
  repeatedFill: fill,
  icon: {
    placeholder: 'ic', figmaNode: iconNode, position: 'left',
    resource: `../resources/images/icon-${id.replace(':', '-')}.png`,
    width: 40, height: 40,
  },
  content: {
    layout: 'vertical', position: 'right',
    elements: [
      { type: 'label', text: name, figmaNode: id, position: 'top', styles: { fontSize: 16, fontWeight: 'bold', color: '#333333' } },
      { type: 'label', text: `地址-${name}`, figmaNode: id, position: 'bottom', styles: { fontSize: 12, color: '#666666' } },
    ],
  },
  stats: [
    { type: 'online', value: '100', label: '在线', styles: { fontSize: 16, fontWeight: 'bold', color: '#52c41a' } },
  ],
});

/** 两卡 figma 树：card 72px、间距 20px、icon 左内距 20px */
const FIGMA = {
  id: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
  children: [
    { id: '10:2', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 72 }, children: [
      { id: '10:3', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 16, width: 40, height: 40 }, children: [] },
    ] },
    { id: '10:5', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 92, width: 400, height: 72 }, children: [
      { id: '10:6', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 108, width: 40, height: 40 }, children: [] },
    ] },
  ],
};

const LIST_SEC = {
  id: '10:1-list', type: 'list', collapsed: true, renderHint: 'v-for', itemCount: 2,
  items: [mkItem('10:2', '10:3', '甲节点', '#ffffff'), mkItem('10:5', '10:6', '乙节点', '#ffffff')],
};

describe('刀20b detectListLeaf — 同构列表接管判据', () => {
  it('⭐ 阳性：2 项同构富卡 ⇒ ok，几何真值全解（cardH 72 / gap [20] / padL 20）', () => {
    const r = detectListLeaf(LIST_SEC, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('list');
    expect(r.items).toHaveLength(2);
    expect(r.items[1].texts[0].t).toBe('乙节点');
    expect(r.cardH).toBe(72);
    expect(r.gaps).toEqual([20]);
    expect(r.padL).toBe(20);
    expect(r.items[0].icon.file).toBe('icon-10-2.png');
  });

  it('反向：非折叠叶 ⇒ notCollapsedList', () => {
    const r = detectListLeaf({ id: 'x', items: LIST_SEC.items }, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('notCollapsedList');
  });

  it('反向：items<2 ⇒ 不接管', () => {
    const r = detectListLeaf({ ...LIST_SEC, items: [LIST_SEC.items[0]] }, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('items<2');
  });

  it('反向：某项零文本零 stat ⇒ emptyItem fail-open', () => {
    const bad = { id: '10:5', content: { elements: [] } };
    const r = detectListLeaf({ ...LIST_SEC, items: [LIST_SEC.items[0], bad] }, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('emptyItem');
  });

  it('反向：文本段数不一致（非同构）⇒ heteroTextCount', () => {
    const odd = mkItem('10:5', '10:6', '乙节点', '#fff');
    odd.content.elements = odd.content.elements.slice(0, 1);
    const r = detectListLeaf({ ...LIST_SEC, items: [LIST_SEC.items[0], odd] }, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('heteroTextCount');
  });

  it('降级：figma 几何缺失 ⇒ 仍接管但不写几何（内容自然流）', () => {
    const r = detectListLeaf(LIST_SEC, null);
    expect(r.ok).toBe(true);
    expect(r.cardH).toBeNull();
    expect(r.gaps).toBeNull();
  });
});

describe('刀20b renderFoldedGridLeafVue — list 渲染', () => {
  const tr = detectListLeaf(LIST_SEC, indexFigmaNodes(FIGMA));
  const vue = renderFoldedGridLeafVue(tr, 'c-demo');

  it('v-for 展开 + 真滚动（overflow-y:auto）+ fg-list 类名', () => {
    expect(vue).toContain('v-for="(it, __i) in FG_LIST_ITEMS"');
    expect(vue).toContain('overflow-y:auto');
    expect(vue).toContain('-fg-list-');
  });

  it('每项真值文案/样式内联（甲/乙节点 + 地址 + stat）', () => {
    for (const t of ['甲节点', '乙节点', '地址-甲节点', '地址-乙节点', '100', '在线']) {
      expect(vue).toContain(t);
    }
    expect(vue).toContain('#52c41a');
  });

  it('几何真值：卡高 72 / 间距 20 / 左内距 20 全部内联', () => {
    expect(vue).toContain("height: '72px'");
    expect(vue.replace(/\s+/g, '')).toContain('FG_LIST_GAPS=[20]');
    expect(vue).toContain("marginLeft: '20px'");
  });

  it('icon 走 import 绑定（非同名字符串），同文件去重', () => {
    expect(vue).toContain("import fgListIcon0 from '../../resources/images/icon-10-2.png'");
    expect(vue).toContain("import fgListIcon1 from '../../resources/images/icon-10-5.png'");
    expect(vue).not.toContain('src="icon');
  });

  it('M5-7 安全：模板/style 无 font-size:NNpx 字面量（字号全走绑定）', () => {
    expect(/font-size\s*:\s*\d+px/.test(vue)).toBe(false);
  });
});

describe('刀20b collectFoldedGridTakeover 集成', () => {
  it('折叠列表叶 ⇒ listHits=1 且显式计数（不落 gridHits）', () => {
    const out = collectFoldedGridTakeover({
      treeSections: [
        { id: 'wrap', type: 'container', isLayoutContainer: true, children: [LIST_SEC] },
      ],
      figmaNodeData: FIGMA,
      resourceMapping: [],
      componentName: 'c-demo',
    });
    expect(out.listHits).toBe(1);
    expect(out.gridHits).toBe(0);
    const tr = [...out.map.values()][0];
    expect(tr.kind).toBe('list');
    expect(tr.vue).toContain('FG_LIST_ITEMS');
  });

  it('阴性：非折叠叶不被 list 抢走（走既有检测链）', () => {
    const plain = { id: '10:2', type: 'text' };
    const out = collectFoldedGridTakeover({
      treeSections: [plain],
      figmaNodeData: FIGMA,
      resourceMapping: [],
      componentName: 'c-demo',
    });
    expect(out.listHits).toBe(0);
  });
});

describe('刀21b normListItem — stat 对象映射形态（mc-max-1793181937804-3e301cdb 实锤）', () => {
  // vision 另一种 stat 形态：stat: {online:{value,unit,styles}}（非 stats 数组），
  // item 无 id/figmaNode ⇒ 几何缺事实 ⇒ cardH/gaps 必须为 null（fail-open 不猜）。
  const mkMapItem = (name, addr, online, offline) => ({
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
    stat: {
      online: { value: online, unit: '在线', styles: { fontSize: 20, color: 'rgba(0,200,0,1)', fontWeight: 'bold' } },
      offline: { value: offline, unit: '离线', styles: { fontSize: 20, color: 'rgba(0,0,0,1)' } },
    },
  });
  const MAP_SEC = {
    id: '48:5798', type: 'list', collapsed: true, renderHint: 'v-for', itemCount: 2,
    items: [
      mkMapItem('甲节点', '地址甲', '3,792', '28'),
      mkMapItem('乙节点', '地址乙', '128', '6'),
    ],
  };

  it('⭐ 阳性：stat 对象映射 ⇒ stats 提取 value/unit 真值，几何缺事实 ⇒ null', () => {
    const r = detectListLeaf(MAP_SEC, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(2);
    expect(r.items[0].stats).toHaveLength(2);
    expect(r.items[0].stats[0]).toMatchObject({ v: '3,792', l: '在线', vc: 'rgba(0,200,0,1)', vfs: 20 });
    expect(r.items[0].stats[1]).toMatchObject({ v: '28', l: '离线' });
    expect(r.items[0].icon.file).toBe('icon-5808.png');
    expect(r.items[0].fill).toBe('#a6ceff');
    // item 无 id/figmaNode ⇒ 几何不可解 ⇒ 不猜兜底值
    expect(r.cardH).toBeNull();
    expect(r.gaps).toBeNull();
    // 渲染出真值文案与数值
    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    expect(vue).toContain('3,792');
    expect(vue).toContain('在线');
    expect(vue).toContain('地址乙');
  });

  it('反向：stat 成员无 value ⇒ 跳过不编造（空 stat 不炸）', () => {
    const sec = {
      ...MAP_SEC,
      items: MAP_SEC.items.map((it) => ({
        ...it,
        stat: { online: { unit: '在线' }, offline: { value: '', unit: '离线' } },
      })),
    };
    const r = detectListLeaf(sec, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    expect(r.items[0].stats).toHaveLength(0);
    // texts 仍在 ⇒ 不是 emptyItem
    expect(r.items[0].texts).toHaveLength(2);
  });
});

describe('刀21d detectListLeaf — E1 树节点 items + per-item body.items[0] 富卡回退', () => {
  // collapser 产物形态：顶层 items 是 E1 富化树节点（children 子树 TEXT/icon，
  // 归一全空），每项 vision 富卡由 F1 回填在 item.body.items[0]；
  // 几何真值在顶层 item.absoluteBoundingBox（卡高 72 / 间距 20）。
  const mkTreeItem = (id, y, rich) => ({
    id, name: 'card', layout: 'vertical',
    absoluteBoundingBox: { x: 0, y, width: 400, height: 72 },
    children: [{ id: `${id}-t`, type: 'TEXT', characters: rich.content.elements[0].text }],
    body: { items: [rich] },
  });
  const richOf = (name, addr, online) => ({
    layout: 'horizontal', repeatedFill: '#a6ceff',
    icon: { placeholder: 'ic', position: 'left', resource: 'icon-5808.png' },
    content: { layout: 'vertical', position: 'right', elements: [
      { type: 'label', text: name, position: 'top', styles: { fontSize: 16, color: '#000', fontWeight: 'bold' } },
      { type: 'label', text: addr, position: 'bottom', styles: { fontSize: 12, color: '#666' } },
    ] },
    stat: { online: { value: online, unit: '在线', styles: { fontSize: 20, color: '#0c0', fontWeight: 'bold' } } },
  });
  const TREE_SEC = {
    id: '10:1-list', type: 'list', collapsed: true, renderHint: 'v-for', itemCount: 2,
    items: [
      mkTreeItem('10:2', 0, richOf('甲节点', '地址甲', '3,792')),
      mkTreeItem('10:5', 92, richOf('乙节点', '地址乙', '128')),
    ],
  };

  it('⭐ 阳性：树节点空壳 + per-item 富卡 ⇒ 内容轨回退成功，几何轨取顶层卡盒（cardH 72/gaps [20]）', () => {
    const r = detectListLeaf(TREE_SEC, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(2);
    expect(r.items[0].texts.map((t) => t.t)).toEqual(['甲节点', '地址甲']);
    expect(r.items[0].stats[0]).toMatchObject({ v: '3,792', l: '在线' });
    expect(r.items[1].icon.file).toBe('icon-5808.png');
    expect(r.cardH).toBe(72);
    expect(r.gaps).toEqual([20]);
  });

  it('反向：树节点空壳且 per-item body 也为空 ⇒ emptyItem 不接管', () => {
    const sec = {
      ...TREE_SEC,
      items: TREE_SEC.items.map((it) => ({
        ...it,
        children: [], // 刀 23 后子树也是内容轨：本用例语义=两轨皆空
        body: { items: [{ content: { elements: [] } }] },
      })),
    };
    const r = detectListLeaf(sec, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('emptyItem');
  });

  it('反向：per-item body.items 多于 1 条（非单轨）⇒ 不回退（防错配）', () => {
    const sec = {
      ...TREE_SEC,
      items: TREE_SEC.items.map((it) => ({
        ...it,
        children: [], // 刀 23 后子树也是内容轨：本用例语义=顶层空+多条防错配
        body: { items: [richOf('X', 'Y', '1'), richOf('Z', 'W', '2')] },
      })),
    };
    const r = detectListLeaf(sec, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('emptyItem');
  });
});

describe('刀23 — children 子树轨（mc-max-1793185156712-b2086a9c 实锤）', () => {
  // vision 又一形态：卡内容在 children 子树（bg/icon/常驻组→text 叶，样式 '16px'
  // 字符串、无 resource 文件名、节点 id 伪造重复）；icon 真值只能靠「卡 figma 子树内
  // 唯一带资源映射节点」归属判据（FIGMA 里 10:3/10:6 是各卡唯一 icon 节点）。
  const mkSubtreeItem = (id, name, addr, val) => ({
    id, name, role: 'stat-card', layout: 'horizontal', repeatedFill: '#a6ceff',
    children: [
      { id, role: 'bg', style: { width: '459px' } },
      { id: id + '-ic', role: 'icon', style: { width: '40px', height: '40px' } },
      { id, role: '常驻', children: [
        { id, type: 'text', text: name, style: { fontSize: '16px', fontWeight: 'bold', color: 'rgba(0,0,0,1)' } },
        { id, type: 'text', text: addr, style: { fontSize: '12px', color: 'rgba(102,102,102,1)' } },
        { id, type: 'text', text: val, style: { fontSize: '20px', fontWeight: 'bold', color: 'rgba(23,168,73,1)' } },
        { id, type: 'text', text: '在线', style: { fontSize: '12px', color: 'rgba(102,102,102,1)' } },
      ] },
    ],
  });
  const SUB_SEC = {
    id: '10:1-list', type: 'list', collapsed: true, renderHint: 'v-for', itemCount: 2,
    items: [mkSubtreeItem('10:2', '甲节点', '地址甲', '3,792'), mkSubtreeItem('10:5', '乙节点', '地址乙', '128')],
  };
  const MAPPING = [
    { figmaNodeId: '10:3', resourceFile: '../resources/images/icon-10-3.png', downloadStatus: 'ok' },
    { figmaNodeId: '10:6', resourceFile: '../resources/images/icon-10-6.png', downloadStatus: 'ok' },
  ];

  it('⭐ 阳性：子树文本提取（px 字号解析）+ icon 归属唯一性反查 + 几何回查', () => {
    const r = detectListLeaf(SUB_SEC, indexFigmaNodes(FIGMA), MAPPING);
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(2);
    expect(r.items[0].texts.map((t) => t.t)).toEqual(['甲节点', '地址甲', '3,792', '在线']);
    expect(r.items[0].texts[0].fs).toBe(16); // '16px' → 16
    expect(r.items[0].texts[2].c).toBe('rgba(23,168,73,1)');
    // icon：vision 子树 id 伪造（=卡 id 查不到映射）⇒ 唯一映射节点回退命中
    expect(r.items[0].icon?.file).toBe('icon-10-3.png');
    expect(r.items[1].icon?.file).toBe('icon-10-6.png');
    // 几何：item.id 真值回查（卡 72 / 间距 20 / padL 20）
    expect(r.cardH).toBe(72);
    expect(r.gaps).toEqual([20]);
    expect(r.padL).toBe(20);
    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    expect(vue).toContain('甲节点');
    expect(vue).toContain('icon-10-3.png');
  });

  it('反向：子树含 decoration 节点 ⇒ 跳过不收（滚动条装饰不进入文案）', () => {
    const sec = {
      ...SUB_SEC,
      items: SUB_SEC.items.map((it) => ({
        ...it,
        children: [...it.children, { id: it.id, role: 'decoration', type: 'decoration', text: '滚动条' }],
      })),
    };
    const r = detectListLeaf(sec, indexFigmaNodes(FIGMA), MAPPING);
    expect(r.ok).toBe(true);
    expect(r.items[0].texts.some((t) => t.t === '滚动条')).toBe(false);
  });

  it('反向：卡 figma 子树内映射节点不唯一 ⇒ icon 留 null 不猜（不阻断接管）', () => {
    const dup = [...MAPPING, { figmaNodeId: '10:2', resourceFile: '../resources/images/bg.png', downloadStatus: 'ok' }];
    // 卡 10:2 子树映射 = 10:3；把 10:2 自己也加映射 ⇒ 该卡子树内 2 个映射节点 ⇒ 歧义
    const r = detectListLeaf(SUB_SEC, indexFigmaNodes(FIGMA), dup);
    expect(r.ok).toBe(true);
    expect(r.items[0].icon).toBeNull(); // 10:2 卡歧义不猜
    expect(r.items[1].icon?.file).toBe('icon-10-6.png'); // 10:5 卡仍唯一
  });

  it('反向：子树零文本 ⇒ emptyItem 不接管', () => {
    const sec = { ...SUB_SEC, items: SUB_SEC.items.map((it) => ({ id: it.id, children: [{ role: 'bg' }] })) };
    const r = detectListLeaf(sec, indexFigmaNodes(FIGMA), MAPPING);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('emptyItem');
  });
});

describe('刀24 — fg-list 渲染产物语法闸（mc-max-1793187227811-1e6d7e4e 实锤）', () => {
  // 病灶：itemLit 逐项缺逗号 ⇒ ListSection.vue script 语法错误 ⇒ 候选快照不推送 ⇒
  // 后续迭代 LLM index.vue 丢 import ⇒ P1-2 孤儿剔除 ⇒ 列表文件整体消失。
  // 用与写盘门禁同一判据（validateVueSfc）锁死，防任何字面量拼接缺陷再生。
  it('⭐ 阳性：LIST_SEC 渲染产物过 validateVueSfc（写盘门禁同判据）', async () => {
    const r = detectListLeaf(LIST_SEC, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    const vue = renderFoldedGridLeafVue(r, 'c-demo');
    const v = validateVueSfc(vue, 'ListSection.vue');
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it('⭐ 阳性：子树轨（刀23 形态）渲染产物同过语法闸', async () => {
    const subtreeSec = {
      id: '10:1-list', type: 'list', collapsed: true, renderHint: 'v-for', itemCount: 2,
      items: ['10:2', '10:5'].map((id, k) => ({
        id, layout: 'horizontal', repeatedFill: '#a6ceff',
        children: [
          { id: id + '-ic', role: 'icon', style: { width: '40px', height: '40px' } },
          { id, role: '常驻', children: [
            { id, type: 'text', text: k === 0 ? '甲节点' : '乙节点', style: { fontSize: '16px', fontWeight: 'bold', color: '#000' } },
            { id, type: 'text', text: '地址', style: { fontSize: '12px', color: '#666' } },
          ] },
        ],
      })),
    };
    const r = detectListLeaf(subtreeSec, indexFigmaNodes(FIGMA), [
      { figmaNodeId: '10:3', resourceFile: '../resources/images/icon-10-3.png', downloadStatus: 'ok' },
      { figmaNodeId: '10:6', resourceFile: '../resources/images/icon-10-6.png', downloadStatus: 'ok' },
    ]);
    expect(r.ok).toBe(true);
    const v = validateVueSfc(renderFoldedGridLeafVue(r, 'c-demo'), 'ListSection.vue');
    expect(v.errors).toEqual([]);
  });
});
