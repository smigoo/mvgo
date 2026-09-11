<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <!-- 修复：标题栏装饰通过 base-panel 插槽分发，不在默认插槽生成 header -->
      <img :src="icon1" class="c-c-monitor-title-dot" alt="" aria-hidden="true" />
    </template>
    <template #title-right>
      <!-- 修复：使用副标题位置的装饰资源，避免遗漏可用图标资源 -->
      <img :src="icon2" class="c-c-monitor-title-vector" alt="" aria-hidden="true" />
    </template>

    <div class="c-c-monitor-root">
      <section class="c-c-monitor-section c-c-monitor-total-section">
        <div class="c-c-monitor-section-header">
          <div class="c-c-monitor-section-title-wrap">
            <img :src="icon3" class="c-c-monitor-section-title-icon" alt="" aria-hidden="true" />
            <span class="c-c-monitor-section-title">当日总流量</span>
          </div>
          <!-- 修复：Select 切换联动图表数据，不只改变控件值 -->
          <a-select
            v-model:value="activeTimeRange"
            class="c-c-monitor-time-select"
            :options="timeOptions"
            size="small"
          />
        </div>

        <!-- 修复：已下载 bgm_2 背景资源必须通过模板 backgroundImage 使用 -->
        <div
          class="c-c-monitor-total-card"
          :style="{
            backgroundImage: `url(${bgm_2})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat'
          }"
        >
          <div class="c-c-monitor-total-stat c-c-monitor-total-stat-left">
            <span class="c-c-monitor-total-label">江阴大桥</span>
            <span class="c-c-monitor-total-value c-c-monitor-total-value-bridge">82,379</span>
          </div>
          <div class="c-c-monitor-total-stat c-c-monitor-total-stat-right">
            <span class="c-c-monitor-total-label">江阴靖江长江隧道</span>
            <span class="c-c-monitor-total-value c-c-monitor-total-value-tunnel">34,620</span>
          </div>
        </div>

        <div class="c-c-monitor-chart-block">
          <div class="c-c-monitor-chart-title-row">
            <span class="c-c-monitor-chart-title-mark"></span>
            <span class="c-c-monitor-chart-title">江阴靖江长江隧道</span>
          </div>
          <div ref="tunnelBarRef" class="c-c-monitor-chart-container"></div>
        </div>

        <div class="c-c-monitor-chart-block">
          <div class="c-c-monitor-chart-title-row">
            <span class="c-c-monitor-chart-title-mark"></span>
            <span class="c-c-monitor-chart-title">江阴大桥</span>
          </div>
          <div ref="bridgeBarRef" class="c-c-monitor-chart-container"></div>
        </div>
      </section>

      <section class="c-c-monitor-section c-c-monitor-vehicle-section">
        <div class="c-c-monitor-section-header">
          <div class="c-c-monitor-section-title-wrap">
            <img :src="icon4" class="c-c-monitor-section-title-icon" alt="" aria-hidden="true" />
            <span class="c-c-monitor-section-title">车型分布</span>
          </div>
        </div>

        <div class="c-c-monitor-vehicle-list">
          <div
            v-for="item in vehicleCards"
            :key="item.name"
            class="c-c-monitor-vehicle-card"
            :style="{
              backgroundImage: `url(${item.bg})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <!-- 修复：车型卡片背景图使用 Figma 下载资源，不用 CSS 渐变替代 -->
            <div class="c-c-monitor-vehicle-chart" :ref="setVehicleChartRef(item.key)"></div>
            <div class="c-c-monitor-vehicle-name">{{ item.name }}</div>
            <div class="c-c-monitor-vehicle-stats">
              <div class="c-c-monitor-vehicle-stat">
                <span class="c-c-monitor-vehicle-stat-label">客车</span>
                <span class="c-c-monitor-vehicle-stat-value c-c-monitor-vehicle-stat-value-passenger">{{ item.passenger }}</span>
              </div>
              <div class="c-c-monitor-vehicle-stat c-c-monitor-vehicle-stat-right">
                <span class="c-c-monitor-vehicle-stat-label">货车</span>
                <span class="c-c-monitor-vehicle-stat-value c-c-monitor-vehicle-stat-value-truck">{{ item.truck }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="c-c-monitor-section c-c-monitor-forecast-section">
        <div class="c-c-monitor-section-header">
          <div class="c-c-monitor-section-title-wrap">
            <img :src="icon5" class="c-c-monitor-section-title-icon" alt="" aria-hidden="true" />
            <span class="c-c-monitor-section-title">流量预测</span>
          </div>
          <!-- 修复：Tab 切换使用 watch 联动预测图表数据 -->
          <div class="c-c-monitor-forecast-tabs">
            <button
              v-for="tab in forecastTabs"
              :key="tab.key"
              type="button"
              :class="[
                'c-c-monitor-forecast-tab',
                { 'c-c-monitor-forecast-tab-active': activeForecastTab === tab.key }
              ]"
              @click="activeForecastTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
          <button type="button" class="c-c-monitor-holiday-button">节假日预测</button>
        </div>
        <div ref="forecastLineRef" class="c-c-monitor-forecast-chart"></div>
      </section>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-3552.png'
