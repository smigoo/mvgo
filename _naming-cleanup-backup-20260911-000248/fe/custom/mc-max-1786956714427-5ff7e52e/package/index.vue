<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-content">
      <!-- 工具栏与筛选 -->
      <div class="c-env-monitor-toolbar">
        <!-- 指标切换Tab -->
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-env-monitor-tab-item', { active: activeTab === tab.value }]"
            :style="activeTab === tab.value ? { backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>

        <!-- 视图切换按钮 -->
        <div class="c-env-monitor-view-switch">
          <img :src="icon2" class="c-env-monitor-view-icon" alt="视图切换" />
          <div class="c-env-monitor-badge">6</div>
        </div>
      </div>

      <!-- 监测数据图表 -->
      <div class="c-env-monitor-chart-wrapper">
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon2 from '../resources/images/tabs-icon-43.png'


import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'vis' },
  { label: '洞内照明', value: 'light_in' },
  { label: '洞外光强', value: 'light_out' }
]
const activeTab = ref('co')

const dataMap = {
  co: [10, 15, 25, 20, 35, 28, 22, 18, 25, 30, 20, 15],
  vis: [30, 28, 25, 20, 15, 10, 12, 18, 25, 30, 35, 32],
  light_in: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  light_out: [10, 20, 35, 40, 38, 30, 20, 10, 5, 5, 5, 5]
}

// --- 图表相关 ---
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const currentData = dataMap[activeTab.value] || dataMap.co
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        lineStyle: { color: '#ccc' }
      }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#333333',
        fontSize: 10
      }
    },
    grid: {
      left: 10,
      right: 20,
      top: 24,
      bottom: 20,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 },
      name: '时',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: { color: '#666666', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLabel: { color: '#333333', fontSize: 12 },
      name: '辆',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: { color: '#666666', fontSize: 12 }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
          ])
        },
        itemStyle: {
          color: '#0fcd7d'
        },
        data: currentData,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线',
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

.c-env-monitor-content {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-toolbar {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.c-env-monitor-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  padding: 0 4px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid #ffffff;
  box-sizing: border-box;
}

.c-env-monitor-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  cursor: pointer;
  position: relative;
  transition: color 0.2s;
  box-sizing: border-box;

  &.active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-view-switch {
  position: relative;
  width: 52px;
  height: 24px;
  flex-shrink: 0;
}

.c-env-monitor-view-icon {
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
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

.c-env-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>