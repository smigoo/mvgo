/**
 * 🧱 column-pair 多列卡内布局（2026-11-13 · mc-max-1794551009165-7dfc01e9 实锤）
 *
 * 病灶：车型分布卡真值 =「副标题行 + 左列(客车/22350 x 对齐) + 右列(货车/16270 右缘对齐)」，
 * 既有 textDir 只有 row|column（column 要求全部 run x 对齐 ≤2px），双列卡 x 起点差
 * 142px ⇒ fallback 'row' ⇒ 确定性单行横排 ⇒ 五段文字挤爆 192px 卡被裁（产物只剩「66」）。
 *
 * 本 spec 钉死 analyzeColumnPair 的几何判据与 cardTruth/renderFoldedGridLeafVue 的接线，
 * 阳性 fixture 逐坐标复刻 7dfc01e9 真值（1263:38 卡）。
 */
import { analyzeColumnPair, cardTruth } from '../folded-grid-section-takeover.js';

/** run+box 构造器（box 为卡内绝对坐标，同 cardTruth 内部口径） */
const R = (text, x, y, w, h) => ({
  text,
  color: 'rgba(51,51,51,1)',
  fs: 12,
  fw: 400,
  box: { x, y, w, h },
});

/** 7dfc01e9 真值复刻（卡 x=33, y=601）：副标题 + 左列(左对齐) + 右列(右对齐) */
function vehicleDistRuns() {
  return [
    R('江阴靖江长江隧道', 73, 603, 112, 18), // 标题行（跨两列）
    R('客车', 45, 658, 24, 18), // 左列 r1
    R('货车', 187, 658, 24, 18), // 右列 r1
    R('22350', 45, 676, 52, 18), // 左列 r2（左缘对齐）
    R('16270', 159, 676, 52, 18), // 右列 r2（右缘对齐 211）
  ];
}

describe('analyzeColumnPair 列聚类判据', () => {
  it('阳性（7dfc01e9 真值）：副标题拆出 + 两列各竖排 + 左 right 对齐判据', () => {
    const out = analyzeColumnPair(vehicleDistRuns());
    expect(out).not.toBeNull();
    expect(out.titleRun?.text).toBe('江阴靖江长江隧道');
    expect(out.columnRuns).toHaveLength(2);
    expect(out.columnRuns[0].map((r) => r.text)).toEqual(['客车', '22350']);
    expect(out.columnRuns[1].map((r) => r.text)).toEqual(['货车', '16270']);
    // 左列左缘极差 0 ⇒ left；右列右缘极差 0 ⇒ right（货车 x187 w24 右缘 211 = 16270 x159 w52 右缘 211）
    expect(out.colAligns).toEqual(['left', 'right']);
    // 列内行距真值：676 - (658+18) = 0
    expect(out.rowGap).toBe(0);
  });

  it('阴性：单行横排（行组数 <2）⇒ null（既有 row 形态不劫持）', () => {
    expect(analyzeColumnPair([R('a', 10, 10, 20, 18), R('b', 60, 10, 20, 18), R('c', 110, 10, 20, 18)])).toBeNull();
  });

  it('阴性：单列竖排（主行列数 <2）⇒ null（既有 column 形态不劫持）', () => {
    expect(
      analyzeColumnPair([R('a', 10, 10, 20, 18), R('b', 10, 40, 20, 18), R('c', 10, 70, 20, 18)]),
    ).toBeNull();
  });

  it('阴性：各行列数不一致 ⇒ null（不猜）', () => {
    // 2 行：首行 2 run，次行 1 run 且非全宽标题（标题拆分仅允许首行组）
    expect(
      analyzeColumnPair([R('a', 10, 10, 20, 18), R('b', 60, 10, 20, 18), R('c', 10, 40, 20, 18)]),
    ).toBeNull();
  });

  it('阴性：跨行 x 区间无重叠 ⇒ null（不是同一列）', () => {
    // 行2 的第 2 个 run 与行1 第 2 个 run 列区间错位
    expect(
      analyzeColumnPair([
        R('a', 10, 10, 20, 18),
        R('b', 60, 10, 20, 18),
        R('c', 10, 40, 20, 18),
        R('d', 110, 40, 20, 18),
      ]),
    ).toBeNull();
  });

  it('阴性：标题越出主行水平范围 ⇒ null（结构可疑不猜）', () => {
    // 标题 x=200 越出主行内容区 [10,80]（+2 容差外）
    expect(
      analyzeColumnPair([
        R('t', 200, 0, 20, 18),
        R('a', 10, 30, 20, 18),
        R('b', 60, 30, 20, 18),
        R('c', 10, 60, 20, 18),
        R('d', 60, 60, 20, 18),
      ]),
    ).toBeNull();
  });

  it('阳性：居中副标题与侧列无重叠仍是合法标题行（7dfc01e9 形态）', () => {
    expect(
      analyzeColumnPair([
        R('t', 25, 0, 30, 18), // 与左列[10,30]右缘相切、不与右列重叠
        R('a', 10, 30, 20, 18),
        R('b', 60, 30, 20, 18),
        R('c', 10, 60, 20, 18),
        R('d', 60, 60, 20, 18),
      ]),
    ).not.toBeNull();
  });

  it('阴性：run 不足 3 ⇒ null', () => {
    expect(analyzeColumnPair([R('a', 10, 10, 20, 18), R('b', 60, 10, 20, 18)])).toBeNull();
  });
});

describe('cardTruth column-pair 接线', () => {
  /** 构造最小 Figma 卡节点（TEXT 子节点带 characters + absoluteBoundingBox） */
  function cardNode(runs, cardBox) {
    return {
      id: 'test:card',
      name: 'card',
      type: 'FRAME',
      absoluteBoundingBox: cardBox,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      children: runs.map((r, i) => ({
        id: `test:t${i}`,
        name: r.text,
        type: 'TEXT',
        characters: r.text,
        absoluteBoundingBox: { x: r.box.x, y: r.box.y, width: r.box.w, height: r.box.h },
        style: { fontSize: r.fs, fontWeight: r.fw },
        fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 }, opacity: 1 }],
      })),
    };
  }

  it('双列卡 ⇒ textDir=column-pair + title/columns/colAligns/padRight 结构真值', () => {
    // 卡 x=33 w=192：末列右缘 211 ⇒ padRight = 33+192-211 = 14
    const t = cardTruth(cardNode(vehicleDistRuns(), { x: 33, y: 601, width: 192, height: 114 }), []);
    expect(t).not.toBeNull();
    expect(t.textDir).toBe('column-pair');
    expect(t.title?.text).toBe('江阴靖江长江隧道');
    expect(t.columns).toHaveLength(2);
    expect(t.columns[0].map((x) => x.text)).toEqual(['客车', '22350']);
    expect(t.columns[1].map((x) => x.text)).toEqual(['货车', '16270']);
    expect(t.colAligns).toEqual(['left', 'right']);
    expect(t.padRight).toBe(14);
    // runs 字段保留（向后兼容）
    expect(t.runs).toHaveLength(5);
  });

  it('单列竖排卡 ⇒ 既有 column 形态逐字不变（阴性）', () => {
    const runs = [R('摄像机', 39, 13, 36, 18), R('(2/484)', 39, 35, 55, 21)];
    const t = cardTruth(cardNode(runs, { x: 20, y: 20, width: 117, height: 64 }), []);
    expect(t.textDir).toBe('column');
    expect(t.title).toBeUndefined();
    expect(t.columns).toBeUndefined();
  });
});
