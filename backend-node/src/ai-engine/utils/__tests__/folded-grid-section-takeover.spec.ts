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
  detectIconLeaf,
  renderFoldedGridLeafVue,
  stripFgTakeoverRules,
  detectStatRowLeaf,
  detectTableLeaf,
  detectLegendDotTextLeaf,
  buildParentMap,
  matchFgTakeoverTargets,
  FG_TAKEOVER_CLASS_RX,
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
    // 🔴 2026-10-27 锚点收口后的配套修正：本用例的**意图**是「本叶锚点内含 2 个 TEXT
    //   ⇒ 不是标题行」。原 fixture 把多余文本放到**父容器**里、靠旧的「合成 id 剥后缀
    //   吸收父容器」才被判到 —— 那正是 8bbcf027 的病灶（拿别人的事实判本叶）。
    //   故把多余文本放进**本叶自己的 sourceNodeIds**，意图不变、判别力更强。
    const sec2 = { ...sec, sourceNodeIds: [...sec.sourceNodeIds, '38:9999'] };
    const r = detectHeaderRowLeaf(sec2, indexFigmaNodes(doc2), ICON_MAPPING);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('texts=2');
  });

  it('父容器里未被本叶认领的 TEXT 不得让本叶失败（8bbcf027 病灶的反向断言）', () => {
    const doc2 = JSON.parse(JSON.stringify(FIGMA_DOC));
    doc2.children.push(text('38:9999', '别人的文本', 200, 25, 40, 16, '#333333', 14, 400));
    const r = detectHeaderRowLeaf(sec, indexFigmaNodes(doc2), ICON_MAPPING);
    expect(r.ok).toBe(true);
    expect(r.title).toBe('战略合作厂商');
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

  it('阳性（29c2c476）：vision 锚点误指图形时，按底部完整文本精确回查 Figma 并物化', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [
      { id: '48:5884', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 40 } },
      text('48:5888', '共 6 个节点', 0, 80, 72, 16, '#88afdf', 14, 400),
      text('48:5889', '接入设备 10810', 363, 80, 107, 16, '#0362a6', 14, 700),
    ] }] };
    const sec = {
      id: '48:5884',
      body: { children: [
        { role: 'text', text: '共 6 个节点' },
        { role: 'text', parts: [{ type: 'label', text: '接入设备 ' }, { type: 'number', text: '10810' }] },
      ] },
    };
    const r = detectTextLeaf(sec, indexFigmaNodes(doc));
    expect(r.ok).toBe(true);
    expect(r.direction).toBe('row');
    expect(r.runs.map((run) => run.text)).toEqual(['共 6 个节点', '接入设备 10810']);
    expect(renderFoldedGridLeafVue(r, 'deployment')).toContain('接入设备 10810');
  });

  it('阳性（9e0b7a97）：footer 完全无锚点时，仍按完整文本唯一回查并物化', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [
      text('48:5888', '共 6 个节点', 0, 80, 72, 16, '#88afdf', 14, 400),
      text('48:5889', '接入设备 10810', 363, 80, 107, 16, '#0362a6', 14, 700),
    ] }] };
    const sec = {
      id: 'section-footer',
      body: { children: [
        { role: 'text', text: '共 6 个节点' },
        { role: 'text', parts: [{ type: 'label', text: '接入设备 ' }, { type: 'number', text: '10810' }] },
      ] },
    };
    const r = detectTextLeaf(sec, indexFigmaNodes(doc));
    expect(r.ok).toBe(true);
    expect(r.direction).toBe('row');
    expect(r.runs.map((run) => run.text)).toEqual(['共 6 个节点', '接入设备 10810']);
  });

  it('阴性：vision 文本在 Figma 重复出现时锚点又无效 ⇒ 歧义不猜', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [
      { id: '48:5884', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 40 } },
      text('a', '共 6 个节点', 0, 80, 72, 16, '#88afdf', 14, 400),
      text('b', '共 6 个节点', 200, 80, 72, 16, '#88afdf', 14, 400),
    ] }] };
    const sec = { id: '48:5884', body: { children: [{ role: 'text', text: '共 6 个节点' }] } };
    expect(detectTextLeaf(sec, indexFigmaNodes(doc)).ok).toBe(false);
  });

  it('阴性：子树含图形节点 → fail-open（数字叶不会误吞 icon 区）', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [{ id: 'g2', type: 'GROUP', children: [text('t2', '33', 0, 0, 28, 28, '#2c68ff', 24, 600), { id: 'v2', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 8, height: 8 } }] }] }] };
    const r = detectTextLeaf(secOf('g2'), indexFigmaNodes(doc));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/hasGraphic/);
  });

  it('阳性：2 个 TEXT 各占一行 → column 接管，段间距取相邻 bbox 差值', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [{ id: 'g3', type: 'GROUP', children: [text('a', '合作厂商', 0, 0, 64, 24, '#333333', 16, 400), text('b', '33', 0, 30, 28, 28, '#2c68ff', 24, 600)] }] }] };
    const r = detectTextLeaf(secOf('g3'), indexFigmaNodes(doc));
    expect(r.ok).toBe(true);
    expect(r.direction).toBe('column');
    expect(r.runs.map((run) => [run.text, run.gapBefore])).toEqual([['合作厂商', 0], ['33', 6]]);
    expect(r.height).toBe(58);
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).toContain('flex-direction:column;');
    expect(vue).toContain('margin-top:6px;');
    expect(vue).toContain('{{ runs[0].text }}');
    expect(vue).toContain('{{ runs[1].text }}');
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

