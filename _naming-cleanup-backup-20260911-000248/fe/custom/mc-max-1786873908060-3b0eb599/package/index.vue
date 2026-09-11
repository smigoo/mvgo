<template>
  <base-panel panelKey="default-panel">
    <template #default>
      <div class="c-env-monitor-root" :class="themeClass">
        <div class="c-env-monitor-content">
          <div class="c-env-monitor-tabs-area">
            <button
              v-for="tab in monitorTabs"
              :key="tab.key"
              type="button"
              :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item-active': activeTab === tab.key }]"
              :style="activeTab === tab.key ? { backgroundImage: `url(${bgtabActive})` } : null"
              @click="handleTabChange(tab.key)"
            >
              <img v-if="tab.showIcon" :src="icontabsIcon" class="c-env-monitor-tab-icon" alt="" />
              <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
            </button>
          </div>

          <div class="c-env-monitor-main-area">
            <div class="c-env-monitor-summary-area">
              <div
                v-for="item in summaryCards"
                :key="item.key"
                class="c-env-monitor-summary-card"
              >
                <div class="c-env-monitor-summary-icon-wrap">
                  <img :src="icon1" class="c-env-monitor-summary-icon" alt="" />
                </div>
                <div class="c-env-monitor-summary-text-group">
                  <span class="c-env-monitor-summary-label">{{ item.label }}</span>
                  <span class="c-env-monitor-summary-value">
                    {{ item.value }}<small class="c-env-monitor-summary-unit">{{ item.unit }}</small>
                  </span>
                </div>
              </div>
            </div>

            <div class="c-env-monitor-chart-section">
              <div class="c-env-monitor-section-header">
                <span class="c-env-monitor-section-title">{{ currentMetricTitle }}</span>
                <div class="c-env-monitor-time-tabs">
                  <button
                    v-for="range in timeRanges"
                    :key="range.key"
                    type="button"
                    :class="['c-env-monitor-time-tab', { 'c-env-monitor-time-tab-active': activeTimeRange === range.key }]"
                    @click="handleTimeRangeChange(range.key)"
                  >
                    {{ range.label }}
                  </button>
                </div>
              </div>
              <div class="c-env-monitor-chart-wrapper">
                <div ref="trendChartRef" class="c-env-monitor-chart-container"></div>
              </div>
            </div>

            <div class="c-env-monitor-status-section">
              <div class="c-env-monitor-section-header">
                <span class="c-env-monitor-section-title">环境状态</span>
              </div>
              <div class="c-env-monitor-status-list">
                <div
                  v-for="status in statusList"
                  :key="status.key"
                  class="c-env-monitor-status-item"
                >
                  <span class="c-env-monitor-status-name">{{ status.name }}</span>
                  <span :class="['c-env-monitor-status-badge', `c-env-monitor-status-badge-${status.level}`]">
                    {{ status.text }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'


import * as echarts from 'echarts'

let runtimeBuilder = null
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function'
    ? $mcComponentBuilder({
        componentId: 'env-monitor',
        componentProps: {},
        componentName: 'env-monitor'
      })
    : null
  runtimeBuilder = builder?.runtimeBuilder || null
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 初始化失败:', e)
  runtimeBuilder = null
  componentProps = {}
}

const themeClass = computed(() => componentProps?.themeType || componentProps?.theme || 'dark')

const monitorTabs = [
  { key: 'co2', label: '二氧化碳', showIcon: true, unit: 'ppm' },
  { key: 'visibility', label: '能见度', showIcon: false, unit: 'm' },
  { key: 'lighting', label: '洞内照明', showIcon: false, unit: 'lx' },
  { key: 'outdoorLight', label: '洞外光强', showIcon: false, unit: 'lx' }
]

const timeRanges = [
  { key: 'day', label: '24小时' },
  { key: 'week', label: '7天' },
  { key: 'month', label: '30天' }
]

const metricTitleMap = {
  co2: '二氧化碳趋势',
  visibility: '能见度趋势',
  lighting: '洞内照明趋势',
  outdoorLight: '洞外光强趋势'
}

