# 图例（Legend）和 Tooltip 规则

## 1. 图例（Legend）配置规范

### 🔴 图例位置判断规则

**当 `legendPosition` 为 `"right"` 时，必须根据 `legendType` 字段决定排列方向：**

| legendType | ECharts orient | 布局位置 | 适用场景 |
|-----------|---------------|---------|---------|
| `"horizontal"` | `orient: 'horizontal'` | 水平排列在右上角 | 柱状图/折线图/面积图 |
| `"vertical"` | `orient: 'vertical'` | 垂直排列在右侧 | 饼图/环形图 |
| 未提供 | 默认 `"horizontal"` | 水平排列 | 无法确定时 |

**其他位置的配置：**

| legendPosition | ECharts 配置 | 示例 |
|----------------|-------------|------|
| `"top"` | `legend: { top: 0, orient: 'horizontal' }` | 顶部水平 |
| `"bottom"` | `legend: { bottom: 0, orient: 'horizontal' }` | 底部水平 |
| `"left"` | `legend: { left: 0, orient: 'vertical', top: 'middle' }` | 左侧垂直居中 |
| `"right"` + `"horizontal"` | `legend: { right: 0, top: 0, orient: 'horizontal' }` | 右上角水平 |
| `"right"` + `"vertical"` | `legend: { right: 8, top: 'middle', orient: 'vertical' }` | 右侧垂直居中 |

### 判断方法

**从预览图或 Figma 中观察：**
1. 图例项是**左右排列**还是**上下排列**？
2. 左右排列 → `legendType: "horizontal"` → `orient: 'horizontal'`
3. 上下排列 → `legendType: "vertical"` → `orient: 'vertical'`

---

## 2. 图例尺寸还原规则

### 🔴 必须按 Figma 原始尺寸还原

**图例色块/图标的大小必须按 Figma 原始尺寸还原，禁止使用 ECharts 默认尺寸（25x14 偏大）。**

| Figma 图例色块尺寸 | ECharts 配置 | 适用场景 |
|------------------|-------------|---------|
| 小色块（10x10, 12x12） | `itemWidth: 12, itemHeight: 12` | 柱状图/折线图的标准图例 |
| 小圆点（8x8） | `itemWidth: 8, itemHeight: 8, symbol: 'circle'` | 面积图/散点图的圆点图例 |
| 细长条（20x4） | `itemWidth: 20, itemHeight: 4` | 线条图例 |
| 未明确尺寸 | `itemWidth: 12, itemHeight: 12` | 默认保守值 |

### 查找图例尺寸的步骤

1. 在 Figma 中找到 `@echarts/legend` 或 `legend` 命名的 Frame
2. 查找色块节点（通常是 Rectangle 或 Ellipse）
3. 读取色块的 `absoluteBoundingBox.width` 和 `height`
4. 将尺寸映射到 ECharts 的 `legend.itemWidth` 和 `legend.itemHeight`

### 正确配置示例

```javascript
legend: {
  data: ['北京方向', '上海方向'],
  itemWidth: 12,    // ← 来自 Figma 色块宽度
  itemHeight: 12,   // ← 来自 Figma 色块高度
  itemGap: 16,      // 图例项之间的间距
  right: 0,
  top: 0,
  orient: 'horizontal',
  textStyle: {
    color: '#666',
    fontSize: 12
  }
}
```

### 错误示例

```javascript
// ❌ 错误：使用 ECharts 默认尺寸（25x14），图例会偏大
legend: {
  data: ['北京方向', '上海方向']
  // 没有设置 itemWidth/itemHeight → 使用默认值 25x14
}

// ✅ 正确：明确设置小尺寸
legend: {
  data: ['北京方向', '上海方向'],
  itemWidth: 12,
  itemHeight: 12
}
```

---

## 3. 图例联动规则

### 🔴 自定义图例必须与图表联动

**如果预览图中存在图表图例，必须实现点击图例切换系列显示的功能。**

### 方式 1: 使用 ECharts 内置 legend（推荐）

```javascript
option = {
  legend: {
    data: ['北京方向', '上海方向'],
    itemWidth: 12,
    itemHeight: 12,
    right: 0,
    top: 0,
    orient: 'horizontal'
  },
  series: [
    { name: '北京方向', type: 'line', data: [...] },
    { name: '上海方向', type: 'line', data: [...] }
  ]
}
```

**注意：** `legend.data` 中的名称必须与 `series[].name` 完全一致。

### 方式 2: DOM 图例 + dispatchAction

