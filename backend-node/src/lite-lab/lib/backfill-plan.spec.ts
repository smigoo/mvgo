/**
 * 只读回填计划（backfill-plan）单元测试
 *
 * 每例都带**阳性对照**：同一个判据必须既能命中目标态、也能在对照态下不命中，
 * 否则「计划说有」无法与「判据恒真」区分。
 */
import { buildBackfillPlan, type BackfillPlan } from './backfill-plan';
import type { TruthInventory } from './truth-matcher';

// ── 最小 Figma 树：cp 画板 → card 组（含 1 个文本 + 1 张容器级 IMAGE） ──
function figmaRoot(opts: { withCardText?: boolean; iconW?: number } = {}) {
  const withCardText = opts.withCardText !== false;
  const card: any = {
    id: '2:100',
    type: 'GROUP',
    name: 'card',
    absoluteBoundingBox: { x: 0, y: 0, width: 193, height: 65 },
    children: [
      {
        id: '2:101',
        type: 'RECTANGLE',
        name: 'bg',
        absoluteBoundingBox: { x: 0, y: 0, width: 193, height: 65 },
        fills: [{ type: 'IMAGE', visible: true, imageRef: 'ref-bg1' }],
      },
    ],
  };
  if (withCardText) {
    card.children.push({
      id: '2:102',
      type: 'TEXT',
      name: '总数',
      characters: '总数',
      absoluteBoundingBox: { x: 4, y: 4, width: 46, height: 21 },
      style: { fontSize: 14 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
    });
  }
  return {
    id: '2:1',
    type: 'FRAME',
    name: 'cp',
    absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
    children: [card],
  };
}

function truth(over: Partial<TruthInventory> = {}): TruthInventory {
  return {
    texts: [
      {
        nodeId: '2:102',
        characters: '总数',
        fontSize: 14,
        color: '#ffffff',
        width: 46,
        height: 21,
      },
    ],
    assets: [
      {
        nodeId: '2:101',
        name: 'bg',
        fileName: 'bg-1.png',
        imageRef: 'ref-bg1',
        width: 193,
        height: 65,
        parentId: '2:100',
        containerLevel: true,
        parentTexts: ['总数'],
      },
    ],
    containerCount: 2,
    containers: [],
    ...over,
  };
}

const VUE = (style: string) => `<template>
  <div class="card"><span class="lbl">总数</span></div>
</template>

<script setup>
</script>

<style lang="less">
${style}
</style>`;

function plan(vueStyle: string, over: { truth?: Partial<TruthInventory>; figma?: any } = {}): BackfillPlan {
  return buildBackfillPlan({
    figmaRoot: over.figma ?? figmaRoot(),
    prodFiles: [{ path: 'package/index.vue', content: VUE(vueStyle) }],
    truth: truth(over.truth),
    now: '2026-11-05T00:00:00.000Z',
  });
}

const bgEntry = (p: BackfillPlan) => p.entries.find((e) => e.kind === 'bg-image')!;
const textEntry = (p: BackfillPlan) => p.entries.find((e) => e.kind === 'text-truth')!;

describe('backfill-plan · 背景图（容器级底图）', () => {
  it('容器级资源 + E2N 边 → 落点唯一类，动作为「渐变整条替换」', () => {
    const p = plan('.card { background: linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }');
    const e = bgEntry(p);
    expect(e.decision).toBe('apply');
    expect(e.targets).toHaveLength(1);
    expect(e.targets[0].cls).toBe('card');
    expect(e.targets[0].action).toBe('replace-gradient');
    expect(e.targets[0].after).toContain('bg-1.png');
    expect(e.targets[0].satisfied).toBe(false);
    // 依据必须写出「两侧 bbox 相等」这条 Figma 内部事实
    expect(e.evidence.join('\n')).toMatch(/193×65 ≈ 父容器 193×65/);
  });

  it('规则体只有 background-color → 动作是「连属性名改写」（不能产出非法 CSS）', () => {
    const p = plan('.card { background-color: #101820; }');
    const t = bgEntry(p).targets[0];
    expect(t.action).toBe('replace-bg-color');
    expect(t.after).toContain('bg-1.png');
  });

  it('已挂本图且无残留图层 → 幂等空转（satisfied）', () => {
    const p = plan(
      ".card { background: url('../images/bg-1.png') center / 100% 100% no-repeat; }",
    );
    const t = bgEntry(p).targets[0];
    expect(t.action).toBe('noop');
    expect(t.satisfied).toBe(true);
    expect(p.stats.satisfied).toBeGreaterThanOrEqual(1);
  });

  it('阳性对照：已挂本图但残留旧渐变 → 不算满足，动作是「清理为单层」', () => {
    const p = plan(
      ".card { background: url('../images/bg-1.png') center / 100% 100% no-repeat, linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }",
    );
    const t = bgEntry(p).targets[0];
    expect(t.satisfied).toBe(false);
    expect(t.action).toBe('replace-url');
    expect(bgEntry(p).evidence.join('\n')).toContain('残留旧图层');
  });

  it('资源明显小于父容器 → 不主张替换容器背景（skip: not-container-level）', () => {
    const p = plan('.card { background: linear-gradient(#fff, #eef); }', {
      truth: {
        assets: [
          {
            nodeId: '2:101',
            name: 'bg',
            fileName: 'bg-1.png',
            width: 40,
            height: 20,
            parentId: '2:100',
            containerLevel: false,
          },
        ],
      },
    });
    expect(bgEntry(p).decision).toBe('skip');
    expect(bgEntry(p).skipReason).toBe('not-container-level');
    expect(p.gaps.some((g) => g.kind === 'bg-image')).toBe(true);
  });

  it('父容器没有 E2N 边 → 落点不明，记事实缺口（不猜落点）', () => {
    const p = plan('.card { background: linear-gradient(#fff, #eef); }', {
      truth: { assets: [{ ...truth().assets[0], parentId: '9:999' }] },
    });
    expect(bgEntry(p).decision).toBe('skip');
    expect(bgEntry(p).skipReason).toBe('no-e2n-edge');
    expect(p.gaps.some((g) => g.detail.includes('9:999'))).toBe(true);
  });
});

describe('backfill-plan · 冲突与语义', () => {
  it('同一规则被「背景图」与「容器 fill」同时占用 → fill 让位（background 只有一个值）', () => {
    const p = plan('.card { background: linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }', {
      truth: {
        containers: [
          { nodeId: '2:100', name: 'card', color: '#ffffff', childTexts: ['总数'] },
        ],
      },
    });
    const fill = p.entries.find((e) => e.kind === 'fill-color')!;
    expect(fill.decision).toBe('skip');
    expect(fill.skipReason).toBe('conflict-lost');
    expect(fill.conflicts[0].entryId).toContain('bg/');
    expect(p.stats.conflicts).toBeGreaterThanOrEqual(1);
  });

  it('文本真值已由 CSS 规则满足 → 不再报「待写」（防误报）', () => {
    const p = plan('.lbl { color: #ffffff; font-size: 14px; }');
    const t = textEntry(p);
    expect(t.targets[0].satisfied).toBe(true);
    expect(t.targets[0].action).toBe('noop');
  });

  it('阳性对照：CSS 颜色与真值不符 → 报「待写」并给出两边值', () => {
    const p = plan('.lbl { color: #333333; font-size: 14px; }');
    const t = textEntry(p);
    expect(t.targets[0].satisfied).toBe(false);
    expect(t.targets[0].action).toBe('set-inline-style');
    expect(t.targets[0].before).toContain('#333333');
    expect(t.targets[0].after).toContain('#ffffff');
  });

  it('现状是 calc()/var() 表达式 → 标「不可静态判定」，不当成真值没落', () => {
    const p = plan('.lbl { color: #ffffff; font-size: calc(@fontSize * 0.75); }');
    const t = textEntry(p);
    expect(t.targets[0].undecidable).toBe(true);
    expect(p.stats.undecidable).toBe(1);
    expect(t.evidence.join('\n')).toContain('不可静态判定');
  });
});

describe('backfill-plan · 分类', () => {
  it('Figma 渐变 fill（非 IMAGE）→ 记为「渐变真值未采集」缺口，不冒充背景图', () => {
    const root = figmaRoot();
    root.children[0].children.push({
      id: '2:103',
      type: 'RECTANGLE',
      name: 'bg',
      absoluteBoundingBox: { x: 0, y: 0, width: 193, height: 65 },
      fills: [{ type: 'GRADIENT_LINEAR', visible: true }],
    } as any);
    const p = buildBackfillPlan({
      figmaRoot: root,
      prodFiles: [{ path: 'package/index.vue', content: VUE('.card { background: #fff; }') }],
      truth: truth(),
      now: '2026-11-05T00:00:00.000Z',
    });
    expect(p.gaps.some((g) => g.kind === 'gradient-fill' && g.figmaId === '2:103')).toBe(true);
    // 不能因为名叫 bg 就当成背景图资产
    expect(p.entries.filter((e) => e.kind === 'bg-image')).toHaveLength(1);
  });

  it('元素级静态图未在产物出现 → 记缺口，不硬塞 <img>', () => {
    const p = plan('.card { background: #fff; }', {
      truth: {
        assets: [
          {
            nodeId: '2:104',
            name: 'icon',
            fileName: 'icon-1.png',
            width: 26,
            height: 32,
            parentId: '2:100',
            containerLevel: false,
          },
        ],
      },
    });
    const img = p.entries.find((e) => e.kind === 'inline-image')!;
    expect(img.decision).toBe('skip');
    expect(img.skipReason).toBe('needs-new-element');
    expect(p.gaps.some((g) => g.kind === 'inline-image')).toBe(true);
  });

  it('元素级静态图已在产物引用 → 幂等满足（不分类型都走同一条判据）', () => {
    const p = plan('.card { background: #fff; }', {
      truth: {
        assets: [
          {
            nodeId: '2:104',
            name: 'icon',
            fileName: 'icon-1.png',
            width: 26,
            height: 32,
            parentId: '2:100',
            containerLevel: false,
          },
        ],
      },
    });
    expect(p.entries.find((e) => e.kind === 'inline-image')!.decision).toBe('skip');
    // 换一份把 icon-1.png 引用进去的产物 → 同一判据必须翻成「已满足」
    const p2 = buildBackfillPlan({
      figmaRoot: figmaRoot(),
      prodFiles: [
        {
          path: 'package/index.vue',
          content: VUE('.card { background: url(../images/icon-1.png); }'),
        },
      ],
      truth: truth({
        assets: [
          {
            nodeId: '2:104',
            name: 'icon',
            fileName: 'icon-1.png',
            width: 26,
            height: 32,
            parentId: '2:100',
            containerLevel: false,
          },
        ],
      }),
      now: '2026-11-05T00:00:00.000Z',
    });
    const img2 = p2.entries.find((e) => e.kind === 'inline-image')!;
    expect(img2.decision).toBe('apply');
    expect(img2.targets[0].satisfied).toBe(true);
  });
});

describe('backfill-plan · 不可写落点', () => {
  it('文本落在 <template #slot> 上 → skip: not-styleable（插槽标签不能承载 style）', () => {
    const root = figmaRoot();
    root.children[0].children.push({
      id: '2:105',
      type: 'TEXT',
      name: '标题',
      characters: '标题',
      absoluteBoundingBox: { x: 0, y: 0, width: 64, height: 19 },
      style: { fontSize: 16 },
      fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
    } as any);
    const vue = `<template>
  <base-panel><template #title-left>标题</template><div class="card"><span class="lbl">总数</span></div></base-panel>
</template>
<script setup></script>
<style>.lbl { color: #fff; font-size: 14px; }</style>`;
    const p = buildBackfillPlan({
      figmaRoot: root,
      prodFiles: [{ path: 'package/index.vue', content: vue }],
      truth: truth({
        texts: [
          ...truth().texts,
          { nodeId: '2:105', characters: '标题', fontSize: 16, color: '#000000', width: 64, height: 19 },
        ],
      }),
      now: '2026-11-05T00:00:00.000Z',
    });
    const t = p.entries.find((e) => e.id === 'txt/2:105')!;
    expect(t.decision).toBe('skip');
    expect(t.skipReason).toBe('not-styleable');
    expect(t.evidence.join('\n')).toContain('不能写 style');
  });
});

/**
 * 🔴 渐变渲染图判据（真机 `2:8439`/`2:8788`/`2:8807` 驱动）：
 * 三张 `bg-*.png` 对应的 Figma 节点都是 `GROUP「bg」` + `VECTOR(GRADIENT_LINEAR)`、
 * 子树**零 IMAGE fill** —— png 是 Figma 渲染的渐变位图，不是切图资源。
 * 判据：无 IMAGE 且含 GRADIENT_* ⇒ 不主张挂 url()，转 gradient-fill 缺口。
 * 阳性对照：同一棵树里只要出现 IMAGE fill，判据必须**不**命中（回到正常背景图流程）。
 */
describe('backfill-plan · 渐变渲染图（bg png 其实是渐变组）', () => {
  /** 把 2:101 从「带 IMAGE fill 的 RECTANGLE」换成「含渐变的 GROUP」 */
  function gradientBgRoot(withImage: boolean) {
    const root = figmaRoot();
    const bg = root.children[0].children[0] as any;
    bg.type = 'GROUP';
    bg.fills = [];
    bg.children = [
      {
        id: '2:101a',
        type: 'VECTOR',
        name: 'Vector',
        absoluteBoundingBox: { x: 0, y: 0, width: 193, height: 65 },
        opacity: 0.8,
        fills: [
          {
            type: 'GRADIENT_LINEAR',
            gradientStops: [
              { position: 0, color: { r: 0.03, g: 0.34, b: 0.4, a: 1 } },
              { position: 1, color: { r: 0.12, g: 0.5, b: 0.58, a: 0 } },
            ],
          },
        ],
      },
    ];
    if (withImage) {
      // 阳性对照：只要子树里有一张真图片，就不能判成「渐变渲染图」
      bg.children.push({
        id: '2:101b',
        type: 'RECTANGLE',
        name: 'photo',
        absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 40 },
        fills: [{ type: 'IMAGE', visible: true, imageRef: 'ref-photo' }],
      });
    }
    return root;
  }

  it('子树零 IMAGE + 有 GRADIENT_* → skip/gradient-render，并登记 gradient-fill 缺口', () => {
    const p = plan('.card { background: linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }', {
      figma: gradientBgRoot(false),
    });
    const e = bgEntry(p);
    expect(e.decision).toBe('skip');
    expect(e.skipReason).toBe('gradient-render');
    // 依据必须点出「渲染图」这个事实，而不是只说「不满足」
    expect(e.evidence.join('\n')).toMatch(/零 IMAGE fill.*GRADIENT_\*.*渲染图/);
    const gap = p.gaps.find((g) => g.kind === 'gradient-fill' && g.figmaId === '2:101')!;
    expect(gap).toBeTruthy();
    // 不主张写任何 url()（落点一个都不该产生）
    expect(e.targets).toHaveLength(0);
  });

  it('阳性对照：子树含 IMAGE fill → 判据不命中，仍按容器级底图执行', () => {
    const p = plan('.card { background: linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }', {
      figma: gradientBgRoot(true),
    });
    const e = bgEntry(p);
    expect(e.decision).toBe('apply');
    expect(e.skipReason).toBeUndefined();
    expect(e.targets[0].action).toBe('replace-gradient');
    expect(p.gaps.some((g) => g.kind === 'gradient-fill' && g.figmaId === '2:101')).toBe(false);
  });
});

