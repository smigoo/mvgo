<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <!-- Tab切换栏 -->
      <div class="c-env-monitor-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="['c-env-monitor-tab-item', { active: activeTab === tab.value }]"
          :style="activeTab === tab.value ? { backgroundImage: `url(${bgtabActive})` } : {}"
          @click="handleTabChange(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>

      <!-- 视图切换按钮 + 徽章 -->
      <div class="c-env-monitor-controls">
        <div
          :class="['c-env-monitor-icon-btn', { active: viewMode === 'chart' }]"
          @click="viewMode = 'chart'"
        >
          <img v-if="icon1" :src="icon1" class="c-env-monitor-icon" alt="图表视图" />
        </div>
        <div
          :class="['c-env-monitor-icon-btn', { active: viewMode === 'table' }]"
          @click="viewMode = 'table'"
        >
          <img v-if="icon2" :src="icon2" class="c-env-monitor-icon" alt="表格视图" />
        </div>
        <div class="c-env-monitor-badge">8</div>
      </div>
    </template>

    <!-- 主内容区 -->
    <div class="c-env-monitor-root">
      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-section" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
        <!-- 图表头部信息 -->
        <div class="c-env-monitor-chart-header">
          <span class="c-env-monitor-label-current">当前</span>
          <span class="c-env-monitor-label-value">zk3+785CO浓度</span>
          <span class="c-env-monitor-label-warning">预警线</span>
        </div>

        <!-- 图表容器 -->
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// $mcComponentBuilder 初始化（直接解构，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 资源变量（系统自动注入，无需 import）
const bg2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const bg3 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const icon1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const icon2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const bgtabActive = bg3

// Tab 切换状态
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])
const activeTab = ref('co')

// 视图模式
const viewMode = ref('chart')

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据映射
const dataMap = {
  co: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    seriesData: [10, 15, 22, 18, 28, 25, 30, 26, 22, 18, 15, 12]
  },
  visibility: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    seriesData: [200, 250, 300, 280, 320, 310, 290, 270, 260, 240, 220, 210]
  },
  lighting: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    seriesData: [400, 420, 450, 440, 460, 450, 430, 410, 400, 390, 380, 370]
  },
  outdoor: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    seriesData: [600, 580, 620, 610, 640, 630, 610, 590, 580, 570, 560, 550]
  }
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const currentData = dataMap[activeTab.value]
  
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      }
    },
    grid: {
      left: 40,
      right: 16,
      top: 30,
      bottom: 28,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: currentData.xData,
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.15)' }
      },
      axisLabel: {
        color: 'rgba(0, 0, 0, 0.45)',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      axisLine: {
        show: false
      },
      axisLabel: {
        color: 'rgba(0, 0, 0, 0.45)',
        fontSize: 12
      },
      splitLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.06)' }
      }
    },
    series: [
      {
        type: 'line',
        data: currentData.seriesData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(15, 205, 125, 1)'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgba(245, 63, 63, 1)',
            type: 'dashed',
            width: 2
          },
          data: [{ yAxis: 30 }],
          label: {
            show: false
          }
        }
      }
    ]
  }, true)
}

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

// Tab 切换处理
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  updateChart()
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听 activeTab
watch(activeTab, () => {
  updateChart()
})

// 窗口 resize 处理
const handleResize = () => {
  if (chart) chart.resize()
}

// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  initChart()
  emitLoadEvent()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
}

.c-env-monitor-chart-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.c-env-monitor-label-current {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.c-env-monitor-label-value {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
}

.c-env-monitor-label-warning {
  font-size: 12px;
  color: rgba(245, 63, 63, 1);
}

.c-env-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.c-env-monitor-tabs {
  display: flex;
  gap: 4px;
  margin-right: 16px;
}

.c-env-monitor-tab-item {
  padding: 6px 16px;
  font-size: 14px;
  color: rgba(44, 155, 234, 1);
  cursor: pointer;
  transition: all 0.3s;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 4px 4px 0 0;

  &.active {
    color: rgba(255, 255, 255, 1);
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.c-env-monitor-icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.3s;

  &.active {
    opacity: 1;
  }

  &:hover {
    opacity: 0.7;
  }
}

.c-env-monitor-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-env-monitor-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  background: rgba(245, 63, 63, 1);
  border-radius: 29px;
  color: rgba(255, 255, 255, 1);
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
</style>
```