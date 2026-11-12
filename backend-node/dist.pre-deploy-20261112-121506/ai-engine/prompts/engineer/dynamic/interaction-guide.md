# 常见交互实现指南

根据 **交互信息（interactions）** 中识别出的交互类型，必须实现相应的功能代码。以下是常见交互的实现模板：

## 🔴 Tab/Select 切换必须实现数据联动（无需 interactions 标注）

**如果预览图中存在 Tab 切换或 Select 下拉（如"24 小时/7 天/30 天"或"隧道/大桥"），即使 interactions 中未标注，也必须实现切换后更新图表数据。**

实现模式：
1. 用 `ref` 维护当前激活状态：`const activeTab = ref('24h')`
2. 维护不同状态对应的数据源：`const dataMap = { '24h': [...], '7d': [...] }`
3. 使用 `watch` 监听状态变化，并更新图表数据：
   ```javascript
   watch(activeTab, (newTab) => {
     updateChart(dataMap[newTab])
   })
   ```
4. **禁止仅做样式切换（只改 active class）而不更新数据**

禁止行为：
- ❌ Tab 切换只改变样式（active class），不更新图表数据
- ❌ Select 切换不触发任何数据更新
- ❌ 数据写死在模板中，没有根据状态动态变化

## 🔴 Tab/Select 切换必须实现数据联动（无需 interactions 标注）

**如果预览图中存在 Tab 切换或 Select 下拉（如"24 小时/7 天/30 天"或"隧道/大桥"），即使 interactions 中未标注，也必须实现切换后更新图表数据。**

实现模式：
1. 用 `ref` 维护当前激活状态：`const activeTab = ref('24h')`
2. 维护不同状态对应的数据源：`const dataMap = { '24h': [...], '7d': [...] }`
3. 使用 `watch` 监听状态变化，并更新图表数据：
   ```javascript
   watch(activeTab, (newTab) => {
     updateChart(dataMap[newTab])
   })
   ```
4. **禁止仅做样式切换（只改 active class）而不更新数据**

禁止行为：
- ❌ Tab 切换只改变样式（active class），不更新图表数据
- ❌ Select 切换不触发任何数据更新
- ❌ 数据写死在模板中，没有根据状态动态变化

## 1. Tab 切换交互 (type: "tab-switch")

当 interactions 中包含 `type: "tab-switch"` 时，必须生成完整的标签页切换功能：

**实现要点：**
- 使用 `ref` 存储当前激活的 tab
- 渲染 tab 按钮列表，绑定点击事件
- 点击时更新激活状态，并触发数据刷新
- 为激活的 tab 添加高亮样式

**代码模板（基础版 - 纯文字标签）：**
```vue
<template>
  <div class="component-root">
    <!-- Tab 按钮组 -->
    <div class="tab-buttons">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['tab-item', { active: currentTab === tab.value }]"
        @click="handleTabChange(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="tab-content">
      <div ref="chartRef" class="chart-container" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// Tab 选项（从 interactions[0].options 提取）
const tabs = ref([
  { label: '二氧化碳', value: 'co2' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活的 tab
const currentTab = ref('co2')

// 图表数据
const chartData = ref(null)
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 加载数据
const loadData = async () => {
  // 根据 currentTab 调用不同的 API 或加载不同的数据
  if (!runtimeBuilder?.callApi) {
    console.warn('runtimeBuilder.callApi 不可用')
    return
  }

  try {
    const res = await runtimeBuilder.callApi('your_api_name', {
      type: currentTab.value,
      // 其他参数
    })
    chartData.value = res?.data || null
    updateChart()
  } catch (e) {
    console.error('数据加载失败', e)
  }
}

// Tab 切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  loadData() // 切换后重新加载数据
}

// 监听 currentTab 变化
watch(currentTab, () => {
  loadData()
})

// 初始化图表
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

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 更新图表
const updateChart = () => {
  if (!chart) return
  const option = {
    // 根据 chartData 构建 ECharts option
  }
  chart.setOption(option, true)
}

const handleResize = () => { if (chart) chart.resize() }

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style scoped lang="less">
.tab-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-item {
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.65);
  transition: all 0.3s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  &.active {
    background: #1890ff;
    color: #ffffff;
  }
}
</style>
```

