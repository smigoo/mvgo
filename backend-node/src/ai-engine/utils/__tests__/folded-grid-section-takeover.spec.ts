/**
 * 🛡️ 刀 53 单测（2026-10-22）：同构「标题行+折叠网格」叶段确定性接管。
 *
 * 阳性对照来自 mc-1792654910735-837fd806（合作厂商弹窗）真实 Figma 形态：
 *   - 标题行：icon 16×16 最左 + TEXT 右侧同行，gap 8；
 *   - 网格行：126×30 r6 卡、列距 20、行距 20、每卡 2 TEXT（名称 #333 + 数值着色）。
 * 阴性对照逐条对应 fail-open 判据（icon 未映射 / 文本样式缺 / 卡缺 fill /
 * item id 解析不到 / 单列）。
 */
import {
  collectFoldedGridTakeover,
  detectHeaderRowLeaf,
  detectGridLeaf,
  detectTextLeaf,
  renderFoldedGridLeafVue,
  stripFgTakeoverRules,
} from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';

const solid = (hex, opacity) => {
  const n = parseInt(hex.slice(1), 16);
  return {
    type: 'SOLID',
    visible: true,
    opacity: opacity === undefined ? 1 : opacity,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 },
  };
};

const text = (id, chars, x, y, w, h, hex, fs, fw) => ({
  id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: { x, y, width: w, height: h },
  fills: [solid(hex)],
  style: { fontSize: fs, fontWeight: fw },
});

const card = (id, x, y, name, value, valueHex, bgHex) => ({
  id,
  type: 'FRAME',
  name: `card-${id}`,
  absoluteBoundingBox: { x, y, width: 126, height: 30 },
  fills: [solid(bgHex)],
  cornerRadius: 6,
  children: [
    text(`${id}-n`, name, x + 16, y, 56, 30, '#333333', 14, 400),
    text(`${id}-v`, value, x + 16 + 56 + 4, y, 22, 30, valueHex, 14, 400),
  ],
});

/** 一行 4 卡（x 步长 146 = 126 + 20）。 */
const row = (id, x, y, bgHex, names, values, valueHex) => ({
  id,
  type: 'FRAME',
  name: `row-${id}`,
  absoluteBoundingBox: { x, y, width: 564, height: 30 },
  children: names.map((n, i) => card(`${id}-c${i}`, x + i * 146, y, n, values[i], valueHex, bgHex)),
});

const FIGMA_DOC = {
  id: '38:3137',
  name: 'Group 2136638432',
  children: [
    {
      id: '38:3138',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 0, width: 604, height: 161 },
      fills: [solid('#e2d084')],
      cornerRadius: 12,
    },
    text('38:3139', '战略合作厂商', 44, 25, 96, 16, '#333333', 16, 500),
    row('38:3140', 20, 57, '#fffdf1', ['华为技术', '中兴通讯', '海康威视', '新华三集团'], ['8台', '8台', '13台', '1台'], '#b9a000'),
    row('38:3153', 20, 107, '#fffdf1', ['浪潮信息', '天地伟业'], ['0台', '0台'], '#679bbe'),
    {
      id: '38:3160',
      type: 'FRAME',
      name: 'icon-战略厂商',
      absoluteBoundingBox: { x: 20, y: 25, width: 16, height: 16 },
      fills: [solid('#ffffff')],
      children: [{ id: '38:3161', type: 'VECTOR', absoluteBoundingBox: { x: 20, y: 25, width: 16, height: 16 }, fills: [solid('#006efe')] }],
    },
  ],
};

// 第二段（优质厂商）：独立兄弟 Group —— 与第一段同构（真值形态）。
// 内含：icon 38:3164 + TEXT 38:3166 + 折叠段 38:3167-list（三行 × 4 卡）。
const SEG2 = {
  id: '38:3162',
  name: 'Group 2136638433',
  children: [
    {
      id: '38:3163',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 206, width: 604, height: 212 },
      fills: [solid('#d8ffe9')],
      cornerRadius: 12,
    },
    text('38:3166', '优质厂商', 44, 231, 64, 16, '#333333', 16, 500),
    {
      id: '38:3164',
      type: 'FRAME',
      name: 'icon-优质厂商',
      absoluteBoundingBox: { x: 20, y: 231, width: 16, height: 16 },
      fills: [solid('#ffffff')],
    },
    {
      id: '38:3167-list',
      type: 'FRAME',
      name: 'Frame 2136639905',
      absoluteBoundingBox: { x: 20, y: 263, width: 564, height: 130 },
      items: [],
    },
  ],
};
FIGMA_DOC.children.push(SEG2);

