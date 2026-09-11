<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 控制栏 -->
      <div class="c-env-monitor-controls">
        <!-- Tab 切换组 -->
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            @click="handleTabChange(tab.key)"
          >
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
            <!-- 激活态背景图 -->
            <div
              v-if="activeTab === tab.key"
              class="c-env-monitor-tab-active-bg"
              :style="{ backgroundImage: `url(${bg3})` }"
            ></div>
          </div>
        </div>

        <!-- 视图切换图标 -->
        <div class="c-env-monitor-view-icons">
          <div class="c-env-monitor-icon-btn" title="图表视图">
            <img :src="icon4" alt="图表视图" class="c-env-monitor-icon-img" />
          </div>
          <div class="c-env-monitor-icon-btn" title="列表视图">
            <img :src="icon5" alt="列表视图" class="c-env-monitor-icon-img" />
            <span class="c-env-monitor-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-section">
        <!-- 自定义图例 -->
        <div class="c-env-monitor-legend">
          <div
            class="c-env-monitor-legend-item"
            :class="{ 'is-inactive': !legendState.co }"
            @click="toggleLegend('zk3+785CO浓度', 'co')"
          >
            <span class="c-env-monitor-legend-line"></span>
            <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
          </div>
        </div>

        <!-- ECharts 容器 -->
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 1. 初始化微码组件构建器
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 触发加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})

// 3. Tab 切换逻辑
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting_in', label: '洞内照明' },
  { key: 'lighting_out', label: '洞外光强' }
])
const activeTab = ref('co')

// 模拟不同 Tab 对应的数据
const dataMap = {
  co: [12, 18, 25, 22, 35, 28, 20, 15, 24, 32, 26, 14],
  visibility: [800, 750, 600, 550, 400, 450, 600, 700, 650, 500, 550, 750],
  lighting_in: [120, 110, 100, 95, 80, 85, 100, 115, 105, 90, 95, 110],
  lighting_out: [5000, 4800, 4500, 4200, 3800, 4000, 4500, 4900, 4600, 4100, 4300, 4800]
}

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
  updateChart()
}

// 4. 图例联动逻辑
const legendState = ref({ co: true })

const toggleLegend = (seriesName, key) => {
  if (chart) {
    chart.dispatchAction({ type: 'legendToggleSelect', name: seriesName })
    legendState.value[key] = !legendState.value[key]
  }
}

// 5. ECharts 图表逻辑
const chartRef = ref(null)
let chart = null
let chartObserver = null

const getChartOption = () => {
  const currentData = dataMap[activeTab.value] || dataMap.co
  const isCO = activeTab.value === 'co'
  
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: '#cccccc'
        }
      }
    },
    legend: {
      show: false // 使用自定义 DOM 图例
    },
    grid: {
      left: 10,
      right: 20,
      top: 20,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: {
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        formatter: '{value} 时'
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: isCO ? 40 : undefined,
      interval: isCO ? 10 : undefined,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        formatter: isCO ? '{value}' : '{value}'
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: {
          width: 2,
          color: 'rgba(15,205,125,1)'
        },
        itemStyle: {
          color: '#0fcd7d'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,205,125,0.4)' },
            { offset: 1, color: 'rgba(15,205,125,0.05)' }
          ])
        },
        data: currentData,
        markLine: isCO
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: {
                color: '#d32f2f',
                type: 'dashed',
                width: 1
              },
              label: {
                show: false
              },
              data: [
                {
                  yAxis: 30,
                  name: '预警线'
                }
              ]
            }
          : undefined
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(getChartOption(), true)
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

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
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
</style>