/**
 * 叶子填充矩形通道（③c）—— 2026-11-06（真机 mc-lab-1793898003372-63cc238e）。
 *
 * Figma 里「产品描述卡底」= **叶子 RECTANGLE + 平级兄弟 TEXT**，没有子节点 ⇒ containers
 * 通道（靠「直接子级 TEXT」锚定）恒空 ⇒ 背景色系统性漏回、只剩 LLM 给的 #FFFFFF。
 * 落点靠几何覆盖文本 → E2N seed 文本 → 最近公共祖先（anchorByCoveredTexts）。
 */
describe('backfill-plan · 叶子填充矩形（背景板几何覆盖通道）', () => {
  const descRect = (color: string) => ({
    id: '36:1695',
    type: 'RECTANGLE',
    name: 'Rectangle 346242326',
    absoluteBoundingBox: { x: 0, y: 300, width: 547, height: 193 },
    fills: [
      {
        type: 'SOLID',
        visible: true,
        color: {
          r: parseInt(color.slice(1, 3), 16) / 255,
          g: parseInt(color.slice(3, 5), 16) / 255,
          b: parseInt(color.slice(5, 7), 16) / 255,
          a: 1,
        },
      },
    ],
  });
  const tree = () => ({
    id: '36:1693',
    type: 'FRAME',
    name: 'root',
    absoluteBoundingBox: { x: 0, y: 0, width: 603, height: 555 },
    children: [
      descRect('#e1ebff'),
      {
        id: '36:1700',
        type: 'TEXT',
        name: '产品描述',
        characters: '产品描述',
        absoluteBoundingBox: { x: 10, y: 310, width: 64, height: 16 },
        style: { fontSize: 16 },
        fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0, a: 1 } }],
      },
    ],
  });
  const PROD = (descBg: string) => [
    {
      path: 'package/index.vue',
      content: `<template>
  <div class="c-content">
    <div class="c-desc"><span class="c-desc-title">产品描述</span></div>
  </div>
</template>

<style lang="less">
.c-content { background: transparent; }
.c-desc { background: ${descBg}; }
</style>`,
    },
  ];
  const build = (descBg: string) =>
    buildBackfillPlan({
      figmaRoot: tree(),
      prodFiles: PROD(descBg),
      now: '2026-11-06T00:00:00.000Z',
    });

  it('叶子矩形 SOLID 覆盖「产品描述」→ 落点 c-desc，动作 set-background-color', () => {
    const p = build('#FFFFFF');
    const e = p.entries.find((x) => x.id === 'fillrect/36:1695')!;
    expect(e).toBeTruthy();
    expect(e.decision).toBe('apply');
    // 依据必须点出「几何覆盖」这条 Figma 内部事实，而不是含糊的「推断」
    expect(e.evidence.join('\n')).toMatch(/叶子填充矩形.*#e1ebff/);
    expect(e.evidence.join('\n')).toMatch(/几何覆盖文本/);
    const t = e.targets.find((x) => x.selector.includes('c-desc'))!;
    expect(t).toBeTruthy();
    expect(t.action).toBe('set-background-color');
    expect(t.after).toBe('#e1ebff');
  });

  it('幂等阳性对照：产物已是 #e1ebff → action 退化为 noop、不主张写入', () => {
    const p = build('#e1ebff');
    const e = p.entries.find((x) => x.id === 'fillrect/36:1695')!;
    expect(e).toBeTruthy();
    // 计划不得声称一个不会执行的动作（否则报表「apply 但零写入」自相矛盾）
    expect(e.targets.every((t) => t.satisfied)).toBe(true);
    expect(e.targets.every((t) => t.action === 'noop')).toBe(true);
  });
});