**如果设计要求自定义图例样式，必须实现联动：**

```vue
<template>
  <div class="chart-legend">
    <span 
      class="legend-item" 
      :class="{ active: legendState.beijing }" 
      @click="toggleLegend('北京方向')"
    >
      <i class="dot dark-blue"></i>北京方向
    </span>
    <span 
      class="legend-item" 
      :class="{ active: legendState.shanghai }" 
      @click="toggleLegend('上海方向')"
    >
      <i class="dot light-blue"></i>上海方向
    </span>
  </div>
  <div class="chart-body">
    <div ref="chartRef" class="chart-container" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) { console.warn('[组件] $mcComponentBuilder 失败:', e) }

const chartRef = ref(null)
let chart = null

// 图例状态
const legendState = ref({ 
  beijing: true, 
  shanghai: true 
})

// 切换图例
const toggleLegend = (name) => {
  chart?.dispatchAction({
    type: 'legendToggleSelect',
    name: name
  })
  
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const updateChart = () => {
  if (!chart) return
  chart.setOption({
    legend: { show: false },  // 隐藏内置图例
    series: [
      { name: '北京方向', type: 'line', data: [...] },
      { name: '上海方向', type: 'line', data: [...] }
    ]
  }, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
  }
}

watch(chartRef, (newRef) => { if (newRef && !chart) initChart() })

onMounted(() => { initChart() })
onUnmounted(() => { chart?.dispose() })
</script>

<style scoped lang="less">
.chart-legend {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.3s;

    &.active {
      opacity: 1;
    }

    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;

      &.dark-blue {
        background: #1890ff;
      }

      &.light-blue {
        background: #69c0ff;
      }
    }
  }
}

.chart-container {
  width: 100%;
  height: 180px;
  min-width: 0;
  min-height: 0;
}
</style>
```

### 禁止的行为

```javascript
// ❌ 错误 1: 图例是静态 DOM，没有点击事件
<span class="legend-item">
  <i class="dot"></i>北京方向
</span>

// ❌ 错误 2: 图例点击后图表不响应
const toggleLegend = (name) => {
  // 只改变样式，没有调用 dispatchAction
  legendState.value[name] = !legendState.value[name]
}

// ❌ 错误 3: 使用 ECharts 内置 legend 替代自定义图例（除非设计稿明确使用）
// 如果设计稿中有明确的图例样式，不应该使用 ECharts 默认图例
```

---

## 4. Tooltip 配置规范

### 🔴 图表 tooltip 必须提供（不可省略）

**核心规则：**
1. **只要组件中存在 ECharts 图表，就必须提供 `option.tooltip`**
2. **禁止**省略 tooltip
3. **禁止**写 `tooltip: { show: false }`（除非是固定 tooltip 场景）
4. **禁止**在 `<template>` 写死 tooltip DOM 元素当成常驻 UI

### 设计稿中的 tooltip 识别

**重要理解：** 设计图里出现的 tooltip 气泡，默认只代表"交互时出现"的效果，而不是常驻 UI。

- ✅ **正确理解**：tooltip 是鼠标悬浮时动态显示的浮层
- ❌ **错误理解**：把 tooltip 当成固定在图表上的装饰元素

---

## 5. 默认 Tooltip 配置规则

### 根据图表类型选择 trigger

**没有设计证据时，必须保留默认 tooltip：**

| 图表类型 | trigger 类型 | 说明 |
|---------|-------------|------|
| 折线图/柱状图/面积图 | `tooltip.trigger = 'axis'` | 坐标系图表，触发整个坐标轴 |
| 饼图/散点图/仪表盘 | `tooltip.trigger = 'item'` | 非坐标系图表，触发单个数据项 |

### 坐标系图表（折线图/柱状图）

```javascript
option = {
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross',  // 十字准星
      crossStyle: {
        color: '#999'
      }
    },
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderColor: '#18ffce',
    borderWidth: 1,
    textStyle: {
      color: '#fff',
      fontSize: 12
    }
  }
}
```

### 非坐标系图表（饼图）

```javascript
option = {
  tooltip: {
    trigger: 'item',
    formatter: '{a} <br/>{b}: {c} ({d}%)',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    textStyle: {
      color: '#fff'
    }
  }
}
```

---

## 6. 自定义 Tooltip 样式还原

### 如果设计图中有 tooltip 视觉证据

**必须还原以下属性：**

