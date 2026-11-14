/**
 * 🛡️ 2026-11-14（6f02cdb0 实锤）：刀 1 剥除 `min-height:0` 的前提判定。
 *
 * 病灶：刀 1 原本对**所有**图表组件标签剥 `min-height:0`，但它存在的前提是
 *   「组件根 == echarts 挂载容器」（那样 inline min-height 经 `$attrs` 落到图表上会压塌）。
 *   真机 `ContentTunnel` / `ContentBridge` / `ChartSection` 的根都**不是** echarts 容器，
 *   剥掉后 flex item 回落 `min-height:auto` ⇒ 图表段被内容最小高撑高、兄弟段被压缩
 *   ⇒ 段高比例与设计不符（用户肉眼可见：柱图段变高、统计块变矮）。
 */
import { chartRootIsEchartsContainer } from './chart-container-guard.js';

const wrap = (tpl: string) => `<template>\n  ${tpl}\n</template>\n<script setup>\n</script>`;

describe('刀 1 前提：根是否即 echarts 容器', () => {
  it('根元素自身带 ref ⇒ true（该剥，否则图表塌成 0）', () => {
    expect(
      chartRootIsEchartsContainer(
        wrap('<div class="c-chart" ref="chartRef" v-bind="$attrs"></div>'),
        'chartRef',
      ),
    ).toBe(true);
  });

  it('ref 在内部子元素 ⇒ false（不该剥，剥了会撑高段）', () => {
    expect(
      chartRootIsEchartsContainer(
        wrap('<div class="c-wrap"><h3 class="t">标题</h3><div class="c-canvas" ref="chartRef"></div></div>'),
        'chartRef',
      ),
    ).toBe(false);
  });

  it('属性顺序无关（ref 在 class 前后都识别）', () => {
    expect(
      chartRootIsEchartsContainer(
        wrap('<div ref="chartRef" class="c-chart"></div>'),
        'chartRef',
      ),
    ).toBe(true);
  });

  it('注释在前不影响判定（跳过注释取第一个真实标签）', () => {
    expect(
      chartRootIsEchartsContainer(
        wrap('<!-- 说明 -->\n<div class="c-chart" ref="chartRef"></div>'),
        'chartRef',
      ),
    ).toBe(true);
  });

  it('ref 名不同 ⇒ false（避免误判兄弟 ref）', () => {
    expect(
      chartRootIsEchartsContainer(
        wrap('<div ref="otherRef" class="c-chart"></div>'),
        'chartRef',
      ),
    ).toBe(false);
  });

  it('缺输入 / 无 template ⇒ false（fail-open 不剥）', () => {
    expect(chartRootIsEchartsContainer('', 'chartRef')).toBe(false);
    expect(chartRootIsEchartsContainer('<script setup></script>', 'chartRef')).toBe(false);
  });
});
