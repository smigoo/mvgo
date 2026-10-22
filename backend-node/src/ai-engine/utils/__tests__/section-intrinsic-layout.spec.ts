/**
 * 刀 50 —— 段内固有几何契约（section-intrinsic-layout）
 *
 * 真值数据全部来自第八轮真机（2026-10-22 · 任务 c-db2d65 / Figma `GTcJm0DKQvcJvcOZTh5n1l` 节点 38:3134）：
 *   38:3137 战略合作厂商 604×161，子 16 / 30 / 30
 *   38:3162 优质厂商     604×212，子 16 / 130
 *   38:3206 普通厂商     604×265，子 16 / 180
 * 三个段**结构完全同构**（上留白 25 / 左留白 20 / header 16 / 间距 16 然后 20），只有行数不同。
 */
import {
  unionBoxes,
  resolveSectionBox,
  resolveSectionSize,
  resolveIntrinsicLayout,
  resolveStackGeometry,
  buildIntrinsicContainerStyle,
  buildIntrinsicChildStyle,
} from '../section-intrinsic-layout.js';

/** 真实 Figma bbox（第八轮真机 api.figma.com 原始返回，1:1 照抄） */
const BB = {
  '38:3137': { x: 26894, y: 51592, width: 604, height: 161 },
  '38:3139': { x: 26938, y: 51617, width: 96, height: 16 }, // 战略 标题
  '38:3140': { x: 26914, y: 51649, width: 564, height: 30 },
  '38:3153': { x: 26914, y: 51699, width: 272, height: 30 },

  '38:3162': { x: 26894, y: 51773, width: 604, height: 212 },
  '38:3166': { x: 26938, y: 51798, width: 64, height: 16 }, // 优质 标题
  '38:3167': { x: 26914, y: 51830, width: 564, height: 30 }, // 首行（合成段只覆盖首行）
  '38:3180': { x: 26914, y: 51880, width: 564, height: 30 },
  '38:3193': { x: 26914, y: 51930, width: 564, height: 30 },

  '38:3206': { x: 26894, y: 52005, width: 604, height: 265 },
  '38:3210': { x: 26938, y: 52030, width: 64, height: 16 }, // 普通 标题
  '38:3211': { x: 26914, y: 52062, width: 564, height: 30 },
  '38:3224': { x: 26914, y: 52112, width: 564, height: 30 },
  '38:3237': { x: 26914, y: 52162, width: 564, height: 30 },
  '38:3250': { x: 26914, y: 52212, width: 418, height: 30 },

  '796:3': { x: 26894, y: 51483, width: 604, height: 787 },
  '38:3260': { x: 26900, y: 51483, width: 265, height: 76 },
  '38:3282': { x: 27229, y: 51483, width: 265, height: 76 },
};

function makeIndex(ids) {
  const m = new Map();
  for (const id of ids) {
    if (BB[id]) m.set(id, { id, bbox: BB[id], rawNode: { id, absoluteBoundingBox: BB[id] } });
  }
  return m;
}

const INDEX = makeIndex(Object.keys(BB));

/** 真实 plan 节点的几何相关切片（照抄 .checkpoint/analysis.json） */
const PLAN = {
  '38:3137': {
    id: '38:3137',
    layout: 'vertical',
    sourceNodeIds: ['38:3137'],
    children: [
      { id: '38:3137-tail-text', type: 'header', sourceNodeIds: ['38:3139'] },
      { id: '38:3140', sourceNodeIds: ['38:3140'] },
      { id: '38:3153', sourceNodeIds: ['38:3153'] },
    ],
  },
  '38:3162': {
    id: '38:3162',
    layout: 'vertical',
    sourceNodeIds: ['38:3162'],
    children: [
      { id: '38:3162-tail-text', type: 'header', sourceNodeIds: ['38:3166'] },
      {
        id: '38:3167-list',
        // 合成段：自身不在 Figma 里，只有 sourceNodeIds（必须走并集才拿到 130）
        sourceNodeIds: ['38:3167', '38:3180', '38:3193'],
      },
    ],
  },
  '38:3206': {
    id: '38:3206',
    layout: 'vertical',
    sourceNodeIds: ['38:3206'],
    children: [
      { id: '38:3206-tail-text', type: 'header', sourceNodeIds: ['38:3210'] },
      {
        id: '38:3211-list',
        sourceNodeIds: ['38:3211', '38:3224', '38:3237', '38:3250'],
      },
    ],
  },
};

