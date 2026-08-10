# 图表（ECharts）配置规则

## 1. 图表配置核心原则

### 🔴 必须按 preview-analysis.charts 落地

**不能生成"通用 ECharts 模板"，必须严格按照 `preview-analysis.json` 的数据实现。**

| preview-analysis 字段 | 必须实现的 ECharts 配置 |
|---------------------|----------------------|
| `series: [...]` | `legend.data = series` + `series[].name = series[i]` |
| `stacked: true` | 所有 series 加 `stack: 'total'` |
| `grouped: true` | series 不加 stack，柱体并排 |
| `markLines: [...]` | `series[0].markLine = { data: [...] }` |
| `areaStyle: true` | 折线 series 加 `areaStyle: { opacity: 0.2 }` |
| `symbol: "circle"` | 折线 series 加 `symbol: 'circle', symbolSize: 6` |
| `backgroundImage: "..."` | 容器外层加 CSS 注释 `/* TODO[figma]: 背景图待补 */` |

---

## 2. 图表基础配置规范

### grid 配置（必须）

**所有图表必须配置 grid，确保不超出容器边界：**

```javascript
option = {
  grid: {
    top: '15px',      // 上边距
    left: '10px',     // 左边距
    bottom: '15px',   // 下边距
    right: '15px',    // 右边距
    containLabel: true  // ← 必须设置，防止坐标轴标签溢出
  }
}
```

**containLabel 的作用：**
- `true`: 坐标轴标签包含在 grid 内，不会超出容器
- `false`: 标签可能超出 grid 边界，导致图表溢出

### 图表容器尺寸规范

```less
.chart-container {
  width: 100%;      // ← 必须设置
  height: 180px;    // ← 必须设置明确高度
  min-width: 0;     // ← 防止 flex 子项溢出
}
```

**❌ 错误示例：**
```less
.chart-container {
  // 没有设置 width/height
}
```

### 响应式调整

```javascript
// 监听容器/窗口尺寸变化
watch(() => containerWidth.value, () => {
  chart?.resize()
})

onMounted(() => {
  window.addEventListener('resize', () => chart?.resize())
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
```

---

## 3. 图表类型配置规范

### 柱状图（Bar）

```javascript
option = {
  xAxis: {
    type: 'category',
    data: props.list?.map(item => item.name),
    axisLabel: {
      color: props.cssVars.axisColor,  // ← 使用主题变量
      fontSize: $mcCssBuilder.getCssEm(12)
    }
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      color: props.cssVars.axisColor
    }
  },
  series: [{
    type: 'bar',
    data: props.list?.map(item => item.value),
    itemStyle: {
      color: props.cssVars.barColor  // ← 使用主题变量
    }
  }]
}
```

### 折线图（Line）

```javascript
series: [{
  type: 'line',
  name: '北京方向',
  data: [120, 200, 150, 80, 70, 110],
  smooth: true,  // 平滑曲线
  symbol: 'circle',
  symbolSize: 6,
  lineStyle: {
    width: 2,
    color: props.cssVars.lineColor
  },
  // 如果需要面积填充
  areaStyle: {
    opacity: 0.2,
    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: 'rgba(54, 119, 248, 0.3)' },
      { offset: 1, color: 'rgba(54, 119, 248, 0)' }
    ])
  }
}]
```

### 饼图（Pie）

```javascript
series: [{
  type: 'pie',
  radius: ['45%', '70%'],  // ← 必须按 Figma Ellipse 比例推算
  center: ['50%', '50%'],
  data: props.list?.map(item => ({
    name: item.name,
    value: item.value,
    itemStyle: {
      color: item.color  // ← 使用数据中的颜色
    }
  })),
  label: {
    fontSize: props.cssVars.pieFontSize || $mcCssBuilder.getCssEm(14),
    color: props.cssVars.colorTextBase
  },
  itemStyle: {
    borderWidth: 0  // ← 如果 Figma 无 strokes，必须为 0
  }
}]
```

**🔴 饼图半径计算规则：**
- 从 Figma 中找到 `@echarts/pie` 节点
- 查找其中的 Ellipse 节点
- 读取 `absoluteBoundingBox.width` 和 `height`
- 内半径 = (Ellipse 内圆 / 容器) * 100%
- 外半径 = (Ellipse 外圆 / 容器) * 100%

---

## 4. 图表元素强制使用 ECharts（禁止 DOM 模拟）

### 阈值线/参考线 - 使用 markLine

**✅ 正确：使用 ECharts markLine**
```javascript
series: [{
  type: 'line',
  data: [...],
  markLine: {
    data: [
      { yAxis: 3000, name: '建议分流' }
    ],
    label: {
      formatter: '建议分流',
      position: 'end',
      color: '#FF9F43'
    },
    lineStyle: {
      type: 'dashed',
      color: '#FF9F43',
      width: 2
    }
  }
}]
```