describe('detectIconLeaf / 纯 icon 叶接管（刀 53c · round-17 实锤）', () => {
  // 真值形态：187:262 = GROUP(icon) 内十几个 VECTOR，无 TEXT；已导出 icon-262.png（53×55）
  const iconGroup = (id, x, y, w, h) => ({
    id,
    type: 'GROUP',
    name: 'icon',
    absoluteBoundingBox: { x, y, width: w, height: h },
    children: [
      { id: `${id}-a`, type: 'VECTOR', absoluteBoundingBox: { x: x + 2, y: y + 2, width: 20, height: 10 } },
      { id: `${id}-b`, type: 'VECTOR', absoluteBoundingBox: { x: x + 4, y: y + 6, width: 30, height: 20 } },
    ],
  });
  const G262 = iconGroup('187:262', 26920, 51496, 53, 55);
  const DOC3 = { children: [{ id: '0:0', type: 'CANVAS', children: [G262] }] };
  const IDX3 = indexFigmaNodes(DOC3);
  const MAP_OK = [{ figmaNodeId: '187:262', resourceFile: '../resources/images/icon-262.png', assignedVarName: 'icon2', downloadStatus: 'success', ownerSectionId: '38:3260' }];

  it('阳性：0 TEXT + 已导出 PNG → icon 接管（真值尺寸 53×55）', () => {
    const r = detectIconLeaf({ id: '187:262' }, IDX3, MAP_OK);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('icon');
    expect(r.iconVar).toBe('icon2');
    expect(r.iconFile).toBe('icon-262.png');
    expect(r.iconW).toBe(53);
    expect(r.iconH).toBe(55);
    expect(r.baseId).toBe('38:3260');
  });

  // 真机 8bbcf027：36:1725(img,已导出) → 36:1726(Mask group,plan 叶)
  //   → 36:1729(RECTANGLE, IMAGE fill)，三者 bbox 全为 98×98。
  const MASK_BOX = { x: 24745, y: 51499, width: 98, height: 98 };
  const maskRect = (id: string, fills: any[]) => ({ id, type: 'RECTANGLE', absoluteBoundingBox: { ...MASK_BOX }, fills });
  const parentImageDoc = (opts: { parentWidth?: number; hasImageFill?: boolean } = {}) => {
    const mask = {
      id: '36:1726',
      type: 'GROUP',
      name: 'Mask group',
      absoluteBoundingBox: { ...MASK_BOX },
      children: [
        maskRect('36:1727', [solid('#e2ebff')]),
        maskRect('36:1728', [solid('#b8d8ff')]),
        maskRect('36:1729', opts.hasImageFill === false ? [solid('#3965ff')] : [{ type: 'IMAGE', visible: true, imageRef: 'a01c53a4f5e6ae2d2cb2d63b25bd12d8a9a4e123' }]),
      ],
    };
    return {
      id: '36:1693',
      type: 'FRAME',
      children: [{ id: '801:3', type: 'GROUP', children: [{ id: '36:1725', type: 'GROUP', name: 'img', absoluteBoundingBox: { ...MASK_BOX, width: opts.parentWidth ?? MASK_BOX.width }, children: [mask] }] }],
    };
  };
  const MASK_SEC = { id: '36:1726', sourceNodeIds: ['36:1726', '36:1727', '36:1728', '36:1729'] };
  const PARENT_IMAGE_MAP = (status = 'success') => [{ figmaNodeId: '36:1725', ownerSectionId: '801:3', resourceFile: '../resources/images/img-1725.png', assignedVarName: 'img1', downloadStatus: status }];

  it('阳性：锚点未导出但直接父级已映射，且本叶含同 bbox IMAGE fill ⇒ 接管', () => {
    const r = detectIconLeaf(MASK_SEC, indexFigmaNodes(parentImageDoc()), PARENT_IMAGE_MAP());
    expect(r.ok).toBe(true);
    expect(r.iconVar).toBe('img1');
    expect(r.iconFile).toBe('img-1725.png');
    expect(r.iconW).toBe(98);
    expect(r.iconH).toBe(98);
    expect(r.baseId).toBe('801:3');
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).toContain("import img1 from '../../resources/images/img-1725.png'");
    expect(vue).toContain('width:98px;height:98px;object-fit:contain');
  });

  it('阴性：父级映射存在但 bbox 不完全相同 ⇒ 不得借错资源', () => {
    const r = detectIconLeaf(MASK_SEC, indexFigmaNodes(parentImageDoc({ parentWidth: 100 })), PARENT_IMAGE_MAP());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('anchorNotExportedAsImage');
  });

  it('阴性：本叶无同 bbox IMAGE fill ⇒ 不得只因父级有图就接管', () => {
    const r = detectIconLeaf(MASK_SEC, indexFigmaNodes(parentImageDoc({ hasImageFill: false })), PARENT_IMAGE_MAP());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('anchorNotExportedAsImage');
  });

  it('阴性：父级资源 missing ⇒ 沿用原 fail-open', () => {
    const r = detectIconLeaf(MASK_SEC, indexFigmaNodes(parentImageDoc()), PARENT_IMAGE_MAP('missing'));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('anchorNotExportedAsImage');
  });

  it('阴性：子树含 TEXT → fail-open（不吃标题/数字叶）', () => {
    const doc = { children: [{ id: '0:0', type: 'CANVAS', children: [{ id: 'g', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 }, children: [{ id: 'g-v', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 8, height: 8 } }, text('g-t', '33', 0, 0, 28, 28, '#2c68ff', 24, 600)] }] }] };
    const r = detectIconLeaf({ id: 'g' }, indexFigmaNodes(doc), [{ figmaNodeId: 'g', resourceFile: 'x.png', assignedVarName: 'i', downloadStatus: 'success' }]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/hasText/);
  });

  it('阴性：锚点未导出为图片 → fail-open（无路径数据的 VECTOR 不臆造）', () => {
    const r = detectIconLeaf({ id: '187:262' }, IDX3, []);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('anchorNotExportedAsImage');
  });

  it('阴性：下载失败 → fail-open', () => {
    const r = detectIconLeaf({ id: '187:262' }, IDX3, [{ figmaNodeId: '187:262', resourceFile: 'x.png', assignedVarName: 'i', downloadStatus: 'failed' }]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('anchorNotExportedAsImage');
  });

  it('渲染：img 尺寸内联 + import + 无 TEXT', () => {
    const r = detectIconLeaf({ id: '187:262' }, IDX3, MAP_OK);
    const vue = renderFoldedGridLeafVue(r, '36520f');
    expect(vue).toContain('c-36520f-fg-icon-187262');
    expect(vue).toContain('width:53px;height:55px;object-fit:contain');
    expect(vue).toContain("import icon2 from '../../resources/images/icon-262.png'");
    expect(vue).not.toContain('const title');
    expect(vue).not.toContain('const text');
  });
});

