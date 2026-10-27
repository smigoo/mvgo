/**
 * 🛡️ 刀 53g 单测（2026-10-27）：属性网格（label-value grid）叶段确定性接管。
 *
 * 阳性对照来自 mc-1793064891313-d072d085（设备详情）真实 Figma 形态 `81:7`
 * 「设备属性信息」：**2 组 × 6 行 × 12 对 label:value**，24 个 TEXT 全部
 * `textAlignHorizontal: LEFT`，但它们的**盒子右缘**钉在两个固定 x ⇒ 视觉上
 * label 是右对齐。这是「语义规则、几何不规则」结构，刀 53 既有七项判据全不命中
 * （`noGridContract` / `texts=24(need 1)` / `hasText(24)` …）⇒ 旧产物猜成 4 列。
 *
 * 夹具刻度：真值 `81:7` x=24745 w=440、value 锚 24816/25089（pitch 273）、
 * label 右缘 24801/25074（labelGap 恒 15）、行距 24（文本高 14 ⇒ rowGap 10）、
 * 列宽 176/181（labelW 56/70）。本夹具按同一比例平移，**不改任何相对关系**。
 */
import {
  detectKvGridLeaf,
  collectFoldedGridTakeover,
  renderFoldedGridLeafVue,
  FG_TAKEOVER_CLASS_RX,
} from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';

const solid = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return {
    type: 'SOLID',
    visible: true,
    opacity: 1,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 },
  };
};

/** 单个 TEXT 节点（几何 + 真值样式三件套 color/fs/fw + lineHeightPx）。 */
const text = (
  id: string,
  chars: string,
  x: number,
  y: number,
  w: number,
  hex = '#546881',
  fs = 14,
  fw = 400,
) => ({
  id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: { x, y, width: w, height: 14 },
  fills: [solid(hex)],
  style: { fontSize: fs, fontWeight: fw, lineHeightPx: 14, textAlignHorizontal: 'LEFT' },
});

/** 真值：容器 x=1000 w=440；value 锚 1071/1344；label 右缘 1056/1329；行 y=500/524/548。 */
const BOX = { x: 1000, y: 500, w: 440, h: 62 };
const VALUE_X = [1071, 1344];
const LABEL_RIGHT = [1056, 1329];
const ROW_Y = [500, 524, 548];

/** 行优先的 6 对真值：[label, labelW, value, valueW] */
const PAIRS: Array<[string, number, string, number]> = [
  ['所属产品', 56, '爆闪灯', 42],
  ['产品厂家', 56, '感动科技', 56],
  ['设备类型', 56, '具身机器人', 70],
  ['所属路公司', 70, '江苏通行宝', 70],
  ['设备IP', 41, '192.168.245.123', 105],
  ['位置', 28, 'G42高速公路上', 96],
];

/** Figma 真值树：`81:7` 的直接子 TEXT（24 → 这里 12 个，比例等价）。 */
function figmaDoc() {
  const kids: any[] = [];
  PAIRS.forEach(([label, lw, value, vw], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    kids.push(
      text(`L${i}`, label, LABEL_RIGHT[col] - lw, ROW_Y[row], lw),
      text(`V${i}`, value, VALUE_X[col], ROW_Y[row], vw, '#333333'),
    );
  });
  return {
    id: 'root',
    type: 'DOCUMENT',
    children: [
      {
        id: '81:7',
        type: 'FRAME',
        name: '设备属性信息',
        absoluteBoundingBox: { x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h },
        children: kids,
      },
    ],
  };
}

/**
 * vision 语义树。`order` 用来证明「输出顺序由几何决定，不由 vision 数组顺序决定」：
 * 传 `'column'` 即按列优先倒序给出（真机 vision 就是列优先，且 id 整体偏移一位）。
 */
function internalTree(order: 'row' | 'column' = 'row') {
  const idxs = PAIRS.map((_, i) => i);
  const ordered = order === 'row' ? idxs : [1, 3, 5, 0, 2, 4];
  return {
    source: 'vision',
    sourceSectionId: '36:1699',
    layout: 'grid',
    gridColumns: 2,
    nodeCount: 6,
    children: ordered.map((i) => ({
      // 🔴 id 故意错位（真机 vision 实测偏移一位）—— 判据不得采信
      id: `36:${1700 + i}`,
      type: 'label-value',
      layout: 'horizontal',
      children: [
        { type: 'label', text: PAIRS[i][0], styles: { fontSize: '14px', color: 'rgba(84,104,129,1)' } },
        { type: 'value', text: PAIRS[i][2], styles: { fontSize: '14px', color: 'rgba(51,51,51,1)' } },
      ],
    })),
  };
}

const secOf = (tree: any) => ({ id: '81:7', internalTree: tree });
const idxOf = (doc: any = figmaDoc()) => indexFigmaNodes(doc);

