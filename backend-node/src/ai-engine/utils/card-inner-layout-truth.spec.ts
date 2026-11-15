/**
 * 🛡️ 2026-11-15（mc-max-1794751473723-92612fc0 实锤）：卡内行分组 / 文字方向真值判据。
 *
 * 病灶：vision 对 `stat-card` 只给 5 条扁平 elem、不给卡内布局 ⇒ 模型排成
 *   `flex-direction: row`（icon/line1/name/line2 一字排开）⇒「总数:」被压成 15px 宽、竖折两行；
 *   同一节点 tab 真值是竖排（15×36 / fs14），vision 只给 fs 不给方向 ⇒ 渲染成横排 24×14.4
 *   ⇒「交通诱导」48px 溢出 46px 容器。
 *
 * 判据全部无量纲、零图层名、零节点 id 特判；fail-open（判不出返回 null）。
 */
import {
  BAND_TOL_RATIO,
  BACKGROUND_AREA_RATIO,
  TEXT_SINGLE_LINE_HEIGHT_RATIO,
  TEXT_VERTICAL_WIDTH_RATIO,
  deriveCardInnerRows,
  indexFigmaNodes,
  textOrientationOf,
  unwrapFigmaRoot,
} from './card-inner-layout-truth.js';

const text = (id: string, characters: string, x: number, y: number, w: number, h: number, fontSize: number) => ({
  id,
  type: 'TEXT',
  characters,
  style: { fontSize },
  absoluteBoundingBox: { x, y, width: w, height: h },
});

/** Figma 真值 `2:8787`（193.4×64.8）直接搬过来：bg 全幅 + name/line1/line2/icon。 */
const card8787 = {
  id: '2:8787',
  type: 'GROUP',
  name: 'active',
  absoluteBoundingBox: { x: 1480.5, y: 475, width: 193.4, height: 64.8 },
  children: [
    {
      id: '2:8788',
      type: 'GROUP',
      name: 'bg',
      absoluteBoundingBox: { x: 1480.5, y: 475, width: 193.4, height: 64.8 },
      children: [
        { id: '2:8789', type: 'VECTOR', absoluteBoundingBox: { x: 1480.5, y: 475, width: 188.4, height: 64.8 } },
      ],
    },
    text('2:8791', '隧道设备', 1494.5, 514, 45, 16, 12),
    {
      id: '2:8792',
      type: 'FRAME',
      name: 'line1',
      absoluteBoundingBox: { x: 1544.5, y: 481, width: 105, height: 23 },
      children: [text('2:8793', '总数:', 1544.5, 482, 46, 21, 14)],
    },
    {
      id: '2:8795',
      type: 'FRAME',
      name: 'line2',
      absoluteBoundingBox: { x: 1544.5, y: 510, width: 59, height: 23 },
      children: [text('2:8796', '异常数:', 1544.5, 511, 46, 21, 14)],
    },
    {
      id: '2:8798',
      type: 'GROUP',
      name: 'icon',
      absoluteBoundingBox: { x: 1498.5, y: 483, width: 35.2, height: 28.3 },
      children: [
        { id: '2:8803', type: 'VECTOR', absoluteBoundingBox: { x: 1502.6, y: 483.7, width: 27.1, height: 27.1 } },
      ],
    },
  ],
};

