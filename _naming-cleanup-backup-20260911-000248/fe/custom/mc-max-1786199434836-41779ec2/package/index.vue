<template>
  <base-panel panelKey="default-panel">
    <!-- [Layout Refine] 移除背景图，改为 Figma 纯色背景 + 阴影 -->
    <div class="c-41779e-content">
      <!-- [Layout Refine] 新增 header 区域，还原 Figma 标题 -->
      <div class="c-41779e-header">
        <span class="c-41779e-title">环境监测</span>
      </div>

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
          <!-- [Style Refine] 添加图标外框容器，还原 Figma 渐变背景与边框 -->
          <div class="c-41779e-view-icon-box">
            <img 
              :src="icontabsIcon" 
              class="c-41779e-view-icon" 
              title="切换为柱状图视图" 
              aria-label="切换为柱状图视图" 
            />
          </div>
          <div class="c-41779e-view-icon-box">
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
import icon1 from '../resources/images/g-7883.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'


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
      axisLine: { lineStyle: { color: '#bdd4e8', width: 0.8 } },
      axisTick: { show: false },
      axisLabel: { color: '#333333', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333333', fontSize: 12 },
      splitLine: { lineStyle: { color: '#bdd4e8', width: 0.8 } }
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
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        },
        data: [10, 15, 25, 20, 30, 28, 22, 18, 25, 32, 20, 15],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
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

/* [Layout Refine] 移除背景图，改为 Figma 纯色背景 + 阴影 */
/* [Style Refine] fills[0].color → #edf4fb, effects → box-shadow */
.c-41779e-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #edf4fb;
  box-shadow: 0px 4px 10px 0px rgba(74, 116, 140, 0.25);
  padding: 10px 20px 8px 20px;
}

/* [Layout Refine] 新增 header 区域，高度 28px */
.c-41779e-header {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* [Style Refine] fills → linear-gradient, typography → font styles */
.c-41779e-title {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  background: linear-gradient(180deg, #198fff 0%, rgba(89, 126, 255, 0.83) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* [Layout Refine] Figma sub-t bbox height=32 */
.c-41779e-tabs-section {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-41779e-tabs-container {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid #ffffff;
  border-radius: 2px;
  padding: 3px;
  height: 27px;
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
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.3s;
  white-space: nowrap;

  &--active {
    background: linear-gradient(180deg, #1099b1 0%, #038fff 100%);
    color: #ffffff;
    text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
    border: 0.6px solid #ffffff;
  }
}

/* [Layout Refine] Figma tabs-icon gap=4 (52 - 24*2) */
.c-41779e-view-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* [Style Refine] 视图图标外框样式还原 */
.c-41779e-view-icon-box {
  width: 24px;
  height: 24px;
  background: linear-gradient(180deg, #ffffff 0%, #e2efff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid #a1ceff;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.c-41779e-view-icon {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

/* [Style Refine] Badge 位置精确对齐 Figma 相对偏移 */
.c-41779e-badge {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  color: #ffffff;
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-41779e-chart-section {
  flex: 1;
  min-height: 0;
  min-width: 0;
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