describe('detectStatRowLeaf / 统计行整行接管（刀 53d · 2026-10-23 f98f7463 实锤）', () => {
  // 真值形态：父容器 43:4892(470x66) 下 3 张同构卡 134x66，x=29636/29804/29972（间距 34）；
  // 卡内**横排**：[标题 fs14][数值 fs24]，卡内间距 10。
  const statCard = (id, x, title, value, valueHex) => ({
    id,
    type: 'GROUP',
    absoluteBoundingBox: { x, y: 51637, width: 134, height: 66 },
    children: [
      {
        id: `${id}-bg`,
        type: 'VECTOR',
        absoluteBoundingBox: { x, y: 51637, width: 134, height: 66 },
        fills: [],
      },
      text(`${id}-t`, title, x + 34, 51663, 42, 21, '#333333', 14, 400),
      text(`${id}-v`, value, x + 86, 51660, 14, 28, valueHex, 24, 400),
    ],
  });

  const STAT_DOC = {
    id: 'root',
    type: 'FRAME',
    children: [
      {
        id: '43:4892',
        type: 'FRAME',
        absoluteBoundingBox: { x: 29636, y: 51637, width: 470, height: 66 },
        children: [
          statCard('43:4893', 29636, '总设备', '8', '#3965ff'),
          statCard('43:4898', 29804, '运行中', '2', '#00ac2e'),
          statCard('43:4903', 29972, '离线', '1', '#ff7300'),
        ],
      },
    ],
  };
  const IDX_S = indexFigmaNodes(STAT_DOC);
  const PARENT_S = buildParentMap(IDX_S);

  it('阳性：3 卡统计行命中，真值（内容/色值/字号/卡内序/间距）逐项正确', () => {
    const r = detectStatRowLeaf({ id: '43:4898' }, IDX_S, PARENT_S);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('statrow');
    expect(r.memberCount).toBe(3);
    expect(r.memberIndex).toBe(1); // x 排第 2（x 最小的 43:4893 不在 plan）
    expect(r.cardW).toBe(134);
    expect(r.cardH).toBe(66);
    expect(r.gap).toBe(34);
    expect(r.innerDir).toBe('row'); // 卡内横排（几何判定，非 Δy 阈值）
    expect(r.innerGap).toBe(10);
    expect(r.members.map((m) => `${m.title}/${m.value}`)).toEqual(['总设备/8', '运行中/2', '离线/1']);
    expect(r.members[0].titleFs).toBe(14);
    expect(r.members[0].valueFs).toBe(24);
    expect(r.members[0].valueColor).toBe('rgba(57,101,255,1)');
    expect(r.members[1].valueColor).toBe('rgba(0,172,46,1)');
    expect(r.members[2].valueColor).toBe('rgba(255,115,0,1)');
    expect(r.members.every((m) => m.titleFirst === true)).toBe(true);
  });

  it('渲染：memberIndex=0 ⇒ 整行 N 卡全渲染；>0 ⇒ display:none 空壳（去重契约）', () => {
    const r = detectStatRowLeaf({ id: '43:4898' }, IDX_S, PARENT_S);
    const whole = renderFoldedGridLeafVue({ ...r, memberIndex: 0 }, 'device');
    expect(whole).toContain('gap:34px');
    expect(whole).toContain('width:100%');
    expect(whole).toContain('flex:1;min-width:0;height:66px');
    expect(whole).toContain('总设备');
    expect(whole).toContain('"8"');
    expect(whole).toContain('离线');
    expect(whole).toContain('"1"');
    expect(whole).toContain('font-size:24px');
    const suppressed = renderFoldedGridLeafVue(r, 'device');
    expect(suppressed).toContain('display:none');
    expect(suppressed).not.toContain('总设备');
  });

  it('阴性：表格列（每列 9 个 TEXT，非二元组）⇒ MISS', () => {
    const col = (id, x, cells) => ({
      id,
      type: 'FRAME',
      absoluteBoundingBox: { x, y: 0, width: 98, height: 388 },
      children: cells.map((c, i) => text(`${id}-t${i}`, c, x, i * 43, 60, 14, '#333333', 14, 500)),
    });
    const doc = {
      id: 'root',
      type: 'FRAME',
      children: [
        {
          id: '43:4784',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 388 },
          children: [
            col('43:4785', 0, ['设备名称', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8']),
            col('43:4812', 97, ['电量', '92', '65', '78', '54', '45', '12', '88', '43']),
          ],
        },
      ],
    };
    const idx = indexFigmaNodes(doc);
    const r = detectStatRowLeaf({ id: '43:4785' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('notStatRowMember');
  });

  it('阴性：父容器下候选 < 2 ⇒ MISS（单卡不成行）', () => {
    const doc = {
      id: 'root',
      type: 'FRAME',
      children: [
        {
          id: 'p1',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 66 },
          children: [statCard('c1', 0, '总设备', '8', '#3965ff')],
        },
      ],
    };
    const idx = indexFigmaNodes(doc);
    const r = detectStatRowLeaf({ id: 'c1' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
  });

  it('阴性：跨成员 title 重复 ⇒ MISS（左右配对不歧义不满足）', () => {
    const doc = {
      id: 'root',
      type: 'FRAME',
      children: [
        {
          id: 'p2',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 66 },
          children: [
            statCard('d1', 0, '总数', '8', '#3965ff'),
            statCard('d2', 168, '总数', '2', '#00ac2e'),
          ],
        },
      ],
    };
    const idx = indexFigmaNodes(doc);
    const r = detectStatRowLeaf({ id: 'd1' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('duplicate-title');
  });

  it('阴性：成员宽高不齐（±2 外）⇒ MISS', () => {
    const doc = {
      id: 'root',
      type: 'FRAME',
      children: [
        {
          id: 'p3',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 66 },
          children: [
            statCard('e1', 0, '总设备', '8', '#3965ff'),
            { ...statCard('e2', 200, '运行中', '2', '#00ac2e'), absoluteBoundingBox: { x: 200, y: 51637, width: 180, height: 66 } },
          ],
        },
      ],
    };
    const idx = indexFigmaNodes(doc);
    const r = detectStatRowLeaf({ id: 'e1' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('member-size-mismatch');
  });
});

describe('stripFgTakeoverRules 单一来源（刀 53d 修复：此前硬编码 header|grid 副本）', () => {
  it('新增 kind（statrow/text/icon）无需改正则即被剔除', () => {
    const css = '@import "x";\n.c-a-fg-text-11 { font-size: 12px; }\n.c-b-fg-statrow-22 { display: flex; }\n.c-c-plain { color: red; }';
    const r = stripFgTakeoverRules(css);
    expect(r.removed).toBe(2);
    expect(r.text).toContain('@import "x";');
    expect(r.text).toContain('.c-c-plain');
    expect(r.text).not.toContain('fg-text-11');
    expect(r.text).not.toContain('fg-statrow-22');
  });
});

describe('matchFgTakeoverTargets（刀 53 vue3 接线 · 2026-10-23）', () => {
  /**
   * 为什么需要它：microcode 的 tag 直接就是文件名（子组件清单来自 plan 的
   * `assignSectionComponentNames`）；**vue3 的子组件清单是从 LLM 生成的 index.vue 里
   * 反解的**，名字自由 ⇒ 照搬「tag 即文件名」会恒零命中且无计数 = 假绿。
   */
  const tr = (sectionId, kind = 'header') => ({
    kind,
    sectionId,
    baseId: sectionId,
    vue: `<div data-section-id="${sectionId}"></div>`,
  });
  const MAP = new Map([
    ['HeaderSection', tr('807:3')],
    ['ContentSection', tr('43:4898', 'statrow')],
  ]);

  it('阳性①：文件名恰好等于 plan 派生的 tag ⇒ byName 命中（可跳过 LLM chunk）', () => {
    const r = matchFgTakeoverTargets({
      takeoverMap: MAP,
      subPaths: ['package/components/HeaderSection.vue', 'package/components/Other.vue'],
    });
    expect(r.evaluated).toBe(2);
    expect(r.nameHits).toBe(1);
    expect(r.byName.has('package/components/HeaderSection.vue')).toBe(true);
    expect(r.unmatched).toEqual(['package/components/Other.vue']);
  });

  it('阳性②：名字对不上但产物带 data-section-id 且落在接管集合 ⇒ bySectionId 命中', () => {
    const r = matchFgTakeoverTargets({
      takeoverMap: MAP,
      subPaths: ['package/components/StatCard.vue'],
      fileContents: {
        'package/components/StatCard.vue': '<div data-section-id="43:4898">2</div>',
      },
    });
    expect(r.sectionIdHits).toBe(1);
    expect(r.bySectionId.get('package/components/StatCard.vue').kind).toBe('statrow');
    expect(r.unmatched).toHaveLength(0);
  });

  it('名命中优先于 section-id 命中（不重复落盘）', () => {
    const r = matchFgTakeoverTargets({
      takeoverMap: MAP,
      subPaths: ['package/components/HeaderSection.vue'],
      fileContents: {
        'package/components/HeaderSection.vue': '<div data-section-id="43:4898"></div>',
      },
    });
    expect(r.byName.size).toBe(1);
    expect(r.bySectionId.size).toBe(0);
  });

  it('阴性①：产物无 data-section-id ⇒ 进 unmatched，不动文件', () => {
    const r = matchFgTakeoverTargets({
      takeoverMap: MAP,
      subPaths: ['package/components/StatCard.vue'],
      fileContents: { 'package/components/StatCard.vue': '<div class="x">2</div>' },
    });
    expect(r.byName.size + r.bySectionId.size).toBe(0);
    expect(r.unmatched).toEqual(['package/components/StatCard.vue']);
  });

  it('阴性②：data-section-id 不在接管集合 ⇒ 不匹配（不得凭相近 id 猜）', () => {
    const r = matchFgTakeoverTargets({
      takeoverMap: MAP,
      subPaths: ['package/components/A.vue'],
      fileContents: { 'package/components/A.vue': '<div data-section-id="99:99"></div>' },
    });
    expect(r.bySectionId.size).toBe(0);
    expect(r.unmatched).toHaveLength(1);
  });

  it('阴性③：省略 fileContents ⇒ 只做名匹配，不抛', () => {
    const r = matchFgTakeoverTargets({
      takeoverMap: MAP,
      subPaths: ['package/components/StatCard.vue'],
    });
    expect(r.evaluated).toBe(1);
    expect(r.byName.size).toBe(0);
    expect(r.bySectionId.size).toBe(0);
  });

  it('阴性④：接管集合为空 ⇒ 全零，不抛', () => {
    expect(matchFgTakeoverTargets({ takeoverMap: new Map(), subPaths: ['package/components/A.vue'] }).evaluated).toBe(0);
    expect(matchFgTakeoverTargets({}).unmatched).toHaveLength(0);
  });

  it('🔴 主组件硬护栏：package/index.vue 永不参与匹配（带 data-section-id 也不覆写）', () => {
    const r = matchFgTakeoverTargets({
      takeoverMap: MAP,
      subPaths: ['package/index.vue', 'package/components/A.vue'],
      fileContents: {
        'package/index.vue': '<div data-section-id="807:3"></div>',
        'package/components/A.vue': '<div data-section-id="807:3"></div>',
      },
    });
    expect(r.evaluated).toBe(1); // 只有 components 下的被评估
    expect(r.bySectionId.has('package/components/A.vue')).toBe(true);
    expect(r.byName.size).toBe(0);
    expect(r.unmatched).toEqual([]);
  });
});

/**
 * 刀 53e / 方案 C：列式表格叶（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）。
 *
 * 🔴 判据按**实测真值**定，不是照抄方案文档的「同宽 ±2」—— 本单 4 列宽是
 *    179/98/98/98（差 81），「同宽」在本单恒不成立。真表格特征 = 同高 ±2 +
 *    同 y ±2 + x 严格递增（允许 ≤2px 咬合）+ 各列 TEXT 数相同 + 跨列逐行 y 对齐。
 */
describe('刀 53e · detectTableLeaf（列式表格整表接管）', () => {
  const COL_X = [0, 179, 277, 375]; // 咬合 1px：(0+179)-179=0…(179+98)-277=0
  const COL_W = [179, 98, 98, 98];
  const ROW_H = 44;

  /** 构造 N 列 × M 行表格：每列 = 1 表头 TEXT + M 数据 TEXT，跨列逐行 y 对齐 */
  const table = (colTexts, opts = {}) => {
    const cols = colTexts.map((texts, ci) => ({
      id: `c${ci}`,
      type: 'FRAME',
      name: `col-${ci}`,
      absoluteBoundingBox: {
        x: opts.x ? opts.x[ci] : COL_X[ci],
        y: 0,
        width: COL_W[ci],
        height: opts.height ? opts.height[ci] : ROW_H * texts.length,
      },
      children: texts.map((t, ri) => ({
        id: `c${ci}-r${ri}`,
        type: 'FRAME',
        absoluteBoundingBox: {
          x: opts.x ? opts.x[ci] : COL_X[ci],
          y: opts.rowY ? opts.rowY[ci][ri] : ri * ROW_H,
          width: COL_W[ci],
          height: ROW_H,
        },
        children: [
          text(
            `t${ci}-${ri}`,
            t,
            COL_X[ci] + 8,
            opts.textY ? opts.textY[ci][ri] : ri * ROW_H + 15,
            60,
            14,
            ri === 0 ? '#333333' : (opts.cellHex || '#333333'),
            14,
            500,
          ),
        ],
      })),
    }));
    return { id: 'tbl', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 470, height: ROW_H * colTexts[0].length }, children: cols };
  };

  const idxOf = (root) => indexFigmaNodes(root);
  const sec = (id) => ({ id, type: 'table', sourceNodeIds: [id] });

  const HEAD = ['设备名称', '电量', '速度(m/s)', '启用状态'];
  const ROWS = [
    ['服务区巡检狗K1', '92', '1.20', '启用'],
    ['服务区巡检狗K2', '65', '0.80', '启用'],
    ['服务区巡检狗K3', '78', '0.80', '禁用'],
  ];

  it('阳性①：4 列 × 3 行真值形态 ⇒ 命中，表头/行数/列宽百分比正确', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const root = table(colTexts);
    const idx = idxOf(root);
    const r = detectTableLeaf(sec('c0'), idx, buildParentMap(idx));
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('table');
    expect(r.memberCount).toBe(4);
    expect(r.rowCount).toBe(3);
    expect(r.rowH).toBe(ROW_H);
    expect(r.height).toBe(ROW_H * 4);
    expect(r.memberIndex).toBe(0);
    expect(r.cols.map((c) => c.header.text)).toEqual(HEAD);
    expect(r.cols.map((c) => c.cells.map((x) => x.text))).toEqual([
      ['服务区巡检狗K1', '服务区巡检狗K2', '服务区巡检狗K3'],
      ['92', '65', '78'],
      ['1.20', '0.80', '0.80'],
      ['启用', '启用', '禁用'],
    ]);
    // 列宽百分比：分母取**列宽和**（真值列间 1px 咬合 ⇒ 用父宽会让总和 >100%）
    const sum = r.cols.reduce((s, c) => s + c.widthPct, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.5);
  });

  it('阳性①b：vision 明确 table 且锚定整表容器 ⇒ 消费整表，不退化为普通列表', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const idx = idxOf(table(colTexts));
    const tableSec = {
      ...sec('tbl'),
      headers: HEAD,
      columnCount: 4,
      cells: colTexts,
    };
    const r = detectTableLeaf(tableSec, idx, buildParentMap(idx));
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('table');
    expect(r.parentId).toBe('tbl');
    expect(r.memberIndex).toBe(0);
    expect(r.cols.map((c) => c.header.text)).toEqual(HEAD);
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).toContain('v-for="(row, ri) in rows"');
    expect(vue).toContain('服务区巡检狗K3');
  });

  it('e7c4197c：vision 表格误锚首行 ⇒ 用唯一表头 LCA 回查整表，仍只物化一张表', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const root = table(colTexts);
    const idx = idxOf(root);
    const tableSec = {
      id: 'section-table',
      type: 'table',
      sourceNodeIds: ['c0-r1'],
      body: { children: [{ role: 'table', control: 'table', tableStyle: { headers: HEAD } }] },
    };
    const r = detectTableLeaf(tableSec, idx, buildParentMap(idx));
    expect(r.ok).toBe(true);
    expect(r.sectionId).toBe('section-table');
    expect(r.parentId).toBe('tbl');
    expect(r.anchorRepair).toBe('declared-headers-lca');
    expect(r.rowCount).toBe(3);
    expect(r.cols.map((c) => c.header.text)).toEqual(HEAD);
    const collected = collectFoldedGridTakeover({ treeSections: [tableSec], figmaNodeData: root });
    expect(collected.tableAnchorRepairs).toBe(1);
  });

  it('阴性：表头文本不能唯一回查 ⇒ 不提升锚点，维持原 fail-open', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const root = table(colTexts);
    root.children.push(text('duplicate-header', '电量', 600, 0, 60, 14, '#333333', 14, 500));
    const idx = idxOf(root);
    const tableSec = {
      id: 'section-table', type: 'table', sourceNodeIds: ['c0-r1'],
      body: { children: [{ role: 'table', tableStyle: { headers: HEAD } }] },
    };
    expect(detectTableLeaf(tableSec, idx, buildParentMap(idx)).ok).toBe(false);
  });

  it('阳性②：锚点是第 2 列 ⇒ memberIndex=1（供两阶段分组决定谁渲染整表）', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const idx = idxOf(table(colTexts));
    const r = detectTableLeaf(sec('c1'), idx, buildParentMap(idx));
    expect(r.ok).toBe(true);
    expect(r.memberIndex).toBe(1);
  });

  it('阳性③：整表渲染 = 表头行 + 数据行，列宽/行高/真值文本内联；抑制项 display:none', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const idx = idxOf(table(colTexts));
    const r = detectTableLeaf(sec('c0'), idx, buildParentMap(idx));
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).toContain('fg-table-');
    expect(vue).toContain('设备名称');
    expect(vue).toContain('速度(m/s)');
    expect(vue).toContain('服务区巡检狗K3');
    expect(vue).toContain('禁用');
    expect(vue).toContain('flex:0 0');
    expect(vue).toContain(`height:${ROW_H}px`);
    expect(vue).toContain('v-for="(row, ri) in rows"');
    expect(vue).not.toContain('display:none');

    const suppressed = renderFoldedGridLeafVue({ ...r, memberIndex: 1 }, 'device');
    expect(suppressed).toContain('display:none');
    expect(suppressed).not.toContain('设备名称');
  });

  it('阴性①：每列仅 2 个 TEXT（统计行形态）⇒ 不接管（与 statrow 互斥）', () => {
    const colTexts = [
      ['总设备', '8'],
      ['运行中', '2'],
      ['离线', '1'],
    ];
    const idx = idxOf(table(colTexts));
    expect(detectTableLeaf(sec('c0'), idx, buildParentMap(idx)).ok).toBe(false);
  });

  it('阴性②：只有 1 列 ⇒ 不接管（不构成表格）', () => {
    const idx = idxOf(table([['设备名称', 'K1', 'K2', 'K3']]));
    expect(detectTableLeaf(sec('c0'), idx, buildParentMap(idx)).ok).toBe(false);
  });

  it('阴性③：列高度不一致 ⇒ 不接管（不是同一行带）', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const idx = idxOf(table(colTexts, { height: [176, 176, 300, 176] }));
    expect(detectTableLeaf(sec('c0'), idx, buildParentMap(idx)).ok).toBe(false);
  });

  it('阴性④：跨列行 y 不对齐 ⇒ 不接管（不是同一行）', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const rowY = [
      [0, 44, 88, 132],
      [0, 44, 88, 132],
      [0, 44, 200, 244],
      [0, 44, 88, 132],
    ];
    const textY = rowY.map((ys) => ys.map((y) => y + 15));
    const idx = idxOf(table(colTexts, { rowY, textY }));
    expect(detectTableLeaf(sec('c0'), idx, buildParentMap(idx)).ok).toBe(false);
  });

  it('阴性⑤：各列 TEXT 数不一致 ⇒ 不接管（行数不同 ⇒ 不是表格）', () => {
    const colTexts = [
      ['设备名称', 'K1', 'K2', 'K3'],
      ['电量', '92', '65'],
      ['速度(m/s)', '1.20', '0.80', '0.80'],
    ];
    const idx = idxOf(table(colTexts));
    expect(detectTableLeaf(sec('c0'), idx, buildParentMap(idx)).ok).toBe(false);
  });

  it('阴性⑥：无 parentOf ⇒ noParentMap（fail-open，不猜）', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const idx = idxOf(table(colTexts));
    const r = detectTableLeaf(sec('c0'), idx, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noParentMap');
  });

  it('阴性⑦：任一文本样式缺失（无 fill）⇒ 整体 fail-open（绝不臆造颜色）', () => {
    const colTexts = HEAD.map((h, ci) => [h, ...ROWS.map((r) => r[ci])]);
    const root = table(colTexts);
    // 摘掉第 2 列第 3 行文本的 fills
    const miss = root.children[1].children[2].children[0];
    miss.fills = [];
    const idx = idxOf(root);
    expect(detectTableLeaf(sec('c0'), idx, buildParentMap(idx)).ok).toBe(false);
  });

  it('🔴 命名空间：table 类名必须被 FG_TAKEOVER_CLASS_RX 覆盖（否则后置管线会改写真值）', () => {
    expect(FG_TAKEOVER_CLASS_RX.test('c-x-fg-table-434785')).toBe(true);
    expect(FG_TAKEOVER_CLASS_RX.test('c-x-fg-statrow-434893')).toBe(true);
    expect(FG_TAKEOVER_CLASS_RX.test('c-x-fg-other-1')).toBe(false);
  });
});

