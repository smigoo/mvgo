# ⚠️ ECharts 图表规范（强制要求）

**使用 echarts.init() 初始化图表，必须满足以下所有条件**：

1. **`$mcComponentBuilder()` 直接解构（声明+赋值一体，只能调用一次）**：`const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()`，禁止用 let + try-catch 分离声明与赋值（会触发 TDZ）
2. **必须使用 `watch(chartRef, (newRef) => { if (newRef && !chart) initChart() })`**（处理 base-panel 渲染过程中销毁并重建 slot DOM 的场景）
3. **必须使用 ResizeObserver 等待容器就绪**（处理尺寸为 0 的情况）
4. **禁止导入不存在的模块导出**（如 `import { set } from '@vueuse/core'`）

# 🎯 图表与面板 UI 还原红线（6 类高频缺陷，强制）

生成图表/面板类组件（流量监测、关键车辆统计等）必须逐条满足，缺一则效果图不合格：

1. **背景图精确还原（bg-size）**：Figma 节点带背景图时，用真实 CSS 还原 `background-size / background-position / background-repeat`，**禁止无脑 cover/center/no-repeat**；Figma 标注具体尺寸/位置则逐值对应。
2. **环形图环厚（radius）**：ECharts 环形图必须用 `radius: [内, 外]` 数组精确控制环厚（如 `['55%','75%']`），**禁止默认 `radius:'50%'` 过细或单值失真**；环厚按 Figma 视觉比例设定。
3. **边框生成（border）**：Figma 标注 stroke 的面板/卡片/分区**必须**生成 `border: <width>px solid <color>`（圆角对应 `border-radius`），**禁止只设背景色漏边框**。
4. **图例位置（legend.position）**：`legend` 的 top/bottom/left/right 必须对齐 Figma 图例实际方位，禁止默认堆顶部；多图共享图例时位置一致。
5. **图例存在性（legend 必生成）**：Figma 有图例则**必须**生成对应 `legend` 配置，禁止只画 series 不画 legend（导致无法区分数据系列）。图例一律用 ECharts `legend`，**禁止**在图表容器外用 `<div>` 色块+文字自绘图例（实锤 mc-1789445437366-5b19ce4f：图例被渲染成容器外的 `.c-env-monitor-time-range` DOM）。
6. **阈值线归属（markLine 必进 series）**：Figma 画布内的横线/竖线（预警线、目标线、安全阈值）**必须**写成 `series[].markLine`，**禁止**在图表容器外建兄弟 DOM（如 `<div class="xxx-threshold-label">`）画线或写标注。阈值线是图表的一部分，其坐标必须随数据轴走（`{ yAxis: 30 }`），不能是脱离画布的静态定位元素。
7. **交通预测/趋势卡片（区块还原）**：设计含"交通预测/趋势/预警"等卡片区块时，必须还原为真实 DOM（数值+单位+环比/趋势箭头/状态色），**禁止整块遗漏或用占位文本**。
8. **图表必须用 ECharts（禁止替代方案）**：Figma 含折线图/柱状图/面积图/饼图/环形图/散点图时，**必须**用 `import * as echarts from 'echarts'` + `echarts.init()` + `setOption()` 渲染。**绝对禁止**以下替代方案（任一出现即判定为不合格）：
   - ❌ SVG `<polyline>` / `<path>` / `<circle>` 手绘折线、柱状或饼图
   - ❌ `<canvas>` 手动绘制图表
   - ❌ 硬编码静态坐标点（如 `points="0,92 40,70 80,78 ..."`）模拟数据走势
   - ❌ 用纯文本/CSS 画柱状或饼图
9. **坐标轴刻度/标签必须还原（axisLabel）**：`xAxis`/`yAxis` 的 `axisLabel.show` 必须为 `true` 且渲染**真实刻度**——Y 轴数值（如 `40/30/20/10/0`）、X 轴时间/类目（如 `2/4/.../24`）；`axisTick.show` 必须为 `true`；`data` 必须取自 Figma 节点树的真实文本，**禁止 `data: []` 空数组**；需单位时用 `name`（如 `name: '时'`）。坐标轴标签缺失（空轴/无刻度数字）即判定不合格。
10. **坐标轴必须用数组格式（xAxis/yAxis 数组）**：`xAxis`/`yAxis` 一律写 `xAxis: [{ ... }]` 数组格式，**禁止对象格式 `xAxis: { ... }`**（部分 ECharts 版本会报 `xAxis "0" not found`）；`series` 中 cartesian 系列（bar/line/scatter 等）**必须显式写 `xAxisIndex: 0, yAxisIndex: 0`**，且索引为数字**禁止字符串 `'0'`**。
11. **禁止 LESS 变量泄漏进 JS formatter**：`tooltip.formatter` / `axisLabel.formatter` 等 JS 回调返回的内联 HTML `style` 中，**禁止出现 `@fontSize` 等 LESS 变量**（浏览器无法解析 `calc(@fontSize * ...)` 会静默丢字号）；需要用字体大小时写 `calc(var(--fontSize, 14px) * N)` 或直接硬编码 px。