// 三行 × 4 卡（y = 263 / 313 / 363）
const ROW2_CARDS = [
  ['38:3167', 263, '#f6fff7', ['大华股份', '宇视科技', '西门子', '施耐德电气'], ['8台', '7台', '4台', '3台']],
  ['38:3180', 313, '#f6fff7', ['ABB中国', '中科曙光', '深信服科技', '奇安信集团'], ['0台', '0台', '0台', '0台']],
  ['38:3193', 363, '#f6fff7', ['启明星辰', '绿盟科技', '安恒信息', '天融信'], ['0台', '0台', '0台', '0台']],
];
for (const [rowId, y, bg, names, values] of ROW2_CARDS) {
  SEG2.children.push(row(rowId, 20, y, bg, names, values, '#00ac2e'));
}
(SEG2.children.find((c) => c.id === '38:3167-list').items = ROW2_CARDS.flatMap(
  ([rowId]) =>
    SEG2.children.find((c) => c.id === rowId).children.map((c) => ({
      id: c.id,
      absoluteBoundingBox: c.absoluteBoundingBox,
    })),
));

const ICON_MAPPING = [
  {
    figmaNodeId: '38:3160',
    resourceFile: '../resources/images/icon-战略厂商-3160.png',
    assignedVarName: 'icon4',
    ownerSectionId: '38:3137',
    downloadStatus: 'success',
  },
];

const TREE = [
  {
    id: 'root',
    isLayoutContainer: true,
    children: [
      { id: '38:3137-tail-text', sourceNodeIds: ['38:3139', '38:3160'] },
      { id: '38:3140', layout: 'grid' },
      { id: '38:3153', layout: 'grid' },
      {
        id: '38:3167-list',
        items: FIGMA_DOC.children
          .find((c) => c.id === '38:3162')
          .children.find((c) => c.id === '38:3167-list').items,
      },
    ],
  },
];

describe('刀 53 detectHeaderRowLeaf', () => {
  const idx = indexFigmaNodes(FIGMA_DOC);
  const sec = { id: '38:3137-tail-text', sourceNodeIds: ['38:3139', '38:3160'] };

  it('阳性：合成 tail-text 叶 → 标题真值 + icon 资源 + 左对齐几何', () => {
    const r = detectHeaderRowLeaf(sec, idx, ICON_MAPPING);
    expect(r.ok).toBe(true);
    expect(r.title).toBe('战略合作厂商');
    expect(r.iconVar).toBe('icon4');
    expect(r.iconFile).toBe('icon-战略厂商-3160.png');
    expect(r.gap).toBe(8);
    expect(r.height).toBe(16);
    expect(r.titleColor).toBe('rgba(51,51,51,1)');
    expect(r.fontSize).toBe(16);
    expect(r.fontWeight).toBe(500);
  });

  it('阴性：icon 不在资源映射 ⇒ fail-open（不臆造占位）', () => {
    const r = detectHeaderRowLeaf(sec, idx, []);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('iconNotMappedOrNotLeftOfTextOnSameRow');
  });

  it('阴性：icon 下载失败 ⇒ fail-open', () => {
    const bad = [{ ...ICON_MAPPING[0], downloadStatus: 'failed' }];
    expect(detectHeaderRowLeaf(sec, idx, bad).ok).toBe(false);
  });

  it('阴性：文本缺 fontWeight ⇒ textStyleIncomplete', () => {
    const doc2 = JSON.parse(JSON.stringify(FIGMA_DOC));
    delete doc2.children.find((c) => c.id === '38:3139').style.fontWeight;
    const r = detectHeaderRowLeaf(sec, indexFigmaNodes(doc2), ICON_MAPPING);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('textStyleIncomplete');
  });

  it('阴性：两个 TEXT（非标题行形态）⇒ fail-open', () => {
    const doc2 = JSON.parse(JSON.stringify(FIGMA_DOC));
    doc2.children.push(text('38:9999', '多余文本', 200, 25, 40, 16, '#333333', 14, 400));
    const r = detectHeaderRowLeaf(sec, indexFigmaNodes(doc2), ICON_MAPPING);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('texts=2');
  });
});

