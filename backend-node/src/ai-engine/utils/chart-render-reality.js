/**
 * 🛡️ RUNTIME-017 判据单一来源（2026-11-15 · T2-W）。
 *
 * 背景（mc-max-1794680105142-4804ca47 流量预测折线图整图空白实锤）：
 *   图表父容器 `.c-traffic-monitor-forecast-chart-wrap` 因 `flex: 1 1 0px` 且缺 width
 *   → `clientWidth=0` → `ContentForecast.vue` 的 `initChart()` 守卫 `clientWidth>0` 短路，
 *   ResizeObserver 回调同样要求 width>0 ⇒ **echarts.init 永不执行、不抛错、无 canvas**。
 *   旧 WP3 第 5 项 `chartNoEcharts` 的面积前置 `rect.width*rect.height < 1000 continue`
 *   恰好把零宽容器排除；静态 G12b 只查源码里有没有 `series: [` ⇒ 三层判据全绿。
 *
 * 设计约束：
 * - **零依赖纯函数**：页内探针只采 DOM 事实，本模块只吃这些真机事实做裁决，
 *   不读产物源码、不塞构造入参（避免「改的人=验的人」假绿），便于 jest 阴阳对照。
 * - **缺证据 fail-open**：探针开关关闭 / 执行失败 / 无 stage ⇒ `verdict:'no-evidence'`，不阻断。
 * - **真机计数行**：调用方恒打 `chartRenderReality:...`（0 也打），不得塞入参冒充读数。
 *
 * 真错定义：存在「类名带 chart、实质高度 >= 60px 或 min-height >= 60、宽 < 2px，
 * 且自身与后代均无 canvas/svg/_echarts_instance_」的容器。
 * 排除项：display:none / visibility:hidden / opacity<0.1；已有 canvas/svg 的容器；
 * 图例、装饰条、文字槽等高度 < 60px 的小节点。
 *
 * 真机阴阳对照（同一预览页，Puppeteer 只读探针）：
 *   破损态 chartLike=6 / rendered=4 / zeroWidth=2（wrap + chart）→ BLOCK；
 *   给父容器补普通 `width:100%` 后 rendered=6 / zeroWidth=0 → PASS；
 *   原有 4 个正常图表容器（两张柱状图）两种状态均不命中 ⇒ 零误伤。
 */

/**
 * @param {object|null} renderProbes 页内探针结果（collectRenderProbesInPage 返回值）
 * @returns {{evaluated:number, chartLike:number, rendered:number, zeroWidth:Array,
 *            shouldBlock:boolean, verdict:'block'|'pass'|'no-evidence'}}
 */
export function evaluateChartRenderReality(renderProbes) {
  const cc = renderProbes?.chartContainers
  if (!cc || typeof cc !== 'object' || !Array.isArray(cc.zeroWidth)) {
    return {
      evaluated: 0,
      chartLike: 0,
      rendered: 0,
      zeroWidth: [],
      shouldBlock: false,
      verdict: 'no-evidence',
    }
  }
  const zeroWidth = cc.zeroWidth
  return {
    evaluated: 1,
    chartLike: Number(cc.chartLike) || 0,
    rendered: Number(cc.rendered) || 0,
    zeroWidth,
    shouldBlock: zeroWidth.length > 0,
    verdict: zeroWidth.length > 0 ? 'block' : 'pass',
  }
}
