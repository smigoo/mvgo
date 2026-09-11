<template>
  <base-panel panelKey="default-panel">
    <template #default>
      <div class="c-env-monitor-root" :class="themeType">
        <section class="c-env-monitor-tabs-section">
          <div class="c-env-monitor-tabs-list">
            <button
              v-for="tab in monitorTabs"
              :key="tab.key"
              type="button"
              :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
              :style="activeTab === tab.key ? { backgroundImage: `url(${bgtabActive})` } : null"
              @click="handleTabChange(tab.key)"
            >
              <img
                v-if="tab.showIcon"
                class="c-env-monitor-tab-icon"
                :src="icontabsIcon"
                :alt="tab.label"
              />
              <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
            </button>
          </div>
        </section>

        <section class="c-env-monitor-summary-section">
          <div class="c-env-monitor-summary-grid">
            <div
              v-for="item in summaryList"
              :key="item.key"
              class="c-env-monitor-summary-card"
            >
              <div class="c-env-monitor-summary-icon-wrap">
                <img class="c-env-monitor-summary-icon" :src="icon1" :alt="item.label" />
              </div>
              <div class="c-env-monitor-summary-text-group">
                <span class="c-env-monitor-summary-label">{{ item.label }}</span>
                <span class="c-env-monitor-summary-value">
                  {{ item.value }}<small>{{ item.unit }}</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="c-env-monitor-chart-section">
          <div class="c-env-monitor-section-header">
            <span class="c-env-monitor-section-title">监测趋势</span>
            <div class="c-env-monitor-time-tabs">
              <button
                v-for="range in timeRanges"
                :key="range.key"
                type="button"
                :class="['c-env-monitor-time-tab', { 'is-active': activeRange === range.key }]"
                @click="handleRangeChange(range.key)"
              >
                {{ range.label }}
              </button>
            </div>
          </div>
          <div class="c-env-monitor-chart-body">
            <div ref="trendChartRef" class="c-env-monitor-chart-container"></div>
          </div>
        </section>

        <section class="c-env-monitor-status-section">
          <div class="c-env-monitor-section-header">
            <span class="c-env-monitor-section-title">设备状态</span>
          </div>
          <div class="c-env-monitor-status-list">
            <div
              v-for="device in deviceStatusList"
              :key="device.id"
              class="c-env-monitor-status-item"
            >
              <span :class="['c-env-monitor-status-dot', `is-${device.status}`]"></span>
              <span class="c-env-monitor-status-name">{{ device.name }}</span>
              <span class="c-env-monitor-status-value">{{ device.value }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'


import * as echarts from 'echarts'

const defaultComponentProps = {
  themeType: 'dark'
}

let runtimeBuilder = null
let builderComponentProps = defaultComponentProps

try {
  const builder = typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
    ? window.$mcComponentBuilder({
      componentId: 'env-monitor',
      componentProps: defaultComponentProps,
      componentName: 'env-monitor'
    })
    : null
  const { runtimeBuilder: currentRuntimeBuilder, componentProps: currentComponentProps = defaultComponentProps } = builder || {}
  runtimeBuilder = currentRuntimeBuilder || null
  builderComponentProps = currentComponentProps || defaultComponentProps
} catch (error) {
  console.warn('[env-monitor] $mcComponentBuilder 初始化失败:', error)
  runtimeBuilder = null
  builderComponentProps = defaultComponentProps
}

const themeType = computed(() => builderComponentProps?.themeType || defaultComponentProps.themeType)

const monitorTabs = [
  { key: 'co2', label: '二氧化碳', showIcon: true, unit: 'ppm' },
  { key: 'visibility', label: '能见度', showIcon: true, unit: 'm' },
  { key: 'lightingIn', label: '洞内照明', showIcon: true, unit: 'lx' },
  { key: 'lightingOut', label: '洞外光强', showIcon: true, unit: 'lx' }
]

const timeRanges = [
  { key: 'day', label: '24小时' },
  { key: 'week', label: '7天' },
  { key: 'month', label: '30天' }
]

const activeTab = ref('co2')
const activeRange = ref('day')
const trendChartRef = ref(null)

let trendChart = null
let chartObserver = null

const xAxisMap = {
  day: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
  week: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  month: ['1日', '5日', '10日', '15日', '20日', '25日', '30日']
}

const trendDataMap = {
  co2: {
    day: [420, 438, 455, 468, 452, 440, 426],
    week: [432, 445, 452, 448, 461, 456, 439],
    month: [428, 436, 452, 460, 455, 447, 433]
  },
  visibility: {
    day: [780, 760, 735, 710, 728, 750, 775],
    week: [775, 768, 752, 739, 746, 758, 772],
    month: [790, 776, 758, 742, 748, 765, 781]
  },
  lightingIn: {
    day: [118, 122, 128, 135, 132, 126, 120],
    week: [120, 124, 129, 133, 131, 127, 123],
    month: [116, 121, 127, 132, 130, 125, 119]
  },
  lightingOut: {
    day: [3200, 6400, 13800, 21800, 17600, 9200, 3800],
    week: [14600, 15200, 16800, 17400, 16000, 14800, 14000],
    month: [13800, 14500, 15600, 16800, 16200, 15100, 14200]
  }
}

const summaryDataMap = {
  co2: [
    { key: 'current', label: '当前浓度', value: '452', unit: 'ppm' },
    { key: 'max', label: '最高浓度', value: '468', unit: 'ppm' },
    { key: 'average', label: '平均浓度', value: '441', unit: 'ppm' }
  ],
  visibility: [
    { key: 'current', label: '当前能见度', value: '750', unit: 'm' },
    { key: 'min', label: '最低能见度', value: '710', unit: 'm' },
    { key: 'average', label: '平均能见度', value: '748', unit: 'm' }
  ],
  lightingIn: [
    { key: 'current', label: '当前照度', value: '126', unit: 'lx' },
    { key: 'max', label: '最高照度', value: '135', unit: 'lx' },
    { key: 'average', label: '平均照度', value: '126', unit: 'lx' }
  ],
  lightingOut: [
    { key: 'current', label: '当前光强', value: '9200', unit: 'lx' },
    { key: 'max', label: '最高光强', value: '21800', unit: 'lx' },
    { key: 'average', label: '平均光强', value: '12400', unit: 'lx' }
  ]
}

const deviceStatusList = ref([
  { id: 'co2-detector', name: 'CO₂传感器', value: '在线', status: 'normal' },
  { id: 'visibility-detector', name: '能见度仪', value: '在线', status: 'normal' },
  { id: 'lighting-in-detector', name: '洞内照明控制器', value: '预警', status: 'warning' },
  { id: 'lighting-out-detector', name: '洞外光强仪', value: '在线', status: 'normal' }
])

const currentTabMeta = computed(() => monitorTabs.find((item) => item.key === activeTab.value) || monitorTabs[0])
const summaryList = computed(() => summaryDataMap[activeTab.value] || summaryDataMap.co2)

const getSeriesColor = () => {
  const colorMap = {
    co2: '#19d4ff',
    visibility: '#2ee6a6',
    lightingIn: '#ffd35c',
    lightingOut: '#ff9f43'
  }
  return colorMap[activeTab.value] || '#19d4ff'
}

const updateChart = () => {
  if (!trendChart) return

  const xAxisData = xAxisMap[activeRange.value] || xAxisMap.day
  const seriesData = trendDataMap[activeTab.value]?.[activeRange.value] || []
  const seriesColor = getSeriesColor()
  const unit = currentTabMeta.value.unit

  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4, 20, 34, 0.92)',
      borderColor: 'rgba(25, 212, 255, 0.45)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(25, 212, 255, 0.55)',
          width: 1,
          type: 'dashed'
        }
      },
      formatter: (params) => {
        const point = Array.isArray(params) ? params[0] : params
        if (!point) return ''
        return `${point.name}<br/>${point.seriesName}: ${point.value}${unit}`
      }
    },
    legend: {
      show: true,
      top: 0,
      right: 8,
      itemWidth: 10,
      itemHeight: 6,
      textStyle: {
        color: 'rgba(255, 255, 255, 0.72)',
        fontSize: 12
      },
      data: [currentTabMeta.value.label]
    },
    grid: {
      left: 8,
      right: 12,
      top: 34,
      bottom: 6,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData,
      axisLine: {
        lineStyle: {
          color: 'rgba(160, 210, 255, 0.28)'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: 'rgba(220, 242, 255, 0.68)',
        fontSize: 11
      }
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      axisLabel: {
        color: 'rgba(220, 242, 255, 0.68)',
        fontSize: 11
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(160, 210, 255, 0.16)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: currentTabMeta.value.label,
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 6,
        data: seriesData,
        lineStyle: {
          width: 2,
          color: seriesColor
        },
        itemStyle: {
          color: seriesColor,
          borderColor: '#ffffff',
          borderWidth: 1
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${seriesColor}66` },
            { offset: 1, color: `${seriesColor}00` }
          ])
        }
      }
    ]
  }, true)
}

const initChart = () => {
  if (!trendChartRef.value || trendChart) return

  const { clientWidth, clientHeight } = trendChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    trendChart = echarts.init(trendChartRef.value)
    updateChart()
    return
  }

  chartObserver?.disconnect()
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0]?.contentRect || {}
    if (width > 0 && height > 0 && !trendChart && trendChartRef.value) {
      chartObserver?.disconnect()
      trendChart = echarts.init(trendChartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(trendChartRef.value)
}

const resizeChart = () => {
  if (trendChart) {
    trendChart.resize()
  }
}

const handleTabChange = (tabKey) => {
  if (activeTab.value === tabKey) return
  activeTab.value = tabKey
}

const handleRangeChange = (rangeKey) => {
  if (activeRange.value === rangeKey) return
  activeRange.value = rangeKey
}

watch(trendChartRef, (newRef) => {
  if (newRef && !trendChart) initChart()
})

watch([activeTab, activeRange], () => {
  updateChart()
})

onMounted(() => {
  nextTick(() => {
    initChart()
    resizeChart()
  })

  window.addEventListener('resize', resizeChart)

  runtimeBuilder?.publishEvent?.('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeChart)
  chartObserver?.disconnect()
  chartObserver = null
  trendChart?.dispose()
  trendChart = null
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>