**❌ 错误：用 DOM 模拟**
```html
<!-- 禁止！ -->
<div class="warning-line">
  <div class="warning-text">建议分流</div>
</div>
```

### 数据标签 - 使用 label

**✅ 正确：使用 ECharts label**
```javascript
series: [{
  type: 'bar',
  data: [...],
  label: {
    show: true,
    position: 'top',
    formatter: '{c}',
    color: props.cssVars.colorTextBase
  }
}]
```

---

## 5. 主题变量使用规范

### 颜色必须使用主题变量

```javascript
const updateChart = () => {
  const option = {
    tooltip: {
      backgroundColor: props.cssVars.tooltipBg || 'rgba(0,0,0,0.8)',
      borderColor: props.cssVars.tooltipBorder || '#18ffce',
      textStyle: {
        color: props.cssVars.colorTextBase || '#fff'
      }
    },
    xAxis: {
      axisLabel: {
        color: props.cssVars.axisColor  // ← 从 props.cssVars 获取
      },
      splitLine: {
        lineStyle: {
          color: props.cssVars.splitLineColor || '#6B6B6B'
        }
      }
    },
    series: [{
      itemStyle: {
        color: props.cssVars.barColor  // ← 从 props.cssVars 获取
      }
    }]
  }
  return option
}
```

### 字体大小使用 $mcCssBuilder

```javascript
const fontSize = $mcCssBuilder.getCssEm(12)
const titleFontSize = $mcCssBuilder.getCssEm(16)

option = {
  xAxis: {
    axisLabel: {
      fontSize: fontSize  // ← 使用计算后的字号
    }
  },
  title: {
    textStyle: {
      fontSize: titleFontSize
    }
  }
}
```

---

## 6. 图表数据更新规范

### 响应式数据更新

```javascript
// ✅ 正确：使用 watch 监听数据变化
watch(() => props.list, () => {
  updateChart()
}, { deep: true })

// ✅ 正确：在 onMounted 中初始化
onMounted(() => {
  chart = echarts.init(chartDom.value)
  updateChart()
})
```

### setOption 使用规范

```javascript
// ✅ 正确：使用 setOption 更新
const updateChart = () => {
  const option = getChartOption()
  chart?.setOption(option, true)  // true = 清空之前的配置
}

// ❌ 错误：直接修改 option 对象
option.series[0].data = newData  // 不会触发更新
```

---

## 7. 图表自检清单

在生成图表代码前，必须完成以下检查：

### 基础配置
- [ ] 是否设置了 `grid.containLabel: true`？
- [ ] 容器是否设置了 `width: 100%` 和明确的 `height`？
- [ ] 是否添加了 `min-width: 0` 防止溢出？
- [ ] 是否监听了容器尺寸变化并调用 `chart.resize()`？

### 主题适配
- [ ] 坐标轴颜色是否使用 `props.cssVars.axisColor`？
- [ ] 文本颜色是否使用 `props.cssVars.colorTextBase`？
- [ ] 字体大小是否使用 `$mcCssBuilder.getCssEm()`？
- [ ] 图表配色是否从 `props.cssVars` 或 `props.list` 中获取？

### 图表元素
- [ ] 是否使用 ECharts `markLine` 而非 DOM 模拟？
- [ ] 是否使用 ECharts `label` 而非 DOM 覆盖？
- [ ] 饼图半径是否按 Figma Ellipse 比例推算？
- [ ] 饼图边框宽度是否根据 Figma strokes 设置（无 strokes = 0）？

### 数据绑定
- [ ] 是否使用 `watch` 监听 `props.list` 变化？
- [ ] 是否在 `onMounted` 中初始化图表？
- [ ] 是否在 `onUnmounted` 中销毁图表（`chart.dispose()`）？

---

## 8. 常见错误及解决方案

### 错误 1: 图表超出容器

**原因：** 未设置 `containLabel: true`

**解决：**
```javascript
grid: {
  containLabel: true  // ← 添加此配置
}
```

### 错误 2: 图表不响应尺寸变化

**原因：** 未调用 `resize()`

**解决：**
```javascript
watch(() => containerWidth.value, () => {
  chart?.resize()
})
```

### 错误 3: 主题切换后图表未更新

**原因：** 未监听 `props.cssVars` 变化

**解决：**
```javascript
watch(() => props.cssVars, () => {
  updateChart()
}, { deep: true })
```

### 错误 4: 饼图半径不准确

**原因：** 使用经验值而非 Figma 数据

**解决：**
```javascript
// ❌ 错误：使用经验值
radius: ['45%', '70%']

// ✅ 正确：从 Figma 数据计算
// 假设 Figma Ellipse 内圆 90px，外圆 140px，容器 200px
radius: ['45%', '70%']  // 90/200=45%, 140/200=70%
```

