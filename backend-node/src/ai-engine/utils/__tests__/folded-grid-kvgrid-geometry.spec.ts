/**
 * 🛡️ 刀 53g·路径 B：无 `internalTree` 时从 Figma 几何推导 label-value 网格。
 *
 * 病灶（2026-10-27 · `81:7` 真机日志）：真值 **6 行 × 4 TEXT = 12 对属性**，
 * 但 `detectKvGridLeaf` 唯一输入是 `sec.internalTree.children` ⇒ `kvPairs=0(need>=4)`，
 * 属性网格永不接管、退回 LLM（产物 label 色被写成 #666666，真值 #546881）。
 *
 * 本 fixture 的几何数字**直接取自该真机样本**（右对齐 label、value 定锚、
 * labelGap=15、两端贴边 ⇒ space-between）。
 *
 * 反向要求：`internalTree` 存在时**路径 A 一字不变**（见第 6 例：非法声明不得被几何救起）。
 */
import { detectKvGridLeaf, detectTextLeaf } from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';

const X = 24745;
const Y = 51630;

const solid = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return {
    type: 'SOLID',
    visible: true,
    opacity: 1,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 },
  };
};

/** x1/x2 为左右缘（绝对坐标），便于直接表达「右对齐」。 */
const T = (id: string, chars: string, x1: number, x2: number, y: number, hex = '#546881') => ({
  id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: { x: x1, y, width: x2 - x1, height: 14 },
  fills: [solid(hex)],
  style: { fontSize: 14, fontWeight: 400, lineHeightPx: 14 },
});

/** 真机 81:7 的两行：每行「label value label value」，label 右缘分别对齐 24801 / 25074。 */
const ROW_A = [
  T('a1', '所属产品', X + 0, X + 56, Y), // 24745..24801
  T('a2', '爆闪灯', X + 71, X + 113, Y + 0, '#333333'), // 24816..24858
  T('a3', '产品厂家', X + 273, X + 329, Y), // 25018..25074
  T('a4', '感动科技', X + 344, X + 400, Y, '#333333'), // 25089..25145
];
const ROW_B = [
  T('b1', '设备IP', X + 15, X + 56, Y + 24), // 24760..24801（右缘同 24801）
  T('b2', '192.168.245.123', X + 71, X + 176, Y + 24, '#333333'),
  T('b3', '位置', X + 301, X + 329, Y + 24), // 25046..25074（右缘同 25074）
  T('b4', 'G42高速公路上', X + 344, X + 440, Y + 24, '#333333'), // 右缘 25185 = 容器右缘
];

const makeDoc = (rows: any[][]) => ({
  id: '36:1693',
  type: 'FRAME',
  children: [
    {
      id: '81:7',
      type: 'GROUP',
      absoluteBoundingBox: { x: X, y: Y, width: 440, height: 135.25 },
      children: rows.flat(),
    },
  ],
});
const sec = { id: '81:7' }; // 🔴 刻意不给 internalTree

describe('刀53g 路径 B：无 internalTree 时的几何推导', () => {
  it('阳性：2 行 × 2 对 ⇒ 接管，文本/列距/贴边形态全部来自真值', () => {
    const r = detectKvGridLeaf(sec, indexFigmaNodes(makeDoc([ROW_A, ROW_B])));
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('kvgrid');
    expect(r.cols).toBe(2);
    expect(r.rows).toBe(2);
    expect(r.cells).toHaveLength(4);
    expect(r.cells.map((c: any) => [c.label, c.value])).toEqual([
      ['所属产品', '爆闪灯'],
      ['产品厂家', '感动科技'],
      ['设备IP', '192.168.245.123'],
      ['位置', 'G42高速公路上'],
    ]);
    expect(r.labelGap).toBe(15);
    expect(r.rowGap).toBe(10); // 行距 24 - 行高 14
    expect(r.justify).toBe('space-between'); // 两端贴容器边
    expect(r.cells[0].labelColor).toBe('rgba(84,104,129,1)'); // #546881，不是 LLM 的 #666666
    expect(r.cells[0].valueColor).toBe('rgba(51,51,51,1)');
  });

  it('阴性①：只有一行（8 个 TEXT）⇒ 不是网格，且理由与旧版一致', () => {
    const row = [...ROW_A, ...ROW_B.map((n, i) => ({ ...n, id: `c${i}`, absoluteBoundingBox: { ...n.absoluteBoundingBox, y: Y } }))];
    const r = detectKvGridLeaf(sec, indexFigmaNodes(makeDoc([row])));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvPairs=0(need>=4)');
  });

  it('阴性②：每行文本数不一致 ⇒ 不接管', () => {
    const r = detectKvGridLeaf(sec, indexFigmaNodes(makeDoc([ROW_A, ROW_B, ROW_A.slice(0, 2)])));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvPairs=0(need>=4)');
  });

  it('阴性③：label 右缘越过 value.x（成对关系被破坏）⇒ 不接管', () => {
    // a1 右缘 = 24801；把 a2 挪到 x=24790（仍排在 a1 之后），则 24801 > 24790+2 ⇒ 违例
    const bad = ROW_A.map((n) => (n.id === 'a2' ? { ...n, absoluteBoundingBox: { x: X + 45, y: Y, width: 42, height: 14 } } : n));
    const r = detectKvGridLeaf(sec, indexFigmaNodes(makeDoc([bad, ROW_B])));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvPairs=0(need>=4)');
  });

  it('阴性④：TEXT 不足 8 个 ⇒ 不接管（理由与旧版逐字一致）', () => {
    const r = detectKvGridLeaf(sec, indexFigmaNodes(makeDoc([ROW_A])));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvPairs=0(need>=4)');
  });

  it('阴性⑤：锚点不存在（合成 id）⇒ 不接管，且不抛异常', () => {
    const r = detectKvGridLeaf({ id: '81:7-orphan-text-0' }, indexFigmaNodes(makeDoc([ROW_A, ROW_B])));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvPairs=0(need>=4)');
  });

  it('判据边界：同一 81:7 真值不得被 text 线性化抢走，仍由 kvgrid 接管', () => {
    const idx = indexFigmaNodes(makeDoc([ROW_A, ROW_B]));
    const text = detectTextLeaf(sec, idx);
    expect(text.ok).toBe(false);
    expect(text.reason).toBe('textRunsNotLinear');
    const kv = detectKvGridLeaf(sec, idx);
    expect(kv.ok).toBe(true);
    expect(kv.kind).toBe('kvgrid');
    expect(kv.cells).toHaveLength(4);
  });

  it('路径 A 优先：internalTree 声明非法时不得被几何推导救起', () => {
    // 几何完全合法（同阳性），但 vision 只声明了 2 对 ⇒ 必须按路径 A 报 kvPairs=2
    const withTree = {
      id: '81:7',
      internalTree: {
        gridColumns: 2,
        children: [
          { type: 'label-value', children: [{ type: 'label', text: '所属产品' }, { type: 'value', text: '爆闪灯' }] },
          { type: 'label-value', children: [{ type: 'label', text: '产品厂家' }, { type: 'value', text: '感动科技' }] },
        ],
      },
    };
    const r = detectKvGridLeaf(withTree, indexFigmaNodes(makeDoc([ROW_A, ROW_B])));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kvPairs=2(need>=4)');
  });
});