import icon2 from '../resources/images/Vector-3549.png'
import icon3 from '../resources/images/icon-3561.png'
import icon4 from '../resources/images/icon-3441.png'
import icon5 from '../resources/images/icon-3573.png'
import bgm_2 from '../resources/images/bg-_m-34.png'
import bgm_3 from '../resources/images/bg-_m-36.png'
import bgm_4 from '../resources/images/bg-_m-35.png'


import { nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import * as echarts from 'echarts'

const componentProps = {}
let runtimeBuilder = null
let builderResult = null

try {
  // 修复：$mcComponentBuilder 使用 try-catch 包裹且只调用一次，避免框架未注入时组件不可见
  const builder = typeof $mcComponentBuilder === 'function'
    ? $mcComponentBuilder({
        componentId: 'monitor',
        componentProps,
        componentName: 'monitor'
      })
    : null
  builderResult = builder
  ;({ runtimeBuilder } = builder || {})
} catch (error) {
  console.warn('[流量监测] $mcComponentBuilder 初始化失败：', error)
  runtimeBuilder = null
}

const activeTimeRange = ref('24h')
const activeForecastTab = ref('tunnel')

const timeOptions = [
  { label: '24小时', value: '24h' },
  { label: '12小时', value: '12h' },
  { label: '6小时', value: '6h' }
]

const forecastTabs = [
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
]

const vehicleCards = [
  {
    key: 'tunnel',
    name: '江阴靖江长江隧道',
    passenger: '66109',
    truck: '16270',
    bg: bgm_3
  },
  {
    key: 'bridge',
    name: '江阴大桥',
    passenger: '66109',
    truck: '16270',
    bg: bgm_4
  }
]

const timeDataMap = {
  '24h': {
    xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    tunnel: {
      beijing: [420, 520, 610, 760, 1120, 1360, 1480, 825, 1060, 1320, 980, 720],
      shanghai: [450, 560, 660, 790, 1180, 1420, 1510, 831, 1110, 1380, 1020, 760]
    },
    bridge: {
      beijing: [520, 650, 720, 850, 1240, 1530, 1600, 920, 1210, 1450, 1100, 850],
      shanghai: [560, 690, 760, 900, 1300, 1580, 1660, 970, 1280, 1510, 1160, 890]
    }
  },
  '12h': {
    xAxis: ['2', '4', '6', '8', '10', '12'],
    tunnel: {
      beijing: [520, 610, 760, 1120, 1360, 1480],
      shanghai: [560, 660, 790, 1180, 1420, 1510]
    },
    bridge: {
      beijing: [650, 720, 850, 1240, 1530, 1600],
      shanghai: [690, 760, 900, 1300, 1580, 1660]
    }
  },
  '6h': {
    xAxis: ['2', '4', '6', '8', '10', '12'],
    tunnel: {
      beijing: [420, 520, 610, 760, 1120, 1360],
      shanghai: [450, 560, 660, 790, 1180, 1420]
    },
    bridge: {
      beijing: [520, 650, 720, 850, 1240, 1530],
      shanghai: [560, 690, 760, 900, 1300, 1580]
    }
  }
}

const forecastDataMap = {
  tunnel: {
    actual: [2400, 2600, 2850, 3100, null],
    forecast: [null, null, 2850, 3350, 3580]
  },
  bridge: {
    actual: [2800, 2950, 3200, 3450, null],
    forecast: [null, null, 3200, 3600, 3820]
  }
}

const tunnelBarRef = ref(null)
const bridgeBarRef = ref(null)
const forecastLineRef = ref(null)
const vehicleChartRefs = ref({})

const charts = {
  tunnelBar: null,
  bridgeBar: null,
  forecastLine: null,
  vehicleTunnel: null,
  vehicleBridge: null
}

const chartObservers = {
  tunnelBar: null,
  bridgeBar: null,
  forecastLine: null,
  vehicleTunnel: null,
  vehicleBridge: null
}

const setVehicleChartRef = (key) => (el) => {
  if (el) {
    vehicleChartRefs.value[key] = el
  }
}

const buildBarOption = (sectionKey) => {
  const current = timeDataMap[activeTimeRange.value] || timeDataMap['24h']
  const sectionData = current[sectionKey]
  return {
    color: ['#3385ff', '#00cccc'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: '#c7e0ff',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: '#333333',
        fontFamily: 'Source Han Sans CN',
        fontSize: 12
      }
    },
    grid: {
      left: 8,
      right: 8,
      top: 12,
      bottom: 34,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: current.xAxis,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#5bbbef' } },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
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
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      splitLine: { lineStyle: { color: 'rgba(91, 187, 239, 0.24)' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        barGap: '50%',
        data: sectionData.beijing
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        data: sectionData.shanghai
      }
    ]
  }
}

const buildVehicleOption = (item) => ({
  color: ['#2ba0ff', '#ffa22f', '#56597c'],
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#c7e0ff',
    borderWidth: 1,
    textStyle: { color: '#333333', fontSize: 12 }
  },
  legend: { show: false },
  series: [
    {
      name: item.name,
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      data: [
        { value: Number(item.passenger), name: '客车' },
        { value: Number(item.truck), name: '货车' },
        { value: 5200, name: '其他' }
      ]
    }
  ]
})