## 2. 下拉框选择交互 (type: "select-change")

当 interactions 中包含 `type: "select-change"` 或识别出下拉框元素时：

**实现要点：**
- 使用 `ref` 存储选中值
- 渲染 `<select>` 元素，绑定 `v-model`
- 监听选中值变化，触发数据刷新

**代码模板：**
```vue
<template>
  <div class="component-root">
    <!-- 下拉框 -->
    <div class="select-wrapper">
      <select v-model="selectedValue" class="custom-select">
        <option v-for="opt in options" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- 内容区域 -->
    <div class="content">
      <div v-if="chartData" ref="chartRef" class="chart-container" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

// 下拉框选项
const options = ref([
  { label: '选项1', value: 'opt1' },
  { label: '选项2', value: 'opt2' }
])

// 选中值
const selectedValue = ref('opt1')

// 数据
const chartData = ref(null)
const chartRef = ref(null)

// 加载数据
const loadData = async () => {
  if (!runtimeBuilder?.callApi) return

  try {
    const res = await runtimeBuilder.callApi('your_api_name', {
      filter: selectedValue.value
    })
    chartData.value = res?.data || null
    updateChart()
  } catch (e) {
    console.error('数据加载失败', e)
  }
}

// 监听选中值变化
watch(selectedValue, () => {
  loadData()
})

const updateChart = () => {
  if (!chartRef.value || !chartData.value) return
  // 构建图表配置
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="less">
.custom-select {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  cursor: pointer;
}
</style>
```

## 3. 图表 Tooltip 交互

所有图表都应该包含 tooltip 配置，实现鼠标悬停显示详情：

**ECharts Tooltip 配置模板：**
```javascript
const option = {
  tooltip: {
    trigger: 'axis', // 或 'item'（饼图等）
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    textStyle: {
      color: '#ffffff',
      fontSize: 12
    },
    formatter: (params) => {
      // 自定义格式
      const p = Array.isArray(params) ? params[0] : params
      return `${p.name}<br/>${p.seriesName}: ${p.value} ${unit || ''}`
    }
  },
  // 其他配置...
}
```

## 4. 开关/Toggle 交互 (type: "toggle")

**代码模板：**
```vue
<template>
  <div class="toggle-wrapper">
    <label class="toggle-switch">
      <input type="checkbox" v-model="isEnabled" />
      <span class="slider"></span>
    </label>
    <span class="toggle-label">{{ isEnabled ? '开启' : '关闭' }}</span>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const isEnabled = ref(false)

watch(isEnabled, (newVal) => {
  // 触发相应的动作
  console.log('Toggle changed:', newVal)
  // 可以调用 API 或更新数据
})
</script>

<style scoped lang="less">
.toggle-switch {
  position: relative;
  width: 44px;
  height: 22px;

  input { display: none; }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 22px;
    transition: 0.3s;

    &:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 2px;
      bottom: 2px;
      background-color: white;
      border-radius: 50%;
      transition: 0.3s;
    }
  }

  input:checked + .slider {
    background-color: #1890ff;

    &:before {
      transform: translateX(22px);
    }
  }
}
</style>
```

## 实现原则

1. **必须根据 interactions 数组生成对应的交互代码** - 不能只识别不实现
2. **交互必须是完整可用的** - 包含 UI、状态管理、事件处理、数据刷新
3. **使用 Vue 3 Composition API** - ref、watch、onMounted 等
4. **样式要与设计稿一致** - 激活状态、悬停效果等
5. **数据刷新要调用 runtimeBuilder.callApi** - 不能只是静态展示
