/**
 * 🎯 2026-09-29 治本·图表容器双刀（mc-max-1790679892888-891fbddc 实锤）
 *
 * 事故：图表组件根元素就是 echarts 挂载容器 ⇒ 装配器下发的
 *   `style="flex:0.304;min-height:0;"` 经 `$attrs` 落到该元素，inline 反杀组件内
 *   `.c-traffic-monitor-chart { min-height: 127px }` ⇒ 高度 0 ⇒ 整图塌陷。
 *
 * 全语料影响面（498 组件 / 480 有 index.vue，实测）：
 *   刀 2 命中 13 / 547 图表组件；刀 1 命中 167 处 / 74 个 index.vue（形态 100% 单一）。
 */
import {
  stripChartInlineMinHeight,
  wrapChartRootAsInnerWrapper,
} from './chart-container-guard.js';

describe('wrapChartRootAsInnerWrapper · 刀 2（echarts 容器==根元素 → 内层 wrapper）', () => {
  const mk = (tpl: string) =>
    `<template>\n  ${tpl}\n</template>\n\n<script setup>\nconst chartRef = ref(null)\n</script>\n`;

  it('空元素根 + v-bind → 插内层，外层去 ref、内层带 canvas class 与 100% 尺寸', () => {
    const src = mk('<div class="c-x-chart" ref="chartRef" v-bind="$attrs"></div>');
    const r = wrapChartRootAsInnerWrapper(src, 'chartRef');
    expect(r.applied).toBe(true);
    expect(r.detail).toEqual({ rootClass: 'c-x-chart', canvasClass: 'c-x-chart-canvas' });
    // 外层：保留原 class 与 $attrs，去掉 ref
    expect(r.code).toContain('<div class="c-x-chart" v-bind="$attrs">');
    // 内层：ref + canvas class + 撑满
    expect(r.code).toContain(
      '<div ref="chartRef" class="c-x-chart-canvas" style="width:100%;height:100%"></div>',
    );
    // 不产生双空格 / `>` 前空格（trim 掉模板自身缩进后只检查改写内容）
    const line = (r.code.split('\n').find((l) => l.includes('ref="chartRef"')) as string).trim();
    expect(line).not.toMatch(/ {2,}/);
    expect(line).not.toMatch(/ >/);
  });

  it('属性顺序相反（ref 在 class 前）同样正确改写', () => {
    const src = mk('<div ref="chartRef" class="c-y-chart" v-bind="$attrs"></div>');
    const r = wrapChartRootAsInnerWrapper(src, 'chartRef');
    expect(r.applied).toBe(true);
    expect(r.code).toContain('<div class="c-y-chart" v-bind="$attrs">');
    expect(r.code).toContain('class="c-y-chart-canvas"');
    const line2 = (r.code.split('\n').find((l) => l.includes('ref="chartRef"')) as string).trim();
    expect(line2).not.toMatch(/ {2,}/);
  });

  it('无 class 属性 → 兜底 canvas class（不崩）', () => {
    const src = mk('<div ref="chartRef"></div>');
    const r = wrapChartRootAsInnerWrapper(src, 'chartRef');
    expect(r.applied).toBe(true);
    expect(r.detail.canvasClass).toBe('c-echarts-canvas');
    expect(r.code).toContain('<div><div ref="chartRef" class="c-echarts-canvas"');
  });

  it('根元素非空（含子节点）→ 一律不改（fail-closed）', () => {
    const src = mk('<div class="c-x-chart" ref="chartRef"><span>标题</span></div>');
    const r = wrapChartRootAsInnerWrapper(src, 'chartRef');
    expect(r.applied).toBe(false);
    expect(r.code).toBe(src);
  });

  it('ref 元素不是 template 第一个元素（已有外层结构）→ 不改', () => {
    const src = mk('<div class="c-x-wrap"><div class="c-x-chart" ref="chartRef"></div></div>');
    const r = wrapChartRootAsInnerWrapper(src, 'chartRef');
    expect(r.applied).toBe(false);
    expect(r.code).toBe(src);
  });

  it('幂等：改写结果再跑一次 applied=false 且内容不变', () => {
    const src = mk('<div class="c-x-chart" ref="chartRef" v-bind="$attrs"></div>');
    const once = wrapChartRootAsInnerWrapper(src, 'chartRef');
    const twice = wrapChartRootAsInnerWrapper(once.code, 'chartRef');
    expect(twice.applied).toBe(false);
    expect(twice.code).toBe(once.code);
  });

  it('ref 不存在 / 无 template / 空输入 → 原样返回', () => {
    const src = mk('<div class="c-x-chart" ref="otherRef"></div>');
    expect(wrapChartRootAsInnerWrapper(src, 'chartRef').applied).toBe(false);
    expect(wrapChartRootAsInnerWrapper('<div></div>', 'chartRef').applied).toBe(false);
    expect(wrapChartRootAsInnerWrapper('', 'chartRef').applied).toBe(false);
    expect(wrapChartRootAsInnerWrapper(null as any, 'chartRef').applied).toBe(false);
  });

  it('保留其它属性（data-section-id 等）原样', () => {
    const src = mk('<div data-section-id="chart-2:7459" class="c-x-chart" ref="chartRef" v-bind="$attrs"></div>');
    const r = wrapChartRootAsInnerWrapper(src, 'chartRef');
    expect(r.code).toContain('<div data-section-id="chart-2:7459" class="c-x-chart" v-bind="$attrs">');
  });
});