describe('刀 53g 属性网格判据 detectKvGridLeaf', () => {
  it('阳性：2 列 × 3 行 ⇒ 列/行/行距/列分布/label 定宽全部来自几何真值', () => {
    const r: any = detectKvGridLeaf(secOf(internalTree()), idxOf());
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('kvgrid');
    expect(r.sectionId).toBe('81:7');
    expect(r.cols).toBe(2);
    expect(r.rows).toBe(3);
    expect(r.rowGap).toBe(10); // 行距 24 − 文本高 14
    expect(r.labelGap).toBe(15); // value 左缘 − label 右缘
    // 首列贴容器左 ∧ 末列贴容器右 ⇒ space-between（事实，不是样式偏好）
    expect(r.justify).toBe('space-between');
    expect(r.colGap).toBe(0);
    // 列内 label 定宽 = 该列最宽 label（col0: 56 / col1: 70）
    expect(r.columns).toEqual([{ labelW: 56 }, { labelW: 70 }]);
    expect(r.cells).toHaveLength(6);
  });

  it('阳性：单元按**行优先**输出，且颜色/字号/行高取自 Figma 真值（不取 vision）', () => {
    const r: any = detectKvGridLeaf(secOf(internalTree()), idxOf());
    expect(r.cells.map((c: any) => `${c.col}:${c.label}=${c.value}`)).toEqual([
      '0:所属产品=爆闪灯',
      '1:产品厂家=感动科技',
      '0:设备类型=具身机器人',
      '1:所属路公司=江苏通行宝',
      '0:设备IP=192.168.245.123',
      '1:位置=G42高速公路上',
    ]);
    expect(r.cells[0]).toMatchObject({
      labelColor: 'rgba(84,104,129,1)',
      labelFs: 14,
      labelFw: 400,
      labelLh: 14,
      valueColor: 'rgba(51,51,51,1)',
      valueFs: 14,
      valueFw: 400,
      valueLh: 14,
    });
  });

  it('阳性：vision 数组顺序被打乱（列优先）⇒ 输出仍是行优先（几何驱动，不靠数组序）', () => {
    const a: any = detectKvGridLeaf(secOf(internalTree('row')), idxOf());
    const b: any = detectKvGridLeaf(secOf(internalTree('column')), idxOf());
    expect(b.ok).toBe(true);
    expect(b.cells).toEqual(a.cells);
  });

  it('阴性：label 右缘不齐（非右对齐事实）⇒ fail-open', () => {
    const doc: any = figmaDoc();
    // 把第 0 行的 label 整体右移 8px：右缘不再落在 1056
    doc.children[0].children[0].absoluteBoundingBox.x += 8;
    const r: any = detectKvGridLeaf(secOf(internalTree()), idxOf(doc));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvLabelNotRightAligned(col0)');
  });

  it('阴性：TEXT 数量 ≠ 2 × 配对数（多出标题/单位等额外文本）⇒ fail-open', () => {
    const doc: any = figmaDoc();
    doc.children[0].children.push(text('extra', '单位：mm', 1400, 560, 48));
    const r: any = detectKvGridLeaf(secOf(internalTree()), idxOf(doc));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvTexts=13(need 12)');
  });

  it('阴性：几何列锚数与声明 gridColumns 不符 ⇒ fail-open（不按声明硬拆）', () => {
    const tree = { ...internalTree(), gridColumns: 3 };
    const r: any = detectKvGridLeaf(secOf(tree), idxOf());
    expect(r.ok).toBe(false);
    // 6 对 / 3 列 ⇒ 先被 rect 判据拦（6 % 3 === 0 会过），再被行/列聚类拦
    expect(r.reason).toBe('kvColsMismatch(2!=3)');
  });

  it('阴性：行距不等距 ⇒ fail-open（乱排绝不猜）', () => {
    const doc: any = figmaDoc();
    // 末行整体下移 20px（行距 24/24 → 24/44）
    for (const n of doc.children[0].children) {
      if (n.absoluteBoundingBox.y === 548) n.absoluteBoundingBox.y += 20;
    }
    const r: any = detectKvGridLeaf(secOf(internalTree()), idxOf(doc));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvRowPitchNotUniform');
  });

  it('路径 B：无 internalTree（旧 plan）⇒ 由 Figma 几何推导接管，且与路径 A 产物一致', () => {
    // 🔴 2026-10-27 反转：原用例断言「无 internalTree ⇒ 不命中」，那正是 `81:7`
    //   （真值 12 对属性却 kvPairs=0）的病灶本身。现在无 internalTree 时走几何推导，
    //   并要求**与 vision 声明路径产物完全一致**（同源校验，不依赖词表）。
    const r: any = detectKvGridLeaf({ id: '81:7' }, idxOf());
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('kvgrid');
    const withTree: any = detectKvGridLeaf(secOf(internalTree()), idxOf());
    expect(withTree.ok).toBe(true);
    expect(r.cells.map((c: any) => [c.label, c.value])).toEqual(
      withTree.cells.map((c: any) => [c.label, c.value]),
    );
    expect({ cols: r.cols, rows: r.rows, labelGap: r.labelGap, justify: r.justify, rowGap: r.rowGap }).toEqual({
      cols: withTree.cols,
      rows: withTree.rows,
      labelGap: withTree.labelGap,
      justify: withTree.justify,
      rowGap: withTree.rowGap,
    });
  });

  it('阴性：内部树类型混入 stat-card ⇒ fail-open（不与统计行抢域）', () => {
    const tree: any = internalTree();
    tree.children[0].type = 'stat-card';
    const r: any = detectKvGridLeaf(secOf(tree), idxOf());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/^kvTypeMixed\(/);
  });

  it('fail-open：无 Figma 索引 / sec 为空时不抛异常', () => {
    expect(() => detectKvGridLeaf(secOf(internalTree()), new Map())).not.toThrow();
    const r: any = detectKvGridLeaf(secOf(internalTree()), new Map());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvAnchorBoxMissing');
    const r2: any = detectKvGridLeaf(null, new Map());
    expect(r2.ok).toBe(false);
  });
});

