<template>
  <div class="c-monitor-vehicle-section">
    <!-- 区块标题 -->
    <div class="c-monitor-vehicle-header">
      <div class="c-monitor-vehicle-title-wrap">
        <img :src="icon2" class="c-monitor-vehicle-title-icon" />
        <span class="c-monitor-vehicle-title">车型分布</span>
      </div>
    </div>

    <!-- 双列环形图 -->
    <div class="c-monitor-vehicle-charts">
      <!-- 江阴靖江长江隧道 -->
      <div
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-vehicle-card-label">江阴靖江长江隧道</div>
        <div class="c-monitor-vehicle-chart-wrap">
          <div ref="tunnelChartRef" class="c-monitor-vehicle-chart-dom"></div>
        </div>
        <div class="c-monitor-vehicle-stats-row">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot" style="background: rgba(25,144,255,1);"></span>
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value" style="color: rgba(25,144,255,1);">22350</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot" style="background: rgba(255,138,96,1);"></span>
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value" style="color: rgba(255,138,96,1);">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 -->
      <div
        class="c-monitor-vehicle-card"
        :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-vehicle-card-label">江阴大桥</div>
        <div class="c-monitor-vehicle-chart-wrap">
          <div ref="bridgeChartRef" class="c-monitor-vehicle-chart-dom"></div>
        </div>
        <div class="c-monitor-vehicle-stats-row">
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot" style="background: rgba(25,144,255,1);"></span>
            <span class="c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value" style="color: rgba(25,144,255,1);">66109</span>
          </div>
          <div class="c-monitor-vehicle-stat-item">
            <span class="c-monitor-vehicle-stat-dot" style="background: rgba(255,138,96,1);"></span>
            <span class="c-monitor-vehicle-stat-label">货车</span>
            <span class="c-monitor-vehicle-stat-value" style="color: rgba(255,138,96,1);">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3561.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

/* 系统自动注入资源变量 */
/* icon2, bg2, bg4 */

const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)

let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

/* 隧道数据 */
const tunnelData = [
  { value: 22350, name: '客车', itemStyle: { color: 'rgba(25,144,255,1)' } },
  { value: 16270, name: '货车', itemStyle: { color: 'rgba(255,138,96,1)' } }
]

/* 大桥数据 */
const bridgeData = [
  { value: 66109, name: '客车', itemStyle: { color: 'rgba(25,144,255,1)' } },
  { value: 16270, name: '货车', itemStyle: { color: 'rgba(255,138,96,1)' } }
]

const buildOption = (data) => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(161,206,255,1)',
    borderWidth: 1,
    textStyle: { color: '#333333', fontSize: 12 },
    formatter: (params) => `${params.name}：${params.value} 辆（${params.percent}%）`
  },
  legend: { show: false },
  series: [
    {
      type: 'pie',
      radius: ['52%', '72%'],
      center: ['50%', '50%'],
      data,
      label: { show: false },
      labelLine: { show: false },
      emphasis: {
        itemStyle: {
          shadowBlur: 8,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0,0,0,0.15)'
        }
      }
    }
  ]
})

const initChart = (domRef, data, chartHolder, observerHolder, setChart) => {
  if (!domRef.value) return
  const { clientWidth, clientHeight } = domRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    const c = echarts.init(domRef.value)
    c.setOption(buildOption(data))
    setChart(c)
    return
  }
  const obs = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chartHolder()) {
      obs.disconnect()
      const c = echarts.init(domRef.value)
      c.setOption(buildOption(data))
      setChart(c)
    }
  })
  obs.observe(domRef.value)
  observerHolder(obs)
}

watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) {
    initChart(
      tunnelChartRef,
      tunnelData,
      () => tunnelChart,
      (obs) => { tunnelObserver = obs },
      (c) => { tunnelChart = c }
    )
  }
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) {
    initChart(
      bridgeChartRef,
      bridgeData,
      () => bridgeChart,
      (obs) => { bridgeObserver = obs },
      (c) => { bridgeChart = c }
    )
  }
})

const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
}

onMounted(() => {
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

.c-monitor-vehicle-section {
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-monitor-vehicle-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 8px 0 6px 0;
}

.c-monitor-vehicle-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-vehicle-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-vehicle-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 24px;
}

.c-monitor-vehicle-charts {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 8px;
}

.c-monitor-vehicle-card {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-vehicle-card-label {
  flex-shrink: 0;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: var(--fontSize, 14px);
  color: rgba(51, 51, 51, 0.65);
  line-height: 21px;
  padding: 8px 8px 0 8px;
}

.c-monitor-vehicle-chart-wrap {
  flex: 1 1 0;
  min-height: 80px;
  min-width: 0;
  position: relative;
}

.c-monitor-vehicle-chart-dom {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-vehicle-stats-row {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 16px;
  padding: 6px 8px 8px 8px;
}

.c-monitor-vehicle-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-vehicle-stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-vehicle-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: var(--fontSize, 14px);
  color: rgba(51, 51, 51, 0.65);
}

.c-monitor-vehicle-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 700;
}
</style>