<template>
  <base-panel panelKey="default-panel">
    <!-- Fixed: 使用 bg1 作为内容区背景图，精确还原 backgroundSize/Position/Repeat -->
    <div 
      class="c-41779e-content" 
      :style="{ 
        backgroundImage: `url(${bg1})`, 
        backgroundSize: 'cover', 
        backgroundPosition: 'center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <!-- Tab 栏与视图切换 -->
      <div class="c-41779e-tabs-section">
        <div class="c-41779e-tabs-container">
          <!-- Fixed: 使用 icon1 作为 Tab 栏左侧装饰圆点 -->
          <img :src="icon1" class="c-41779e-tab-decorator" alt="" />
          <div class="c-41779e-tabs-list">
            <div
              v-for="tab in tabs"
              :key="tab.key"
              :class="['c-41779e-tab-item', { 'c-41779e-tab-item--active': activeTab === tab.key }]"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </div>
          </div>
        </div>
        
        <!-- 视图切换图标 -->
        <div class="c-41779e-view-icons">
          <!-- Fixed: 添加 title 和 aria-label 提升可访问性 -->
          <img 
            :src="icontabsIcon" 
            class="c-41779e-view-icon" 
            title="切换为柱状图视图" 
            aria-label="切换为柱状图视图" 
          />
          <div class="c-41779e-view-icon-wrapper">
            <img 
              :src="icontabsIcon" 
              class="c-41779e-view-icon" 
              title="切换为列表视图" 
              aria-label="切换为列表视图" 
            />
            <span class="c-41779e-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="c-41779e-chart-section">
        <div class="c-41779e-chart-wrapper">
          <div ref="chartRef" class="c-41779e-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'light-in', label: '洞内照明' },
  { key: 'light-out', label: '洞外光强' }
]
const activeTab = ref('co')

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 图表配置与更新 ---
const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: { color: '#333333', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 30,
      right: 16,
      top: 24,
      bottom: 24,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisTick: { show: false },
      axisLabel: { color: '#8c8c8c', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#8c8c8c', fontSize: 10 },
      splitLine: { lineStyle: { color: '#e8e8e8', type: 'dashed' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#0fcd7d', width: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
        },
        data: [10, 15, 25, 20, 30, 28, 22, 18, 25, 32, 20, 15],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f53f3f', type: 'dashed', width: 1 },
          label: {
            formatter: '预警线',
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

// --- 图表初始化 ---
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

watch(activeTab, () => {
  // 模拟切换 Tab 更新数据
  updateChart()
})

const handleResize = () => { 
  if (chart) chart.resize() 
}

// --- 生命周期 ---
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('41779e-onload', {
      componentId: '41779e',
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
@import '../resources/styles/index.less';

.c-41779e-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-41779e-tabs-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  flex-shrink: 0;
}

.c-41779e-tabs-container {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 2px;
  padding: 3px;
}

.c-41779e-tab-decorator {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.c-41779e-tabs-list {
  display: flex;
  gap: 4px;
}

.c-41779e-tab-item {
  padding: 4px 12px;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.3s;
  white-space: nowrap;

  // Fixed: 移除 :style 绑定，改为 CSS 渐变实现激活态背景，避免 RUNTIME-004
  &--active {
    background: linear-gradient(180deg, #1099b1 0%, #038fff 100%);
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
    border: 0.6px solid rgba(255, 255, 255, 1);
  }
}

.c-41779e-view-icons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-41779e-view-icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-41779e-view-icon {
  width: 24px;
  height: 24px;
  cursor: pointer;
}

.c-41779e-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #f53f3f;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.c-41779e-chart-section {
  flex: 1;
  min-height: 0;
  min-width: 0;
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
}

.c-41779e-chart-wrapper {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.c-41779e-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>