参考示例：
```vue
<template>
  <div class="chart-wrapper">
    <div ref="chartRef" class="chart-container" />
  </div>
</template>
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: { trigger: 'axis' },
    grid: { containLabel: true },
    // ⚠️ data 必须取自 Figma 节点树的真实刻度/类目文本，禁止留空 []
    // 🔴🔴 xAxis/yAxis 必须用【数组】格式（非对象），否则部分 ECharts 版本会报 `xAxis "0" not found`
    xAxis: [{
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'], // 时间刻度，按设计稿
      name: '时',                // 单位标识，按设计稿
      axisLabel: { show: true }, // 🔴 必须显示刻度标签
      axisTick: { show: true },
    }],
    yAxis: [{
      type: 'value',
      min: 0, max: 50,          // 按设计稿真实量程
      axisLabel: { show: true }, // 🔴 必须显示数值刻度（40/30/20/10/0 等）
      axisTick: { show: true },
    }],
    // 🔴 柱状图/折线图/散点图等 cartesian 系列【必须】显式写 xAxisIndex: 0, yAxisIndex: 0
    series: [{ type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: [] }]
  }
  chart.setOption(option, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

const handleResize = () => { if (chart) chart.resize() }

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>
<style scoped lang="less">
.chart-wrapper { width: 100%; height: 100%; min-height: 0; }
/* 🔴 echarts 挂载容器必须带【非零】 min-height 兜底：主图 160px / 紧凑图(环形/仪表) 100px
   ⚠️ 禁止写 `min-height: 0` —— 容器内容为空时高度算成 0，图表直接看不见（真机实锤）。 */
.chart-container { width: 100%; height: 100%; min-width: 0; min-height: 160px; }
</style>
```

---

## 图表边界约束（必须）

### 🔴 ECharts 不能超出组件容器

图表"越界"通常不是单一原因，必须同时满足以下约束：

1. 图表容器必须显式设置 `width: 100%`，高度按**设计稿比例**用 `flex` 分配
2. 图表外层 flex 子项必须设置 `min-width: 0`（避免内容挤压导致溢出）
3. ECharts `grid` 必须设置 `containLabel: true`（避免坐标轴文字把画布撑出容器）
4. 必须使用 ResizeObserver + window resize 监听容器/窗口尺寸变化
5. 图表区块建议增加 `overflow: hidden` 作为视觉兜底
6. 图表上方的 Tab、图例、按钮等兄弟区域也必须保持 `width: 100%` / `min-width: 0`，不能因固定宽度把图表容器挤出组件边界

**高度分配规则（区分两类区块）**：

| 区块类型 | 示例 | 高度策略 |
|---------|------|---------|
| **固定功能区块** | 标题栏、tab 条、操作栏、状态栏、页脚 | 可写固定高度（如 `height: 40px`） |
| **内容弹性区块** | 图表、数据列表、主内容区 | 用 `flex` 比例分配，**禁止写死高度** |

**多图表高度比例分配**（核心规则）：
组件内有多个图表时，**禁止给每个图表写死固定高度**，使用 `flex: <flexGrow系数> 1 0`（flexGrow 为管线按 Figma 高度归一化的弹性系数，直接使用 prompt 下发值）按设计稿视觉比例分配空间。
🔴 **禁止把 Figma 像素高度直接写进 flex-grow**（如 `flex: 220 1 0`）——grow 是无单位弹性系数，像素只能出现在 basis 或固定区块 height。

```less
// ✅ 正确：固定功能条 + flex-grow=归一化系数 的比例分配
// （假设设计稿各区块高度：标题40 / tab32 / 柱状图220 / 折线图180 / 环形130 / 页脚24
//   → 管线归一化后系数示例：柱状 1.30 / 折线 1.06 / 环形 0.77，以 prompt 实际下发为准）
.root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  .header { height: 40px; flex-shrink: 0; }   // 固定：标题栏
  .tab-bar { height: 32px; flex-shrink: 0; }  // 固定：tab 条

  .chart-bar {    flex: 1.30 1 0; min-height: 160px; min-width: 0; overflow: hidden; }  // 柱状图（主图，系数 1.30）
  .chart-line {   flex: 1.06 1 0; min-height: 160px; min-width: 0; overflow: hidden; }  // 折线图（主图，系数 1.06）
  .chart-donut {  flex: 0.77 1 0; min-height: 100px; min-width: 0; overflow: hidden; }  // 环形图（紧凑图，系数 0.77）

  .footer { height: 24px; flex-shrink: 0; }   // 固定：状态栏
}
// flex 引擎按 1.30:1.06:0.77 自动等比分配剩余空间——容器变大/变小，设计稿比例不变
// （系数比 = 设计稿高度比 220:180:130，由管线归一化计算，禁止 LLM 手写像素进 grow）
```

```less
// ❌ 错误：给图表写死固定高度，不同屏幕/组件尺寸下必然失衡
.chart-a { height: 120px; }
.chart-b { height: 180px; }
.chart-c { height: 60px; }
```

**单一图表场景**：直接用 `flex: 1 1 0; min-height: 160px`（单区块独占剩余空间撑满；`min-height` 必须是**非零兜底值**，写 0 会让空容器高度算成 0 → 图表不可见）。

```js
// updateChart 通过 chart.setOption 更新
const updateChart = () => {
  if (!chart) return
  chart.setOption({
    grid: { left: 40, right: 16, top: 20, bottom: 28, containLabel: true },
    // ... 其他配置
  }, true)
}
```