const buildForecastOption = () => {
  const current = forecastDataMap[activeForecastTab.value]
  return {
    color: ['#00cccc', '#3385ff'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: '#c7e0ff',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      bottom: 0,
      left: 'center',
      itemWidth: 14,
      itemHeight: 6,
      textStyle: {
        color: '#333333',
        fontFamily: 'Source Han Sans CN',
        fontSize: 12
      }
    },
    grid: {
      left: 8,
      right: 8,
      top: 10,
      bottom: 34,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#5bbbef' } },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
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
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      splitLine: { lineStyle: { color: 'rgba(91, 187, 239, 0.24)' } }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 1, color: '#00cccc' },
        itemStyle: {
          color: '#ffffff',
          borderColor: '#00cccc',
          borderWidth: 1,
          shadowBlur: 1,
          shadowOffsetY: 1,
          shadowColor: 'rgba(0, 204, 204, 0.3)'
        },
        areaStyle: { color: 'rgba(0, 204, 204, 0.18)' },
        data: current.actual
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 1, color: '#3385ff' },
        itemStyle: {
          color: '#ffffff',
          borderColor: '#3385ff',
          borderWidth: 1,
          shadowBlur: 1,
          shadowOffsetY: 1,
          shadowColor: 'rgba(0, 204, 204, 0.3)'
        },
        areaStyle: { color: 'rgba(51, 133, 255, 0.18)' },
        data: current.forecast
      }
    ]
  }
}