// ───────────────────────────── 阳性对照（真机三段） ─────────────────────────────

describe('刀 50 阳性：三个真实面板段（同构、行数 2/3/4）', () => {
  test('① 战略合作厂商 38:3137：留白 25/20，子 16/30/30，间距 16 然后 20，下留白 24', () => {
    const p = resolveIntrinsicLayout(PLAN['38:3137'], INDEX);
    expect(p.ok).toBe(true);
    expect(p.paddingTop).toBe(25);
    expect(p.paddingLeft).toBe(20);
    expect(p.children.map((c: any) => c.height)).toEqual([16, 30, 30]);
    expect(p.children.map((c: any) => c.gapBefore)).toEqual([0, 16, 20]);
    // 25 + 16 + 16 + 30 + 20 + 30 = 137，段高 161 ⇒ 下留白 24（剩余值是设计留白，不是可分配空间）
    expect(p.leftover).toBe(24);
  });

  test('② 优质厂商 38:3162：合成 list 段必须按**并集**取到 130（首行只有 30）', () => {
    const p = resolveIntrinsicLayout(PLAN['38:3162'], INDEX);
    expect(p.ok).toBe(true);
    expect(p.paddingTop).toBe(25);
    expect(p.paddingLeft).toBe(20);
    expect(p.children.map((c: any) => c.height)).toEqual([16, 130]);
    expect(p.children.map((c: any) => c.gapBefore)).toEqual([0, 16]);
    expect(p.leftover).toBe(25);
  });

  test('③ 普通厂商 38:3206：4 行 ⇒ 180，下留白 28', () => {
    const p = resolveIntrinsicLayout(PLAN['38:3206'], INDEX);
    expect(p.ok).toBe(true);
    expect(p.paddingTop).toBe(25);
    expect(p.paddingLeft).toBe(20);
    expect(p.children.map((c: any) => c.height)).toEqual([16, 180]);
    expect(p.children.map((c: any) => c.gapBefore)).toEqual([0, 16]);
    expect(p.leftover).toBe(28);
  });

  test('④ 三段「结构同构」是本判据的核心断言：留白与首间距完全一致，只有行数不同', () => {
    const plans = ['38:3137', '38:3162', '38:3206'].map((id) =>
      resolveIntrinsicLayout((PLAN as any)[id], INDEX),
    );
    expect(new Set(plans.map((p) => p.paddingTop))).toEqual(new Set([25]));
    expect(new Set(plans.map((p) => p.paddingLeft))).toEqual(new Set([20]));
    expect(new Set(plans.map((p) => p.children[0].height))).toEqual(new Set([16]));
    expect(new Set(plans.map((p) => p.children[1].gapBefore))).toEqual(new Set([16]));
    expect(plans.map((p) => p.children[1].height)).toEqual([30, 130, 180]);
  });
});

// ───────────────────────────── 阴性对照（必须 fail-open） ─────────────────────────────

