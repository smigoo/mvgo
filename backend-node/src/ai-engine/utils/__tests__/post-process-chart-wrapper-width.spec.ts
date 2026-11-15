/**
 * 🛡️ 2026-11-15 T2-W · 图表父容器宽度锚定阴阳对照
 *
 * 真机来源：mc-max-1794680105142-4804ca47 产物
 *   ContentForecast.vue（折线图空白，wrap 缺 width）→ 阳性
 *   ContentTunnel.vue（柱状图正常，wrap 已有 width:100%）→ 阴性
 * 真机 Puppeteer 5 组对照结论：只补**直接父容器**有效；只补内层无效；
 * `flex:1 1 auto` 无效；`!important` 非必需。
 *
 * 验者只对纯函数的输入/输出做断言，不复用改者的正则集合。
 */
import { anchorChartWrapperWidth, resolveEchartsContainer } from '../post-process.js';

// 逐字摘取真机产物模板 + 样式（ContentForecast.vue:26-28 / 312-320）
const FORECAST_SFC = `<template>
  <div class="c-traffic-monitor-forecast-root" data-section-id="2:3604">
    <div class="c-traffic-monitor-forecast-chart-wrap">
      <div ref="chartRef" class="c-traffic-monitor-forecast-chart"></div>
    </div>
  </div>
</template>
<style lang="less">
.c-traffic-monitor-forecast-chart-wrap {
  min-height: 0;
  min-width: 0;
}

.c-traffic-monitor-forecast-chart {
  min-width: 0;
  min-height: 160px;
}
</style>`;

// 真机好件（ContentTunnel.vue:10-11 / 215-229）
const TUNNEL_SFC = `<template>
  <div class="c-traffic-monitor-tunnel-root">
    <div class="c-traffic-monitor-tunnel-chart-wrap">
      <div ref="chartRef" class="c-traffic-monitor-tunnel-chart"></div>
    </div>
  </div>
</template>
<style lang="less">
.c-traffic-monitor-tunnel-chart-wrap {
  min-height: 0;
  width: 100%;
}
.c-traffic-monitor-tunnel-chart {
  width: 100%;
  height: 100%;
}
</style>`;

