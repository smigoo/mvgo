<template>
  <div class="c-monitor-bar-section">
    <div class="c-monitor-bar-header">
      <span class="c-monitor-bar-decor"></span>
      <span class="c-monitor-bar-title">{{ locationName }}</span>
    </div>
    <div class="c-monitor-bar-legend">
      <span 
        class="c-monitor-legend-item" 
        :class="{ active: legendState.beijing }" 
        @click="toggleLegend('北京方向')"
      >
        <i class="c-monitor-legend-dot" style="background: #1890ff;"></i>
        北京方向
      </span>
      <span 
        class="c-monitor-legend-item" 
        :class="{ active: legendState.shanghai }" 
        @click="toggleLegend('上海方向')"
      >
        <i class="c-monitor-legend-dot" style="background: #69c0ff;"></i>
        上海方向
      </span>
    </div>
    <div class="c-monitor-bar-chart-wrapper">
      <div ref="chartRef" class="c-monitor-bar-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  sectionKey: { type: String, required: true },
  locationName: { type: String, required: true }
})

const chartRef = ref(null)
let chart = null
let chartObserver = null

const legendState = ref({ beijing: true, shanghai: true })

const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const mockData = {
  tunnel: {
    beijing: [600, 400, 200, 600, 0, 600, 800, 1200, 2000, 2400, 1600, 800],
    shanghai: [600, 400, 200, 600, 0, 600, 831, 1200, 2000, 2400, 1600, 800]
  },
  bridge: {
    beijing: [800, 600, 400, 800, 200, 800, 1200, 1800, 2800, 3200, 2400, 1200],
    shanghai: [800, 600, 400, 800, 200, 800, 1250, 1800, 2800, 3200, 2400, 1200]
  }
}

const updateChart = () => {
  if (!chart) return
  const data = mockData[props.sectionKey] || mockData.tunnel
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: 'rgba(161,206,255,1)',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      extraCssText: 'box-shadow: 4px 4px 4px rgba(0,28,53,0.2); background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 30%, #deedff 63%, #ffffff 100%); border-radius: 4px;',
      axisPointer: {
        type: 'shadow',
        shadowStyle: { color: 'rgba(24, 144, 255, 0.05)' }
      },
      formatter: (params) => {
        let res = `<div style="font-size:12px;color:#333;margin-bottom:4px;font-weight:500;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          res += `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:2px;">
            <span style="display:inline-block;width:6px;height:6px;background:${p.color};border-radius:1px;flex-shrink:0;"></span>
            <span style="color:#666;">${p.seriesName}</span>
            <span style="color:#333;font-weight:500;margin-left:auto;">${p.value} 辆</span>
          </div>`
        })
        return res
      }
    },
    legend: { show: false },
    grid: { left: 10, right: 20, top: 20, bottom: 20, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' } },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        barGap: 2,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18ffff' },
            { offset: 1, color: '#00a3d6' }
          ]),
          borderRadius: [2, 2, 0, 0]
        },
        data: data.beijing,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#ff984e', type: 'dashed', width: 1 },
          label: { 
            formatter: '建议分流', 
            color: '#ff984e', 
            fontSize: 12,
            position: 'insideEndTop'
          },
          data: [{ yAxis: 2000 }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        barGap: 2,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18acff' },
            { offset: 1, color: '#3c50ff' }
          ]),
          borderRadius: [2, 2, 0, 0]
        },
        data: data.shanghai
      }
    ]
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

watch(() => props.sectionKey, () => {
  updateChart()
})

const handleResize = () => {
  if (chart && !chart.isDisposed()) {
    chart.resize()
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
  chart = null
})
</script>