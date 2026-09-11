<template>
  <div class="c-monitor-vehicle-distribution">
    <div class="c-monitor-vehicle-distribution-header">
      <img :src="icon2" class="c-monitor-vehicle-header-icon" alt="车型分布" />
      <span class="c-monitor-vehicle-distribution-title">车型分布</span>
    </div>

    <div class="c-monitor-vehicle-cards">
      <div class="c-monitor-vehicle-card" :style="tunnelCardStyle">
        <div class="c-monitor-vehicle-card-label">江阴靖江长江隧道</div>
        <div class="c-monitor-vehicle-card-body">
          <div ref="tunnelChartRef" class="c-monitor-vehicle-pie"></div>
          <div class="c-monitor-vehicle-stats">
            <div class="c-monitor-vehicle-stat">
              <span class="c-monitor-vehicle-stat-label">客车</span>
              <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--blue">22350</span>
            </div>
            <div class="c-monitor-vehicle-stat">
              <span class="c-monitor-vehicle-stat-label">货车</span>
              <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--orange">16270</span>
            </div>
          </div>
        </div>
      </div>

      <div class="c-monitor-vehicle-card" :style="bridgeCardStyle">
        <div class="c-monitor-vehicle-card-label">江阴大桥</div>
        <div class="c-monitor-vehicle-card-body">
          <div ref="bridgeChartRef" class="c-monitor-vehicle-pie"></div>
          <div class="c-monitor-vehicle-stats">
            <div class="c-monitor-vehicle-stat">
              <span class="c-monitor-vehicle-stat-label">客车</span>
              <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--blue">66109</span>
            </div>
            <div class="c-monitor-vehicle-stat">
              <span class="c-monitor-vehicle-stat-label">货车</span>
              <span class="c-monitor-vehicle-stat-value c-monitor-vehicle-stat-value--orange">16270</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)

let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

const tunnelCardStyle = {
  backgroundImage: 'url(' + bg2 + ')',
  backgroundSize: '100% auto',
  backgroundPosition: 'left bottom',
  backgroundRepeat: 'no-repeat'
}

const bridgeCardStyle = {
  backgroundImage: 'url(' + bg4 + ')',
  backgroundSize: '100% auto',
  backgroundPosition: 'left bottom',
  backgroundRepeat: 'no-repeat'
}

const tunnelData = [
  { name: '客车', value: 22350 },
  { name: '货车', value: 16270 }
]

const bridgeData = [
  { name: '客车', value: 66109 },
  { name: '货车', value: 16270 }
]

const buildPieOption = (data) => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(51, 51, 51, 0.15)',
    borderWidth: 1,
    padding: [6, 10],
    textStyle: {
      color: '#333333',
      fontSize: 12,
      fontFamily: 'Source Han Sans CN'
    },
    formatter: (params) => `${params.name}<br/>${params.value} 辆`
  },
  color: ['#1890ff', '#ff7a45'],
  series: [
    {
      type: 'pie',
      radius: ['46%', '68%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      hoverAnimation: false,
      itemStyle: {
        borderWidth: 0
      },
      label: {
        show: false
      },
      labelLine: {
        show: false
      },
      emphasis: {
        scale: false
      },
      data
    }
  ]
})

const initTunnelChart = () => {
  if (!tunnelChartRef.value || tunnelChart) return

  const el = tunnelChartRef.value
  const run = () => {
    tunnelChart = echarts.init(el)
    tunnelChart.setOption(buildPieOption(tunnelData))
  }

  if (el.clientWidth > 0 && el.clientHeight > 0) {
    run()
    return
  }

  tunnelObserver = new ResizeObserver(() => {
    if (el.clientWidth > 0 && el.clientHeight > 0 && !tunnelChart) {
      tunnelObserver?.disconnect()
      run()
    }
  })
  tunnelObserver.observe(el)
}

const initBridgeChart = () => {
  if (!bridgeChartRef.value || bridgeChart) return

  const el = bridgeChartRef.value
  const run = () => {
    bridgeChart = echarts.init(el)
    bridgeChart.setOption(buildPieOption(bridgeData))
  }

  if (el.clientWidth > 0 && el.clientHeight > 0) {
    run()
    return
  }

  bridgeObserver = new ResizeObserver(() => {
    if (el.clientWidth > 0 && el.clientHeight > 0 && !bridgeChart) {
      bridgeObserver?.disconnect()
      run()
    }
  })
  bridgeObserver.observe(el)
}

watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-distribution {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-monitor-vehicle-distribution-header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  flex-shrink: 0;
}

.c-monitor-vehicle-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-vehicle-distribution-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-vehicle-cards {
  display: flex;
  flex-direction: row;
  gap: 8px;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 8px 10px 10px;
  overflow: hidden;
  position: relative;
}

.c-monitor-vehicle-card-label {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  line-height: 21px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-bottom: 4px;
}

.c-monitor-vehicle-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.c-monitor-vehicle-pie {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.c-monitor-vehicle-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.c-monitor-vehicle-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.c-monitor-vehicle-stat-label {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
}

.c-monitor-vehicle-stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 18px;
}

.c-monitor-vehicle-stat-value--blue {
  color: #1399ff;
}

.c-monitor-vehicle-stat-value--orange {
  color: #ff6a00;
}
</style>