<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <img :src="icon1" class="c-env-monitor-title-icon" alt="" />
    </template>

    <template #header-right>
      <div class="c-env-monitor-header-right">
        <div class="c-env-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="c-env-monitor-tab-item"
            :class="{ active: currentTab === tab.key }"
            :style="currentTab === tab.key ? { backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : null"
            @click="handleTabChange(tab.key)"
          >
            <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
          </div>
        </div>

        <div class="c-env-monitor-tabs-icon">
          <img :src="icon2" class="c-env-monitor-tabs-icon-img" alt="" />
          <span class="c-env-monitor-badge">6</span>
        </div>
      </div>
    </template>

    <div class="c-env-monitor-content">
      <div ref="chartRef" class="c-env-monitor-chart"></div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 资源变量由系统注入，不可自行 import ---

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 调用失败:', e)
}

const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])

const currentTab = ref('co')

const chartRef = ref(null)
let chart = null
let chartObserver = null

const dataMap = {
  co: {
    seriesName: 'zk3+785CO浓度',
    color: '#52c41a',
    areaColor: 'rgba(82, 196, 26, 0.3)',
    data: [2, 3, 4, 6, 5, 8, 12, 16, 14, 10, 6, 3],
    markLine: { name: '预警线', yAxis: 30, color: '#ff4d4f', label: '预警线' }
  },
  visibility: {
    seriesName: '能见度',
    color: '#1890ff',
    areaColor: 'rgba(24, 144, 255, 0.3)',
    data: [8, 10, 12, 11, 14, 16, 18, 20, 19, 17, 15, 12],
    markLine: null
  },
  lighting: {
    seriesName: '洞内照明',
    color: '#faad14',
    areaColor: 'rgba(250, 173, 20, 0.3)',
    data: [30, 32, 34, 33, 35, 36, 38, 40, 39, 37, 35, 34],
    markLine: null
  },
  outdoor: {
    seriesName: '洞外光强',
    color: '#13c2c2',
    areaColor: 'rgba(19, 194, 194, 0.3)',
    data: [20, 22, 24, 23, 25, 28, 30, 32, 30, 26, 22, 20],
    markLine: null
  }
}

const xAxisData = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]

const updateChart = () => {
  if (!chart) return

  const config = dataMap[currentTab.value]
  if (!config) return

  const series = [
    {
      name: config.seriesName,
      type: 'line',
      data: config.data,
      smooth: false,
      symbol: 'circle',
      symbolSize: 4,
      showSymbol: false,
      lineStyle: {
        color: config.color,
        width: 2
      },
      itemStyle: {
        color: config.color
      },
      areaStyle: {
        color: config.areaColor
      }
    }
  ]

  if (config.markLine) {
    series[0].markLine = {
      silent: false,
      symbol: 'none',
      data: [
        {
          name: config.markLine.name,
          yAxis: config.markLine.yAxis,
          lineStyle: {
            color: config.markLine.color,
            type: 'dashed',
            width: 1
          },
          label: {
            formatter: config.markLine.label,
            position: 'end',
            color: config.markLine.color,
            fontSize: 11
          }
        }
      ]
    }
  }

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        if (!p) return ''
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    legend: {
      data: [config.seriesName],
      top: 6,
      right: 8,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 3,
      textStyle: {
        color: '#666666',
        fontSize: 10
      }
    },
    grid: {
      left: 34,
      right: 16,
      top: 28,
      bottom: 24,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#cccccc' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#666666',
        fontSize: 10,
        interval: 1
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: {
        color: '#666666',
        fontSize: 10
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: '#e8e8e8',
          type: 'dashed'
        }
      }
    },
    series
  }, true)
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

const handleTabChange = (key) => {
  if (currentTab.value === key) return
  currentTab.value = key
}

watch(currentTab, () => {
  updateChart()
})

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