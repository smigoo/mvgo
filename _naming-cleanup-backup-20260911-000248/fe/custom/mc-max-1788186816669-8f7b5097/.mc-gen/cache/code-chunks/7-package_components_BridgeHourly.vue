<template>
  <div class="c-monitor-bridge-hourly">
    <div class="c-monitor-section-header">
      <div class="c-monitor-header-icon-wrapper">
        <span class="c-monitor-header-icon"></span>
      </div>
      <span class="c-monitor-section-title">江阴大桥</span>
    </div>
    <div 
      class="c-monitor-chart-body"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
    >
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import bg1 from '../../resources/images/bg-_m-35.png'

const chartRef = ref(null)
let chart = null
let chartObserver = null

const mockData = {
  hours: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 300, 250, 400, 600, 800, 1200, 1800, 2500, 2200, 1500, 800, 400],
  shanghai: [180, 280, 230, 380, 580, 780, 1150, 1750, 2400, 2100, 1450, 750, 380]
}

const updateChart = () => {
  if (!chart) return
  
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
      formatter: (params) => {
        let result = params[0].name + '时<br/>'
        params.forEach(p => {
          result += `${p.seriesName} ${p.value}车<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      right: 20,
      top: 10,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: '#333333',
        fontSize: 12
      }
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: mockData.hours,
      name: '时',
      nameTextStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      axisTick: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 4000,
      interval: 1000,
      nameTextStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: true
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: mockData.beijing,
        barWidth: '40%',
        itemStyle: {
          color: '#1890ff',
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: mockData.shanghai,
        barWidth: '40%',
        itemStyle: {
          color: '#ff9800',
          borderRadius: [2, 2, 0, 0]
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
@import '../../resources/styles/index.less';

.c-monitor-bridge-hourly {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.c-monitor-header-icon-wrapper {
  flex-shrink: 0;
}

.c-monitor-header-icon {
  display: inline-block;
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.c-monitor-section-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