/**
 * 🛡️ 刀 53 外观扩维单测（2026-10-23 · cd8938f8 实锤）。
 *
 * 病灶：table/statrow 输出模型只有 `{text,color,fs,fw}` —— 无 background/border/
 * padding ⇒ 接管后表格「裸文字」、统计卡无渐变底（不是忘写，是模型无此维度）。
 * 治本：契约扩维 + **内联输出**（微码预览运行时 SFC scoped style 不生效）。
 *
 * 🔴 本组核心是**阴性对照**：「取不到即 null ⇒ 该属性整体不写」，绝不填兜底色。
 */
describe('刀 53 外观扩维 · detectTableLeaf（cd8938f8 实锤）', () => {
  const COL_X = [0, 179, 277, 375];
  const COL_W = [179, 98, 98, 98];
  const ROW_H = 44; // 真值行高；行节距 itemSpacing=-1 ⇒ 行间压叠 1px
  const HEAD = ['设备名称', '电量', '速度(m/s)', '启用状态'];
  const ROWS = [
    ['服务区巡检狗K1', '92', '1.20', '启用'],
    ['服务区巡检狗K2', '65', '0.80', '启用'],
    ['服务区巡检狗K3', '78', '0.80', '禁用'],
  ];
  const ZEBRA = ['#e2ecfe', '#d6e5ff'];

  /** 真机形态：4 列 × (1 表头 + 3 数据) 行节点，带 fills/strokes/padding（可选） */
  const tableDoc = ({ withFills = true, icons = null }: any = {}) => ({
    id: '43:4784',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 470, height: ROW_H * 4 - 3 },
    children: COL_X.map((cx, ci) => ({
      id: `43:478${5 + ci}`,
      type: 'FRAME',
      absoluteBoundingBox: { x: cx, y: 0, width: COL_W[ci], height: ROW_H * 4 - 3 },
      itemSpacing: -1, // 负行节距（真值）
      children: [0, 1, 2, 3].map((ri) => {
        const y = ri * (ROW_H - 1);
        const iconId = `81:${36 + ri}`;
        const kids: any[] = [];
        // 🔴 真值：仅**首列**每行有 28×28 前缀图标，其余列只有文本（fixture 必须与真值同形，
        //    否则「非首列无图标」这类断言就成了 fixture 自说自话）
        if (ci === 0 && icons && icons.some((m: any) => m.figmaNodeId === iconId)) {
          kids.push({
            id: iconId,
            type: 'VECTOR',
            absoluteBoundingBox: { x: cx + 16, y: y + 8, width: 28, height: 28 },
            fills: [],
          });
        }
        kids.push(
          text(
            `c${ci}-r${ri}-t`,
            ri === 0 ? HEAD[ci] : ROWS[ri - 1][ci],
            cx + 52,
            y + 15,
            60,
            14,
            ri === 0 ? '#ffffff' : '#333333',
            14,
            500,
          ),
        );
        const node: any = {
          id: `c${ci}-r${ri}`,
          type: 'FRAME',
          absoluteBoundingBox: { x: cx, y, width: COL_W[ci], height: ROW_H },
          itemSpacing: 8, // 图标-文字间距真值
          children: kids,
        };
        if (withFills) {
          node.fills = [solid(ri === 0 ? '#bdd5ff' : ZEBRA[(ri - 1) % 2])];
          node.strokes = [solid('#ffffff')];
          node.strokeWeight = 1;
          node.strokeAlign = 'INSIDE';
          node.paddingTop = 10;
          node.paddingRight = 16;
          node.paddingBottom = 10;
          node.paddingLeft = 16;
        }
        return node;
      }),
    })),
  });

  const ICON_MAP = [
    { figmaNodeId: '81:37', resourceFile: '../resources/images/image_473938-37.png', downloadStatus: 'success', assignedVarName: 'icon1' },
    { figmaNodeId: '81:38', resourceFile: '../resources/images/image_473938-38.png', downloadStatus: 'success', assignedVarName: 'icon2' },
    { figmaNodeId: '81:39', resourceFile: '../resources/images/image_473938-39.png', downloadStatus: 'success', assignedVarName: 'icon3' },
  ];
  const sec = (id: string) => ({ id, type: 'table', sourceNodeIds: [id] });

  it('阳性①：表头/斑马纹/白网格线/内边距/负行节距 全部进契约', () => {
    const idx = indexFigmaNodes(tableDoc());
    const r = detectTableLeaf(sec('43:4785'), idx, buildParentMap(idx), []);
    expect(r.ok).toBe(true);
    expect(r.rowGap).toBe(-1);
    expect(r.cols[0].header.bg).toBe('#bdd5ff');
    expect(r.cols[0].header.border).toBe('1px solid #ffffff');
    expect(r.cols[0].header.pad).toBe('10px 16px');
    expect(r.cols[0].cells.map((x: any) => x.bg)).toEqual(['#e2ecfe', '#d6e5ff', '#e2ecfe']);
    // 🔴 每列各自读自己的行节点（列间不串位）
    expect(r.cols[3].cells[0].bg).toBe('#e2ecfe');
    expect(r.cols[3].cells[1].border).toBe('1px solid #ffffff');
    expect(r.cols[3].cells[1].pad).toBe('10px 16px');
  });

  it('阳性②：渲染把外观**内联**（bg/border/padding/负 margin-top），不依赖 style 块', () => {
    const idx = indexFigmaNodes(tableDoc());
    const r = detectTableLeaf(sec('43:4785'), idx, buildParentMap(idx), []);
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).toContain('background:#bdd5ff;');
    expect(vue).toContain('border:1px solid #ffffff;');
    expect(vue).toContain('padding:10px 16px;');
    expect(vue).toContain('margin-top:-1px;');
    expect(vue).toContain('background: row.c0.bg || undefined');
    expect(vue).toContain('"bg": "#e2ecfe"');
    expect(vue).toContain('"border": "1px solid #ffffff"');
  });

  it('阳性③：首列数据行图标进契约（尺寸/间距）+ import + img；非首列与表头无图标', () => {
    const idx = indexFigmaNodes(tableDoc({ icons: ICON_MAP }));
    const r = detectTableLeaf(sec('43:4785'), idx, buildParentMap(idx), ICON_MAP);
    expect(r.cols[0].cells[0].icon).toEqual({
      varName: 'icon1',
      file: 'image_473938-37.png',
      w: 28,
      h: 28,
      r: 0,
      gap: 8,
    });
    expect(r.cols[0].cells[1].icon.varName).toBe('icon2');
    expect(r.cols[0].header.icon).toBeUndefined();
    expect(r.cols[1].cells[0].icon).toBeNull();
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).toContain("import icon1 from '../../resources/images/image_473938-37.png'");
    expect(vue).toContain('"iconVar": "icon1"');
    expect(vue).toContain('"iconGap": 8');
    // 🔴🔴 图标必须经**运行时查表**取：`rows` 是 JSON 字面量（`inlineJson`），`iconVar`
    //   存的是变量名的**字符串**（`"icon1"`）⇒ 直接 `:src="row.c0.iconVar"` 会求值成
    //   `src="icon1"`（相对 URL → 404），而 `import icon1` 全成死代码。
    //   实锤：c-device-6d79e69d 表格首列 8 行图标全破图。
    expect(vue).toContain('const ICON_MAP = { icon1, icon2, icon3 }');
    expect(vue).toContain(':src="ICON_MAP[row.c0.iconVar]"');
    expect(vue).not.toContain(':src="row.c0.iconVar"');
  });

  it('🔴 阴性①（核心纪律）：行节点无 fills/strokes/padding ⇒ 属性整体不写（绝不填兜底色）', () => {
    const idx = indexFigmaNodes(tableDoc({ withFills: false }));
    const r = detectTableLeaf(sec('43:4785'), idx, buildParentMap(idx), []);
    expect(r.ok).toBe(true); // 内容照常接管（单属性降级，不 fail-open 整表）
    expect(r.cols[0].header.bg).toBeNull();
    expect(r.cols[0].header.border).toBeNull();
    expect(r.cols[0].header.pad).toBeNull();
    expect(r.cols[0].cells[0].bg).toBeNull();
    expect(r.cols[0].cells[0].icon).toBeNull();
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).not.toContain('background:#');
    expect(vue).not.toContain('border:1px');
    expect(vue).not.toContain('padding:10px');
    expect(vue).not.toContain('import icon');
    expect(vue).toContain('设备名称'); // 真值文本仍在（不因缺外观丢内容）
  });

  it('🔴 阴性②：图标未导出（不在资源映射）⇒ 单格降级不渲 img，其余真值照常', () => {
    const idx = indexFigmaNodes(tableDoc({ icons: ICON_MAP }));
    const r = detectTableLeaf(sec('43:4785'), idx, buildParentMap(idx), []);
    expect(r.cols[0].cells[0].icon).toBeNull();
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).not.toContain('import icon1');
    // 零副作用：无可用图标 ⇒ 不产查表、不产 `<img>`
    expect(vue).not.toContain('ICON_MAP');
    expect(vue).not.toContain('<img');
    expect(vue).toContain('background:#bdd5ff;'); // 外观不受图标缺口影响
  });

  it('🔴 阴性③：同 varName 指向不同 file ⇒ 冲突名下图标全不渲（不猜取哪一个）', () => {
    const conflict = [
      { figmaNodeId: '81:37', resourceFile: '../resources/images/a.png', downloadStatus: 'success', assignedVarName: 'iconX' },
      { figmaNodeId: '81:38', resourceFile: '../resources/images/b.png', downloadStatus: 'success', assignedVarName: 'iconX' },
    ];
    const idx = indexFigmaNodes(tableDoc({ icons: conflict }));
    const r = detectTableLeaf(sec('43:4785'), idx, buildParentMap(idx), conflict);
    const vue = renderFoldedGridLeafVue(r, 'device');
    expect(vue).not.toContain('import iconX');
    expect(vue).toContain('"iconVar": null');
    // 冲突名下无一可用 ⇒ 查表也不产（否则是永远取不到值的空表）
    expect(vue).not.toContain('ICON_MAP');
  });
});

