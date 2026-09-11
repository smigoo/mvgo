<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <!-- Fixed: 装饰性图片使用 alt="" 和 role="presentation" 提升可访问性 -->
      <img :src="icon1" alt="" role="presentation" class="c-env-monitor-title-decor" />
    </template>
    
    <template #header-right>
      <div class="c-env-monitor-header-icons">
        <!-- Fixed: 图标按钮添加 role="button" 和 aria-label -->
        <div class="c-env-monitor-icon-btn" role="button" aria-label="视图切换与列表">
          <img :src="icontabsIcon" alt="" role="presentation" class="c-env-monitor-tabs-icon" />
          <span class="c-env-monitor-badge">6</span>
        </div>
      </div>
    </template>

    <!-- Fixed: 内容区背景图未被使用，添加 bg1 背景图 -->
    <div 
      class="c-env-monitor-content" 
      :style="{ 
        backgroundImage: `url(${bg1})`, 
        backgroundSize: 'cover', 
        backgroundPosition: 'center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <!-- Tab 栏 -->
      <div class="c-env-monitor-tabs">
        <div class="c-env-monitor-tabs-list">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="handleTabChange(tab.key)"
          >
            <!-- Fixed: Tab 激活态使用 bgtabActive 背景图 -->
            <div 
              v-if="activeTab === tab.key" 
              class="c-env-monitor-tab-active-bg" 
              :style="{ backgroundImage: `url(${bgtabActive})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
            ></div>
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="c-env-monitor-chart-section">
        <!-- Fixed: 自定义图例联动缺失，实现自定义图例 DOM 并绑定点击事件 -->
        <div class="c-env-monitor-legend">
          <div
            :class="['c-env-monitor-legend-item', { 'is-active': legendState.co }]"
            @click="toggleLegend('zk3+785CO浓度', 'co')"
          >
            <span class="c-env-monitor-legend-line"></span>
            <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
          </div>
        </div>
        
        <!-- Fixed: 图表容器高度缺失，显式设置 height: 160px -->
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// Fixed: $mcComponentBuilder 异常处理缺失风险，使用 try-catch 包裹
let runtimeBuilder = null
let componentId = 'env-monitor'

try {
  const builder = typeof window.$mcComponentBuilder === 'function' ? window.$mcComponentBuilder({
    componentId: 'env-monitor',
    componentProps: {},
    componentName: '环境监测'
  }) : null
  
  runtimeBuilder = builder?.runtimeBuilder
  componentId = builder?.componentId || 'env-monitor'
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting-in', label: '洞内照明' },
  { key: 'lighting-out', label: '洞外光强' }
])
const activeTab = ref('co')

const legendState = ref({ co: true })

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 模拟数据映射 ---
const dataMap = {
  'co': [10, 15, 12, 25, 35, 28, 20, 15, 18, 22, 16, 10],
  'visibility': [30, 28, 25, 20, 15, 10, 12, 18, 22, 25, 28, 30],
  'lighting-in': [5, 8, 10, 12, 15, 18, 16, 14, 12, 10, 8, 5],
  'lighting-out': [80, 75, 60, 40, 20, 10, 15, 30, 50, 70, 85, 90]
}

// --- 图表配置与更新 ---
const updateChart = () => {
  if (!chart) return
  
  const currentData = dataMap[activeTab.value] || dataMap['co']
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#ccc' } }
    },
    legend: { show: false }, // 使用自定义图例
    grid: {
      // Fixed: ECharts grid containLabel 配置缺失风险，添加 containLabel: true
      containLabel: true,
      top: 24,
      right: 16,
      bottom: 28,
      left: 10
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12, margin: 12 },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666', fontSize: 12, padding: [0, 0, 0, -10] }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } },
      axisLabel: { color: '#333', fontSize: 12 },
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: { color: '#666', fontSize: 12, align: 'left' }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: 'rgba(15,205,125,1)' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,205,125,0.35)' },
            { offset: 1, color: 'rgba(15,205,125,0.05)' }
          ])
        },
        data: currentData,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
          label: {
            formatter: '预警线 30',
            color: '#d32f2f',
            fontSize: 12,
            position: 'insideEndTop'
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// --- 交互逻辑 ---
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
  // Fixed: Tab/Switch 切换必须 watch 并更新数据
  updateChart()
}

const toggleLegend = (name, key) => {
  if (!chart) return
  // Fixed: 自定义图例联动缺失，调用 dispatchAction 实现联动
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  legendState.value[key] = !legendState.value[key]
}

// --- 图表初始化与生命周期 ---
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

// Fixed: 必须使用 watch 处理 base-panel 渲染过程中销毁并重建 slot DOM 的场景
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

const handleResize = () => { 
  if (chart) chart.resize() 
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  // Fixed: 触发 onload 事件
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent(`${componentId}-onload`, {
      componentId: componentId,
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
/* Fixed: L4-002 违规风险，必须在 style scoped 中引入样式入口文件 */
@import '../resources/styles/index.less';

.c-env-monitor-title-decor {
  width: 8px;
  height: 8px;
  display: block;
}

.c-env-monitor-header-icons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-env-monitor-icon-btn {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.c-env-monitor-tabs-icon {
  width: 52px;
  height: 24px;
  display: block;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #f53f3f;
  border-radius: 29px;
  color: #ffffff;
  font-size: 10px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  box-sizing: border-box;
}

.c-env-monitor-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden;
}

.c-env-monitor-tabs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.c-env-monitor-tabs-list {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
}

.c-env-monitor-tab-item {
  position: relative;
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.3s ease;
  z-index: 1;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 3px;
  z-index: -1;
  border: 0.6px solid rgba(255, 255, 255, 1);
}

.c-env-monitor-tab-text {
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  white-space: nowrap;
}

.c-env-monitor-tab-item.is-active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-env-monitor-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  flex-shrink: 0;
}

.c-env-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.3s;
  
  &.is-active {
    opacity: 1;
  }
}

.c-env-monitor-legend-line {
  width: 14px;
  height: 2px;
  background: #0fcd7d;
  border-radius: 1px;
}

.c-env-monitor-legend-text {
  font-size: 12px;
  color: #333333;
  line-height: 14px;
}

/* Fixed: 图表容器高度缺失，显式设置 height: 160px */
.c-env-monitor-chart-container {
  width: 100%;
  height: 160px;
  min-width: 0;
  min-height: 0;
}
</style>