| 属性 | 说明 | 示例 |
|-----|------|------|
| `trigger` | 触发类型 | `'axis'` / `'item'` |
| `backgroundColor` | 背景色 | `'rgba(0, 0, 0, 0.8)'` |
| `borderColor` | 边框颜色 | `'#18ffce'` |
| `borderWidth` | 边框宽度 | `1` |
| `textStyle` | 文字样式 | `{ color, fontSize }` |
| `axisPointer` | 坐标轴指示器 | `{ type, lineStyle }` |
| `formatter` | 内容格式化 | 函数或模板字符串 |

### 完整示例

```javascript
tooltip: {
  trigger: 'axis',
  backgroundColor: props.cssVars.tooltipBg || 'rgba(0, 0, 0, 0.8)',
  borderColor: props.cssVars.tooltipBorder || '#18ffce',
  borderWidth: 1,
  textStyle: {
    color: props.cssVars.colorTextBase || '#fff',
    fontSize: $mcCssBuilder.getCssEm(12)
  },
  axisPointer: {
    type: 'line',
    lineStyle: {
      color: props.cssVars.tooltipBorder || '#18ffce',
      type: 'dashed'
    }
  },
  formatter: (params) => {
    if (Array.isArray(params)) {
      let result = `<div style="padding: 4px 8px;">`
      result += `<div style="margin-bottom: 4px;">${params[0].axisValue}</div>`
      params.forEach(param => {
        result += `<div style="display: flex; align-items: center; gap: 8px;">`
        result += `<span style="width: 10px; height: 10px; background: ${param.color}; display: inline-block;"></span>`
        result += `<span>${param.seriesName}: ${param.value}</span>`
        result += `</div>`
      })
      result += `</div>`
      return result
    }
    return `${params.seriesName}: ${params.value}`
  }
}
```

---

## 7. 固定 Tooltip 特殊处理

### 识别固定 Tooltip

**如果 preview-analysis 中有以下字段：**
- `tooltip: "fixed-on-chart"`
- `fixedTooltip: { anchor, content }`

**则使用 ECharts graphic 组件绘制固定框。**

### 实现方式

```javascript
option = {
  tooltip: { show: false },  // 这种情况下可以关闭
  graphic: [{
    type: 'group',
    z: -1,  // ← 必须设置，避免遮挡交互
    left: 100,
    top: 50,
    children: [
      {
        type: 'rect',
        shape: { x: 0, y: 0, width: 120, height: 60 },
        style: {
          fill: 'rgba(0, 0, 0, 0.8)',
          stroke: '#18ffce',
          lineWidth: 1
        }
      },
      {
        type: 'text',
        style: {
          text: '北京方向\n3000 辆',
          fill: '#fff',
          fontSize: 12,
          x: 10,
          y: 15
        }
      }
    ]
  }]
}
```

**⚠️ 重要：** `z: -1` 必须设置，否则会遮挡图表交互。

---

## 8. 禁止的行为

### ❌ 错误 1: 省略 tooltip

```javascript
// ❌ 错误：没有 tooltip 配置
option = {
  series: [...]
  // 没有 tooltip
}
```

### ❌ 错误 2: 禁用 tooltip

```javascript
// ❌ 错误：禁用 tooltip
option = {
  tooltip: { show: false },  // 禁止！除非是固定 tooltip 场景
  series: [...]
}
```

### ❌ 错误 3: 在 template 中写死 tooltip DOM

```html
<!-- ❌ 错误：tooltip 应该是交互时出现，不是常驻元素 -->
<div class="fixed-tooltip">
  <div class="tooltip-content">北京方向: 3000</div>
</div>
```

### ❌ 错误 4: 强制常驻显示

```javascript
// ❌ 错误：强制常驻显示（除非需求明确）
onMounted(() => {
  chart.dispatchAction({ 
    type: 'showTip', 
    seriesIndex: 0, 
    dataIndex: 0 
  })
})
```

---

## 9. 图例和 Tooltip 自检清单

### 图例自检
- [ ] 图例位置是否按 `legendPosition` 和 `legendType` 配置？
- [ ] 图例尺寸是否按 Figma 色块尺寸设置（`itemWidth`/`itemHeight`）？
- [ ] 图例是否使用了 ECharts 默认尺寸（25x14）？（禁止）
- [ ] 自定义图例是否实现了与图表的联动（`dispatchAction`）？
- [ ] `legend.data` 中的名称是否与 `series[].name` 完全一致？