describe('刀 53 detectGridLeaf', () => {
  const idx = indexFigmaNodes(FIGMA_DOC);

  it('阳性（路径 B）：整行段无 items → figma 兜底几何 + 卡内容全量真值', () => {
    const r = detectGridLeaf({ id: '38:3140', layout: 'grid' }, idx);
    expect(r.ok).toBe(true);
    expect(r.cols).toBe(4);
    expect(r.rows).toBe(1);
    expect(r.cardW).toBe(126);
    expect(r.cardH).toBe(30);
    expect(r.colGap).toBe(20);
    expect(r.items).toHaveLength(4);
    expect(r.items[0].bg).toBe('rgba(255,253,241,1)');
    expect(r.items[0].r).toBe(6);
    expect(r.items[0].pad).toBe(16);
    expect(r.items[0].gap).toBe(4);
    expect(r.items[0].runs.map((x) => x.text)).toEqual(['华为技术', '8台']);
    expect(r.items[0].runs[1].color).toBe('rgba(185,160,0,1)');
  });

  it('阳性（路径 A）：折叠段 items[].id → 12 卡、4 列 3 行、rowGap 20', () => {
    // 真实折叠段 plan 叶自带 items（repeated-section-collapser 产物）
    const listLeaf = { id: '38:3167-list', items: FIGMA_DOC.children.find((c) => c.id === '38:3162').children.find((c) => c.id === '38:3167-list').items };
    const r = detectGridLeaf(listLeaf, idx);
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(12);
    expect(r.cols).toBe(4);
    expect(r.rows).toBe(3);
    expect(r.rowGap).toBe(20);
  });

  it('阴性：item id 解析不到 ⇒ 部分内联防线（整体 fail-open）', () => {
    const sec = {
      id: '38:3167-list',
      items: [
        { id: '不存在A', absoluteBoundingBox: { x: 20, y: 263, width: 126, height: 30 } },
        { id: '不存在B', absoluteBoundingBox: { x: 146, y: 263, width: 126, height: 30 } },
      ],
    };
    const r = detectGridLeaf(sec, idx);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('cardNodesNotFullyResolvable');
  });

  it('阴性：卡缺 fill ⇒ fail-open', () => {
    const doc2 = JSON.parse(JSON.stringify(FIGMA_DOC));
    delete doc2.children.find((c) => c.id === '38:3140').children[0].fills;
    const r = detectGridLeaf({ id: '38:3140', layout: 'grid' }, indexFigmaNodes(doc2));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('cardTruthMissing');
  });

  it('阴性：单列（xs.length<2）⇒ noGridContract', () => {
    const doc2 = JSON.parse(JSON.stringify(FIGMA_DOC));
    const rowNode = doc2.children.find((c) => c.id === '38:3140');
    rowNode.children = rowNode.children.slice(0, 1); // 只留 1 卡
    for (const c of rowNode.children) c.absoluteBoundingBox.x = 20;
    expect(detectGridLeaf({ id: '38:3140', layout: 'grid' }, indexFigmaNodes(doc2)).ok).toBe(false);
  });
});