const updateBarCharts = () => {
  charts.tunnelBar?.setOption(buildBarOption('tunnel'), true)
  charts.bridgeBar?.setOption(buildBarOption('bridge'), true)
}

const updateForecastChart = () => {
  charts.forecastLine?.setOption(buildForecastOption(), true)
}

const updateVehicleCharts = () => {
  vehicleCards.forEach((item) => {
    const chartKey = item.key === 'tunnel' ? 'vehicleTunnel' : 'vehicleBridge'
    charts[chartKey]?.setOption(buildVehicleOption(item), true)
  })
}

const initChart = (key, el, optionBuilder) => {
  if (!el) return

  const createChart = () => {
    if (!el || charts[key]) return
    charts[key] = echarts.init(el)
    charts[key].setOption(optionBuilder(), true)
    charts[key].resize()
  }

  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    createChart()
    return
  }

  // 修复：使用 ResizeObserver 等待容器宽高就绪，避免 base-panel 初始 0 尺寸导致空白图表
  chartObservers[key]?.disconnect()
  chartObservers[key] = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !charts[key]) {
      chartObservers[key]?.disconnect()
      createChart()
    }
  })
  chartObservers[key].observe(el)
}

const disposeChart = (key) => {
  chartObservers[key]?.disconnect()
  chartObservers[key] = null
  charts[key]?.dispose()
  charts[key] = null
}

const initAllCharts = () => {
  initChart('tunnelBar', tunnelBarRef.value, () => buildBarOption('tunnel'))
  initChart('bridgeBar', bridgeBarRef.value, () => buildBarOption('bridge'))
  initChart('forecastLine', forecastLineRef.value, buildForecastOption)

  vehicleCards.forEach((item) => {
    const chartKey = item.key === 'tunnel' ? 'vehicleTunnel' : 'vehicleBridge'
    initChart(chartKey, vehicleChartRefs.value[item.key], () => buildVehicleOption(item))
  })
}

const handleResize = () => {
  Object.values(charts).forEach((chart) => chart?.resize())
}

watch(tunnelBarRef, (newRef, oldRef) => {
  // 修复：监听 ref 变化，处理 base-panel 替换 DOM 后图表重新初始化
  if (oldRef && oldRef !== newRef) disposeChart('tunnelBar')
  if (newRef && !charts.tunnelBar) initChart('tunnelBar', newRef, () => buildBarOption('tunnel'))
})

watch(bridgeBarRef, (newRef, oldRef) => {
  // 修复：监听 ref 变化，处理 base-panel 替换 DOM 后图表重新初始化
  if (oldRef && oldRef !== newRef) disposeChart('bridgeBar')
  if (newRef && !charts.bridgeBar) initChart('bridgeBar', newRef, () => buildBarOption('bridge'))
})

watch(forecastLineRef, (newRef, oldRef) => {
  // 修复：监听 ref 变化，处理 base-panel 替换 DOM 后图表重新初始化
  if (oldRef && oldRef !== newRef) disposeChart('forecastLine')
  if (newRef && !charts.forecastLine) initChart('forecastLine', newRef, buildForecastOption)
})

watch(activeTimeRange, () => {
  // 修复：Select 变化后更新柱状图数据
  updateBarCharts()
})

watch(activeForecastTab, () => {
  // 修复：Tab 变化后更新预测折线图数据
  updateForecastChart()
})

onMounted(() => {
  nextTick(() => {
    initAllCharts()
    updateVehicleCharts()
  })
  window.addEventListener('resize', handleResize)

  // 修复：触发微码组件 onload 事件
  runtimeBuilder?.publishEvent?.('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  Object.keys(charts).forEach((key) => disposeChart(key))
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>