const summarySourceMap = {
  co2: [
    { key: 'avg', label: '平均浓度', value: '426', unit: 'ppm' },
    { key: 'max', label: '最高浓度', value: '512', unit: 'ppm' },
    { key: 'alarm', label: '告警次数', value: '0', unit: '次' }
  ],
  visibility: [
    { key: 'avg', label: '平均能见度', value: '183', unit: 'm' },
    { key: 'min', label: '最低能见度', value: '156', unit: 'm' },
    { key: 'alarm', label: '告警次数', value: '1', unit: '次' }
  ],
  lighting: [
    { key: 'avg', label: '平均照度', value: '268', unit: 'lx' },
    { key: 'max', label: '最高照度', value: '315', unit: 'lx' },
    { key: 'alarm', label: '告警次数', value: '0', unit: '次' }
  ],
  outdoorLight: [
    { key: 'avg', label: '平均光强', value: '8420', unit: 'lx' },
    { key: 'max', label: '最高光强', value: '12680', unit: 'lx' },
    { key: 'alarm', label: '告警次数', value: '0', unit: '次' }
  ]
}

const statusSourceMap = {
  co2: [
    { key: 'sensor', name: 'CO₂传感器', text: '正常', level: 'normal' },
    { key: 'threshold', name: '浓度阈值', text: '正常', level: 'normal' },
    { key: 'ventilation', name: '通风联动', text: '待命', level: 'warning' }
  ],
  visibility: [
    { key: 'sensor', name: '能见度传感器', text: '正常', level: 'normal' },
    { key: 'threshold', name: '能见度阈值', text: '关注', level: 'warning' },
    { key: 'warning', name: '诱导预警', text: '已开启', level: 'normal' }
  ],
  lighting: [
    { key: 'sensor', name: '照明检测器', text: '正常', level: 'normal' },
    { key: 'control', name: '照明控制', text: '自动', level: 'normal' },
    { key: 'energy', name: '节能策略', text: '运行', level: 'normal' }
  ],
  outdoorLight: [
    { key: 'sensor', name: '洞外光强计', text: '正常', level: 'normal' },
    { key: 'threshold', name: '光强阈值', text: '正常', level: 'normal' },
    { key: 'linkage', name: '入口照明联动', text: '运行', level: 'normal' }
  ]
}

const axisLabelMap = {
  day: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
  week: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  month: ['1日', '5日', '10日', '15日', '20日', '25日', '30日']
}

const chartDataMap = {
  co2: {
    day: {
      inbound: [392, 405, 418, 452, 438, 426, 410],
      outbound: [386, 398, 424, 468, 446, 432, 416]
    },
    week: {
      inbound: [421, 435, 426, 448, 438, 420, 412],
      outbound: [416, 428, 432, 456, 442, 426, 418]
    },
    month: {
      inbound: [398, 412, 426, 438, 432, 418, 405],
      outbound: [404, 418, 435, 446, 438, 424, 412]
    }
  },
  visibility: {
    day: {
      inbound: [198, 192, 185, 176, 182, 190, 196],
      outbound: [202, 194, 188, 178, 184, 192, 198]
    },
    week: {
      inbound: [186, 181, 178, 183, 190, 195, 198],
      outbound: [190, 184, 180, 186, 193, 197, 201]
    },
    month: {
      inbound: [202, 196, 188, 181, 185, 192, 198],
      outbound: [205, 198, 190, 184, 188, 195, 201]
    }
  },
  lighting: {
    day: {
      inbound: [220, 238, 260, 286, 275, 248, 232],
      outbound: [226, 242, 268, 292, 280, 254, 238]
    },
    week: {
      inbound: [248, 252, 268, 276, 270, 258, 246],
      outbound: [254, 260, 274, 282, 276, 264, 252]
    },
    month: {
      inbound: [236, 248, 262, 275, 286, 272, 258],
      outbound: [242, 254, 268, 282, 292, 278, 264]
    }
  },
  outdoorLight: {
    day: {
      inbound: [1200, 2800, 7600, 12680, 9800, 4200, 1600],
      outbound: [1100, 2600, 7200, 11860, 9400, 3950, 1500]
    },
    week: {
      inbound: [8200, 8600, 7900, 9200, 8800, 7600, 8400],
      outbound: [7800, 8300, 7600, 8900, 8500, 7300, 8100]
    },
    month: {
      inbound: [7600, 8200, 8800, 9100, 8600, 8300, 7900],
      outbound: [7300, 7900, 8500, 8800, 8300, 8000, 7600]
    }
  }
}

const activeTab = ref('co2')
const activeTimeRange = ref('day')
const trendChartRef = ref(null)
const summaryCards = ref(summarySourceMap.co2)
const statusList = ref(statusSourceMap.co2)