describe('刀 53 renderFoldedGridLeafVue', () => {
  const idx = indexFigmaNodes(FIGMA_DOC);

  it('标题叶：justify-content:flex-start 内联 + import + 数据内联（无 defineProps）', () => {
    const tr = detectHeaderRowLeaf({ id: '38:3137-tail-text' }, idx, ICON_MAPPING);
    const vue = renderFoldedGridLeafVue(tr, 'component');
    expect(vue).toContain('justify-content:flex-start');
    // 🔴 内联钉死 flex-direction:row（布局事实注入器会给 class 写 column，round-10 实锤）
    expect(vue).toContain('flex-direction:row');
    // 🔴 font-size 必须**内联**（round-16 推翻 round-10：微码预览运行时 scoped style
    //   块不生效 ⇒ 放 style 块 = 字号塌回继承值；内联依赖归一器 fg- 标签内联保护）
    expect(vue).toContain('.c-component-fg-header-383137tailtext-title { font-size: 16px; }');
    expect(vue).toMatch(/style="color:[^;]+;font-size:16px;font-weight:500[^"]*">\{\{ title \}\}/);
    expect(vue).toContain("import icon4 from '../../resources/images/icon-战略厂商-3160.png'");
    expect(vue).toContain('data-section-id="38:3137-tail-text"');
    expect(vue).toContain('width:16px;height:16px');
    expect(vue).not.toContain('defineProps');
    expect(vue).toContain('const title = "战略合作厂商"');
    // 类名按 section id 派生（组件内唯一，免疫全局注入「后写者胜」）
    expect(vue).toContain('c-component-fg-header-383137tailtext');
  });

  it('网格叶（多行）：canonical grid 声明 + row-gap + items 内联', () => {
    const listLeaf = { id: '38:3167-list', items: FIGMA_DOC.children.find((c) => c.id === '38:3162').children.find((c) => c.id === '38:3167-list').items };
    const tr = detectGridLeaf(listLeaf, idx);
    const vue = renderFoldedGridLeafVue(tr, 'component');
    expect(vue).toContain('display:grid;justify-content:start;grid-template-columns:repeat(4, 126px);grid-auto-rows:30px;column-gap:20px;row-gap:20px;align-content:start;align-items:stretch;');
    expect(vue).toContain('background: it.bg');
    expect(vue).toContain('borderRadius: it.r');
    expect(vue).toContain('"text": "大华股份"');
    expect(vue).not.toContain('defineProps');
    expect(vue).toContain('c-component-fg-grid-383167list');
  });

  it('网格叶（单行）：不写 row-gap（单行真值 ⇒ 行距未知）', () => {
    const tr = detectGridLeaf({ id: '38:3140', layout: 'grid' }, idx);
    const vue = renderFoldedGridLeafVue(tr, 'component');
    expect(vue).not.toContain('row-gap');
    expect(vue).toContain('grid-auto-rows:30px');
  });

  it('标题含 HTML 特殊字符 ⇒ JSON 转义（防 </script> 闭合）', () => {
    const vue = renderFoldedGridLeafVue(
      {
        kind: 'header', sectionId: 'x:1', baseId: 'x:1', title: 'a</script><b>', titleColor: 'rgba(0,0,0,1)',
        fontSize: 14, fontWeight: 400, iconVar: 'icon1', iconFile: 'a.png', iconW: 16, iconH: 16, gap: 8, height: 16,
      },
      'component',
    );
    expect(vue).toContain('a\\u003c/script>\\u003cb>');
    expect(vue.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe('刀 53 collectFoldedGridTakeover', () => {
  it('阳性：四叶全接管（1 标题 + 3 网格），map 以组件名为键', () => {
    const out = collectFoldedGridTakeover({
      treeSections: TREE,
      figmaNodeData: FIGMA_DOC,
      resourceMapping: ICON_MAPPING,
      componentName: 'c-component',
    });
    expect(out.evaluated).toBe(4);
    expect(out.headerHits).toBe(1);
    expect(out.gridHits).toBe(3);
    expect(out.map.size).toBe(4);
    for (const [, tr] of out.map) {
      expect(['header', 'grid']).toContain(tr.kind);
      expect(tr.vue).toContain('<template>');
    }
    expect(out.skipped).toHaveLength(0);
  });

  it('阴性：无树 / 无 Figma ⇒ 空 map（fail-open）', () => {
    expect(collectFoldedGridTakeover({ treeSections: [] }).map.size).toBe(0);
    const out = collectFoldedGridTakeover({
      treeSections: TREE,
      figmaNodeData: null,
      resourceMapping: ICON_MAPPING,
      componentName: 'c-component',
    });
    expect(out.map.size).toBe(0);
    expect(out.skipped.length).toBe(4);
  });

  it('幂等：同一输入两次收集结果一致', () => {
    const a = collectFoldedGridTakeover({
      treeSections: TREE, figmaNodeData: FIGMA_DOC, resourceMapping: ICON_MAPPING, componentName: 'c-component',
    });
    const b = collectFoldedGridTakeover({
      treeSections: TREE, figmaNodeData: FIGMA_DOC, resourceMapping: ICON_MAPPING, componentName: 'c-component',
    });
    expect([...a.map.entries()]).toEqual([...b.map.entries()]);
  });
});

describe('stripFgTakeoverRules（刀 53 命名空间隔离 · round-13）', () => {
  it('剔除 common.less 里编造的 fg- 规则块', () => {
    const src = [
      '.c-x-fg-header-383137tailtext {height: 100%;',
      '  display: flex;',
      '  flex-direction: column;}',
      '.c-x-fg-header-383137tailtext-title { font-size: calc(@fontSize * 1.1429); }',
      '.c-demo-card { color: red; }',
    ].join('\n');
    const r = stripFgTakeoverRules(src);
    expect(r.removed).toBe(2);
    expect(r.text).not.toContain('fg-header-');
    expect(r.text).toContain('.c-demo-card { color: red; }');
  });

  it('阴性对照：非 fg- 类规则零剔除（不会误伤业务样式）', () => {
    const src = '.c-demo-header { font-size: 16px; }\n.c-demo-grid { display: grid; }';
    const r = stripFgTakeoverRules(src);
    expect(r.removed).toBe(0);
    expect(r.text).toBe(src);
  });

  it('只删 fg- 块，块外内容（@import / 注释）不动', () => {
    const src = "@import 'x.less';\n/* keep */\n.c-x-fg-grid-383140 { display: flex; }\n.c-a { top: 0; }";
    const r = stripFgTakeoverRules(src);
    expect(r.removed).toBe(1);
    expect(r.text).toContain("@import 'x.less';");
    expect(r.text).toContain('/* keep */');
    expect(r.text).toContain('.c-a { top: 0; }');
  });
});

describe('detectTextLeaf / 纯文本叶接管（刀 53b · round-16 实锤）', () => {
  // 真值形态：mc-1792662399514-2b715fa0 顶部 stat 条 —— 38:3262="33" fs24 fw600 蓝（TEXT 节点本身即锚点）
  const NUM_NODE = text('38:3262', '33', 26997, 51522, 28, 28, '#2c68ff', 24, 600);
  const LABEL_NODE = text('38:3263', '合作厂商', 26998, 51496, 64, 24, '#333333', 16, 400);
  const DOC2 = { children: [{ id: '0:0', type: 'CANVAS', children: [NUM_NODE, LABEL_NODE] }] };
  const IDX2 = indexFigmaNodes(DOC2);
  const secOf = (id) => ({ id });

  it('阳性：纯 TEXT 锚点 → text 接管（真值样式齐全）', () => {
    const r = detectTextLeaf(secOf('38:3262'), IDX2);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('text');
    expect(r.text).toBe('33');
    expect(r.fontSize).toBe(24);
    expect(r.fontWeight).toBe(600);
    expect(r.color).toBe('rgba(44,104,255,1)');
    expect(r.height).toBe(28);
  });

  it('阳性：GROUP 纯包装 1 TEXT（无图形）同样接管', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [{ id: 'g1', type: 'GROUP', children: [text('t1', '66', 0, 0, 28, 28, '#2c68ff', 24, 600)] }] }] };
    const r = detectTextLeaf(secOf('g1'), indexFigmaNodes(doc));
    expect(r.ok).toBe(true);
    expect(r.text).toBe('66');
  });

  it('阴性：子树含图形节点 → fail-open（数字叶不会误吞 icon 区）', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [{ id: 'g2', type: 'GROUP', children: [text('t2', '33', 0, 0, 28, 28, '#2c68ff', 24, 600), { id: 'v2', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 8, height: 8 } }] }] }] };
    const r = detectTextLeaf(secOf('g2'), indexFigmaNodes(doc));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/hasGraphic/);
  });

  it('阴性：2 个 TEXT → fail-open', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [{ id: 'g3', type: 'GROUP', children: [text('a', '合作厂商', 0, 0, 64, 24, '#333333', 16, 400), text('b', '33', 0, 30, 28, 28, '#2c68ff', 24, 600)] }] }] };
    const r = detectTextLeaf(secOf('g3'), indexFigmaNodes(doc));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('texts=2(need 1)');
  });

  it('阴性：缺 fontWeight → fail-open（不猜）', () => {
    const n = text('t9', '33', 0, 0, 28, 28, '#2c68ff', 24, 600);
    delete n.style.fontWeight;
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [n] }] };
    const r = detectTextLeaf(secOf('t9'), indexFigmaNodes(doc));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('textStyleIncomplete');
  });

  it('渲染：纯 span 无 img、内联 color/weight、font-size 在 style 块、类名 -fg-text-', () => {
    const r = detectTextLeaf(secOf('38:3262'), IDX2);
    const vue = renderFoldedGridLeafVue(r, '2b715f');
    expect(vue).toContain('c-2b715f-fg-text-383262');
    expect(vue).not.toContain('<img');
    expect(vue).toContain('color:rgba(44,104,255,1);font-size:24px;font-weight:600');
    expect(vue).toContain('.c-2b715f-fg-text-383262-text { font-size: 24px; }');
    expect(vue).toContain('const text = "33"');
    // 命名空间正则必须覆盖 -fg-text-（三个消费者单点生效的前提）
    expect(/-fg-(?:header|grid|text)-/.test('c-x-fg-text-383262')).toBe(true);
  });
});