describe('stripChartInlineMinHeight · 刀 1（index.vue 图表标签剥 inline min-height:0）', () => {
  it('保留 flex 比例、剥掉 min-height:0', () => {
    const src = '<div>\n  <ChartChart style="flex:0.304;min-height:0;" />\n</div>';
    const r = stripChartInlineMinHeight(src, ['ChartChart']);
    expect(r.stripped).toHaveLength(1);
    expect(r.stripped[0]).toEqual({ tag: 'ChartChart', before: 'flex:0.304;min-height:0;', after: 'flex:0.304' });
    expect(r.code).toContain('<ChartChart style="flex:0.304" />');
  });

  it('0px / auto / initial / unset / none 同属「未保护」口径 → 一并剥除', () => {
    for (const v of ['0px', 'auto', 'initial', 'unset', 'none']) {
      const src = `<ChartA style="flex:1.000;min-height:${v};" />`;
      const r = stripChartInlineMinHeight(src, ['ChartA']);
      expect(r.stripped).toHaveLength(1);
      expect(r.code).toContain('<ChartA style="flex:1.000" />');
    }
  });

  it('非零 min-height（组件自身兜底）→ 不动', () => {
    const src = '<ChartA style="flex:1.000;min-height:160px;" />';
    const r = stripChartInlineMinHeight(src, ['ChartA']);
    expect(r.stripped).toHaveLength(0);
    expect(r.code).toBe(src);
  });

  it('style 剥空 → 整个 style 属性移除（不留 style=""）', () => {
    const src = '<ChartA style="min-height:0;" />';
    const r = stripChartInlineMinHeight(src, ['ChartA']);
    expect(r.code).toBe('<ChartA />');
  });

  it('只动目标标签：非图表组件 / 父级 div 的 min-height:0 保留', () => {
    const src = [
      '<div style="flex:1;min-height:0;">',
      '  <ChartA style="flex:0.5;min-height:0;" />',
      '  <CardGrid style="flex:0.5;min-height:0;" />',
      '</div>',
    ].join('\n');
    const r = stripChartInlineMinHeight(src, ['ChartA']);
    expect(r.stripped).toHaveLength(1);
    expect(r.code).toContain('<div style="flex:1;min-height:0;">');
    expect(r.code).toContain('<ChartA style="flex:0.5" />');
    expect(r.code).toContain('<CardGrid style="flex:0.5;min-height:0;" />');
  });

  it('同一标签出现多次 → 全部剥除', () => {
    const src = '<ChartA style="flex:1;min-height:0;" />\n<ChartA style="flex:2;min-height:0;" />';
    const r = stripChartInlineMinHeight(src, ['ChartA']);
    expect(r.stripped).toHaveLength(2);
    expect(r.code).not.toContain('min-height:0');
  });

  it('⭐ 标签前缀不得跨名误匹配：ChartA 不命中 <ChartA2>，CardGrid 不命中 <CardGrid13>', () => {
    const src = [
      '<ChartA style="flex:1;min-height:0;" />',
      '<ChartA2 style="flex:2;min-height:0;" />',
      '<CardGrid style="flex:1;min-height:0;" />',
      '<CardGrid13 style="flex:2;min-height:0;" />',
    ].join('\n');
    const r = stripChartInlineMinHeight(src, ['ChartA', 'CardGrid']);
    expect(r.stripped).toHaveLength(2);
    expect(r.stripped.map((s) => s.tag)).toEqual(['ChartA', 'CardGrid']);
    // 带数字后缀的兄弟标签必须原样保留
    expect(r.code).toContain('<ChartA2 style="flex:2;min-height:0;" />');
    expect(r.code).toContain('<CardGrid13 style="flex:2;min-height:0;" />');
    expect(r.code).toContain('<ChartA style="flex:1" />');
    expect(r.code).toContain('<CardGrid style="flex:1" />');
  });

  it('tagNames 空 / 无 style 属性 / 空输入 → 原样', () => {
    const src = '<ChartA style="flex:1;min-height:0;" />';
    expect(stripChartInlineMinHeight(src, []).stripped).toHaveLength(0);
    expect(stripChartInlineMinHeight('<ChartA />', ['ChartA']).stripped).toHaveLength(0);
    expect(stripChartInlineMinHeight('', ['ChartA']).code).toBe('');
    expect(stripChartInlineMinHeight(null as any, ['ChartA']).stripped).toHaveLength(0);
  });

  it('与 T2-D 共享 0 值口径（引号/空格变体也认）', () => {
    const src = '<ChartA style="flex: 0.3; min-height : 0 ;" />';
    const r = stripChartInlineMinHeight(src, ['ChartA']);
    expect(r.stripped).toHaveLength(1);
    expect(r.code).not.toMatch(/min-height/);
  });
});
