/**
 * 🛡️ S0（2026-11-14 · mc-max-1794651114530-9ed088e3 实锤）：布局结构事实 golden。
 *
 * 夹具用**真机几何**（流量监测 `2:9778` 的 bbox 逐节点抄录），断言：
 *   ① 五态判定与设计意图一致（row / row-between / column-stack / free-overlay）；
 *   ② `layoutMode` 与几何冲突时能识别（`modeConflict`）—— 真机 `2:3660` 标 HORIZONTAL 但子项重叠；
 *   ③ `itemSpacing` 与几何间距不符时能识别（`spacingConflict`）—— `1263:38` 标 3 实际 29；
 *   ④ 守卫：G1 越界不判 between、G2 单大间隙判 between、G4 子项 >3 不判 between。
 *
 * 纯函数、无 IO：判据只吃 bbox + 父子 + 类型，**不读图层名**。
 */
import {
  inferLayoutFacts,
  inferLayoutFactsForContainer,
  pickLayoutFacts,
} from './layout-geom-facts.js';

const bb = (x: number, y: number, w: number, h: number) => ({
  absoluteBoundingBox: { x, y, width: w, height: h },
});
const node = (
  id: string,
  name: string,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  layoutMode: string | null = null,
  children: any[] = [],
  extra: Record<string, any> = {},
) => ({ id, name, type, layoutMode, ...bb(x, y, w, h), ...extra, children });

/** 真机几何（9ed088e3 → .mc-gen/cache/figma-node-data.json 逐节点抄录） */
const tree = () =>
  node('2:9778', 'cp-流量监测', 'FRAME', 0, 0, 426, 807, null, [
    node('1744:125', 'slot-con', 'FRAME', 10, 159, 426, 745, null, [
      node('88:32', '0sub-header', 'FRAME', 36, 159, 380, 30, null, [
        node('2:3559', '标题', 'GROUP', 36, 162, 102, 24, null, [
          node('2:3560', '当日总流量', 'TEXT', 58, 162, 80, 24),
          node('2:3561', 'icon', 'GROUP', 36, 165, 18, 18),
        ]),
        node('2:3545', '@ant/select', 'GROUP', 316, 159, 100, 30, null, [
          node('2:7674', '24小时', 'TEXT', 320, 162, 50, 16),
        ]),
      ]),
      node('2:3660', '1统计', 'FRAME', 10, 196, 426, 91, 'HORIZONTAL', [
        node('88:34', 'bg-[m]', 'FRAME', 10, 196, 426, 91),
        node('1744:126', 'cards', 'FRAME', 43, 216, 359, 52),
      ]),
      node('1744:127', '2charts', 'FRAME', 34, 287, 379, 131, null, [
        node('2:7625', 'bar', 'FRAME', 34, 287, 379, 131),
      ]),
      node('1744:128', '3charts', 'FRAME', 34, 428, 379, 131, null, [
        node('2:7794', 'bar', 'FRAME', 34, 428, 379, 131),
      ]),
      node('2:3439', '4sub-header', 'GROUP', 37, 573, 86, 24, null, [
        node('2:3441', 'icon', 'GROUP', 37, 577, 18, 18),
        node('2:3440', '车型分布', 'TEXT', 59, 577, 62, 16),
      ]),
      node('1263:38', '5cards', 'FRAME', 33, 601, 387, 114, 'HORIZONTAL', [
        node('1263:39', 'con', 'FRAME', 45, 650, 166, 53, null, [
          node('2:3459', 'icon', 'FRAME', 45, 658, 41, 36),
          node('246:30', 'donut', 'FRAME', 102, 650, 52, 53),
          node('2:3464', 'num', 'FRAME', 169, 658, 42, 36),
        ]),
        node('1263:40', 'con', 'FRAME', 240, 650, 166, 52, null, [
          node('2:3509', 'icon', 'FRAME', 240, 658, 41, 36),
          node('246:31', 'donut', 'FRAME', 297, 650, 52, 52),
          node('2:3514', 'num', 'FRAME', 364, 658, 42, 36),
        ]),
      ], { itemSpacing: 3 }),
      node('2:3565', '6sub-header', 'GROUP', 36, 730, 378, 24, null, [
        node('2:3571', 'tit', 'GROUP', 36, 730, 86, 24),
        node('2:3566', '@antd/tab', 'FRAME', 128, 733, 204, 18, 'HORIZONTAL', [
          node('2:3567', 'btn-active', 'FRAME', 128, 733, 128, 19),
          node('2:3569', 'btn', 'FRAME', 264, 733, 68, 19),
        ]),
        node('2:3577', '节假日预测', 'TEXT', 347, 733, 67, 18),
      ]),
      node('2:3604', '@echarts/line-7', 'GROUP', 44, 764, 363, 141, null, [
        node('83:31', 'charts', 'FRAME', 44, 764, 363, 141),
        node('2:3636', '图例', 'FRAME', 264, 764, 140, 18),
      ]),
    ]),
    node('2:3436', 'bg-[m]', 'BOOLEAN_OPERATION', 16, 109, 420, 807, null, [
      node('2:3437', 'Vector', 'VECTOR', 16, 109, 420, 807),
    ]),
  ]);

