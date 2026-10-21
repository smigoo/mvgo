/**
 * R19 · B 形态（单 TEXT 内分段）落地：逐段拆 span
 *
 * 旧实现（已删）：
 *   `// 实际场景中，per-char 分段需要更复杂的模板重写（如拆分成多个 span）`
 *   `// 这里采用保守策略：只为主颜色添加 class`
 * ⇒ 分段色**必然丢失**，且"主色"取 `colorClasses[0]`（第一个出现的段色，不是 base）。
 * 新实现：字面量模板按 run 边界拆成逐段 span；动态绑定无静态文本 ⇒ 保留首色兜底（不臆造）。
 */
import { extractNodeLevelColorTruth, injectNodeLevelColorTruth } from '../post-process.js';

const solid = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return {
    type: 'SOLID',
    visible: true,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 },
  };
};

const perCharDoc = () => ({
  id: 'root',
  type: 'FRAME',
  children: [
    {
      id: '2:8443',
      type: 'TEXT',
      characters: '(2/484)',
      fills: [solid('#1990ff')],
      style: { fontSize: 16, fontWeight: 500 },
      characterStyleOverrides: [1, 2, 1, 1, 1, 1, 1],
      styleOverrideTable: {
        '1': { fontSize: 16, fontWeight: 500, fills: [solid('#1990ff')] },
        '2': { fontSize: 18, fontWeight: 600, fills: [solid('#e03434')] },
      },
    },
  ],
});

describe('extractNodeLevelColorTruth（R19 委托 text-runs）', () => {
  it('多段节点：runs 带段边界，perCharColors 非空（准入判据不变）', () => {
    const truth = extractNodeLevelColorTruth(perCharDoc());
    expect(truth).toHaveLength(1);
    expect(truth[0].text).toBe('(2/484)');
    expect(truth[0].runs.map((r: any) => r.text)).toEqual(['(', '2', '/484)']);
    expect(truth[0].perCharColors.length).toBeGreaterThan(0);
  });

  it('单色节点：perCharColors 为空 ⇒ 注入器整段跳过（不制造噪音）', () => {
    const doc = {
      id: 'root',
      type: 'FRAME',
      children: [
        {
          id: 't',
          type: 'TEXT',
          characters: '在线设备',
          fills: [solid('#333333')],
          style: { fontSize: 16, fontWeight: 400 },
        },
      ],
    };
    const truth = extractNodeLevelColorTruth(doc);
    expect(truth[0].runs).toHaveLength(1);
    expect(truth[0].perCharColors).toEqual([]);
    const files = { 'package/index.vue': '<template><div>在线设备</div></template>\n<style>.x{}</style>' };
    expect(injectNodeLevelColorTruth(files, truth).applied).toBe(false);
  });
});

describe('injectNodeLevelColorTruth：字面量模板逐段拆 span', () => {
  const vue = () => `<template>
  <div class="cons">
    <span class="label">摄像机</span>
    <span class="value">(2/484)</span>
  </div>
</template>

<style lang="less">
.label { color: #ffffff; }
</style>`;

  it('三段各一个 span，且三个色规则都写入样式', () => {
    const files = { 'package/components/Cons.vue': vue() };
    const truth = extractNodeLevelColorTruth(perCharDoc());
    const r = injectNodeLevelColorTruth(files, truth);
    expect(r.applied).toBe(true);
    const out = files['package/components/Cons.vue'];

    // ① 结构：按 run 边界拆成 3 个 span（旧实现会保留 1 个 span + 只加主色类）
    const spans = out.match(/<span[^>]*>\(\<\/span>|<span[^>]*>2<\/span>|<span[^>]*>\/484\)<\/span>/g);
    expect(spans).toHaveLength(3);
    // ② 段内样式：'2' 那段的字号/字重随段落地
    expect(out).toMatch(/<span[^>]*font-size:18px[^>]*>2<\/span>/);
    // ③ 三个颜色规则都在（旧实现只绑第一个，其余成为死 CSS；现在都有消费者）
    expect(out).toContain('color: rgb(25,144,255)');
    expect(out).toContain('color: rgb(224,52,52)');
    // ④ 整行字面量已不存在
    expect(out).not.toContain('(2/484)');
  });

  it('幂等：第二次零改动', () => {
    const files = { 'package/components/Cons.vue': vue() };
    const truth = extractNodeLevelColorTruth(perCharDoc());
    injectNodeLevelColorTruth(files, truth);
    const once = files['package/components/Cons.vue'];
    const again = injectNodeLevelColorTruth(files, truth);
    expect(again.applied).toBe(false);
    expect(files['package/components/Cons.vue']).toBe(once);
  });

  it('动态绑定（无静态字面量）⇒ 不拆结构，保持保守兜底', () => {
    const src = `<template>
  <div class="cons"><span class="value">{{ item.value }}</span></div>
</template>
<style>.value{}</style>`;
    const files = { 'package/components/Cons.vue': src };
    const truth = extractNodeLevelColorTruth(perCharDoc());
    const r = injectNodeLevelColorTruth(files, truth);
    // 模板里没有 `(2/484)` 字面量 ⇒ 不进入任何绑定分支（不臆造）
    expect(r.applied).toBe(false);
    expect(files['package/components/Cons.vue']).toBe(src);
  });
});
