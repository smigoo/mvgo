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
import { extractRichBodyItems } from '../repeated-section-collapser.js';
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

describe('刀26 — 富卡 stats text 形态（mc-max-1793191766917-329a3781 实锤）', () => {
  // 病灶：vision 富卡第三种 stat 形态 `stats:[{label:'在线', text:'3,792', styles}]`
  // （值字段是 text 非 value）⇒ 富卡归一 stats=0 ⇒ 「更全者胜出」比分 2 < 子树
  // 扁平轨 6 ⇒ 富卡（带样式/icon/fill/结构）被劣轨顶掉，产物退化成 6 条纵堆文本。
  const richTextStat = (name, addr, online, offline) => ({
    layout: 'horizontal', repeatedFill: 'rgba(255,255,255,0.43)',
    icon: { placeholder: 'ic', position: 'left', resourceFile: '../resources/images/icon-5808.png' },
    content: { layout: 'vertical', position: 'right', elements: [
      { type: 'label', text: name, position: 'top', styles: { fontSize: 16, color: '#333', fontWeight: 'bold' } },
      { type: 'label', text: addr, position: 'bottom', styles: { fontSize: 12, color: '#8890a0' } },
    ] },
    stats: [
      { type: 'value', label: '在线', text: online, styles: { fontSize: 18, color: '#2ecc71', fontWeight: 'bold' } },
      { type: 'dot', label: '离线', text: offline, styles: { fontSize: 12, color: '#e74c3c' } },
    ],
  });
  const mkTree = (id, y, name, addr, online, offline) => ({
    id, name: 'card', layout: 'vertical',
    absoluteBoundingBox: { x: 0, y, width: 470, height: 72 },
    // 子树扁平轨：6 条 TEXT（名称/数值1/数值2/地址/在线/离线）——条数多于富卡 texts
    children: [
      { id: `${id}-t1`, type: 'TEXT', characters: name },
      { id: `${id}-t2`, type: 'TEXT', characters: online },
      { id: `${id}-t3`, type: 'TEXT', characters: offline },
      { id: `${id}-t4`, type: 'TEXT', characters: addr },
      { id: `${id}-t5`, type: 'TEXT', characters: '在线' },
      { id: `${id}-t6`, type: 'TEXT', characters: '离线' },
    ],
    body: { items: [richTextStat(name, addr, online, offline)] },
  });
  const SEC26 = {
    id: '48:5798-list', type: 'list', collapsed: true, renderHint: 'v-for', itemCount: 2,
    items: [
      mkTree('48:5798', 0, '甲节点', '地址甲', '3,792', '28'),
      mkTree('48:5814', 92, '乙节点', '地址乙', '2,138', '12'),
    ],
  };

  it('⭐ 阳性：stats text 形态富卡 ⇒ 结构轨胜出（stats 2 带 label，texts 2 带样式，icon/fill 齐）', () => {
    const r = detectListLeaf(SEC26, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    expect(r.items[0].stats.map((s) => [s.l, s.v])).toEqual([['在线', '3,792'], ['离线', '28']]);
    expect(r.items[0].stats[0]).toMatchObject({ vc: '#2ecc71', vfs: 18, vfw: 'bold' });
    expect(r.items[0].texts.map((t) => t.t)).toEqual(['甲节点', '地址甲']);
    expect(r.items[0].texts[0]).toMatchObject({ fs: 16, fw: 'bold' });
    expect(r.items[0].icon.file).toBe('icon-5808.png');
    expect(r.items[0].fill).toBe('rgba(255,255,255,0.43)');
  });

  it('反向：stat 无 value 且无 text ⇒ 跳过不编造（空 stat 不进产物）', () => {
    const sec = {
      ...SEC26,
      items: SEC26.items.map((it) => ({
        ...it,
        children: [],
        body: { items: [{ ...it.body.items[0], stats: [{ label: '在线', styles: {} }] }] },
      })),
    };
    const r = detectListLeaf(sec, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    expect(r.items[0].stats).toEqual([]);
  });
});

describe('刀28a — children 角色结构轨（mc-max-1793252160457-54ae6ee3 实锤）', () => {
  // vision 又一形态：卡内分区带 role 标记（icon 自带 resourceFile、content 文本对、
  // stat-value 的 value+label 子节点）。旧实现 collectSubtreeTexts 全部拍平 ⇒
  // texts=6 纵堆（统计值/标签混入）、stats=0、icon=null ⇒ 卡内布局全失效
  // （6 行文本堆进 72px 卡高溢出叠字）。
  const mkRoleItem = (id, name, addr, online, offline) => ({
    id, name, role: 'stat-card', layout: 'horizontal', repeatedFill: '#a6ceff',
    children: [
      { id: `${id}-ic`, role: 'icon', resourceFile: '../resources/images/icon-5808.png', width: 40, height: 40 },
      { id: `${id}-ct`, role: 'content', children: [
        { id: `${id}-t1`, role: 'label', text: name, styles: { fontSize: 16, fontWeight: 'bold', color: 'rgba(0,0,0,1)' } },
        { id: `${id}-t2`, role: 'label', text: addr, styles: { fontSize: 12, color: 'rgba(102,102,102,1)' } },
      ] },
      { id: `${id}-s1`, role: 'stat-value', children: [
        { id: `${id}-v1`, role: 'value', text: online, styles: { fontSize: 20, fontWeight: 'bold', color: 'rgba(0,180,42,1)' } },
        { id: `${id}-l1`, role: 'label', text: '在线', styles: { fontSize: 12, color: 'rgba(102,102,102,1)' } },
      ] },
      { id: `${id}-s2`, role: 'stat-value', children: [
        { id: `${id}-v2`, role: 'value', text: offline, styles: { fontSize: 20, fontWeight: 'bold', color: 'rgba(255,77,79,1)' } },
        { id: `${id}-l2`, role: 'label', text: '离线', styles: { fontSize: 12, color: 'rgba(102,102,102,1)' } },
      ] },
    ],
  });
  const SEC28 = {
    id: '10:1-list', type: 'list', collapsed: true, renderHint: 'v-for', itemCount: 2,
    items: [
      mkRoleItem('10:2', '江苏联网节点', '江苏省南京市建邺区江东中路', '3,792', '28'),
      mkRoleItem('10:5', '湖南交通厅节点', '湖南省长沙市芙蓉区五一大道', '1,665', '15'),
    ],
  };

  it('⭐ 阳性：role 分区提取——texts 仅 content 对、stats 双列带样式、icon 读子树自带资源', () => {
    const r = detectListLeaf(SEC28, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    // texts 只含 content 子树两条（统计值/标签不得混入）
    expect(r.items[0].texts.map((t) => t.t)).toEqual(['江苏联网节点', '江苏省南京市建邺区江东中路']);
    expect(r.items[0].texts[0]).toMatchObject({ fs: 16, fw: 'bold', c: 'rgba(0,0,0,1)' });
    // stats 双列：value+label 带各自样式真值
    expect(r.items[0].stats.map((s) => [s.l, s.v])).toEqual([['在线', '3,792'], ['离线', '28']]);
    expect(r.items[0].stats[0]).toMatchObject({ vc: 'rgba(0,180,42,1)', vfs: 20, vfw: 'bold', lc: 'rgba(102,102,102,1)', lfs: 12 });
    // icon：子树 icon 节点自带 resourceFile/尺寸，不经 resourceMapping
    expect(r.items[0].icon).toMatchObject({ file: 'icon-5808.png', w: 40, h: 40 });
    expect(r.items[0].fill).toBe('#a6ceff');
    expect(r.items[1].texts.map((t) => t.t)).toEqual(['湖南交通厅节点', '湖南省长沙市芙蓉区五一大道']);
  });

  it('反向：stat-value 缺 value 子节点 ⇒ 该 stat 跳过不编造', () => {
    const sec = {
      ...SEC28,
      items: SEC28.items.map((it) => ({
        ...it,
        children: it.children.map((c) =>
          c.role === 'stat-value' ? { ...c, children: (c.children || []).filter((d) => d.role !== 'value') } : c,
        ),
      })),
    };
    const r = detectListLeaf(sec, indexFigmaNodes(FIGMA));
    expect(r.ok).toBe(true);
    expect(r.items[0].stats).toEqual([]);
    expect(r.items[0].texts).toHaveLength(2);
  });

  it('反向：icon 子树无 resourceFile ⇒ icon null（缺事实不猜，不冒用 mapping 外资源）', () => {
    const sec = {
      ...SEC28,
      items: SEC28.items.map((it) => ({
        ...it,
        children: it.children.map((c) => (c.role === 'icon' ? { ...c, resourceFile: undefined } : c)),
      })),
    };
    const r = detectListLeaf(sec, indexFigmaNodes(FIGMA), []);
    expect(r.ok).toBe(true);
    expect(r.items[0].icon).toBeNull();
  });
});

describe('刀29a — extractRichBodyItems children 轨须有卡结构签名（mc-max-1793255115028-7ec263c9 实锤）', () => {
  // 病灶：vision 把「底部统计区」(role=layout, children=2 条 label) 混进 body.items，
  // 旧判据 Array.isArray(it.children) 太宽 ⇒ 判成富卡 ⇒ richItems=7 与 6 卡异构 ⇒
  // detectListLeaf heteroTextCount 拒绝 ⇒ 整列退回 LLM 手写（卡2-6 空心）。
  const card = (id) => ({
    id, role: 'stat-card', layout: 'horizontal', repeatedFill: '#fff',
    children: [
      { id: `${id}-ic`, role: 'icon', resourceFile: '../resources/images/ic.png', width: 40, height: 40 },
      { id: `${id}-ct`, role: 'content', children: [
        { id: `${id}-t1`, role: 'label', text: '名称', styles: { fontSize: 16 } },
        { id: `${id}-t2`, role: 'label', text: '地址', styles: { fontSize: 12 } },
      ] },
    ],
  });
  const footerStrip = {
    id: '48:5876', role: 'layout', layout: 'horizontal',
    children: [
      { id: '48:5876-a', role: 'label', text: '共 6 个节点', styles: { fontSize: 12 } },
      { id: '48:5876-b', role: 'label', text: '接入设备 10810', styles: { fontSize: 12 } },
    ],
  };
  const scrollbar = { id: '48:5890', role: 'decoration', layout: 'horizontal', styles: { width: '6px' } };

  it('⭐ 阳性：6 卡 + layout 杂项 + 装饰 ⇒ 只留 6 张卡（杂项/装饰剔出富卡子集）', () => {
    const sec = { body: { items: [card('48:5798'), card('48:5813'), card('48:5828'), card('48:5843'), card('48:5858'), card('48:5873'), footerStrip, scrollbar] } };
    const rich = extractRichBodyItems(sec);
    expect(rich).toHaveLength(6);
    expect(rich.map((r) => r.id)).toEqual(['48:5798', '48:5813', '48:5828', '48:5843', '48:5858', '48:5873']);
  });

  it('反向：b2086a9c 子树形态（children 含 role=icon，无 resourceFile）⇒ 仍算富卡', () => {
    const subtreeCard = (id) => ({
      id, role: 'stat-card', layout: 'horizontal', repeatedFill: '#fff',
      children: [
        { id: `${id}-bg`, role: 'bg', style: { width: '459px' } },
        { id: `${id}-ic`, role: 'icon', style: { width: '40px', height: '40px' } },
        { id: `${id}-tx`, role: '常驻', children: [
          { id: `${id}-t1`, type: 'text', text: '名称', style: { fontSize: '16px' } },
          { id: `${id}-t2`, type: 'text', text: '地址', style: { fontSize: '12px' } },
        ] },
      ],
    });
    const sec = { body: { items: [subtreeCard('10:2'), subtreeCard('10:5')] } };
    const rich = extractRichBodyItems(sec);
    expect(rich).toHaveLength(2);
  });

  it('反向：全是纯 label 组（无卡结构签名）⇒ null（整轨漏判退回 LLM，不硬折叠）', () => {
    const sec = { body: { items: [footerStrip, { ...footerStrip, id: '48:5891' }] } };
    expect(extractRichBodyItems(sec)).toBeNull();
  });
});

/**
 * 🛡️ 刀31（2026-10-29，mc-max-1793258602028-6eafb2f7 实锤）：
 * 同一设计（48:5796 部署节点概览）vision 第三形态——锚点错挂 bg rect、角色词异构
 * （图标/label/stat + value/label 中文词）、id 错位。旧链：F1 语义树 children 形态
 * 在折叠时死亡 ⇒ items 全来自 figma 递归（无 role）⇒ 拍平轨 texts=6 纵堆、
 * stats/icon/fill 全 null ⇒ 36 行文本大乱。三修：31a 折叠携带宿主语义树、
 * 31b 结构比分（stats 权重）选轨、31c 角色词表归一 + fill 最大面积真值回查。
 */
describe('刀31：异构角色词 + 语义树携带 + fill 真值回查（6eafb2f7 形态）', () => {
  // vision 语义树（children 形态，宿主 body.children 随折叠 graft 成 leaf.body.items）
  const visionCard = (name: string, addr: string, online: string, offline: string) => ({
    id: '48:5798',
    role: 'stat-card',
    children: [
      { id: '48:5801', role: '图标', resourceFile: 'resources/images/icon-5808.png', width: 40, height: 40 },
      { id: '48:5802', role: 'label', children: [
        { id: '48:5803', role: 'text', text: name },
        { id: '48:5804', role: 'text', text: addr },
      ] },
      { id: '48:5805', role: 'stat', children: [
        { id: '48:5806', role: 'value', text: online },
        { id: '48:5807', role: 'label', text: '在线' },
      ] },
      { id: '48:5808', role: 'stat', children: [
        { id: '48:5809', role: 'value', text: offline },
        { id: '48:5810', role: 'label', text: '离线' },
      ] },
    ],
  });
  const mkLeaf = () => ({
    id: '48:5798-list',
    collapsed: true,
    renderHint: 'v-for',
    // figma 折叠轨：无 role 的树节点（拍平轨 texts=6 非空——旧口径顶掉角色轨）
    items: [1, 2].map((n) => ({
      id: `48:5798-${n}`,
      figmaNodeId: `48:5798-${n}`,
      absoluteBoundingBox: { x: 0, y: (n - 1) * 92, width: 470, height: 72 },
      children: [
        { type: 'TEXT', text: `节点${n}` },
        { type: 'TEXT', text: `${1000 + n}` },
        { type: 'TEXT', text: `${n}` },
        { type: 'TEXT', text: `地址${n}` },
        { type: 'TEXT', text: '在线' },
        { type: 'TEXT', text: '离线' },
      ],
    })),
    body: {
      // 宿主 vision 语义树（buildCollapsedSection graft 为 body.items，与真实链同构）
      items: [visionCard('节点1', '地址1', '1,001', '1'), visionCard('节点2', '地址2', '1,002', '2')],
    },
  });

  it('阳性：角色轨（中文词）结构比分胜过 figma 拍平轨 ⇒ texts=2/stats=2/icon 齐', () => {
    const res = detectListLeaf(mkLeaf() as any, null, []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0].texts.map((t: any) => t.t)).toEqual(['节点1', '地址1']);
    expect(res.items[0].stats.map((s: any) => `${s.v}/${s.l}`)).toEqual(['1,001/在线', '1/离线']);
    expect(res.items[0].icon?.file).toBe('icon-5808.png');
  });

  it('反向：摘掉角色轨比分（拍平轨恒留）⇒ texts=6 stats=0 纵堆形态回归', () => {
    const leaf = mkLeaf() as any;
    delete leaf.body; // 无 vision 语义树 ⇒ 只剩拍平轨
    const res = detectListLeaf(leaf, null, []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0].texts.length).toBe(6);
    expect(res.items[0].stats.length).toBe(0);
    expect(res.items[0].icon).toBeNull();
  });

  it('阳性：fill 真值回查——本体无 fill ⇒ 子树最大面积 SOLID（首卡高亮/卡底）', () => {
    const figmaRoot = {
      id: '48:5796', type: 'GROUP',
      children: [
        { id: '48:5798-1', type: 'GROUP', fills: [], children: [
          { id: '48:5799', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 72 },
            fills: [{ type: 'SOLID', visible: true, color: { r: 166 / 255, g: 206 / 255, b: 1, a: 1 } }] },
          { id: '48:5800', type: 'RECTANGLE', absoluteBoundingBox: { x: 10, y: 10, width: 8, height: 8 },
            fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 0, b: 0, a: 1 } }] },
        ] },
        { id: '48:5798-2', type: 'GROUP', fills: [], children: [
          { id: '48:5802a', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 92, width: 470, height: 72 },
            fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 0.43 } }] },
        ] },
      ],
    };
    const idx = indexFigmaNodes(figmaRoot as any);
    const res = detectListLeaf(mkLeaf() as any, idx, []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0].fill).toBe('rgba(166,206,255,1)'); // 最大面积，小红块 8×8 被忽略
    expect(res.items[1].fill).toBe('rgba(255,255,255,0.43)');
  });
});

