<template>
  <base-panel panelKey="default-panel">
    <div class="c-119ab2-content" :style="{ backgroundImage: `url(${bg1})` }">
      <!-- Tab 控制区 -->
      <div class="c-119ab2-tabs-controls">
        <div class="c-119ab2-tabs-list">
          <!-- Fixed: 使用 icon1 作为 Tab 列表前的装饰小圆点 -->
          <img :src="icon1" class="c-119ab2-tab-decor" alt="" />
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-119ab2-tab-item', { 'c-119ab2-tab-item--active': activeTab === tab.value }]"
            role="tab"
            :aria-selected="activeTab === tab.value"
            tabindex="0"
            @click="handleTabChange(tab.value)"
            @keydown.enter="handleTabChange(tab.value)"
          >
            <div
              v-if="activeTab === tab.value"
              class="c-119ab2-tab-active-bg"
              :style="{ backgroundImage: `url(${bgtabActive})` }"
            ></div>
            <span class="c-119ab2-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-119ab2-view-controls">
          <!-- Fixed: 添加 aria-label 和 title 提升可访问性 -->
          <img 
            :src="icontabsIcon" 
            class="c-119ab2-view-icon" 
            alt="切换视图" 
            title="切换视图" 
            aria-label="切换视图" 
          />
          <div class="c-119ab2-badge">6</div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="c-119ab2-chart-wrapper">
        <div ref="chartRef" class="c-119ab2-chart-container"></div>
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
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[119ab2] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor' },
  { label: '洞外光强', value: 'outdoor' }
])
const activeTab = ref('co')

// Fixed: Tab 切换必须联动更新图表数据
const dataMap = {
  co: [5, 8, 12, 15, 22, 28, 35, 32, 25, 18, 10, 6],
  visibility: [10, 15, 20, 25, 30, 35, 38, 35, 30, 25, 20, 15],
  indoor: [2, 3, 5, 8, 10, 12, 15, 12, 10, 8, 5, 3],
  outdoor: [20, 25, 30, 35, 40, 38, 35, 30, 25, 20, 15, 10]
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 交互逻辑 ---
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

// Fixed: 监听 activeTab 变化并更新图表数据
watch(activeTab, () => {
  updateChart()
})

// --- 图表逻辑 ---
const updateChart = () => {
  if (!chart) return
  const data = dataMap[activeTab.value] || dataMap.co
  
  const option = {
    // Fixed: 强制要求提供 tooltip
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: { color: '#333333', fontSize: 10 },
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      left: 30,
      right: 10,
      top: 24,
      bottom: 20,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.2)' } },
      axisLabel: { color: '#333', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.08)', type: 'dashed' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#0fcd7d', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线 30',
                color: '#d32f2f',
                fontSize: 12,
                position: 'insideEndTop'
              }
            }
          ]
        }
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

// --- 生命周期 ---
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  // 触发 onload 事件
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('119ab2-onload', {
      componentId: '119ab2',
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

// Fixed: 内联样式优化，将静态背景属性移至 CSS
.c-119ab2-content {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-119ab2-tabs-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  flex-shrink: 0;
}

.c-119ab2-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  // Fixed: 移除臆造的 border 属性
}

.c-119ab2-tab-decor {
  width: 8px;
  height: 8px;
  margin-right: 8px;
  flex-shrink: 0;
}

.c-119ab2-tab-item {
  position: relative;
  padding: 4px 14px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.3s;
  
  &:hover {
    color: #1990ff;
  }
}

.c-119ab2-tab-item--active {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  
  &:hover {
    color: #ffffff;
  }
}

.c-119ab2-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  z-index: -1;
}

.c-119ab2-tab-text {
  position: relative;
  z-index: 2;
}

.c-119ab2-view-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.c-119ab2-view-icon {
  width: 52px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
}

.c-119ab2-badge {
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
}

.c-119ab2-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 0 12px 12px;
}

.c-119ab2-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
}
</style>