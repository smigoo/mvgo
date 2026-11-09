/**
 * 🛡️ S1（2026-11-09 · mc-max-1794233412869-25711e88 实锤）
 *
 * 三个真机病灶：
 *   ① 渐变文字被降级成「首停靠点实色」并标注「必须是实色」⇒ 模型自编纯色；
 *   ② TEXT 的「零偏移零模糊 DROP_SHADOW」= 文字描边，旧实现只映射 box-shadow ⇒ 白字失去轮廓；
 *   ③ fill 全 invisible 的 TEXT（真机「设备监测」2:8426）无真值，但 prompt 不给任何标注 ⇒ 模型臆造。
 * 另修 `fillsToCss` 图层语义：旧口径「SOLID 优先」会丢掉上层渐变。
 *
 * 全部判据零硬编码：期望值均由 fixture 的节点真值决定。
 */
import { buildSectionStyleFacts, fillsToCss } from './section-tree.js';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const treeWith = (children: unknown[]) => ({
  document: {
    id: 'root',
    name: 'cp-x',
    type: 'FRAME',
    absoluteBoundingBox: box(0, 0, 400, 300),
    children: [
      {
        id: 'sec1',
        name: 'slot-a',
        type: 'FRAME',
        absoluteBoundingBox: box(0, 0, 400, 300),
        children,
      },
    ],
  },
});

const sectionsOf = (id: string) => [{ id, title: 'header', type: 'header', sourceNodeIds: [id] }];

const SOLID = (r: number, g: number, b: number) => ({
  type: 'SOLID',
  color: { r, g, b, a: 1 },
  opacity: 1,
});

/** 与真机同形态：#e1f0ff → #00ccff 线性渐变 */
const GRAD = {
  type: 'GRADIENT_LINEAR',
  visible: true,
  opacity: 1,
  gradientHandlePositions: [
    { x: 0.5, y: 0 },
    { x: 0.5, y: 1 },
  ],
  gradientStops: [
    { color: { r: 0.882, g: 0.94, b: 1, a: 1 }, position: 0 },
    { color: { r: 0, g: 0.8, b: 1, a: 1 }, position: 1 },
  ],
};

const TEXTV = (id: string, chars: string, fills: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: box(0, 10, 100, 20),
  fills,
  style: { fontSize: 20 },
  children: [],
  ...extra,
});

describe('S1 · fillsToCss 图层语义（自底向上，取最上层可复现 paint）', () => {
  it('① 上层是渐变 ⇒ 输出渐变（旧「SOLID 优先」会丢掉它）', () => {
    const css = fillsToCss([SOLID(1, 1, 1), GRAD], undefined);
    expect(css).toContain('linear-gradient(');
    expect(css).toContain('100%');
  });

  it('② 上层是纯色 ⇒ 输出纯色（不得向下取渐变）', () => {
    expect(fillsToCss([GRAD, SOLID(1, 1, 1)], undefined)).toBe('#ffffff');
  });

  it('③ 全 invisible ⇒ null（不猜）', () => {
    expect(fillsToCss([{ ...GRAD, visible: false }], undefined)).toBeNull();
  });

  it('④ 不可复现层（IMAGE）⇒ 向下回退到最近可复现层', () => {
    const img = { type: 'IMAGE', visible: true, imageRef: 'x' };
    expect(fillsToCss([SOLID(0, 0, 0), img], undefined)).toBe('#000000');
  });
});

describe('S1 · TEXT 渐变真值下发（阳性对照：25711e88 大数字/标题）', () => {
  it('⑤ 渐变文字 ⇒ textFill + CSS 实现语义，且不再降级为首停靠点实色', () => {
    const data = treeWith([TEXTV('t1', '68562', [GRAD])]);
    const out = buildSectionStyleFacts(sectionsOf('sec1') as any, data as any);
    expect(out).toContain('textFill:linear-gradient(');
    expect(out).toContain('background-clip:text');
    // 旧口径的两个特征必须消失
    expect(out).not.toContain('首停靠点');
    expect(out).not.toContain('color:linear-gradient');
  });

  it('⑥ fill 全 invisible ⇒ colorTruth:absent（禁止臆造），且不输出任何颜色值', () => {
    const data = treeWith([TEXTV('t2', '设备监测', [{ ...GRAD, visible: false }])]);
    const out = buildSectionStyleFacts(sectionsOf('sec1') as any, data as any);
    expect(out).toContain('colorTruth:absent');
    expect(out).not.toContain('textFill');
  });
});

describe('S1 · TEXT 描边（阳性对照：25711e88 卡片 (2/484)）', () => {
  it('⑦ 零偏移零模糊 DROP_SHADOW ⇒ textStroke，宽度/颜色取自节点', () => {
    const data = treeWith([
      TEXTV('t3', '(2/484)', [SOLID(1, 1, 1)], {
        strokeWeight: 1,
        effects: [
          {
            type: 'DROP_SHADOW',
            visible: true,
            radius: 0,
            offset: { x: 0, y: 0 },
            color: { r: 0, g: 0, b: 0, a: 0.5 },
          },
        ],
      }),
    ]);
    const out = buildSectionStyleFacts(sectionsOf('sec1') as any, data as any);
    expect(out).toContain('textStroke:1px rgba(0,0,0,0.5)');
  });

  it('⑧ 有偏移/有模糊的 DROP_SHADOW 不算描边（不得误判）', () => {
    const data = treeWith([
      TEXTV('t4', '正文', [SOLID(0.2, 0.2, 0.2)], {
        effects: [
          {
            type: 'DROP_SHADOW',
            visible: true,
            radius: 4,
            offset: { x: 0, y: 2 },
            color: { r: 0, g: 0, b: 0, a: 0.3 },
          },
        ],
      }),
    ]);
    const out = buildSectionStyleFacts(sectionsOf('sec1') as any, data as any);
    expect(out).not.toContain('textStroke');
  });
});