describe('deriveCardInnerRows —— 卡内行分组', () => {
  it('阳性：真值 2:8787 形态 ⇒ 2 带、axis=column、members 按行归组', () => {
    const rows = deriveCardInnerRows(card8787);
    expect(rows).not.toBeNull();
    expect(rows!.axis).toBe('column');
    expect(rows!.bandCount).toBe(2);
    // 第一带 y≈481（line1 的 frame @481 / icon @483）；第二带 y≈510-514
    expect(rows!.rows[0].members).toEqual(['2:8792', '2:8798']);
    expect(rows!.rows[1].members).toEqual(['2:8795', '2:8791']);
  });

  it('bg 全幅首子节点被面积规则排除（不额外产生一带）', () => {
    const rows = deriveCardInnerRows(card8787);
    const allMembers = rows!.rows.flatMap((r) => r.members);
    expect(allMembers).not.toContain('2:8788');
    expect(allMembers).not.toContain('2:8789');
  });

  it('装饰叶（无文本且面积极小）不参与行带', () => {
    const card = {
      id: 'c',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [
        text('t1', '标题', 10, 10, 60, 16, 12),
        text('t2', '数值', 10, 40, 60, 16, 12),
        // 8×8 圆点：会把 y 带凭空拉出第三带（layout-truth-healer 曾因此误判 column）
        { id: 'dot', type: 'VECTOR', absoluteBoundingBox: { x: 5, y: 63, width: 8, height: 8 } },
      ],
    };
    const rows = deriveCardInnerRows(card)!;
    expect(rows.bandCount).toBe(2);
    expect(rows.rows.flatMap((r) => r.members)).not.toContain('dot');
  });

  it('阴性：同 y 的单行卡 ⇒ axis=row、1 带', () => {
    const row = {
      id: 'r',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 40 },
      children: [
        text('a', '总数:', 10, 12, 46, 21, 14),
        text('b', '56302', 60, 12, 58, 23, 20),
        text('c', '异常数:', 130, 12, 46, 21, 14),
      ],
    };
    const rows = deriveCardInnerRows(row)!;
    expect(rows.axis).toBe('row');
    expect(rows.bandCount).toBe(1);
  });

  it('阴性：子节点不足 2 个 / 缺 bbox ⇒ null（fail-open）', () => {
    expect(deriveCardInnerRows(null)).toBeNull();
    expect(deriveCardInnerRows({ id: 'x', children: [text('a', '标题', 0, 0, 20, 10, 12)] })).toBeNull();
    expect(
      deriveCardInnerRows({ id: 'y', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 }, children: [{ id: 'p' }, { id: 'q' }] }),
    ).toBeNull();
  });

  it('容差无量纲：同形卡放大 10 倍结果不变（判据不依赖固定 px）', () => {
    const big = JSON.parse(JSON.stringify(card8787));
    const walk = (node: any) => {
      const b = node.absoluteBoundingBox;
      if (b) {
        b.x *= 10;
        b.y *= 10;
        b.width *= 10;
        b.height *= 10;
      }
      for (const c of node.children || []) walk(c);
    };
    walk(big);
    const a = deriveCardInnerRows(card8787)!;
    const b = deriveCardInnerRows(big)!;
    expect(b.bandCount).toBe(a.bandCount);
    expect(b.axis).toBe(a.axis);
    expect(b.tolerance).toBeCloseTo(a.tolerance * 10, 0);
  });
});

describe('textOrientationOf —— 文字方向', () => {
  it('阳性：真值 tab「监控」15×36 / fs14 ⇒ vertical', () => {
    expect(textOrientationOf(text('2:8827', '监控', 1484, 553.8, 15, 36, 14))!.orientation).toBe('vertical');
  });

  it('阳性：真值「交通诱导」17×64 / fs14 ⇒ vertical', () => {
    expect(textOrientationOf(text('2:8848', '交通诱导', 1483, 787.8, 17, 64, 14))!.orientation).toBe('vertical');
  });

  it('阴性：产物横排 24×14.4 / fs12 ⇒ horizontal', () => {
    expect(textOrientationOf(text('lbl', '监控', 261, 353.7, 24, 14.4, 12))!.orientation).toBe('horizontal');
  });

  it('阴性：网格卡标题 72×18 / fs12 ⇒ horizontal', () => {
    expect(textOrientationOf(text('t', '光照度变送器', 1560, 565.8, 72, 18, 12))!.orientation).toBe('horizontal');
  });

  it('阴性：单字「5」12×23 / fs20 ⇒ null（单字无方向）', () => {
    expect(textOrientationOf(text('d5', '5', 1591.5, 510, 12, 23, 20))).toBeNull();
  });

  it('阴性：缺 fontSize / 非 TEXT ⇒ null（fail-open）', () => {
    expect(textOrientationOf({ id: 'x', type: 'TEXT', characters: '监控', absoluteBoundingBox: { x: 0, y: 0, width: 15, height: 36 } })).toBeNull();
    expect(textOrientationOf({ id: 'y', type: 'FRAME', characters: '监控' } as any)).toBeNull();
  });

  it('阈值常量为无量纲比例（不得引入 px 常量）', () => {
    expect(BAND_TOL_RATIO).toBeGreaterThan(0);
    expect(BAND_TOL_RATIO).toBeLessThan(0.5);
    expect(TEXT_VERTICAL_WIDTH_RATIO).toBeGreaterThan(1);
    expect(TEXT_SINGLE_LINE_HEIGHT_RATIO).toBeGreaterThan(1);
    expect(BACKGROUND_AREA_RATIO).toBeGreaterThan(0.5);
  });
});

describe('unwrapFigmaRoot / indexFigmaNodes', () => {
  const tree = { id: 'root', type: 'FRAME', children: [{ id: 'a', type: 'TEXT', children: [] }] };

  it('三形态入参归一：裸树 / {document} / {nodes}', () => {
    expect(unwrapFigmaRoot(tree)!.id).toBe('root');
    expect(unwrapFigmaRoot({ document: tree })!.id).toBe('root');
    expect(unwrapFigmaRoot({ nodes: { '0:1': { document: tree } } })!.id).toBe('root');
    expect(unwrapFigmaRoot(null)).toBeNull();
    expect(unwrapFigmaRoot({ foo: 1 })).toBeNull();
  });

  it('索引可查任意深度节点', () => {
    const index = indexFigmaNodes(tree);
    expect(index.get('a')!.type).toBe('TEXT');
    expect(index.size).toBe(2);
  });
});
