<template>
  <div class="c-monitor-vehicle-type">
    <!-- 标题 -->
    <div class="c-monitor-section-header">
      <img :src="icon2" class="c-monitor-title-icon" alt="" />
      <span class="c-monitor-section-title">车型分布</span>
    </div>

    <!-- 车型分布内容 -->
    <div class="c-monitor-vehicle-content">
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-vehicle-item">
        <div class="c-monitor-vehicle-label">江阴靖江长江隧道</div>
        <div class="c-monitor-vehicle-row">
          <!-- 客车卡片 -->
          <div 
            class="c-monitor-vehicle-card" 
            :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
          >
            <div class="c-monitor-vehicle-card-label">客车</div>
            <div class="c-monitor-vehicle-card-value">22350</div>
          </div>

          <!-- 环形图 -->
          <div class="c-monitor-vehicle-chart-wrapper">
            <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
          </div>

          <!-- 货车卡片 -->
          <div 
            class="c-monitor-vehicle-card" 
            :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
          >
            <div class="c-monitor-vehicle-card-label">货车</div>
            <div class="c-monitor-vehicle-card-value c-monitor-vehicle-card-value-orange">16270</div>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-vehicle-item">
        <div class="c-monitor-vehicle-label">江阴大桥</div>
        <div class="c-monitor-vehicle-row">
          <!-- 客车卡片 -->
          <div 
            class="c-monitor-vehicle-card" 
            :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
          >
            <div class="c-monitor-vehicle-card-label">客车</div>
            <div class="c-monitor-vehicle-card-value">66109</div>
          </div>

          <!-- 环形图 -->
          <div class="c-monitor-vehicle-chart-wrapper">
            <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
          </div>

          <!-- 货车卡片 -->
          <div 
            class="c-monitor-vehicle-card" 
            :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
          >
            <div class="c-monitor-vehicle-card-label">货车</div>
            <div class="c-monitor-vehicle-card-value c-monitor-vehicle-card-value-orange">16270</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, inject } from 'vue'
import * as echarts from 'echarts'

// 注入资源变量
const icon2 = inject('icon2', null)
const bg2 = inject('bg2', null)
const bg4 = inject('bg4', null)

// 图表引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

// 初始化图表
const initChart = (chartRef, isObserverMode = false) => {
  if (!chartRef.value) return null
  
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(chartRef.value)
    updateChart(chart, chartRef === tunnelChartRef)
    return chart
  }
  
  if (isObserverMode) {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        observer?.disconnect()
        const chart = echarts.init(chartRef.value)
        updateChart(chart, chartRef === tunnelChartRef)
        if (chartRef === tunnelChartRef) {
          tunnelChart = chart
          tunnelObserver = null
        } else {
          bridgeChart = chart
          bridgeObserver = null
        }
      }
    })
    observer.observe(chartRef.value)
    return observer
  }
  
  return null
}

// 更新图表配置
const updateChart = (chart, isTunnel) => {
  if (!chart) return
  
  const carData = isTunnel ? 22350 : 66109
  const truckData = 16270
  const total = carData + truckData
  const carPercent = ((carData / total) * 100).toFixed(1)
  const truckPercent = ((truckData / total) * 100).toFixed(1)
  
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: (params) => {
        return `${params.name}<br/>${params.value} (${params.percent}%)`
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        data: [
          { 
            value: carData, 
            name: '客车',
            itemStyle: {
              color: '#1890ff'
            }
          },
          { 
            value: truckData, 
            name: '货车',
            itemStyle: {
              color: '#ff8c00'
            }
          }
        ]
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 监听图表容器
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) {
    const result = initChart(tunnelChartRef, true)
    if (result && typeof result.disconnect === 'function') {
      tunnelObserver = result
    } else if (result) {
      tunnelChart = result
    }
  }
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) {
    const result = initChart(bridgeChartRef, true)
    if (result && typeof result.disconnect === 'function') {
      bridgeObserver = result
    } else if (result) {
      bridgeChart = result
    }
  }
})

// 窗口大小调整
const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
}

onMounted(() => {
  if (tunnelChartRef.value) {
    const result = initChart(tunnelChartRef, true)
    if (result && typeof result.disconnect === 'function') {
      tunnelObserver = result
    } else if (result) {
      tunnelChart = result
    }
  }
  
  if (bridgeChartRef.value) {
    const result = initChart(bridgeChartRef, true)
    if (result && typeof result.disconnect === 'function') {
      bridgeObserver = result
    } else if (result) {
      bridgeChart = result
    }
  }
  
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (tunnelChart) {
    tunnelChart.dispose()
    tunnelChart = null
  }
  if (bridgeChart) {
    bridgeChart.dispose()
    bridgeChart = null
  }
  if (tunnelObserver) {
    tunnelObserver.disconnect()
    tunnelObserver = null
  }
  if (bridgeObserver) {
    bridgeObserver.disconnect()
    bridgeObserver = null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-type {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 0 8px 0;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: calc(@fontSize * 1);
  font-weight: 600;
  color: @colorTextBase;
}

.c-monitor-vehicle-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.c-monitor-vehicle-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.c-monitor-vehicle-label {
  font-size: calc(@fontSize * 0.857);
  color: @colorTextBase;
  font-weight: normal;
}

.c-monitor-vehicle-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.c-monitor-vehicle-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 16px;
  min-width: 80px;
  flex-shrink: 0;
}

.c-monitor-vehicle-card-label {
  font-size: calc(@fontSize * 0.857);
  color: @colorTextBase;
}

.c-monitor-vehicle-card-value {
  font-size: calc(@fontSize * 1.429);
  font-weight: 600;
  color: #1890ff;
}

.c-monitor-vehicle-card-value-orange {
  color: #ff8c00;
}

.c-monitor-vehicle-chart-wrapper {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.c-monitor-vehicle-chart {
  width: 100%;
  height: 100%;
}
</style>