---

## 9. 示例：完整的图表组件

```vue
<template>
  <div class="layout-echart-bar">
    <div class="title">今日事件数量</div>
    <div ref="chartRef" class="chart-container" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// $mcComponentBuilder 保护
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) { console.warn('[组件] $mcComponentBuilder 失败:', e) }

const props = defineProps({
  cssVars: {
    type: Object,
    default: () => {}
  },
  list: {
    type: Array,
    default: () => []
  }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

const fontSize = $mcCssBuilder.getCssEm(12)

const updateChart = () => {
  if (!chart) return
  const option = {
    grid: {
      top: '15px',
      left: '10px',
      bottom: '15px',
      right: '15px',
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: props.cssVars.tooltipBg || 'rgba(0,0,0,0.8)',
      borderColor: props.cssVars.tooltipBorder,
      textStyle: {
        color: props.cssVars.colorTextBase
      }
    },
    xAxis: {
      type: 'category',
      data: props.list?.map(item => item.name),
      axisLabel: {
        color: props.cssVars.axisColor,
        fontSize: fontSize
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: props.cssVars.axisColor,
        fontSize: fontSize
      }
    },
    series: [{
      type: 'bar',
      data: props.list?.map(item => item.value),
      itemStyle: {
        color: (params) => {
          return props.list[params.dataIndex]?.color
        }
      }
    }]
  }
  chart.setOption(option, true)
}

const cleanupObserver = () => {
  if (chartObserver) { chartObserver.disconnect(); chartObserver = null }
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  cleanupObserver()
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      cleanupObserver()
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
  cleanupObserver()
})
</script>

<style scoped lang="less">
.layout-echart-bar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;

  .title {
    font-size: @fontSize;
    color: @colorTextBase;
    margin-bottom: 12px;
  }

  .chart-container {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
}
</style>
```

**echarts.init() 关键点：**
1. `$mcComponentBuilder()` 必须 try-catch 保护
2. 初始化：`echarts.init(chartRef.value)` + `chart.setOption(option, true)`
3. 必须使用 `watch(chartRef)` 处理 base-panel DOM 替换
4. 必须使用 ResizeObserver 等待容器就绪
5. `onUnmounted` 必须 dispose + cleanup
6. 容器 `width: 100%; height: 100%` + `min-width: 0; min-height: 0`

---

## 9b. 🔴 base-panel + echarts.init() 场景的特殊处理

**如果组件使用 `<base-panel>` 包裹且必须使用 `echarts.init()`，必须增加以下处理**：

### 问题根因
`base-panel` 可能在渲染过程中经历：创建临时DOM → onMounted → 销毁临时DOM（v-if切换） → 重建最终DOM。在此过程中，`ResizeObserver` 会绑定到已销毁的临时元素上，回调永远不会触发。

### 必须的三重保障

```javascript
// 1. $mcComponentBuilder 必须 try-catch 保护
let runtimeBuilder = null
let componentProps = {}
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : {}
  runtimeBuilder = builder.runtimeBuilder || null
  componentProps = builder.componentProps || {}
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  // 尺寸为 0，ResizeObserver 等待
  cleanupObserver()
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      cleanupObserver()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

// 🔑 关键：监听 chartRef 变化，处理 base-panel DOM 替换
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})
```

**❌ 禁止的错误做法：**
- 模块顶层直接 `const { runtimeBuilder } = $mcComponentBuilder()` 无 try-catch → 框架未就绪时整个模块加载失败
- 只有 ResizeObserver 没有 `watch(chartRef)` → base-panel 重建 DOM 后 observer 失联
- `import { set } from '@vueuse/core'` → 不存在的导出导致构建失败

---

## 10. Preview 阶段特殊规则

### 背景图占位

```vue
<!-- TODO[figma]: 背景图待补 - 图表底图 -->
<div class="chart-container chart-container__has-bg">
  <div ref="chartRef" class="chart-container" />
</div>
```

```less
.chart-container__has-bg {
  /* TODO[figma]: 背景图 */
  background: transparent;  // 先留空
}
```

### 图标占位

```vue
<!-- TODO[figma]: 图标待补 -->
<span class="chart-icon-placeholder" />
```

---

## 总结

图表配置的核心要点：
1. ✅ 必须设置 `grid.containLabel: true`
2. ✅ 容器必须有明确的 width 和 height
3. ✅ 颜色和字号使用主题变量
4. ✅ 图表元素使用 ECharts 原生配置，禁止 DOM 模拟
5. ✅ 监听数据和主题变化，及时更新图表
6. ✅ 正确销毁图表，防止内存泄漏