describe('anchorChartWrapperWidth（T2-W）', () => {
  it('阳性：折线图 wrap 缺 width ⇒ 只给父容器补 100%，内层不注入', () => {
    const r = anchorChartWrapperWidth(FORECAST_SFC, 'chartRef', 'c-traffic-monitor-forecast-chart');
    expect(r.wrapperCls).toBe('c-traffic-monitor-forecast-chart-wrap');
    expect(r.injectedCount).toBe(1);
    expect(r.code).toContain('.c-traffic-monitor-forecast-chart-wrap {\n  min-height: 0;\n  min-width: 0;\n  width: 100%;');
    // 内层不得注入（真机实证：100% of 0 无效，属噪声）
    const inner = r.code.slice(r.code.indexOf('.c-traffic-monitor-forecast-chart {'));
    expect(inner).not.toContain('width: 100%');
    // 不得写 !important（实证非必需，避免强覆盖后续真值）
    expect(r.code).not.toContain('!important');
  });

  it('阴性：好件已有 width:100% ⇒ 逐字不变（杜绝 862c6b29 拉锯）', () => {
    const r = anchorChartWrapperWidth(TUNNEL_SFC, 'chartRef', 'c-traffic-monitor-tunnel-chart');
    expect(r.injectedCount).toBe(0);
    expect(r.code).toBe(TUNNEL_SFC);
  });

  it('阳性变体：min-width:0 不得被误判为已有 width', () => {
    const sfc = FORECAST_SFC.replace('  min-width: 0;\n}\n\n.c-traffic-monitor-forecast-chart', '}\n\n.c-traffic-monitor-forecast-chart');
    const r = anchorChartWrapperWidth(sfc, 'chartRef', 'c-traffic-monitor-forecast-chart');
    expect(r.injectedCount).toBe(1);
    expect(r.code).toContain('width: 100%;');
  });

  it('幂等：连续执行第二次逐字不变、注入数归零', () => {
    const once = anchorChartWrapperWidth(FORECAST_SFC, 'chartRef', 'c-traffic-monitor-forecast-chart');
    const twice = anchorChartWrapperWidth(once.code, 'chartRef', 'c-traffic-monitor-forecast-chart');
    expect(twice.injectedCount).toBe(0);
    expect(twice.code).toBe(once.code);
  });

  it.each([
    ['绝对定位父容器', FORECAST_SFC.replace('  min-width: 0;\n}', '  min-width: 0;\n  position: absolute;\n}')],
    ['父容器无 class', FORECAST_SFC.replace('class="c-traffic-monitor-forecast-chart-wrap"', '')],
    ['ref 名不匹配', FORECAST_SFC],
    ['ref 与父之间夹注释', FORECAST_SFC.replace('>\n      <div ref="chartRef"', '>\n      <!-- 图表区 -->\n      <div ref="chartRef"')],
    ['父与 chartCls 同类', FORECAST_SFC.replace('c-traffic-monitor-forecast-chart-wrap', 'c-traffic-monitor-forecast-chart')],
  ])('阴性 fail-closed：%s ⇒ 不动', (_name, sfc) => {
    const ref = _name === 'ref 名不匹配' ? 'otherRef' : 'chartRef';
    const r = anchorChartWrapperWidth(sfc, ref, 'c-traffic-monitor-forecast-chart');
    expect(r.injectedCount).toBe(0);
    expect(r.code).toBe(sfc);
  });

  it('阴性：echarts 直接挂在根元素、无父容器 ⇒ 不动', () => {
    const sfc = `<template><div class="root"><div ref="chartRef" class="root"></div></div></template>
<style>.root { min-height: 0; }</style>`;
    const r = anchorChartWrapperWidth(sfc, 'chartRef', 'root');
    expect(r.injectedCount).toBe(0);
    expect(r.code).toBe(sfc);
  });

  it.each([
    ['空 code', '', 'chartRef', 'chart'],
    // 缺 ref/class 时改由 resolveEchartsContainer 自解析；本片段无 echarts.init ⇒ fail-closed 不动
    ['缺 refName', FORECAST_SFC, '', 'c-traffic-monitor-forecast-chart'],
    ['缺 chartCls', FORECAST_SFC, 'chartRef', ''],
  ])('入参缺证据：%s ⇒ 不动', (_name, code, refName, chartCls) => {
    expect(anchorChartWrapperWidth(code, refName, chartCls).code).toBe(code);
  });

  it('lite 单文件链路：不传 ref/class ⇒ resolveEchartsContainer 自解析并命中', () => {
    const liteSfc = FORECAST_SFC.replace(
      '</template>',
      '</template>\n<script setup>\nconst chartRef = ref(null)\nlet chart = echarts.init(chartRef.value)\n</script>',
    );
    expect(resolveEchartsContainer(liteSfc)).toEqual({
      refName: 'chartRef',
      chartCls: 'c-traffic-monitor-forecast-chart',
    });
    const r = anchorChartWrapperWidth(liteSfc);
    expect(r.wrapperCls).toBe('c-traffic-monitor-forecast-chart-wrap');
    expect(r.injectedCount).toBe(1);
    expect(r.code).toContain('width: 100%');
  });

  it('阴性：无 echarts.init / 无静态 ref ⇒ 自解析返回 null', () => {
    expect(resolveEchartsContainer(FORECAST_SFC)).toBeNull();
    expect(resolveEchartsContainer('')).toBeNull();
    expect(resolveEchartsContainer('<template><div ref="x"></div></template>')).toBeNull();
    expect(anchorChartWrapperWidth(FORECAST_SFC).code).toBe(FORECAST_SFC);
  });
});
