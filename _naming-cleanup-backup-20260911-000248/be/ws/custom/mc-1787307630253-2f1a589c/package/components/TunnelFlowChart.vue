<template>
  <div class="c-monitor-tunnel-section">
    <div class="c-monitor-tunnel-header">
      <div class="c-monitor-tunnel-title-icon"></div>
      <span class="c-monitor-tunnel-title-text">江阴靖江长江隧道</span>
    </div>
    <div class="c-monitor-tunnel-legend">
      <div 
        class="c-monitor-legend-item" 
        :class="{ inactive: !legendState.beijing }" 
        @click="toggleLegend('北京方向')"
      >
        <span class="c-monitor-legend-dot" style="background: #1890ff;"></span>
        <span class="c-monitor-legend-text">北京方向</span>
      </div>
      <div 
        class="c-monitor-legend-item" 
        :class="{ inactive: !legendState.shanghai }" 
        @click="toggleLegend('上海方向')"
      >
        <span class="c-monitor-legend-dot" style="background: #69c0ff;"></span>
        <span class="c-monitor-legend-text">上海方向</span>
      </div>
    </div>
    <div ref="chartRef" class="c-monitor-tunnel-chart"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const legendState = ref({ beijing: true, shanghai: true })

const toggleLegend = (name) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
}

const updateChart = () => {
  if (!chart) return
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      formatter: (params) => {
        let res = `${params[0].axisValue}时<br/>`
        params.forEach(p => {
          res += `${p.marker}${p.seriesName} ${p.value} 辆<br/>`
        })
        return res
      }
    },
    legend: { data: ['北京方向', '上海方向'], show: false },
    grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: false },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: [200, 300, 500, 1200, 2500, 3000, 2800, 3200, 2000, 1500, 800, 400],
        itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
        barWidth: 4,
        barGap: '30%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#fa8c16', type: 'dashed', width: 1 },
          data: [{ yAxis: 3000, label: { formatter: '建议分流', color: '#fa8c16', fontSize: 12, position: 'end' } }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: [150, 250, 450, 1000, 2200, 2800, 2600, 3000, 1800, 1300, 700, 350],
        itemStyle: { color: '#69c0ff', borderRadius: [2, 2, 0, 0] },
        barWidth: 4
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
@import '../../resources/styles/index.less';

.c-monitor-tunnel-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.c-monitor-tunnel-header {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-bottom: 8px;
  
  .c-monitor-tunnel-title-icon {
    width: 3px;
    height: 12px;
    background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
    border-radius: 6px;
  }
  
  .c-monitor-tunnel-title-text {
    font-size: 14px;
    font-weight: 400;
    color: #333333;
    line-height: 21px;
  }
}

.c-monitor-tunnel-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  
  .c-monitor-legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: opacity 0.3s;
    
    &.inactive {
      opacity: 0.3;
    }
    
    .c-monitor-legend-dot {
      width: 10px;
      height: 10px;
    }
    
    .c-monitor-legend-text {
      font-size: 12px;
      color: #333333;
      line-height: 18px;
    }
  }
}

.c-monitor-tunnel-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>