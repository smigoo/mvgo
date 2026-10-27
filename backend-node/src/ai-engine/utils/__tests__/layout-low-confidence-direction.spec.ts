/**
 * 🛡️ low 置信方向闸单测（2026-10-27 · mc-1793064994649-2ec8acc7 实锤）
 *
 * 病灶：`decideGeometricLayout` 对 `confidence:'low'` **无条件**兜底 `row`。
 * 历史理由「不标准文件仍 flex，横排被堆纵是最常见的失败」只覆盖一半失效；
 * 另一半（真值纵排被兜底成横排）把整段纵排压成一条窄列 —— `807:2`（`slot-con`
 * 483×515，真值三段 y=51637/51728/52138）即是：三张统计卡 / 表格 / 图例 / 链接
 * 全被横排进一行，表格被压成右侧窄条。
 *
 * 修法（两事实合取，非「按组件 id」的特例）：
 *   仅当 ① 几何多数判 `column` ∧ ② 容器自身「高 > 宽」 ⇒ 保留 `column`；
 *   其余一律保持原兜底 `row`。
 *
 * 为什么必须合取（全语料量化 168 组件 / 9534 容器 / low 777 个）：
 *   单看 ① 会把 `2:8419`（388×30 header，ratio 0.464）翻成纵排 ⇒ 本 spec 的
 *   「宽容器 + 几何 column + low ⇒ 仍 row」就是防这一半。
 */
import { decideLayoutForBoxes } from '../figma-node-layout-facts.js';

const box = (x: number, y: number, w: number, h: number) => ({
  id: `${x}-${y}`,
  absoluteBoundingBox: { x, y, width: w, height: h },
});

/**
 * 5 个兄弟：上一行 3 个并排 + 下一行 2 个并排（两行之间 y 不重叠）。
 * ⇒ pair 数 C(5,2)=10、side-by-side 4（3 + 1）⇒ `ratio 0.4`（low）、几何多数判 `column`。
 * 尺寸刻意做小（最大 120×14），避免被 `excludeBackgroundLayers`（面积 ≥90% 父面积）
 * 当背景层剔掉 —— 剔掉后配对集会塌成 high，测的就不是本闸了。
 * 列聚类为 `[2,1,1,1]`（min 1）⇒ `detectGridColumns` 返回 0，不会误入 grid 分支。
 */
const LOW_COLUMN_KIDS = () => {
  const top = [0, 70, 140].map((x) => box(x, 0, 60, 14));
  const bottom = [box(0, 16, 120, 14), box(130, 16, 120, 14)];
  return [...top, ...bottom];
};

/** 5 个兄弟：4 个在同一行并排 + 1 个在下方 ⇒ ratio 6/10 = 0.6（low）且几何多数判 `row`。 */
const LOW_ROW_KIDS = () => {
  const row4 = [0, 70, 140, 210].map((x) => box(x, 0, 60, 40));
  return [...row4, box(0, 50, 270, 120)];
};

const TALL = { x: 0, y: 0, width: 290, height: 300 }; // h 300 > w 290
const WIDE = { x: 0, y: 0, width: 388, height: 30 }; // h 30 < w 388（2:8419 header 形态）