const currentMetricTitle = computed(() => metricTitleMap[activeTab.value] || '环境趋势')

let trendChart = null
let trendChartObserver = null

const getCurrentTabInfo = () => monitorTabs.find((item) => item.key === activeTab.value) || monitorTabs[0]

const buildTrendOption = () => {
  const labels = axisLabelMap[activeTimeRange.value] || axisLabelMap.day
  const metricData = chartDataMap[activeTab.value]?.[activeTimeRange.value] || chartDataMap.co2.day
  const tabInfo = getCurrentTabInfo()

  return {
    color: ['#20D6FF', '#FFD15C'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(3, 19, 35, 0.92)',
      borderColor: 'rgba(32, 214, 255, 0.45)',
      borderWidth: 1,
      textStyle: {
        color: '#EAF7FF',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(32, 214, 255, 0.45)',
          width: 1,
          type: 'dashed'
        }
      },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const rows = list.map((item) => `${item.marker}${item.seriesName}: ${item.value}${tabInfo.unit}`).join('<br/>')
        return `${list[0]?.axisValue || ''}<br/>${rows}`
      }
    },
    legend: {
      top: 0,
      right: 8,
      itemWidth: 10,
      itemHeight: 6,
      textStyle: {
        color: 'rgba(234, 247, 255, 0.78)',
        fontSize: 12
      },
      data: ['入口方向', '出口方向']
    },
    grid: {
      left: 8,
      right: 16,
      top: 36,
      bottom: 8,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: {
        lineStyle: {
          color: 'rgba(147, 206, 255, 0.28)'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: 'rgba(234, 247, 255, 0.62)',
        fontSize: 11
      }
    },
    yAxis: {
      type: 'value',
      name: tabInfo.unit,
      nameTextStyle: {
        color: 'rgba(234, 247, 255, 0.56)',
        fontSize: 11,
        padding: [0, 0, 0, 4]
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(147, 206, 255, 0.16)',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: 'rgba(234, 247, 255, 0.62)',
        fontSize: 11
      }
    },
    series: [
      {
        name: '入口方向',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: metricData.inbound,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(32, 214, 255, 0.28)' },
            { offset: 1, color: 'rgba(32, 214, 255, 0.02)' }
          ])
        },
        lineStyle: {
          width: 2
        }
      },
      {
        name: '出口方向',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: metricData.outbound,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 209, 92, 0.22)' },
            { offset: 1, color: 'rgba(255, 209, 92, 0.02)' }
          ])
        },
        lineStyle: {
          width: 2
        }
      }
    ]
  }
}

const updateSummaryAndStatus = () => {
  summaryCards.value = summarySourceMap[activeTab.value] || summarySourceMap.co2
  statusList.value = statusSourceMap[activeTab.value] || statusSourceMap.co2
}

const updateTrendChart = () => {
  if (!trendChart) return
  trendChart.setOption(buildTrendOption(), true)
}

const initChart = () => {
  if (!trendChartRef.value || trendChart) return

  const { clientWidth, clientHeight } = trendChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    trendChart = echarts.init(trendChartRef.value)
    updateTrendChart()
    return
  }

  if (typeof ResizeObserver === 'undefined') {
    nextTick(() => {
      if (!trendChart && trendChartRef.value) {
        trendChart = echarts.init(trendChartRef.value)
        updateTrendChart()
      }
    })
    return
  }

  trendChartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !trendChart && trendChartRef.value) {
      trendChartObserver?.disconnect()
      trendChartObserver = null
      trendChart = echarts.init(trendChartRef.value)
      updateTrendChart()
    }
  })
  trendChartObserver.observe(trendChartRef.value)
}

const handleResize = () => {
  if (trendChart) {
    trendChart.resize()
  }
}

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

const handleTimeRangeChange = (key) => {
  if (activeTimeRange.value === key) return
  activeTimeRange.value = key
}

watch(trendChartRef, (newRef) => {
  if (newRef && !trendChart) initChart()
})

watch(activeTab, () => {
  updateSummaryAndStatus()
  updateTrendChart()
})

watch(activeTimeRange, () => {
  updateTrendChart()
})

onMounted(() => {
  runtimeBuilder?.publishEvent?.('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })

  updateSummaryAndStatus()
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  trendChart = null
  trendChartObserver?.disconnect()
  trendChartObserver = null
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>