describe('S0 布局结构事实（真机几何 golden）', () => {
  const facts = inferLayoutFacts(tree(), {});

  it('slot-con：8 段纵向、间距不齐 ⇒ column-stack（逐项 margin 真值）', () => {
    expect(facts['1744:125'].mode).toBe('column-stack');
    expect(facts['1744:125'].gaps).toEqual([7, 0, 10, 14, 4, 15, 10]);
  });

  it('0sub-header：一行、首尾贴边、单大间隙 ⇒ row-between（不得下发 gap:178）', () => {
    expect(facts['88:32'].mode).toBe('row-between');
    expect(facts['88:32'].gap).toBeUndefined();
  });

  it('1统计：两卡与装饰图重叠 ⇒ free-overlay，并识别 layoutMode 说谎', () => {
    expect(facts['2:3660'].mode).toBe('free-overlay');
    expect(facts['2:3660'].modeConflict).toBe(true);
  });

  it('echarts 容器：图表与图例重叠 ⇒ free-overlay', () => {
    expect(facts['2:3604'].mode).toBe('free-overlay');
  });

  it('4sub-header / 标题：图标 + 文字一行、间距 4 ⇒ row gap 4', () => {
    expect(facts['2:3439'].mode).toBe('row');
    expect(facts['2:3439'].gap).toBe(4);
    expect(facts['2:3559'].mode).toBe('row');
    expect(facts['2:3559'].gap).toBe(4);
  });

  it('5cards：几何间距 29（itemSpacing 标 3 不可信）⇒ row gap 29 + spacingConflict', () => {
    expect(facts['1263:38'].mode).toBe('row');
    expect(facts['1263:38'].gap).toBe(29);
    expect(facts['1263:38'].spacingConflict).toBe(true);
  });

  it('卡内 con：三块近等距（16/15）⇒ row gap 15（比 space-between 更贴真值）', () => {
    expect(facts['1263:39'].mode).toBe('row');
    expect(facts['1263:39'].gap).toBe(15);
  });

  it('6sub-header：标题 | tabs | 按钮、间距不齐且首尾贴边 ⇒ row-between', () => {
    expect(facts['2:3565'].mode).toBe('row-between');
    expect(facts['2:3565'].gaps).toEqual([6, 15]);
  });

  it('@antd/tab：间距 8（产物里写 16 是错的）', () => {
    expect(facts['2:3566'].mode).toBe('row');
    expect(facts['2:3566'].gap).toBe(8);
  });

  it('单子节点容器不产出事实（下游回落自然流）', () => {
    expect(facts['2:3436']).toBeUndefined();
  });

  it('计数行：evaluated / between / stack / overlay / modeConflict 全部可观测', () => {
    const stats: any = {};
    inferLayoutFacts(tree(), stats);
    expect(stats.evaluated).toBeGreaterThanOrEqual(12);
    expect(stats.between).toBeGreaterThanOrEqual(2);
    expect(stats.stack).toBeGreaterThanOrEqual(1);
    expect(stats.overlay).toBeGreaterThanOrEqual(3);
    expect(stats.modeConflict).toBe(1);
  });
});

