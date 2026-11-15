/**
 * 🛡️ 2026-11-15 T2-W · RUNTIME-017 判据阴阳对照
 *
 * 真机事实来源（只读 Puppeteer 探针 /tmp/probe-chart-gate-yinyang-20261115.mjs，
 * 同一预览页 mc-max-1794680105142-4804ca47 的破损态 / 修好态）：
 *   broken: chartLike=6 rendered=4 zeroWidth=[wrap(w0,h93), chart(w0,h160)] canvasTotal=2
 *   fixed : chartLike=6 rendered=6 zeroWidth=[] canvasTotal=3
 *
 * 验者只调纯函数断言裁决结果，**不复用改者的页内采集正则 / 阈值**。
 * 阳性对照 = 破损态必须 BLOCK；阴性对照 = 修好态 + 探针缺失一律不阻断。
 */
import { evaluateChartRenderReality } from '../chart-render-reality.js';

// 逐字来自真机探针输出（破损态）
const BROKEN_FACTS = {
  chartContainers: {
    chartLike: 6,
    rendered: 4,
    zeroWidth: [
      { el: 'div.c-traffic-monitor-forecast-chart-wrap', w: 0, h: 93, minHeight: '0px' },
      { el: 'div.c-traffic-monitor-forecast-chart', w: 0, h: 160, minHeight: '160px' },
    ],
    canvasTotal: 2,
  },
};

// 逐字来自真机探针输出（给父容器补普通 width:100% 后）
const FIXED_FACTS = {
  chartContainers: {
    chartLike: 6,
    rendered: 6,
    zeroWidth: [],
    canvasTotal: 3,
  },
};

describe('evaluateChartRenderReality（RUNTIME-017 单一判据）', () => {
  it('阳性：零宽图表容器（wrap + chart）必须阻断', () => {
    const r = evaluateChartRenderReality(BROKEN_FACTS);
    expect(r.shouldBlock).toBe(true);
    expect(r.verdict).toBe('block');
    expect(r.evaluated).toBe(1);
    expect(r.zeroWidth).toHaveLength(2);
    expect(r.chartLike).toBe(6);
    expect(r.rendered).toBe(4);
    // 证据必须原样透传，供 runtimeGate.issues.evidence 追溯
    expect(r.zeroWidth[0].el).toContain('forecast-chart-wrap');
  });

  it('阴性：修好态（rendered=6 / zeroWidth=0）必须放行', () => {
    const r = evaluateChartRenderReality(FIXED_FACTS);
    expect(r.shouldBlock).toBe(false);
    expect(r.verdict).toBe('pass');
    expect(r.evaluated).toBe(1);
    expect(r.rendered).toBe(6);
    expect(r.zeroWidth).toEqual([]);
  });

  it('阴性：只有 1 个零宽容器也阻断（不设数量宽容）', () => {
    const facts = {
      chartContainers: { ...BROKEN_FACTS.chartContainers, zeroWidth: [BROKEN_FACTS.chartContainers.zeroWidth[0]] },
    };
    expect(evaluateChartRenderReality(facts).verdict).toBe('block');
  });

  it.each([
    ['探针被开关关闭', null],
    ['探针未执行', undefined],
    ['探针抛错', { error: 'page.evaluate timeout' }],
    ['无 stage', { skipped: 'no-stage' }],
    ['zeroWidth 不是数组', { chartContainers: { zeroWidth: 'oops' } }],
    ['chartContainers 为 null', { chartContainers: null }],
  ])('缺证据 fail-open：%s 一律不阻断', (_name, probes) => {
    const r = evaluateChartRenderReality(probes);
    expect(r.verdict).toBe('no-evidence');
    expect(r.evaluated).toBe(0);
    expect(r.shouldBlock).toBe(false);
    expect(r.zeroWidth).toEqual([]);
  });

  it('计数透传：非数值字段归零，不得伪造读数', () => {
    const r = evaluateChartRenderReality({
      chartContainers: { chartLike: 'x', rendered: undefined, zeroWidth: [], canvasTotal: 0 },
    });
    expect(r.chartLike).toBe(0);
    expect(r.rendered).toBe(0);
    expect(r.verdict).toBe('pass');
  });
});
