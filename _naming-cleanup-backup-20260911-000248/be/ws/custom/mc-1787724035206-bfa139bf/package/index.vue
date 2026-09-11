<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-title-deco">
        <img :src="icon1" class="c-env-monitor-deco-1" />
        <img :src="icon2" class="c-env-monitor-deco-2" />
        <img :src="icon3" class="c-mc-max-1787717625475-7db40354-c-env-monitor-deco-3" />
      </div>
    </template>

    <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-root">
      <!-- 控制栏 -->
      <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-controls">
        <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-tabs" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
            @click="handleTabChange(tab.key)"
          >
            <div v-if="activeTab === tab.key" class="c-mc-max-1787717625475-7db40354-c-env-monitor-tab-active-bg" :style="{ backgroundImage: `url(${bg3})` }"></div>
            <span class="c-mc-max-1787717625475-7db40354-c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-icon-group">
          <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-icon-btn">
            <img :src="icon4" class="c-mc-max-1787717625475-7db40354-c-env-monitor-icon" />
          </div>
          <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-icon-btn">
            <img :src="icon5" class="c-mc-max-1787717625475-7db40354-c-env-monitor-icon" />
            <span class="c-mc-max-1787717625475-7db40354-c-env-monitor-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-chart-section" :style="{ backgroundImage: `url(${bg2})` }">
        <div class="c-mc-max-1787717625475-7db40354-c-env-monitor-legend">
          <span
            class="c-mc-max-1787717625475-7db40354-c-env-monitor-legend-item"
            :class="{ 'is-active': legendState.co }"
            @click="toggleLegend('zk3+785CO浓度')"
          >
            <i class="c-mc-max-1787717625475-7db40354-c-env-monitor-legend-dot"></i>
            <span class="c-mc-max-1787717625475-7db40354-c-env-monitor-legend-text">zk3+785CO浓度</span>
          </span>
        </div>
        <div ref="chartRef" class="c-mc-max-1787717625475-7db40354-c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/circle-7884.png'
import icon2 from '../resources/images/circle-7885.png'
import icon3 from '../resources/images/path-7886.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon4 from '../resources/images/icon-7941.png'
import icon5 from '../resources/images/icon-7945.png'
import bg2 from '../resources/images/bg-7890.png'


import * as echarts from 'echarts'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// ==================== Tab 切换配置 ====================
const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
]

const activeTab = ref('co')

// 各监测指标对应的系列名称与演示数据（面积图趋势：14-18 时轻微隆起）
const seriesConfig = {
  co: {
    name: 'zk3+785CO浓度',
    data: [8, 6, 10, 15, 18, 22, 28, 32, 26, 20, 14, 10]
  },
  visibility: {
    name: '能见度',
    data: [28, 26, 22, 18, 16, 14, 12, 14, 18, 24, 30, 35]
  },
  lighting: {
    name: '洞内照明',
    data: [22, 20, 18, 16, 14, 12, 10, 8, 10, 14, 18, 22]
  },
  outdoor: {
    name: '洞外光强',
    data: [2, 4, 10, 20, 32, 38, 40, 36, 26, 14, 6, 2]
  }
}

// X 轴时间刻度（2-24 时）
const xAxisData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// ==================== 图例状态与切换 ====================
const legendState = ref({ co: true })

const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  legendState.value.co = !legendState.value.co
}

// ==================== ECharts 图表 ====================
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const current = seriesConfig[activeTab.value]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#E5E6EB',
      borderWidth: 1,
      padding: [6, 10, 6, 10],
      textStyle: {
        color: '#1D2129',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: '#00B42A',
          opacity: 0.4
        }
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    legend: {
      show: false,
      data: [current.name]
    },
    grid: {
      left: 46,
      right: 16,
      top: 20,
      bottom: 24,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData,
      axisLine: {
        lineStyle: { color: '#C9CDD4' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#86909C',
        fontSize: 10,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#86909C',
        fontSize: 10,
        align: 'right',
        padding: [0, 0, 0, -36]
      },
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: 'rgba(201, 205, 212, 0.4)',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#86909C',
        fontSize: 10
      }
    },
    series: [
      {
        name: current.name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: current.data,
        lineStyle: {
          color: '#00B42A',
          width: 2
        },
        itemStyle: {
          color: '#00B42A'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 180, 42, 0.25)' },
              { offset: 1, color: 'rgba(0, 180, 42, 0.02)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            formatter: '预警线',
            color: '#F53F3F',
            fontSize: 10,
            position: 'right'
          },
          lineStyle: {
            type: 'dashed',
            color: '#F53F3F',
            width: 1
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  }

  chart.setOption(option, true)

  // 恢复图例可见状态（setOption 重置后重新应用）
  if (!legendState.value.co) {
    chart.dispatchAction({ type: 'legendToggleSelect', name: current.name })
  }
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

// ==================== Tab 切换 ====================
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

// 监听 Tab 变化：更新图表数据并重置图例状态
watch(activeTab, () => {
  legendState.value.co = true
  updateChart()
})

// ==================== 窗口缩放 ====================
const handleResize = () => {
  if (chart) chart.resize()
}

// ==================== 生命周期 ====================
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)

  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
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