/**
 * 🛡️ 刀 53 外观扩维 · 统计卡（cd8938f8 实锤）：
 * 真值卡底与描边**都在子 VECTOR 上**（卡节点是 GROUP，无 fills/strokes）⇒ 必须回退
 * 子树取真值；取不到即不写（阴性对照）。
 */
describe('刀 53 外观扩维 · detectStatRowLeaf（统计卡渐变底 + 描边）', () => {
  const grad = (from: number[], to: number[]) => ({
    type: 'GRADIENT_LINEAR',
    visible: true,
    opacity: 0.9,
    gradientHandlePositions: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }],
    gradientStops: [
      { position: 0, color: { r: from[0] / 255, g: from[1] / 255, b: from[2] / 255 } },
      { position: 1, color: { r: to[0] / 255, g: to[1] / 255, b: to[2] / 255 } },
    ],
  });
  const gradedCard = (id: string, x: number, title: string, value: string, valueHex: string) => ({
    id,
    type: 'GROUP',
    absoluteBoundingBox: { x, y: 0, width: 134, height: 66 },
    children: [
      {
        id: `${id}-bg`,
        type: 'VECTOR',
        absoluteBoundingBox: { x, y: 0, width: 134, height: 66 },
        fills: [grad([0xd4, 0xe3, 0xff], [0xc1, 0xd6, 0xff])],
        strokes: [solid('#a0c1ff')],
        strokeWeight: 1,
      },
      text(`${id}-t`, title, x + 34, 26, 42, 21, '#333333', 14, 400),
      text(`${id}-v`, value, x + 86, 23, 14, 28, valueHex, 24, 400),
    ],
  });
  const bareCard = (id: string, x: number, title: string, value: string, valueHex: string) => ({
    id,
    type: 'GROUP',
    absoluteBoundingBox: { x, y: 0, width: 134, height: 66 },
    children: [
      text(`${id}-t`, title, x + 34, 26, 42, 21, '#333333', 14, 400),
      text(`${id}-v`, value, x + 86, 23, 14, 28, valueHex, 24, 400),
    ],
  });
  const doc = (mk: any) => ({
    id: 'root',
    type: 'FRAME',
    children: [
      {
        id: '43:4892',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 66 },
        children: [
          mk('43:4893', 0, '总设备', '8', '#3965ff'),
          mk('43:4898', 168, '运行中', '2', '#00ac2e'),
          mk('43:4903', 336, '离线', '1', '#ff7300'),
        ],
      },
    ],
  });

  it('阳性：卡底渐变与描边在子 VECTOR 上 ⇒ 回退取出并内联', () => {
    const idx = indexFigmaNodes(doc(gradedCard));
    const r = detectStatRowLeaf({ id: '43:4898' }, idx, buildParentMap(idx), []);
    expect(r.ok).toBe(true);
    expect(r.members[0].bg).toContain('linear-gradient(90deg');
    expect(r.members[0].bg).toContain('rgba(212,227,255,0.9) 0%');
    expect(r.members[0].bg).toContain('rgba(193,214,255,0.9) 100%');
    expect(r.members[0].border).toBe('1px solid #a0c1ff');
    const vue = renderFoldedGridLeafVue({ ...r, memberIndex: 0 }, 'device');
    expect(vue).toContain('background:linear-gradient(90deg');
    expect(vue).toContain('border:1px solid #a0c1ff;');
    expect(vue).toContain('box-sizing:border-box;');
  });

  it('🔴 阴性（核心纪律）：卡与子树都无外观 ⇒ 不写 background/border（不填兜底色）', () => {
    const idx = indexFigmaNodes(doc(bareCard));
    const r = detectStatRowLeaf({ id: '43:4898' }, idx, buildParentMap(idx), []);
    expect(r.ok).toBe(true);
    expect(r.members[0].bg).toBeNull();
    expect(r.members[0].border).toBeNull();
    const vue = renderFoldedGridLeafVue({ ...r, memberIndex: 0 }, 'device');
    expect(vue).not.toContain('background:');
    expect(vue).not.toContain('border:');
    expect(vue).toContain('总设备'); // 真值文本不受影响
  });
});

