<template>
  <div class="c-monitor-section-vehicle-type">
    <div class="c-monitor-vehicle-header">
      <img v-if="icon2" :src="icon2" class="c-monitor-vehicle-icon" alt="icon" />
      <span class="c-monitor-vehicle-title">车型分布</span>
    </div>
    <div class="c-monitor-vehicle-body">
      <div 
        v-for="location in locations" 
        :key="location.key"
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: location.bg ? `url(${location.bg})` : 'none' }"
      >
        <div class="c-monitor-vehicle-card-header">
          <div class="c-monitor-vehicle-card-title-wrapper">
            <div class="c-monitor-vehicle-card-title-bg" />
            <span class="c-monitor-vehicle-card-title">{{ location.name }}</span>
          </div>
        </div>
        <div class="c-monitor-vehicle-card-content">
          <div ref="chartRefs" class="c-monitor-vehicle-chart" />
          <div class="c-monitor-vehicle-stats">
            <div 
              v-for="item in location.stats" 
              :key="item.type"
              class="c-monitor-vehicle-stat-item"
            >
              <span class="c-monitor-vehicle-stat-label">{{ item.type }}</span>
              <span 
                class="c-monitor-vehicle-stat-value"
                :style="{ color: item.color }"
              >{{ item.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'


import * as echarts from 'echarts'

const chartRefs = ref([])
const charts = []
const chartObservers = []

const locations = ref([
  {
    key: 'tunnel',
    name: '江阴靖江长江隧道',
    bg: bg2,
    stats: [
      { type: '客车', value: '22350', color: '#1399ff' },
      { type: '货车', value: '16270', color: '#ff6a00' }
    ],
    chartData: [
      { value: 22350, name: '客车' },
      { value: 16270, name: '货车' }
    ],
    colors: ['#2ba0ff', '#ffa22f']
  },
  {
    key: 'bridge',
    name: '江阴大桥',
    bg: bg4,
    stats: [
      { type: '客车', value: '66109', color: '#1399ff' },
      { type: '货车', value: '16270', color: '#ff6a00' }
    ],
    chartData: [
      { value: 66109, name: '客车' },
      { value: 16270, name: '货车' }
    ],
    colors: ['#2ba0ff', '#ffa22f']
  }
])

const initChart = (container, location) => {
  if (!container) return null

  const { clientWidth, clientHeight } = container
  if (clientWidth <= 0 || clientHeight <= 0) {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        observer.disconnect()
        const chart = echarts.init(container)
        updateChart(chart, location)
        charts.push(chart)
      }
    })
    observer.observe(container)
    chartObservers.push(observer)
    return null
  }

  const chart = echarts.init(container)
  updateChart(chart, location)
  return chart
}

const updateChart = (chart, location) => {
  if (!chart) return

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
        return `${params.name}: ${params.value} (${params.percent}%)`
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        data: location.chartData,
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        itemStyle: {
          borderRadius: 0,
          borderColor: 'transparent',
          borderWidth: 0
        },
        color: location.colors
      }
    ]
  }

  chart.setOption(option, true)
}

const handleResize = () => {
  charts.forEach(chart => {
    if (chart && !chart.isDisposed()) {
      chart.resize()
    }
  })
}

onMounted(() => {
  nextTick(() => {
    if (chartRefs.value && chartRefs.value.length > 0) {
      chartRefs.value.forEach((container, index) => {
        if (container && locations.value[index]) {
          const chart = initChart(container, locations.value[index])
          if (chart) {
            charts.push(chart)
          }
        }
      })
    }
    window.addEventListener('resize', handleResize)
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  charts.forEach(chart => {
    if (chart && !chart.isDisposed()) {
      chart.dispose()
    }
  })
  chartObservers.forEach(observer => observer.disconnect())
})
</script>

<style lang="less" scoped>
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-section-vehicle-type {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-vehicle-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-vehicle-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-vehicle-title {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}

.c-monitor-vehicle-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  position: relative;
  min-height: 0;}

.c-monitor-vehicle-card-header {
  height: 25px;
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  margin-bottom: 8px;
}

.c-monitor-vehicle-card-title-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  height: 18px;
}

.c-monitor-vehicle-card-title-bg {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 9px;
  background: linear-gradient(90deg, transparent 0%, rgba(25, 144, 255, 0.15) 25%, rgba(25, 144, 255, 0.15) 75%, transparent 100%);
}

.c-monitor-vehicle-card-title {
  position: relative;
  z-index: 1;
  font-size: @fontSize;
  font-weight: 500;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
}

.c-monitor-vehicle-card-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.c-monitor-vehicle-chart {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.c-monitor-vehicle-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.c-monitor-vehicle-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.c-monitor-vehicle-stat-label {
  font-size: calc(@fontSize * 0.8571);
  font-weight: 400;
  color: #333333;
  line-height: 18px;
  text-align: center;
}

.c-monitor-vehicle-stat-value {
  font-size: calc(@fontSize * 1.2857);
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
</style>