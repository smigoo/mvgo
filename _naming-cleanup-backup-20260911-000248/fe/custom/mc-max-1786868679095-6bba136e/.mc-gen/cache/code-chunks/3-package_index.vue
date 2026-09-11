<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const defaultComponentProps = {
  themeType: 'dark'
}

let builderResult = {}
try {
  const builderFactory =
    typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
      ? window.$mcComponentBuilder
      : typeof $mcComponentBuilder === 'function'
        ? $mcComponentBuilder
        : null

  if (builderFactory) {
    builderResult = builderFactory({
      componentId: 'env-monitor',
      componentProps: defaultComponentProps,
      componentName: 'env-monitor'
    })
  }
} catch (error) {
  console.warn('[env-monitor] $mcComponentBuilder 初始化失败:', error)
  builderResult = {}
}

const { runtimeBuilder, componentProps: mcComponentProps = {} } = builderResult || {}

const themeType = computed(() => mcComponentProps.themeType || defaultComponentProps.themeType)

const monitorTabs = [
  { key: 'co2', label: '二氧化碳', unit: 'ppm' },
  { key: 'visibility', label: '能见度', unit: 'm' },
  { key: 'lighting', label: '洞内照明', unit: 'lx' },
  { key: 'outdoor-light', label: '洞外光强', unit: 'lx' }
]

const timeRanges = [
  { key: 'realtime', label: '实时' },
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' }
]

const activeTab = ref('co2')
const activeRange = ref('realtime')
const trendChartRef = ref(null)
let trendChart = null
let trendChartObserver = null

const chartXAxisMap = {
  realtime: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'],
  '24h': ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
  '7d': ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
}

const chartDataMap = {
  co2: {
    realtime: [410, 428, 436, 452, 441, 430],
    '24h': [398, 415, 442, 456, 438, 421],
    '7d': [420, 433, 428, 446, 439, 431, 424]
  },
  visibility: {
    realtime: [1180, 1160, 1120, 1080, 1100, 1140],
    '24h': [1220, 1200, 1160, 1090, 1130, 1180],
    '7d': [1190, 1210, 1170, 1150, 1120, 1160, 1200]
  },
  lighting: {
    realtime: [238, 242, 246, 251, 248, 245],
    '24h': [230, 236, 245, 252, 247, 240],
    '7d': [241, 244, 239, 246, 250, 243, 238]
  },
  'outdoor-light': {
    realtime: [2200, 2800, 3600, 4200, 3900, 3100],
    '24h': [300, 1800, 3600, 4300, 2800, 900],
    '7d': [3200, 3500, 3300, 4100, 3900, 3000, 2800]
  }
}

const summaryDataMap = {
  co2: [
    { key: 'current', label: '当前浓度', value: '430', unit: 'ppm' },
    { key: 'average', label: '平均浓度', value: '438', unit: 'ppm' },
    { key: 'threshold', label: '预警阈值', value: '800', unit: 'ppm' }
  ],
  visibility: [
    { key: 'current', label: '当前能见度', value: '1140', unit: 'm' },
    { key: 'average', label: '平均能见度', value: '1160', unit: 'm' },
    { key: 'threshold', label: '预警阈值', value: '500', unit: 'm' }
  ],
  lighting: [
    { key: 'current', label: '当前照度', value: '245', unit: 'lx' },
    { key: 'average', label: '平均照度', value: '246', unit: 'lx' },
    { key: 'threshold', label: '标准照度', value: '220', unit: 'lx' }
  ],
  'outdoor-light': [
    { key: 'current', label: '当前光强', value: '3100', unit: 'lx' },
    { key: 'average', label: '平均光强', value: '3350', unit: 'lx' },
    { key: 'threshold', label: '联动阈值', value: '2500', unit: 'lx' }
  ]
}