describe('刀33：卡盒真值回收（c-aiot-dpjh-bsjd-fg-list-485798list-item 实锤）', () => {
  // 病灶（用户报障「背景错误 + marginTop 哪来的」）：vision item 锚点 = 卡内**内层
  //   内容组**（48:5801，430×41），带 repeatedFill 自绘底的**卡盒**是它的祖先
  //   （48:5798 GROUP，470×72；自绘底 48:5799 RECT 470×72 / cr=6，SOLID）。
  //   卡内另有 459×29 图条（48:5800，映射 recommendedUsage=backgroundBlock）与图标。
  //   卡步长 92 ⇒ 真值 卡高 72 / 间距 20（旧口径取内层组 ⇒ 误得 41 / 51）。
  // 全部字段值逐字取自该 run 的 figma-node-data.json / resource-dom-mapping.json。
  const PITCH = 92;
  const N = 6;
  const CARD_BASE = 5798; // 卡 id 步长 15（真实样本 5798/5813/5828/5843/5858/5873）
  const FILL_RGB = { r: 0.651292085647583, g: 0.8067402839660645, b: 1 }; // → #a6ceff
  const WHITE_OPACITY = 0.4300000071525574; // → rgba(255,255,255,0.43)

  /** 造一张卡：卡盒 GROUP 本体无 fills（自绘底在其子 RECT 上，与真实样本同构）。 */
  const mkCard = (i: number, h = 72, fill: 'a6ceff' | 'white43' | null = null) => {
    const b = CARD_BASE + i * 15;
    const y = i * PITCH;
    const kids: any[] = [];
    if (fill === 'a6ceff') {
      kids.push({
        id: `48:${b + 1}`, type: 'RECTANGLE', cornerRadius: 6,
        absoluteBoundingBox: { x: 0, y, width: 470, height: h },
        fills: [{ type: 'SOLID', visible: true, color: { ...FILL_RGB, a: 1 } }],
      });
    } else if (fill === 'white43') {
      kids.push({
        id: `48:${b + 1}`, type: 'RECTANGLE', cornerRadius: 6,
        absoluteBoundingBox: { x: 0, y, width: 470, height: h },
        fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 }, opacity: WHITE_OPACITY }],
      });
    }
    kids.push({
      id: `48:${b + 2}`, type: 'RECTANGLE',
      absoluteBoundingBox: { x: 6, y, width: 459, height: 29 },
      fills: [{ type: 'IMAGE', visible: true }],
    });
    kids.push({
      id: `48:${b + 3}`, type: 'GROUP',
      absoluteBoundingBox: { x: 20, y: y + 16, width: 430, height: 41 },
      children: [
        { id: `48:${b + 10}`, type: 'GROUP',
          absoluteBoundingBox: { x: 20, y: y + 17, width: 40, height: 40 }, fills: [] },
      ],
    });
    return { id: `48:${b}`, type: 'GROUP', fills: [], absoluteBoundingBox: { x: 0, y, width: 470, height: h }, children: kids };
  };

  const FIGMA_CARD = {
    id: '48:5796', type: 'GROUP',
    absoluteBoundingBox: { x: 0, y: 0, width: 470, height: N * PITCH },
    children: Array.from({ length: N }, (_, i) => mkCard(i, 72, i === 0 ? 'a6ceff' : 'white43')),
  };

  const mkItems = (n = N, fill = (i: number) => (i === 0 ? '#a6ceff' : 'rgba(255,255,255,0.43)')) =>
    Array.from({ length: n }, (_, i) => {
      const id = `48:${CARD_BASE + i * 15 + 3}`; // 内层内容组 = vision item 锚点
      return mkItem(id, id, `节点${i + 1}`, fill(i));
    });

  const SEC = {
    id: '48:5798-list', type: 'list', collapsed: true, renderHint: 'v-for', itemCount: N,
    items: mkItems(),
  };

  /** 真实映射两道：图条（背景用途）+ 图标（imgSrc ⇒ 必须被排除）。 */
  const MAP = [
    {
      figmaNodeId: '48:5800', resourceFile: '../resources/images/image_313-5800.png',
      recommendedUsage: 'backgroundBlock', bgRole: 'sub-state', previewAnalysisRole: 'bg',
      assignedVarName: 'bg1', downloadStatus: 'success',
      figmaBox: { x: 6, y: 0, width: 459, height: 29 },
      parentBox: { x: 0, y: 0, width: 470, height: 72 },
    },
    {
      figmaNodeId: '48:5808', resourceFile: '../resources/images/icon-5808.png',
      recommendedUsage: 'imgSrc', previewAnalysisRole: 'icon',
      assignedVarName: 'icon4', downloadStatus: 'success',
      figmaBox: { x: 20, y: 17, width: 40, height: 40 },
      parentBox: { x: 20, y: 16, width: 430, height: 41 },
    },
  ];

  it('⭐ 阳性：内层组锚点 ⇒ 上溯到自绘底卡盒（72 / 20 / cr6 / 图条四件套）', () => {
    const res = detectListLeaf(SEC as any, indexFigmaNodes(FIGMA_CARD as any), MAP) as any;
    expect(res.ok).toBe(true);
    // 🔴 自证性：geoReady 要求**各行卡盒尺寸一致** ⇒ 若只有首卡命中（其余回落行盒
    //   430×41），cardH 必为 null。故 cardH=72 + gaps 五连 20 即证明**六张卡全部**
    //   命中自绘底卡盒（含卡 1–5 的 fill.opacity 0.43 alpha 路径）。
    expect(res.cardH).toBe(72);
    expect(res.gaps).toEqual([20, 20, 20, 20, 20]);
    expect(res.padL).toBe(20);
    expect(res.radius).toBe(6);
    expect(res.items[0].fill).toBe('#a6ceff');
    expect(res.items[1].fill).toBe('rgba(255,255,255,0.43)');
    expect(res.itemBg.varName).toBe('bg1');
    expect(res.itemBg.file).toBe('image_313-5800.png');
    expect(res.itemBg.style.size).toBe('459px 29px');
    expect(res.itemBg.style.position).toBe('6px 0px');
    expect(res.itemBg.style.repeat).toBe('no-repeat');
  });

  it('⭐ 阳性：渲染产物 —— 圆角/图条四件套进静态段，URL 只走 :style 绑定', () => {
    const res = detectListLeaf(SEC as any, indexFigmaNodes(FIGMA_CARD as any), MAP) as any;
    const vue = renderFoldedGridLeafVue(res, 'c-demo');
    expect(vue).toContain("import bg1 from '../../resources/images/image_313-5800.png'");
    expect(vue).toContain('border-radius:6px;');
    expect(vue).toContain('background-size:459px 29px;background-repeat:no-repeat;background-position:6px 0px;');
    expect(vue).toContain("backgroundImage: 'url(' + bg1 + ')'");
    // 🔴 卡底必须走 backgroundColor **长写**：`:style` 里的 `background` 简写会把静态段
    //   的 background-size/position/repeat 一并重置 ⇒ 图条尺寸定位全丢（593cf7f 同族）。
    expect(vue).toContain('backgroundColor: it.fill || undefined');
    expect(vue).not.toContain('background: it.fill');
    expect(vue).toContain("height: '72px'");
    const v = validateVueSfc(vue, 'ListSection.vue');
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it('反向：自绘底只在**列表容器**层（覆盖整列）⇒ 拒绝误锚，回落行盒', () => {
    const FIGMA_CONTAINER_FILL = {
      id: '48:5796', type: 'GROUP',
      absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 2 * PITCH },
      children: [
        { id: '48:5797', type: 'RECTANGLE',
          absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 2 * PITCH },
          fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }] },
        mkCard(0, 72, null), mkCard(1, 72, null),
      ],
    };
    const sec = { ...SEC, itemCount: 2, items: mkItems(2, () => '#ffffff') };
    const res = detectListLeaf(sec as any, indexFigmaNodes(FIGMA_CONTAINER_FILL as any), []) as any;
    expect(res.ok).toBe(true);
    // 命中的盒包含其它行 ⇒ 是列表容器而非卡盒 ⇒ 不可证 ⇒ 回落行盒（旧口径不改）
    expect(res.cardH).toBe(41);
    expect(res.gaps).toEqual([51]);
    expect(res.radius).toBeNull();
    expect(res.itemBg).toBeNull();
  });

  it('反向：行间卡盒尺寸不一致 ⇒ 不下发几何（自然流，绝不猜）', () => {
    const FIGMA_HETERO = {
      id: '48:5796', type: 'GROUP',
      absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 2 * PITCH },
      children: [mkCard(0, 72, 'white43'), mkCard(1, 60, 'white43')],
    };
    const sec = { ...SEC, itemCount: 2, items: mkItems(2, () => 'rgba(255,255,255,0.43)') };
    const res = detectListLeaf(sec as any, indexFigmaNodes(FIGMA_HETERO as any), []) as any;
    expect(res.ok).toBe(true);
    expect(res.cardH).toBeNull();
    expect(res.gaps).toBeNull();
    expect(res.radius).toBeNull();
    expect(res.itemBg).toBeNull();
  });

  it('反向：卡盒层级无可解释 fill 的祖先 ⇒ 回落行盒且零编造圆角/图条', () => {
    // 刀20b 基线 figma（卡本体无 SOLID fill）⇒ 无从证明错位 ⇒ 旧口径 rowBox
    const res = detectListLeaf(LIST_SEC as any, indexFigmaNodes(FIGMA as any), []) as any;
    expect(res.cardH).toBe(72);
    expect(res.radius).toBeNull();
    expect(res.itemBg).toBeNull();
    const vue = renderFoldedGridLeafVue(res, 'c-demo');
    expect(vue).not.toContain('border-radius');
    expect(vue).not.toContain('backgroundImage');
  });
});