describe('刀 50 阴性：判不了就必须交回既有比例行为', () => {
  test('⑤ 同 y 并排兄弟（796:3 的两张统计卡）⇒ plan 层交回比例；几何层必须判「行组」而不是 overlap', () => {
    const sec = {
      id: '796:3',
      layout: 'vertical',
      sourceNodeIds: ['796:3'],
      children: [
        { id: '38:3260', sourceNodeIds: ['38:3260'] },
        { id: '38:3282', sourceNodeIds: ['38:3282'] },
        { id: '38:3137', sourceNodeIds: ['38:3137'] },
      ],
    };
    const p = resolveIntrinsicLayout(sec as any, INDEX);
    expect(p.ok).toBe(false);
    // 🔴 2026-10-22：并列 ≠ 重叠。旧实现按「逐项严格堆叠」比 ⇒ gap=−76 ⇒ 判 overlap，
    //   于是整段（含父子）都拿不到几何；现在几何层先把同顶边合成一个「高度单元」。
    expect(p.reason).toBe('row-peers');

    // 同一份几何、同一函数：单元口径必须算得出来（刀 52 在写盘期用它钉段高）
    const geo = resolveStackGeometry(
      { x: 26894, y: 51483, w: 604, h: 787 },
      [
        { x: 26900, y: 51483, w: 265, h: 76 },
        { x: 27229, y: 51483, w: 265, h: 76 },
        { x: 26894, y: 51592, w: 604, h: 161 },
      ],
    );
    expect(geo.ok).toBe(true);
    expect(geo.units.map((u) => [u.height, u.gapBefore, u.members.length])).toEqual([
      [76, 0, 2],
      [161, 33, 1],
    ]);
    expect(geo.leftover).toBe(787 - (33 + 76 + 161));
  });

  test('⑥ grid 段归刀 41，本契约不得抢（两套判据同时改写会互相覆盖）', () => {
    const p = resolveIntrinsicLayout({ ...(PLAN as any)['38:3162'], layout: 'grid' }, INDEX);
    expect(p).toEqual({ ok: false, reason: 'grid-axis' });
  });

  test('⑦ layout 缺失（无布局事实）⇒ 不臆造纵向', () => {
    expect(resolveIntrinsicLayout({ ...(PLAN as any)['38:3162'], layout: null }, INDEX)).toEqual({
      ok: false,
      reason: 'axis-not-column',
    });
    expect(resolveIntrinsicLayout({ ...(PLAN as any)['38:3162'], layout: 'horizontal' }, INDEX)).toEqual({
      ok: false,
      reason: 'axis-not-column',
    });
  });

  test('⑧ 单子项 ⇒ 没有间距/剩余留白可言', () => {
    const p = resolveIntrinsicLayout(
      { id: '38:3162', layout: 'vertical', children: [{ id: 'a', sourceNodeIds: ['38:3166'] }] },
      INDEX,
    );
    expect(p).toEqual({ ok: false, reason: 'too-few-children' });
  });

  test('⑨ 任一子 box 解析不到 ⇒ 整段不判（不做「部分子项固定、部分比例」的混合态）', () => {
    const p = resolveIntrinsicLayout(
      {
        id: '38:3162',
        layout: 'vertical',
        children: [{ id: 'a', sourceNodeIds: ['38:3166'] }, { id: 'nope', sourceNodeIds: ['zz:1'] }],
      },
      INDEX,
    );
    expect(p).toEqual({ ok: false, reason: 'child-box-unknown' });
  });

  test('⑩ 内容溢出父高（子真值比段高还大）⇒ content-overflow，不硬塞固定高', () => {
    const p = resolveIntrinsicLayout(
      {
        id: '38:3162',
        layout: 'vertical',
        sourceNodeIds: ['38:3162'], // 212
        children: [
          { id: 'a', sourceNodeIds: ['38:3166'] },
          { id: 'b', sourceNodeIds: ['38:3211', '38:3224', '38:3237', '38:3250'] }, // 180，起点在段外 ⇒ 先被撞
        ],
      },
      INDEX,
    );
    // 3211 起于 52062，段 38:3162 只到 51985 ⇒ 内容整体落在外侧，先触发溢出判定
    expect(p.ok).toBe(false);
    expect(['content-overflow', 'overlap']).toContain(p.reason);
  });

  test('⑪ 无 figmaIndex / 无 section ⇒ 静默不判', () => {
    expect(resolveIntrinsicLayout(null as any, INDEX)).toEqual({ ok: false, reason: 'no-section' });
    expect(resolveIntrinsicLayout(PLAN['38:3137'], null as any).reason).toBe('parent-box-unknown');
  });
});

// ───────────────────────────── 单一来源：几何解析 ─────────────────────────────

