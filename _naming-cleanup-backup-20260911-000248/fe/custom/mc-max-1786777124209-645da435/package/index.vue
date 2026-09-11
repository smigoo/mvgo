<template>
  <base-panel panelKey="default-panel">
    <!-- Fixed: 内容区背景图使用bg1 (问题8) -->
    <div
      class="c-env-monitor-content"
      :style="{
        backgroundImage: `url(${bg1})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }"
    >
      <!-- Tab 行 -->
      <div class="c-env-monitor-tabs-row">
        <!-- Tabs 容器 -->
        <div class="c-env-monitor-tabs-list">
          <!-- 激活态指示器 - 使用bgtabActive资源 -->
          <div
            class="c-env-monitor-tab-indicator"
            :style="{
              backgroundImage: `url(${bgtabActive})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              left: `${activeTabIndex * 25}%`
            }"
          ></div>
          <!-- Tab 项 -->
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>

        <!-- 右侧视图切换图标 + Badge -->
        <div class="c-env-monitor-view-switch">
          <!-- Fixed: 使用icontabsIcon资源 (问题1空格修复，问题2资源引用) -->
          <img
            :src="icontabsIcon"
            class="c-env-monitor-icons-strip"
            alt="视图切换"
          />
          <!-- Badge 数字6 -->
          <div class="c-env-monitor-badge">
            <span class="c-env-monitor-badge-num">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-area">
        <div ref="chartRef" class="c-env-monitor-chart-canvas"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-7890.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'


import * as echarts from 'echarts'

// --- $mcComponentBuilder 初始化 (问题4) ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function'
    ? $mcComponentBuilder().runtimeBuilder
    : null
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const activeTab = ref('co')
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lightingIn' },
  { label: '洞外光强', value: 'lightingOut' }
]

const activeTabIndex = computed(() =>
  tabs.findIndex(t => t.value === activeTab.value)
)

// --- 图表数据映射 (问题5: Tab切换数据联动) ---
const chartDataMap = {
  co: {
    name: 'zk3+785CO浓度',
    data: [5, 8, 12, 18, 25, 32, 35, 28, 22, 15, 10, 6]
  },
  visibility: {
    name: '能见度',
    data: [35, 32, 28, 22, 15, 10, 8, 12, 18, 25, 30, 34]
  },
  lightingIn: {
    name: '洞内照明',
    data: [20, 20, 22, 24, 26, 28, 30, 28, 26, 24, 22, 20]
  },
  lightingOut: {
    name: '洞外光强',
    data: [2, 5, 12, 22, 32, 38, 40, 35, 25, 15, 8, 3]
  }
}

const xData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// --- 图表相关 ---
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Fixed: 图表Tooltip配置 (问题6)
const updateChart = () => {
  if (!chart) return
  const currentData = chartDataMap[activeTab.value]
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      }
    },
    legend: {
      data: [currentData.name],
      top: 4,
      right: 10,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#333333',
        fontSize: 10
      }
    },
    // Fixed: grid containLabel (问题7)
    grid: {
      left: 10,
      right: 16,
      top: 30,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      boundaryGap: false
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      },
      nameGap: 5,
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.06)' }
      }
    },
    series: [{
      name: currentData.name,
      type: 'line',
      data: currentData.data,
      smooth: true,
      symbol: 'none',
      lineStyle: {
        color: '#0fcd7d',
        width: 1
      },
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
        lineStyle: {
          type: 'dashed',
          color: '#d32f2f',
          width: 1
        },
        data: [{
          yAxis: 30,
          label: {
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            position: 'insideEndTop'
          }
        }]
      }
    }]
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

// Fixed: watch chartRef 处理DOM重建
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// Fixed: Tab切换数据联动 (问题5)
watch(activeTab, () => {
  updateChart()
})

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  // Fixed: 触发onload事件 (问题4)
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'c-env-monitor',
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

/* Fixed: 完整的style块 (问题3) */

.c-env-monitor-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-tabs-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 32px;
  padding: 0 4px;
}

.c-env-monitor-tabs-list {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex: 1;
  height: 27px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 2px;
  overflow: hidden;
}

.c-env-monitor-tab-indicator {
  position: absolute;
  top: 3px;
  width: 25%;
  height: 21px;
  border: 0.6px solid rgba(255, 255, 255, 1);
  border-radius: 2px;
  transition: left 0.3s ease;
  z-index: 1;
}

.c-env-monitor-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  cursor: pointer;
  z-index: 2;
  position: relative;
  transition: color 0.3s ease;
  user-select: none;

  &.is-active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }

  &:hover:not(.is-active) {
    color: #1a8ad4;
  }
}

.c-env-monitor-view-switch {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 8px;
}

.c-env-monitor-icons-strip {
  width: 52px;
  height: 24px;
  display: block;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

.c-env-monitor-badge-num {
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #ffffff;
  line-height: 14px;
}

.c-env-monitor-chart-area {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.c-env-monitor-chart-canvas {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>