describe('low 置信方向闸 decideLayoutForBoxes', () => {
  it('基线复算：5 兄弟得 ratio 0.4、confidence low、几何多数 column', () => {
    const r = decideLayoutForBoxes(LOW_COLUMN_KIDS(), null) as any;
    expect(r.display).toBe('flex');
    expect(r.confidence).toBe('low');
    expect(r.ratio).toBeCloseTo(0.4, 5);
  });

  it('阳性：几何判 column ∧ 容器高>宽 ⇒ 保留 column（807:2 形态）', () => {
    const r = decideLayoutForBoxes(LOW_COLUMN_KIDS(), TALL) as any;
    expect(r.flexDirection).toBe('column');
    expect(r.confidence).toBe('low');
  });

  it('🔴 阴性：几何判 column 但容器宽>高 ⇒ 仍兜底 row（2:8419 388×30 header 不翻车）', () => {
    const r = decideLayoutForBoxes(LOW_COLUMN_KIDS(), WIDE) as any;
    expect(r.flexDirection).toBe('row');
    expect(r.confidence).toBe('low');
  });

  it('阴性：无 parentBox（拿不到容器尺寸）⇒ 保持历史兜底 row', () => {
    const r = decideLayoutForBoxes(LOW_COLUMN_KIDS(), null) as any;
    expect(r.flexDirection).toBe('row');
  });

  it('阴性：容器高>宽但几何多数判 row ⇒ row（本闸在构造上碰不到）', () => {
    const r = decideLayoutForBoxes(LOW_ROW_KIDS(), TALL) as any;
    expect(r.confidence).toBe('low');
    expect(r.ratio).toBeCloseTo(0.6, 5);
    expect(r.flexDirection).toBe('row');
  });

  it('阴性：高置信不受本闸影响（row/high 与 column/high 各自维持）', () => {
    const rowHigh = decideLayoutForBoxes([box(0, 0, 100, 40), box(110, 0, 100, 40)], TALL) as any;
    expect(rowHigh.confidence).toBe('high');
    expect(rowHigh.flexDirection).toBe('row');
    const colHigh = decideLayoutForBoxes([box(0, 0, 100, 40), box(0, 50, 100, 40)], TALL) as any;
    expect(colHigh.confidence).toBe('high');
    expect(colHigh.flexDirection).toBe('column');
  });

  it('阴性：grid 分支完全不经过本闸', () => {
    // 2 列 × 2 行等距（`detectGridColumns` 命中）
    const kids = [
      box(0, 0, 60, 40), box(70, 0, 60, 40),
      box(0, 50, 60, 40), box(70, 50, 60, 40),
    ];
    const r = decideLayoutForBoxes(kids, TALL) as any;
    expect(r.display).toBe('grid');
    expect(r.gridColumns).toBe(2);
    expect(r.flexDirection).toBeUndefined();
  });

  it('回归护栏：807:2 真实形态（483×515、7 子含越界 rect）仍判 column', () => {
    const kids = [
      box(29636, 51728, 470, 388), // 43:4784 表格
      box(29636, 52138, 53, 14), // 43:4869 状态
      box(29708, 52138, 39, 14), // 43:4875 状态
      box(30001, 52138, 84, 14), // 43:4878 「点击查看详情」
      box(29636, 51637, 470, 66), // 43:4892 三卡
      box(30095, 52141, 8, 8), // 43:4911 icon
      box(30113, 51815, 6, 218), // 43:5688 越界滚动条
    ];
    const r = decideLayoutForBoxes(kids, { x: 29636, y: 51637, width: 483, height: 515 }) as any;
    expect(r.display).toBe('flex');
    expect(r.flexDirection).toBe('column');
    expect(r.confidence).toBe('low');
    expect(r.ratio).toBeCloseTo(0.333, 2);
  });
});

/**
 * 刀 5（2026-10-27）：`tallContainer` 只覆盖「竖长方形」容器，**宽容器真纵排**漏检。
 *
 * 视觉裁判实测（`__tests__/fixtures/direction-truth-cases.ts`）：
 * 全语料「low ∧ 几何判 column ∧ 宽容器」只有 95 个容器 / 3 种结构 ——
 *   · `2:3438` 387×142 ×19、`2:3446` 192×114 ×38 —— 真值 `column`（标题带 + 内容带）
 *   · `2:8419` 388×30 ×38 —— 真值 `row`（一行 header，下方只有一条 6px 下划线）
 * ⇒ 补第三条事实：剔除装饰后按 y 聚带，要求「带数 ≥ 2」且「首带之后最厚那条带
 *   高 ≥ 50% 父高 ∧ 横向覆盖 ≥ 60% 父宽」。
 */