const statusDataMap = {
  co2: [
    { key: 'co2-current', name: '二氧化碳浓度', desc: '当前 430ppm，处于正常范围', statusText: '正常', statusClass: 'is-normal' },
    { key: 'co2-sensor', name: '传感器状态', desc: '在线稳定，数据更新及时', statusText: '在线', statusClass: 'is-normal' },
    { key: 'co2-alarm', name: '告警状态', desc: '暂无超限告警记录', statusText: '无告警', statusClass: 'is-normal' }
  ],
  visibility: [
    { key: 'visibility-current', name: '能见度', desc: '当前 1140m，满足通行要求', statusText: '正常', statusClass: 'is-normal' },
    { key: 'visibility-sensor', name: '检测设备', desc: '设备在线，采集状态稳定', statusText: '在线', statusClass: 'is-normal' },
    { key: 'visibility-trend', name: '变化趋势', desc: '短时略有波动，持续监测中', statusText: '关注', statusClass: 'is-warning' }
  ],
  lighting: [
    { key: 'lighting-current', name: '洞内照明', desc: '当前 245lx，照明状态良好', statusText: '正常', statusClass: 'is-normal' },
    { key: 'lighting-linkage', name: '照明联动', desc: '与光强策略联动正常', statusText: '正常', statusClass: 'is-normal' },
    { key: 'lighting-device', name: '灯具状态', desc: '局部灯具需巡检确认', statusText: '巡检', statusClass: 'is-warning' }
  ],
  'outdoor-light': [
    { key: 'outdoor-current', name: '洞外光强', desc: '当前 3100lx，联动策略已生效', statusText: '正常', statusClass: 'is-normal' },
    { key: 'outdoor-sensor', name: '光强检测器', desc: '采集设备在线运行', statusText: '在线', statusClass: 'is-normal' },
    { key: 'outdoor-trend', name: '光强变化', desc: '日照变化平稳，无异常突变', statusText: '平稳', statusClass: 'is-normal' }
  ]
}

const summaryItems = computed(() => summaryDataMap[activeTab.value] || summaryDataMap.co2)
const statusItems = computed(() => statusDataMap[activeTab.value] || statusDataMap.co2)

const getActiveTabMeta = () => monitorTabs.find((tab) => tab.key === activeTab.value) || monitorTabs[0]

const updateTrendChart = () => {
  if (!trendChart) return

  const tabMeta = getActiveTabMeta()
  const xAxisData = chartXAxisMap[activeRange.value] || chartXAxisMap.realtime
  const seriesData = chartDataMap[activeTab.value]?.[activeRange.value] || []

  trendChart.setOption(
    {
      color: ['#20d7ff'],
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(5, 22, 36, 0.92)',
        borderColor: 'rgba(32, 215, 255, 0.45)',
        borderWidth: 1,
        textStyle: {
          color: '#ffffff',
          fontSize: 12
        },
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: 'rgba(32, 215, 255, 0.55)',
            width: 1
          }
        },
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params]
          return list
            .map((item) => `${item.marker}${item.seriesName}: ${item.value}${tabMeta.unit}`)
            .join('<br/>')
        }
      },
      legend: {
        show: true,
        top: 0,
        right: 8,
        itemWidth: 10,
        itemHeight: 6,
        textStyle: {
          color: 'rgba(255, 255, 255, 0.78)',
          fontSize: 12
        },
        data: [tabMeta.label]
      },
      grid: {
        left: 8,
        right: 12,
        top: 34,
        bottom: 8,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xAxisData,
        axisLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.25)'
          }
        },
        axisTick: {
          show: false
        },
        axisLabel: {
          color: 'rgba(255, 255, 255, 0.65)',
          fontSize: 11
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.12)',
            type: 'dashed'
          }
        },
        axisLabel: {
          color: 'rgba(255, 255, 255, 0.58)',
          fontSize: 11
        }
      },
      series: [
        {
          name: tabMeta.label,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: {
            width: 2,
            color: '#20d7ff'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(32, 215, 255, 0.32)' },
              { offset: 1, color: 'rgba(32, 215, 255, 0.02)' }
            ])
          },
          data: seriesData
        }
      ]
    },
    true
  )
}

const initTrendChart = () => {
  if (!trendChartRef.value || trendChart) return

  const { clientWidth, clientHeight } = trendChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    trendChart = echarts.init(trendChartRef.value)
    updateTrendChart()
    return
  }

  trendChartObserver?.disconnect()
  trendChartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !trendChart) {
      trendChartObserver?.disconnect()
      trendChart = echarts.init(trendChartRef.value)
      updateTrendChart()
    }
  })
  trendChartObserver.observe(trendChartRef.value)
}

const resizeTrendChart = () => {
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
  if (newRef && !trendChart) initTrendChart()
})

watch([activeTab, activeRange], () => {
  updateTrendChart()
})

onMounted(() => {
  runtimeBuilder?.publishEvent?.('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })

  nextTick(() => {
    initTrendChart()
    resizeTrendChart()
  })

  window.addEventListener('resize', resizeTrendChart)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeTrendChart)
  trendChart?.dispose()
  trendChart = null
  trendChartObserver?.disconnect()
  trendChartObserver = null
})
</script>