describe('刀 50 resolveSectionBox / unionBoxes（几何解析唯一实现）', () => {
  test('⑫ 合成段 id（38:3167-list）必须取 sourceNodeIds **并集** ⇒ 130，不是首行 30', () => {
    const box = resolveSectionBox(PLAN['38:3162'].children[1], INDEX);
    expect(box).toEqual({ x: 26914, y: 51830, w: 564, h: 130 });
  });

  test('⑬ 自带 bbox 优先于索引回查', () => {
    const box = resolveSectionBox(
      { id: '38:3162', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 20 } },
      INDEX,
    );
    expect(box).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  });
  test('⑭ unionBoxes：空集 / 非法 box ⇒ null（不返回半个盒子）', () => {
    expect(unionBoxes([])).toBeNull();
    expect(unionBoxes([{ x: NaN, y: 0, w: 1, h: 1 } as any])).toBeNull();
    expect(
      unionBoxes([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: 30, w: 5, h: 5 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 25, h: 35 });
  });

  test('⑭b 只有尺寸没有原点（planner 常见形态）：尺寸可解析，几何不可解析', () => {
    // 🔴 回归锁（2026-10-22 实锤）：`getFigmaBox` 要求 x/y/w/h 四元齐全，
    //   plan 里 `absoluteBoundingBox: { width: 46, height: 317 }` 这种形态会被它整块判 null
    //   ⇒ tabs 46 / cons 367 的宽度比例全部退化成 flex:1（既有用例被打红）。
    const partial = { id: '89:39', absoluteBoundingBox: { width: 46, height: 317 } };
    expect(resolveSectionSize(partial, null, 'width')).toBe(46);
    expect(resolveSectionSize(partial, null, 'height')).toBe(317);
    // 判几何（间距/padding）必须有原点 ⇒ 严格档返回 null，交回既有比例行为
    expect(resolveSectionBox(partial, null)).toBeNull();
  });

  test('⑭c resolveSectionSize：sourceNodeIds 多个候选取并集（合成段拿整段尺寸）', () => {
    expect(resolveSectionSize(PLAN['38:3162'].children[1], INDEX, 'height')).toBe(130);
    expect(resolveSectionSize(PLAN['38:3137'].children[0], INDEX, 'height')).toBe(16);
    expect(resolveSectionSize(null as any, INDEX, 'width')).toBe(0);
  });
});

// ───────────────────────────── 输出形态 ─────────────────────────────

describe('刀 50 输出形态（inline style）', () => {
  const plan = resolveIntrinsicLayout(PLAN['38:3137'], INDEX);

  test('⑮ 容器：只写 >0 的 padding（真值 0 不写，避免盖掉 class 上的合法语义）', () => {
    expect(buildIntrinsicContainerStyle(plan)).toBe('padding-top:25px;padding-left:20px;');
    expect(buildIntrinsicContainerStyle({ ok: true, paddingTop: 0, paddingLeft: 0 } as any)).toBe('');
    expect(buildIntrinsicContainerStyle({ ok: false } as any)).toBe('');
  });

  test('⑯ 子项：flex:0 1 auto（不拉伸 + 可压缩）+ 固定高度；第 1 项无 margin', () => {
    expect(buildIntrinsicChildStyle(plan, 0)).toBe('flex:0 1 auto;height:16px;');
    expect(buildIntrinsicChildStyle(plan, 1)).toBe(
      'flex:0 1 auto;height:30px;margin-top:16px;',
    );
    expect(buildIntrinsicChildStyle(plan, 2)).toBe(
      'flex:0 1 auto;height:30px;margin-top:20px;',
    );
    // 🔴 绝不能是 flex:0.211 —— 比例 = 「拉伸填满」，与「真值 + 剩余留白」互斥
    expect(buildIntrinsicChildStyle(plan, 1)).not.toMatch(/flex:0?\.\d/);
  });

  test('⑰ 越界索引 / 未命中 plan ⇒ 空串（fail-open）', () => {
    expect(buildIntrinsicChildStyle(plan, 9)).toBe('');
    expect(buildIntrinsicChildStyle({ ok: false } as any, 0)).toBe('');
  });
});

// ───────────────────────────── 幂等 / 无副作用 ─────────────────────────────

test('⑱ 纯函数：不改入参，重复调用结果逐字相同', () => {
  const sec = JSON.parse(JSON.stringify(PLAN['38:3162']));
  const snapshot = JSON.stringify(sec);
  const a = resolveIntrinsicLayout(sec, INDEX);
  const b = resolveIntrinsicLayout(sec, INDEX);
  expect(JSON.stringify(sec)).toBe(snapshot);
  expect(a).toEqual(b);
});
