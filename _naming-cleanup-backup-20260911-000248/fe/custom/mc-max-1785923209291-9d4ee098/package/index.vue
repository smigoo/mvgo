<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-container">
      <!-- 背景层 -->
      <div class="c-env-monitor-bg"></div>
      
      <!-- 标题区 -->
      <div class="c-env-monitor-header">
        <span class="c-env-monitor-title">环境监测</span>
      </div>

      <!-- 内容区 -->
      <div class="c-env-monitor-content">
        <!-- Tab与图标区 -->
        <div class="c-env-monitor-sub-t">
          <div class="c-env-monitor-tabs-list">
            <div 
              v-for="tab in tabs" 
              :key="tab.key"
              :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </div>
          </div>
          <div class="c-env-monitor-tabs-icon">
            <div class="c-env-monitor-icon-btn">
              <img :src="iconChart" alt="chart" />
            </div>
            <div class="c-env-monitor-icon-btn">
              <img :src="iconList" alt="list" />
              <div class="c-env-monitor-badge">6</div>
            </div>
          </div>
        </div>

        <!-- 图表区 -->
        <div class="c-env-monitor-chart">
          <div ref="chartRef" class="c-env-monitor-chart-container"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-7880.png'
import iconChart from '../resources/images/g-7883.png'
import iconList from '../resources/images/tabs-icon-43.png'

import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 1. 初始化 $mcComponentBuilder
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[env-monitor] $mcComponentBuilder 初始化失败:', e)
}

// 2. Tab 数据
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'tunnel-light', label: '洞内照明' },
  { key: 'outside-light', label: '洞外光强' }
])
const activeTab = ref('co')

// 3. 图表实例相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff' }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 4,
      right: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#333333',
        fontSize: 10,
        fontFamily: 'Source Han Sans CN'
      }
    },
    grid: {
      left: 20,
      right: 14,
      top: 28,
      bottom: 15,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        margin: 8
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        margin: 8
      },
      splitLine: {
        lineStyle: {
          color: '#BDD4E8',
          width: 0.8
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        data: [10, 15, 25, 35, 28, 20, 15, 12, 18, 25, 32, 20],
        symbol: 'none',
        lineStyle: {
          color: '#0FCD7D',
          width: 1
        },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        markLine: {
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#D32F2F',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN'
          },
          lineStyle: {
            color: '#D32F2F',
            type: 'dashed',
            width: 1
          },
          data: [
            { yAxis: 30 }
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

// 4. 监听
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

// 5. 生命周期
const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'env-monitor',
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
</style>