### Tooltip 自检
- [ ] 图表是否提供了 `tooltip` 配置？
- [ ] 是否根据图表类型选择了正确的 `trigger`（axis/item）？
- [ ] 是否使用主题变量设置 tooltip 颜色（`backgroundColor`/`borderColor`）？
- [ ] 是否在 template 中写死了 tooltip DOM？（禁止）
- [ ] 固定 tooltip 是否设置了 `z: -1` 避免遮挡交互？

---

## 10. 完整示例

### 示例 1: 折线图 + 水平图例 + Tooltip

```vue
<template>
  <div class="chart-wrapper">
    <div ref="chartRef" class="chart-container" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) { console.warn('[组件] $mcComponentBuilder 失败:', e) }

const props = defineProps({
  cssVars: { type: Object, default: () => {} },
  list: { type: Array, default: () => [] }
})

const chartRef = ref(null)
let chart = null

const updateChart = () => {
  if (!chart) return
  const option = {
    grid: {
      top: '40px',
      left: '10px',
      bottom: '15px',
      right: '15px',
      containLabel: true
    },
    legend: {
      data: ['北京方向', '上海方向'],
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      right: 0,
      top: 0,
      orient: 'horizontal',
      textStyle: {
        color: props.cssVars.colorTextBase,
        fontSize: $mcCssBuilder.getCssEm(12)
      }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: props.cssVars.tooltipBorder || '#18ffce',
      borderWidth: 1,
      textStyle: {
        color: '#fff',
        fontSize: $mcCssBuilder.getCssEm(12)
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: props.cssVars.tooltipBorder || '#18ffce',
          type: 'dashed'
        }
      }
    },
    xAxis: {
      type: 'category',
      data: ['0:00', '4:00', '8:00', '12:00', '16:00', '20:00']
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '北京方向',
        type: 'line',
        data: [120, 200, 150, 80, 70, 110],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6
      },
      {
        name: '上海方向',
        type: 'line',
        data: [80, 120, 100, 60, 90, 130],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6
      }
    ]
  }
  chart.setOption(option, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
  }
}

watch(chartRef, (newRef) => { if (newRef && !chart) initChart() })

onMounted(() => { initChart() })
onUnmounted(() => { chart?.dispose() })

watch(() => props.cssVars, () => {
  updateChart()
}, { deep: true })
</script>

<style scoped lang="less">
.chart-wrapper {
  width: 100%;
  height: 100%;
}
.chart-container {
  width: 100%;
  height: 200px;
  min-width: 0;
  min-height: 0;
}
</style>
```

### 示例 2: 饼图 + 垂直图例 + Tooltip

```vue
<script setup>
const updateChart = () => {
  if (!chart) return

  const option = {
    legend: {
      data: ['交通事故', '车辆故障', '施工作业', '道路拥堵', '其他'],
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 12,
      right: 8,
      top: 'middle',
      orient: 'vertical',  // ← 垂直排列
      textStyle: {
        color: props.cssVars.colorTextBase,
        fontSize: $mcCssBuilder.getCssEm(12)
      }
    },
    tooltip: {
      trigger: 'item',  // ← 饼图使用 item
      formatter: '{a} <br/>{b}: {c} ({d}%)',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      textStyle: {
        color: '#fff',
        fontSize: $mcCssBuilder.getCssEm(12)
      }
    },
    series: [{
      name: '事件类型',
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['40%', '50%'],  // ← 左移，为右侧图例留空间
      data: props.list?.map(item => ({
        name: item.name,
        value: item.value,
        itemStyle: {
          color: item.color
        }
      })),
      label: {
        fontSize: props.cssVars.pieFontSize || $mcCssBuilder.getCssEm(14),
        color: props.cssVars.colorTextBase
      },
      itemStyle: {
        borderWidth: 0  // ← Figma 无 strokes，设为 0
      }
    }]
  }

  chart.setOption(option, true)
}
</script>
```

---

## 总结

图例和 Tooltip 的核心要点：

### 图例
1. ✅ 必须按 Figma 色块尺寸设置 `itemWidth`/`itemHeight`
2. ✅ `legendPosition` 和 `legendType` 决定布局方向
3. ✅ 自定义图例必须与图表联动（`dispatchAction`）
4. ✅ `legend.data` 必须与 `series[].name` 一致

### Tooltip
1. ✅ 图表必须提供 tooltip，不可省略
2. ✅ 根据图表类型选择 `trigger`（axis/item）
3. ✅ 使用主题变量设置颜色
4. ✅ 固定 tooltip 必须设置 `z: -1`
5. ❌ 禁止在 template 中写死 tooltip DOM