describe('刀 5 · 宽容器真纵排（内容带证据）', () => {
  // 2:3438 形态：上方一条标题带（86×24），下方两张 192×114 卡横排
  const TITLE_PLUS_CARDS = () => [
    box(0, 0, 86, 24), // 标题
    box(0, 28, 192, 114), // 左卡
    box(195, 28, 192, 114), // 右卡
  ];
  const WIDE_2_3438 = { x: 0, y: 0, width: 387, height: 142 }; // 宽容器（h 142 < w 387）

  it('✅ 阳性：宽容器 + 标题带 + 厚内容带 ⇒ column（2:3438 形态，旧闸会兜底成 row）', () => {
    const r = decideLayoutForBoxes(TITLE_PLUS_CARDS(), WIDE_2_3438) as any;
    expect(r.display).toBe('flex');
    expect(r.confidence).toBe('low');
    expect(r.flexDirection).toBe('column');
  });

  it('✅ 阳性：同一组 box 换成高容器 ⇒ 走 tallContainer 那条，结论一致（两条事实不冲突）', () => {
    const r = decideLayoutForBoxes(TITLE_PLUS_CARDS(), {
      x: 0, y: 0, width: 142, height: 387,
    }) as any;
    expect(r.flexDirection).toBe('column');
  });

  it('阴性（不变量）：全在 1 条带里时 ratio 必然偏高 ⇒ 走 high 直出，本闸根本不参与', () => {
    // 4 个子项同一行：C(4,2)=6 对全部 side-by-side ⇒ ratio 1.0(high) ⇒ 直接 row。
    // 这解释了为什么「带数 ≥ 2」这条前置条件是必要的：真正需要救的容器一定先落在 low。
    const kids = [
      box(0, 2, 64, 19),
      box(100, 0, 80, 23),
      box(186, 0, 115, 23),
      box(307, 0, 81, 23),
    ];
    const r = decideLayoutForBoxes(kids, WIDE) as any;
    expect(r.confidence).toBe('high');
    expect(r.flexDirection).toBe('row');
  });

  it('🔴 阴性：第二带只是一条 6px 下划线（装饰，占父高 27%）⇒ 仍 row', () => {
    const kids = [
      box(0, 2, 64, 19),
      box(100, 0, 80, 23),
      box(186, 0, 115, 23),
      box(7, 23, 362, 6), // 下划线：细长条，剔除装饰后不构成第二带
    ];
    const r = decideLayoutForBoxes(kids, WIDE) as any;
    expect(r.flexDirection).toBe('row');
  });

  it('🔴 阴性：标题 + 两块厚卡，但卡组横向只占 53% 父宽 ⇒ 仍 row（宽度门槛挡住）', () => {
    const kids = [
      box(0, 0, 86, 24), // 标题带
      box(0, 28, 100, 114), // 卡 1
      box(105, 28, 100, 114), // 卡 2 —— 两卡总跨度 205 / 387 = 53%
    ];
    const r = decideLayoutForBoxes(kids, WIDE_2_3438) as any;
    expect(r.confidence).toBe('low'); // 三兄弟只有 1 对 side-by-side ⇒ 0.333
    expect(r.flexDirection).toBe('row');
  });

  it('🔴 阴性：容器宽但几何多数判 row ⇒ 本闸在构造上碰不到', () => {
    const r = decideLayoutForBoxes(LOW_ROW_KIDS(), WIDE_2_3438) as any;
    expect(r.confidence).toBe('low');
    expect(r.flexDirection).toBe('row');
  });

  it('🔴 阴性：无 parentBox ⇒ 拿不到父尺寸，不触发第三条事实，保持 row', () => {
    const r = decideLayoutForBoxes(TITLE_PLUS_CARDS(), null) as any;
    expect(r.flexDirection).toBe('row');
  });
});