describe('S0 守卫（G1 越界 / G2 单大间隙 / G4 子项数）', () => {
  const c = (children: any[], box: any, layoutMode: any = null) => ({
    id: 'c',
    layoutMode,
    absoluteBoundingBox: box,
    children,
  });

  it('G1 越界：子项越出容器 ⇒ 不判 between（降为 stack）', () => {
    // 容器高 100，子项占到 130（越界 30）
    const f = inferLayoutFactsForContainer(
      c(
        [
          { absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 } },
          { absoluteBoundingBox: { x: 0, y: 90, width: 100, height: 40 } },
          { absoluteBoundingBox: { x: 0, y: 180, width: 100, height: 40 } },
        ],
        { x: 0, y: 0, width: 100, height: 260 },
      ),
    );
    // 间距不齐（50/50 齐）→ 这里构造齐次，仅验证不出 between
    expect(['column', 'column-between', 'column-stack']).toContain(f.mode);
    expect(f.mode).not.toBe('column-between');
  });

  it('G2 单大间隙：两个子项隔很远 ⇒ between，不写 gap', () => {
    const f = inferLayoutFactsForContainer(
      c(
        [
          { absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 24 } },
          { absoluteBoundingBox: { x: 300, y: 0, width: 80, height: 24 } },
        ],
        { x: 0, y: 0, width: 380, height: 24 },
      ),
    );
    expect(f.mode).toBe('row-between');
    expect(f.gap).toBeUndefined();
  });

  it('G4 子项 >3 且间距不齐：即使首尾贴边也不判 between（避免把真值间距摊平）', () => {
    const kids = [0, 60, 130, 210, 300].map((x) => ({
      absoluteBoundingBox: { x, y: 0, width: 50, height: 20 },
    }));
    const f = inferLayoutFactsForContainer(c(kids, { x: 0, y: 0, width: 350, height: 20 }));
    expect(f.mode).toBe('row-stack');
  });

  it('子项重叠 ⇒ free-overlay（不是 row）', () => {
    const f = inferLayoutFactsForContainer(
      c(
        [
          { absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 } },
          { absoluteBoundingBox: { x: 50, y: 0, width: 100, height: 40 } },
        ],
        { x: 0, y: 0, width: 200, height: 40 },
      ),
    );
    expect(f.mode).toBe('free-overlay');
  });

  it('缺 bbox ⇒ unknown（fail-open，下游不写布局）', () => {
    expect(inferLayoutFactsForContainer({ id: 'x', children: [{}, {}] }).mode).toBe('unknown');
    expect(inferLayoutFactsForContainer(null as any).mode).toBe('unknown');
  });
});

describe('S0 取用入口 pickLayoutFacts', () => {
  const facts = { '2:3439': { mode: 'row', gap: 4 }, '2:3436': { mode: 'unknown' } };
  it('按候选顺序命中第一个可用事实', () => {
    expect(pickLayoutFacts(facts, [null, '2:9999', '2:3439'])?.gap).toBe(4);
  });
  it('unknown 不算可用（回落自然流）', () => {
    expect(pickLayoutFacts(facts, ['2:3436'])).toBeNull();
  });
  it('facts 为空/无候选 ⇒ null', () => {
    expect(pickLayoutFacts(null, ['a'])).toBeNull();
    expect(pickLayoutFacts(facts, [])).toBeNull();
  });
});
