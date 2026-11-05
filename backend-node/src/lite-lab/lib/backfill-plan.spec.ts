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