describe('刀 53g 渲染 renderFoldedGridLeafVue(kind=kvgrid)', () => {
  const tr: any = detectKvGridLeaf(secOf(internalTree()), idxOf());

  it('模板：2 列 max-content + space-between + 行距内联（不依赖 style 块）', () => {
    const vue = renderFoldedGridLeafVue(tr, 'device');
    expect(vue).toContain('c-device-fg-kvgrid-817');
    expect(vue).toContain('display:grid');
    expect(vue).toContain('grid-template-columns:repeat(2, max-content)');
    expect(vue).toContain('justify-content:space-between');
    expect(vue).toContain('row-gap:10px');
    expect(vue).not.toContain('column-gap'); // space-between 通道不带 column-gap
  });

  it('label：定宽 + text-align:right（复刻真值右缘对齐），字号/色值全部内联', () => {
    const vue = renderFoldedGridLeafVue(tr, 'device');
    expect(vue).toContain('flex:0 0 56px;text-align:right;color:rgba(84,104,129,1);font-size:14px;font-weight:400;line-height:14px');
    expect(vue).toContain('flex:0 0 70px;text-align:right');
    expect(vue).toContain('gap:15px');
    expect(vue).toContain('color:rgba(51,51,51,1);font-size:14px;font-weight:400;line-height:14px');
  });

  it('数据内联进 script const（12 个 l/v 常量 = 6 对）', () => {
    const vue = renderFoldedGridLeafVue(tr, 'device');
    expect(vue).toContain('const l0 = "所属产品"');
    expect(vue).toContain('const v0 = "爆闪灯"');
    expect(vue).toContain('const l5 = "位置"');
    expect(vue).toContain('const v5 = "G42高速公路上"');
    expect(vue).not.toContain('const l6');
  });

  it('🔴 类名签名登记：`-fg-kvgrid-` 必须命中 FG_TAKEOVER_CLASS_RX', () => {
    // 该正则的消费方：font-size-normalizer 的内联字号保护 / skip 选择器、
    // code-validator 清单过滤、layout-facts-injector 跳过注入、orphan-style-rule-guard。
    // 漏登记 ⇒ 字号塌回 @fontSize（d072d085 实锤病灶之一）。
    expect(FG_TAKEOVER_CLASS_RX.test('c-device-fg-kvgrid-817')).toBe(true);
    expect(FG_TAKEOVER_CLASS_RX.test('c-device-fg-kvgrid-817-label')).toBe(true);
  });
});

describe('刀 53g 端到端 collectFoldedGridTakeover', () => {
  const tree = [
    {
      id: 'root',
      isLayoutContainer: true,
      children: [{ id: '81:7', internalTree: internalTree() }],
    },
  ];

  it('计为 kvGridHits=1 且**不**混进 gridHits（计数失真 = 假绿）', () => {
    const out: any = collectFoldedGridTakeover({
      treeSections: tree,
      figmaNodeData: figmaDoc(),
      resourceMapping: [],
      componentName: 'c-device',
    });
    expect(out.kvGridHits).toBe(1);
    expect(out.gridHits).toBe(0);
    expect(out.skipped).toHaveLength(0);
    expect(out.map.size).toBe(1);
    for (const [, t] of out.map) {
      expect((t as any).kind).toBe('kvgrid');
      expect((t as any).vue).toContain('-fg-kvgrid-');
    }
  });

  it('抑制语义：属性网格**不走**两阶段决策，产物不得出现 display:none 空壳', () => {
    const out: any = collectFoldedGridTakeover({
      treeSections: tree,
      figmaNodeData: figmaDoc(),
      resourceMapping: [],
      componentName: 'c-device',
    });
    for (const [, t] of out.map) expect((t as any).vue).not.toContain('display:none');
  });
});