/**
 * 🛡️ 刀 53f：图例「圆点 + 短文本」叶接管（mc-max-1792934367321-ab7bb76c 实锤）。
 *
 * 夹具 = 事故件真值几何，一个数字都不改：
 *   `43:4869` = GROUP(53×14) @ (29636,52138)
 *     ├ TEXT `43:4870` "运行中" 42×14 @ (29647,52138) → cy 52145
 *     └ ELLIPSE `43:4871` 8×8  @ (29636,52141)       → cy 52145（gap=3）
 *   `43:4875` = GROUP(39×14) @ (29708,52138)，同构（TEXT 43:4876 "离线" / ELLIPSE 43:4877）
 * 真机日志 2026-10-25T13:20:52Z 的跳过原因（text:hasGraphic(ELLIPSE) + icon:hasText(1)）
 * 正是本判据要填的缝。
 */
describe('刀 53f detectLegendDotTextLeaf / 图例圆点叶', () => {
  /** 图例组：圆点在**几何左侧**，但子项数组序是 [TEXT, ELLIPSE]（真值如此 ⇒ 判据不得依赖序）。 */
  const legendItem = (
    id: string,
    x: number,
    y: number,
    dotId: string,
    textId: string,
    chars: string,
    opts: any = {},
  ) => {
    const dotX = opts.dotX === undefined ? x : opts.dotX;
    const dotW = opts.dotW === undefined ? 8 : opts.dotW;
    const dotH = opts.dotH === undefined ? 8 : opts.dotH;
    const textX = opts.textX === undefined ? x + 11 : opts.textX;
    const dot: any = {
      id: dotId,
      type: 'ELLIPSE',
      absoluteBoundingBox: { x: dotX, y: y + 3, width: dotW, height: dotH },
      fills: opts.noFill ? [] : [solid(opts.dotHex || '#ff7300')],
    };
    const t: any = text(textId, chars, textX, y, chars.length * 14, 14, '#536881', 14, 400);
    if (opts.dropWeight) delete t.style.fontWeight;
    const kids: any[] = [t, dot];
    if (opts.extra) kids.push(opts.extra);
    return {
      id,
      type: 'GROUP',
      name: `Group ${id}`,
      absoluteBoundingBox: { x, y, width: 53, height: 14 },
      children: kids,
    };
  };
  /** 父容器 FRAME 持有 N 枚图例组（parentOf 需要真实父节点才能查兄弟）。 */
  const doc = (items: any[], parentId = '807:2') => ({
    id: 'root',
    type: 'FRAME',
    children: [{ id: parentId, type: 'FRAME', children: items }],
  });
  const TWO = () => [
    legendItem('43:4869', 29636, 52138, '43:4871', '43:4870', '运行中'),
    legendItem('43:4875', 29708, 52138, '43:4877', '43:4876', '离线'),
  ];
  const idxOf = (items: any[], parentId = '807:2') => indexFigmaNodes(doc(items, parentId));

  it('阳性：真值几何 → 点 8×8 + 色值 + 间距 3 + 文本三件套', () => {
    const idx = idxOf(TWO());
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('legend');
    expect(r.sectionId).toBe('43:4869');
    expect(r.baseId).toBe('43:4869');
    expect(r.text).toBe('运行中');
    expect(r.dotW).toBe(8);
    expect(r.dotH).toBe(8);
    expect(r.dotColor).toBe('rgba(255,115,0,1)');
    expect(r.gap).toBe(3);
    expect(r.color).toBe('rgba(83,104,129,1)');
    expect(r.fontSize).toBe(14);
    expect(r.fontWeight).toBe(400);
    expect(r.height).toBe(14);
  });

  it('阳性：同父两枚**各自独立**接管（不需要两阶段抑制）', () => {
    const idx = idxOf(TWO());
    const parentOf = buildParentMap(idx);
    const a: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, parentOf);
    const b: any = detectLegendDotTextLeaf({ id: '43:4875' }, idx, parentOf);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.text).toBe('运行中');
    expect(b.text).toBe('离线');
    // 两者渲染后互不覆盖：类名按 section id 派生 ⇒ 唯一
    expect(renderFoldedGridLeafVue(a, 'device')).toContain('c-device-fg-legend-434869');
    expect(renderFoldedGridLeafVue(b, 'device')).toContain('c-device-fg-legend-434875');
  });

  it('🔴 阳性对照（病灶复现）：同一叶被 text / icon / header 三判据全拒 —— 这就是要填的缝', () => {
    const idx = idxOf(TWO());
    const sec = { id: '43:4869' };
    const t: any = detectTextLeaf(sec, idx);
    const ic: any = detectIconLeaf(sec, idx, []);
    const h: any = detectHeaderRowLeaf(sec, idx, []);
    expect(t.ok).toBe(false);
    expect(t.reason).toMatch(/hasGraphic\(ELLIPSE:43:4871\)/);
    expect(ic.ok).toBe(false);
    expect(ic.reason).toBe('hasText(1)');
    expect(h.ok).toBe(false);
    // 三条与真机日志逐字对齐（2026-10-25T13:20:52Z）
    expect(h.reason).toBe('iconNotMappedOrNotLeftOfTextOnSameRow');
  });

  it('渲染：CSS 圆（无 img）+ 宽高/色值/间距/字号**内联** + 命名空间被覆盖', () => {
    const idx = idxOf(TWO());
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, buildParentMap(idx));
    const vue = renderFoldedGridLeafVue(r, 'device');
    // 🔴 事故件病灶：`.dot` 只有 background 没有 width/height ⇒ 圆点 0×0。故尺寸必须内联。
    expect(vue).toContain(
      'width:8px;height:8px;border-radius:50%;background:rgba(255,115,0,1);flex:none;',
    );
    expect(vue).toContain('display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:3px;');
    expect(vue).toContain('height:14px;');
    expect(vue).toContain('color:rgba(83,104,129,1);font-size:14px;font-weight:400');
    expect(vue).toContain('const text = "运行中"');
    // 圆点是纯色 ELLIPSE，既无路径也无需 PNG ⇒ 绝不渲 img
    expect(vue).not.toContain('<img');
    // 🔴 命名空间：漏了 legend 片段，font-size-normalizer / 布局注入器 / 校验器
    //    三个消费者就不会豁免本文件 ⇒ 真值被改写（副本口径 ⇒ 单点扩维）
    expect(FG_TAKEOVER_CLASS_RX.test('c-device-fg-legend-434869')).toBe(true);
  });

  // ───────── 阴性：零误伤（每条都是「拒绝接管」的正当理由，不是 bug） ─────────
  it('阴性①（图例定义）：同父仅 1 组 ⇒ 可能是状态徽标，不接管', () => {
    const idx = idxOf([legendItem('43:4869', 29636, 52138, '43:4871', '43:4870', '已连接')]);
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('dotTextSiblings=1(need 2)');
  });

  it('阴性②（核心纪律）：圆点无可见 SOLID 填充 ⇒ 不画（绝不填兜底色）', () => {
    const idx = idxOf([
      legendItem('43:4869', 29636, 52138, '43:4871', '43:4870', '运行中', { noFill: true }),
      legendItem('43:4875', 29708, 52138, '43:4877', '43:4876', '离线'),
    ]);
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('dotFillMissing');
  });

  it('阴性③：文本缺 fontWeight ⇒ textStyleIncomplete（不猜）', () => {
    const idx = idxOf([
      legendItem('43:4869', 29636, 52138, '43:4871', '43:4870', '运行中', { dropWeight: true }),
      legendItem('43:4875', 29708, 52138, '43:4877', '43:4876', '离线'),
    ]);
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('textStyleIncomplete');
  });

  it('阴性④：圆点在文字**右侧**（几何反向）⇒ noDotTextPair', () => {
    const idx = idxOf([
      legendItem('43:4869', 29636, 52138, '43:4871', '43:4870', '运行中', {
        dotX: 29690, textX: 29647,
      }),
      legendItem('43:4875', 29708, 52138, '43:4877', '43:4876', '离线'),
    ]);
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noDotTextPair');
  });

  it('阴性⑤：圆点过大（20×20）⇒ 不是「点」⇒ noDotTextPair', () => {
    const idx = idxOf([
      legendItem('43:4869', 29636, 52138, '43:4871', '43:4870', '运行中', { dotW: 20, dotH: 20 }),
      legendItem('43:4875', 29708, 52138, '43:4877', '43:4876', '离线'),
    ]);
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noDotTextPair');
  });

  it('阴性⑥：组内多一个 VECTOR（图标/箭头）⇒ 不是「点+文」纯组 ⇒ noDotTextPair', () => {
    const extra = { id: '43:4999', type: 'VECTOR', absoluteBoundingBox: { x: 29700, y: 52138, width: 8, height: 8 } };
    const idx = idxOf([
      legendItem('43:4869', 29636, 52138, '43:4871', '43:4870', '运行中', { extra }),
      legendItem('43:4875', 29708, 52138, '43:4877', '43:4876', '离线'),
    ]);
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, buildParentMap(idx));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noDotTextPair');
  });

  it('🔴 阴性⑦（锚点纪律）：锚点集合里含别人的图例组 ⇒ 也不得代渲染', () => {
    // `807:2-tail-text` 这类合成叶的 sourceNodeIds 会把父级全部子项带进来（含 43:4869）。
    // 若照兄弟判据那样遍历 collectAnchorNodes 全集，本叶会把 43:4869 的图例重复渲染一遍。
    const idx = idxOf(TWO());
    const r: any = detectLegendDotTextLeaf(
      { id: '807:2-tail-text', sourceNodeIds: ['807:2-tail-text', '807:2', '43:4869'] },
      idx,
      buildParentMap(idx),
    );
    expect(r.ok).toBe(false);
    // 容器被严格解析成真父节点 807:2（2 个 GROUP 子项、0 个 TEXT）⇒ 不构成点+文组
    expect(r.reason).toBe('noDotTextPair');
  });

  it('阴性⑧：父节点不在 parentOf（无法验证同构）⇒ fail-open，不猜', () => {
    const idx = idxOf(TWO());
    const r: any = detectLegendDotTextLeaf({ id: '43:4869' }, idx, new Map());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noParentForRepeatCheck');
  });

  it('fail-open：无 Figma 索引 / 节点不存在时不抛异常', () => {
    expect(() => detectLegendDotTextLeaf({ id: '43:4869' }, new Map(), new Map())).not.toThrow();
    const r: any = detectLegendDotTextLeaf({ id: 'nope:1' }, new Map(), new Map());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noAnchorNode');
  });

  it('端到端：collectFoldedGridTakeover 把两枚图例叶记为 legendTaken=2', () => {
    const items = TWO();
    const out = collectFoldedGridTakeover({
      treeSections: [{ id: 'root', isLayoutContainer: true, children: [{ id: '43:4869' }, { id: '43:4875' }] }],
      figmaNodeData: doc(items),
      resourceMapping: [],
      componentName: 'c-device',
    });
    expect(out.legendHits).toBe(2);
    expect(out.skipped).toHaveLength(0);
    expect(out.map.size).toBe(2);
    for (const [, tr] of out.map) {
      expect(tr.kind).toBe('legend');
      // 图例不走两阶段抑制（每枚独立渲染）⇒ 产物不得出现 display:none 空壳。
      // 🔴 断言「可观测产物」而非 P1-B 新增的 `suppressed` 字段：本 spec 属 P2，
      //    不得依赖 P1-B 落地，否则单独回滚 P1-B 会让 P2 spec 转红（坏 commit 独立性）。
      expect(tr.vue).not.toContain('display:none');
      expect(tr.vue).toContain('-fg-legend-');
    }
  });
});
