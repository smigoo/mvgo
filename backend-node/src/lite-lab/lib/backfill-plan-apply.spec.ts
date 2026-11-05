/**
 * 回填计划执行器（applyBackfillPlan / reconcileBgPlan）单元测试
 *
 * 走真实链路：buildBackfillPlan → applyBackfillPlan，断言**产物文本**，
 * 而不是断言中间变量——执行器的唯一职责就是产出正确的文本编辑。
 */
import { buildBackfillPlan } from './backfill-plan';
import { applyBackfillPlan, reconcileBgPlan } from './backfill-plan-apply';
import type { PlanKind } from './backfill-plan';
import type { TruthInventory } from './truth-matcher';

function figmaRoot() {
  return {
    id: '2:1',
    type: 'FRAME',
    name: 'cp',
    absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
    children: [
      {
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
          {
            id: '2:102',
            type: 'TEXT',
            name: '总数',
            characters: '总数',
            absoluteBoundingBox: { x: 4, y: 4, width: 46, height: 21 },
            style: { fontSize: 14 },
            fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
          },
        ],
      },
    ],
  };
}

function truth(over: Partial<TruthInventory> = {}): TruthInventory {
  return {
    texts: [{ nodeId: '2:102', characters: '总数', fontSize: 14, color: '#ffffff', width: 46, height: 21 }],
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

function run(style: string, over: Partial<TruthInventory> = {}, kinds?: PlanKind[]) {
  const files = [{ path: 'package/index.vue', content: VUE(style) }];
  const t = truth(over);
  const plan = buildBackfillPlan({ figmaRoot: figmaRoot(), prodFiles: files, truth: t });
  const res = applyBackfillPlan(files, plan, kinds ? { kinds } : {});
  return { plan, res, content: res.files[0].content };
}

describe('applyBackfillPlan · 背景图', () => {
  it('渐变 → 整条替换成资源图（不叠加，旧渐变必须消失）', () => {
    const { content, res } = run('.card { background: linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }');
    expect(content).toContain("background: url('../resources/images/bg-1.png') center / 100% 100% no-repeat");
    expect(content).not.toContain('linear-gradient');
    expect(res.stats.bgReplacedGradient).toBe(1);
  });

  it('已挂本图但残留旧渐变 → 清理成单层（旧通道会因「已有 url」永远跳过）', () => {
    const { content, res } = run(
      ".card { background: url('../images/bg-1.png') center / 100% 100% no-repeat, linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }",
    );
    expect(content).not.toContain('linear-gradient');
    expect(content.match(/url\(/g)).toHaveLength(1);
    expect(res.stats.bgReplacedUrl).toBe(1);
  });

  it('阳性对照：已挂本图且无残留 → 幂等空转，文件不变', () => {
    const style = ".card { background: url('../images/bg-1.png') center / 100% 100% no-repeat; }";
    const { content, res } = run(style, {}, ['bg-image']);
    expect(res.files[0].changed).toBe(false);
    expect(content).toBe(VUE(style));
    expect(res.stats.noop).toBeGreaterThanOrEqual(1);
  });

  it('只有 background-color → 连属性名改写（不能产出非法 CSS）', () => {
    const { content } = run('.card { background-color: #101820; }');
    expect(content).toContain('background: url(');
    expect(content).not.toContain('background-color');
    expect(content).not.toContain('#101820');
  });

  it('规则体没有背景声明 → 插入一条 background', () => {
    const { content, res } = run('.card { color: #fff; }');
    expect(content).toContain('background: url(');
    expect(res.stats.bgInserted).toBe(1);
  });
});

describe('applyBackfillPlan · 容器背景色', () => {
  const fillTruth = (color: string) =>
    truth({
      assets: [],
      containers: [{ nodeId: '2:100', name: 'card', color, childTexts: ['总数'] }],
    });

  it('纯色 background → 换真值色', () => {
    const files = [{ path: 'package/index.vue', content: VUE('.card { background: #FF4D4F; }') }];
    const plan = buildBackfillPlan({ figmaRoot: figmaRoot(), prodFiles: files, truth: fillTruth('#ffffff') });
    const res = applyBackfillPlan(files, plan);
    expect(res.files[0].content).toContain('background: #ffffff');
    expect(res.files[0].content).not.toContain('#FF4D4F');
    expect(res.stats.fillApplied).toBe(1);
  });

  it('阳性对照：目标是资源图时绝不塞颜色（否则 background 简写会吃掉 url）', () => {
    const style = ".card { background: url('../images/bg-1.png') center / 100% 100% no-repeat; }";
    const files = [{ path: 'package/index.vue', content: VUE(style) }];
    const plan = buildBackfillPlan({ figmaRoot: figmaRoot(), prodFiles: files, truth: fillTruth('#ffffff') });
    const res = applyBackfillPlan(files, plan, { kinds: ['fill-color'] });
    expect(res.files[0].content).toBe(VUE(style));
    expect(res.stats.fillApplied).toBe(0);
  });
});

describe('applyBackfillPlan · 计划过期保护', () => {
  it('同一计划重复执行 → 不产生新编辑（偏移漂移必须被现状值校验挡住）', () => {
    const files = [{ path: 'package/index.vue', content: VUE('.card { background: #fff; }') }];
    const plan = buildBackfillPlan({ figmaRoot: figmaRoot(), prodFiles: files, truth: truth() });
    const first = applyBackfillPlan(files, plan, { kinds: ['bg-image'] });
    expect(first.stats.ruleEdits).toBe(1);
    const second = applyBackfillPlan(first.files, plan, { kinds: ['bg-image'] });
    expect(second.stats.ruleEdits).toBe(0);
    expect(second.files[0].changed).toBe(false);
  });

  it('内容已变（前面插入了一条规则）→ 计划指针失效，一律不改', () => {
    const files = [{ path: 'package/index.vue', content: VUE('.card { background: #fff; }') }];
    const plan = buildBackfillPlan({ figmaRoot: figmaRoot(), prodFiles: files, truth: truth() });
    const drifted = [
      { path: 'package/index.vue', content: VUE('.other { color: red; }\n.card { background: #fff; }') },
    ];
    const res = applyBackfillPlan(drifted, plan, { kinds: ['bg-image'] });
    expect(res.stats.ruleEdits).toBe(0);
    expect(res.stats.stale).toBeGreaterThan(0);
    expect(res.files[0].content).toBe(drifted[0].content);
  });
});

const VUE_T = (tpl: string, style: string) => `<template>
${tpl}
</template>

<script setup>
</script>

<style lang="less">
${style}
</style>`;

function runT(tpl: string, style: string) {
  const files = [{ path: 'package/index.vue', content: VUE_T(tpl, style) }];
  const plan = buildBackfillPlan({ figmaRoot: figmaRoot(), prodFiles: files, truth: truth() });
  return { plan, res: applyBackfillPlan(files, plan) };
}

describe('applyBackfillPlan · 文本真值（元素级内联 style）', () => {
  it('元素没有 style → 新建一条（分隔符与合并路径一致，保证幂等）', () => {
    const { res } = runT('  <div class="card"><span class="lbl">总数</span></div>', '.card { background: #fff; }');
    expect(res.files[0].content).toContain('<span class="lbl" style="color:#ffffff;font-size:14px">');
    expect(res.stats.textApplied).toBe(1);
  });

  it('元素已有 style（布局真值）→ 合并保留原有声明，只覆盖同名属性', () => {
    const { res } = runT(
      '  <div class="card"><span class="lbl" style="width:46px;height:21px">总数</span></div>',
      '.card { background: #fff; }',
    );
    const c = res.files[0].content;
    expect(c).toContain('style="width:46px;height:21px;color:#ffffff;font-size:14px"');
    expect(c).not.toContain('width:46px;color'); // 不能把布局真值冲掉
  });

  it('阳性对照：颜色已正确 → 不写 style（幂等）', () => {
    const { res } = runT(
      '  <div class="card"><span class="lbl" style="color:#ffffff;font-size:14px">总数</span></div>',
      '.card { background: #fff; }',
    );
    expect(res.files[0].content).not.toContain('style="color:#ffffff;font-size:14px;color');
    expect(res.stats.textApplied).toBe(0);
  });
});

describe('applyBackfillPlan · 资源不透明度（整块底图 vs 叠加层）', () => {
  const planWith = (style: string, meanAlpha: number) => {
    const files = [{ path: 'package/index.vue', content: VUE(style) }];
    const plan = buildBackfillPlan({
      figmaRoot: figmaRoot(),
      prodFiles: files,
      truth: truth(),
      assetOpacity: { 'bg-1.png': { meanAlpha, meanLum: 150, visibleRatio: 0.9 } },
    });
    return { files, plan, res: applyBackfillPlan(files, plan, { kinds: ['bg-image'] }) };
  };

  it('半透明资源（alpha 12）→ 叠图：保留原底色，图在上层', () => {
    const { res } = planWith('.card { background: linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }', 12);
    const c = res.files[0].content;
    expect(c).toContain(
      "background: url('../resources/images/bg-1.png') center / 100% 100% no-repeat, linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%)",
    );
    expect(res.stats.bgLayered).toBe(1);
    expect(res.stats.bgReplacedGradient).toBe(0);
  });

  it('阳性对照：不透明资源（alpha 220）→ 整条替换，旧渐变必须消失', () => {
    const { res } = planWith('.card { background: linear-gradient(135deg, #2E7BF6 0%, #1E62E8 100%); }', 220);
    const c = res.files[0].content;
    expect(c).not.toContain('linear-gradient');
    expect(c).toContain("background: url('../resources/images/bg-1.png') center / 100% 100% no-repeat;");
    expect(res.stats.bgReplacedGradient).toBe(1);
  });

  it('半透明下「图 + 底色」共存即目标态 → 幂等不写（不容错判成残留图层）', () => {
    const style =
      ".card { background: url('../images/bg-1.png') center / 100% 100% no-repeat, rgba(255,255,255,0.6); }";
    const { res } = planWith(style, 12);
    expect(res.files[0].changed).toBe(false);
    expect(res.stats.noop).toBeGreaterThanOrEqual(1);
  });
});

describe('reconcileBgPlan · 计划 vs 旧通道对账', () => {
  const planOf = (style: string) => {
    const files = [{ path: 'package/index.vue', content: VUE(style) }];
    return buildBackfillPlan({ figmaRoot: figmaRoot(), prodFiles: files, truth: truth() });
  };

  it('双方落点相同 → both=1、agree', () => {
    const r = reconcileBgPlan(planOf('.card { background: #fff; }'), [{ fileName: 'bg-1.png', cls: 'card' }]);
    expect(r.both).toEqual(['bg-1.png→card']);
    expect(r.agree).toBe(true);
  });

  it('旧通道漏做 → planOnly（旧通道有缺口）', () => {
    const r = reconcileBgPlan(planOf('.card { background: #fff; }'), []);
    expect(r.planOnly).toEqual(['bg-1.png→card']);
    expect(r.agree).toBe(false);
  });

  it('旧通道把图和类挂到别处 → legacyOnly（旧通道在猜落点）', () => {
    const r = reconcileBgPlan(planOf('.card { background: #fff; }'), [{ fileName: 'bg-9.png', cls: 'tab' }]);
    expect(r.legacyOnly).toEqual(['bg-9.png→tab']);
    expect(r.agree).toBe(false);
  });
});
