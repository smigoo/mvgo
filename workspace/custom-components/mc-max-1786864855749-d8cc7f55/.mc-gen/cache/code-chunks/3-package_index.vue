<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const componentProps = {
  themeType: 'dark'
}

let runtimeBuilder = null
let mcComponentProps = componentProps
let componentApi = null
let businessProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function'
    ? $mcComponentBuilder({
        componentId: 'monitor',
        componentProps,
        componentName: 'monitor'
      })
    : null
  runtimeBuilder = builder?.runtimeBuilder || null
  mcComponentProps = builder?.componentProps || componentProps
  componentApi = builder?.componentApi || null
  businessProps = builder?.businessProps || {}
} catch (error) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', error)
}

const themeType = computed(() => mcComponentProps?.themeType || mcComponentProps?.theme || 'dark')

const overviewStats = ref([
  { key: 'total', label: '设备总数', value: '2,486', unit: '台', bg: bg2, icon: typeof icon1 !== 'undefined' ? icon1 : '' },
  { key: 'online', label: '在线设备', value: '2,358', unit: '台', bg: bg3, icon: typeof icon2 !== 'undefined' ? icon2 : '' },
  { key: 'offline', label: '离线设备', value: '128', unit: '台', bg: bg4, icon: typeof icon3 !== 'undefined' ? icon3 : '' },
  { key: 'alarm', label: '告警设备', value: '36', unit: '台', bg: bg5, icon: typeof icon4 !== 'undefined' ? icon4 : '' }
])

const statusTabs = [
  { key: 'all', label: '全部' },
  { key: 'camera', label: '摄像机' },
  { key: 'sensor', label: '传感器' }
]

const activeStatusTab = ref('all')

const statusDataMap = {
  all: [
    { key: 'online', name: '在线', count: 2358, unit: '台', bg: bg7 },
    { key: 'offline', name: '离线', count: 128, unit: '台', bg: bg8 },
    { key: 'fault', name: '故障', count: 36, unit: '台', bg: bg9 }
  ],
  camera: [
    { key: 'online', name: '在线', count: 1268, unit: '台', bg: bg7 },
    { key: 'offline', name: '离线', count: 68, unit: '台', bg: bg8 },
    { key: 'fault', name: '故障', count: 18, unit: '台', bg: bg9 }
  ],
  sensor: [
    { key: 'online', name: '在线', count: 1090, unit: '台', bg: bg7 },
    { key: 'offline', name: '离线', count: 60, unit: '台', bg: bg8 },
    { key: 'fault', name: '故障', count: 18, unit: '台', bg: bg9 }
  ]
}

const deviceStatusList = computed(() => statusDataMap[activeStatusTab.value] || statusDataMap.all)

const alarmRangeOptions = [
  { value: 'today', label: '今日' },
  { value: 'week', label: '近7日' },
  { value: 'month', label: '近30日' }
]

const selectedAlarmRange = ref('today')
const alarmDropdownVisible = ref(false)

const selectedAlarmRangeLabel = computed(() => {
  const target = alarmRangeOptions.find((item) => item.value === selectedAlarmRange.value)
  return target?.label || '今日'
})

const alarmTrendMap = {
  today: {
    xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    warning: [3, 6, 8, 12, 9, 5],
    fault: [1, 2, 3, 5, 4, 2]
  },
  week: {
    xAxis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    warning: [18, 22, 16, 28, 24, 15, 12],
    fault: [6, 8, 5, 9, 7, 4, 3]
  },
  month: {
    xAxis: ['1日', '5日', '10日', '15日', '20日', '25日', '30日'],
    warning: [42, 58, 51, 66, 72, 63, 48],
    fault: [12, 18, 15, 22, 26, 19, 14]
  }
}

const healthCards = ref([
  { key: 'health', label: '健康设备占比', value: '94.8%', trend: '+2.6%', trendType: 'up', bg: bg13, icon: typeof icon5 !== 'undefined' ? icon5 : '' },
  { key: 'maintenance', label: '待维护设备', value: '86', trend: '-12', trendType: 'down', bg: bg14, icon: typeof icon6 !== 'undefined' ? icon6 : '' }
])

const maintenanceTasks = ref([
  { id: 'task-001', name: '摄像机巡检', desc: '隧道入口监控点位', status: '进行中', statusType: 'processing', bg: bg16 },
  { id: 'task-002', name: '传感器校准', desc: '环境监测设备校准', status: '待处理', statusType: 'pending', bg: bg17 },
  { id: 'task-003', name: '网络链路检查', desc: '核心交换链路巡检', status: '已完成', statusType: 'finished', bg: bg18 }
])

const deviceStatusChartRef = ref(null)
const alarmTrendChartRef = ref(null)
const deviceTypeChartRef = ref(null)

let deviceStatusChart = null
let alarmTrendChart = null
let deviceTypeChart = null
let deviceStatusObserver = null
let alarmTrendObserver = null
let deviceTypeObserver = null
let refreshTimer = null

const handleStatusTabChange = (key) => {
  if (activeStatusTab.value === key) return
  activeStatusTab.value = key
}

const toggleAlarmDropdown = () => {
  alarmDropdownVisible.value = !alarmDropdownVisible.value
}

const handleAlarmRangeSelect = (value) => {
  selectedAlarmRange.value = value
  alarmDropdownVisible.value = false
}

const getTotalByStatus = (list) => list.reduce((sum, item) => sum + Number(item.count || 0), 0)

const updateDeviceStatusChart = () => {
  if (!deviceStatusChart) return
  const list = deviceStatusList.value
  const total = getTotalByStatus(list)
  deviceStatusChart.setOption({
    color: ['#20d6a4', '#f3b23e', '#ff5b5b'],
    tooltip: {
      trigger: 'item',
      formatter: '{b}<br/>{c}台 ({d}%)'
    },
    legend: {
      show: true,
      orient: 'vertical',
      right: 8,
      top: 'middle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: {
        color: '#d8f6ff',
        fontSize: 12
      }
    },
    series: [
      {
        name: '设备在线状态',
        type: 'pie',
        radius: ['58%', '76%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: 'center',
          formatter: `{value|${total}}\n{name|总数}`,
          rich: {
            value: {
              color: '#ffffff',
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 28
            },
            name: {
              color: '#9fc8d9',
              fontSize: 12,
              lineHeight: 18
            }
          }
        },
        labelLine: {
          show: false
        },
        data: list.map((item) => ({ name: item.name, value: item.count }))
      }
    ]
  }, true)
}

const updateAlarmTrendChart = () => {
  if (!alarmTrendChart) return
  const data = alarmTrendMap[selectedAlarmRange.value] || alarmTrendMap.today
  alarmTrendChart.setOption({
    color: ['#f3b23e', '#ff5b5b'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(5, 23, 38, 0.92)',
      borderColor: 'rgba(71, 187, 255, 0.45)',
      borderWidth: 1,
      textStyle: {
        color: '#e8fbff',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(120, 214, 255, 0.45)',
          type: 'dashed'
        }
      }
    },
    legend: {
      show: true,
      top: 2,
      right: 8,
      itemWidth: 10,
      itemHeight: 6,
      textStyle: {
        color: '#d8f6ff',
        fontSize: 12
      },
      data: ['预警', '故障']
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
      data: data.xAxis,
      axisLine: {
        lineStyle: {
          color: 'rgba(136, 201, 226, 0.36)'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#9fc8d9',
        fontSize: 11
      }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: 'rgba(136, 201, 226, 0.16)',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#9fc8d9',
        fontSize: 11
      }
    },
    series: [
      {
        name: '预警',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.warning,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(243, 178, 62, 0.32)' },
            { offset: 1, color: 'rgba(243, 178, 62, 0.02)' }
          ])
        }
      },
      {
        name: '故障',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.fault,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 91, 91, 0.28)' },
            { offset: 1, color: 'rgba(255, 91, 91, 0.02)' }
          ])
        }
      }
    ]
  }, true)
}

const updateDeviceTypeChart = () => {
  if (!deviceTypeChart) return
  deviceTypeChart.setOption({
    color: ['#34d8ff', '#20d6a4', '#f3b23e', '#8d7cff'],
    tooltip: {
      trigger: 'item',
      formatter: '{b}<br/>{c}台 ({d}%)'
    },
    legend: {
      show: true,
      orient: 'vertical',
      right: 4,
      top: 'middle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: {
        color: '#d8f6ff',
        fontSize: 12
      }
    },
    series: [
      {
        name: '设备类型分布',
        type: 'pie',
        radius: ['48%', '70%'],
        center: ['38%', '50%'],
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        data: [
          { name: '视频监控', value: 936 },
          { name: '环境传感', value: 682 },
          { name: '通信设备', value: 508 },
          { name: '供电设备', value: 360 }
        ]
      }
    ]
  }, true)
}

const observeChartContainer = (chartRef, currentChartGetter, chartSetter, observerSetter, updateFn) => {
  if (!chartRef.value) return
  const init = () => {
    if (!chartRef.value || currentChartGetter()) return
    chartSetter(echarts.init(chartRef.value))
    updateFn()
  }
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    init()
    return
  }
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0 && !currentChartGetter()) {
        observer.disconnect()
        init()
      }
    })
    observer.observe(chartRef.value)
    observerSetter(observer)
  }
}

const initDeviceStatusChart = () => {
  observeChartContainer(
    deviceStatusChartRef,
    () => deviceStatusChart,
    (chart) => { deviceStatusChart = chart },
    (observer) => { deviceStatusObserver = observer },
    updateDeviceStatusChart
  )
}

const initAlarmTrendChart = () => {
  observeChartContainer(
    alarmTrendChartRef,
    () => alarmTrendChart,
    (chart) => { alarmTrendChart = chart },
    (observer) => { alarmTrendObserver = observer },
    updateAlarmTrendChart
  )
}

const initDeviceTypeChart = () => {
  observeChartContainer(
    deviceTypeChartRef,
    () => deviceTypeChart,
    (chart) => { deviceTypeChart = chart },
    (observer) => { deviceTypeObserver = observer },
    updateDeviceTypeChart
  )
}

const resizeCharts = () => {
  deviceStatusChart?.resize()
  alarmTrendChart?.resize()
  deviceTypeChart?.resize()
}

const fetchDeviceSummary = async () => {
  if (!componentApi) return
  try {
    const result = await componentApi.getCommonApiFindOne({}, 'deviceMonitorSummary')
    if (!result) return
    overviewStats.value = overviewStats.value.map((item) => ({
      ...item,
      value: result[item.key] ?? item.value
    }))
  } catch (error) {
    console.warn('[monitor] 设备汇总数据获取失败:', error)
  }
}

watch(deviceStatusChartRef, (newRef) => {
  if (newRef && !deviceStatusChart) initDeviceStatusChart()
})

watch(alarmTrendChartRef, (newRef) => {
  if (newRef && !alarmTrendChart) initAlarmTrendChart()
})

watch(deviceTypeChartRef, (newRef) => {
  if (newRef && !deviceTypeChart) initDeviceTypeChart()
})

watch(activeStatusTab, () => {
  updateDeviceStatusChart()
})

watch(selectedAlarmRange, () => {
  updateAlarmTrendChart()
})

onMounted(() => {
  runtimeBuilder?.publishEvent?.('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })

  initDeviceStatusChart()
  initAlarmTrendChart()
  initDeviceTypeChart()
  fetchDeviceSummary()
  window.addEventListener('resize', resizeCharts)

  const interval = Number(businessProps?.dataRefreshInterval ?? 60000)
  if (interval > 0) {
    refreshTimer = window.setInterval(() => {
      fetchDeviceSummary()
      updateDeviceStatusChart()
      updateAlarmTrendChart()
      updateDeviceTypeChart()
    }, interval)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCharts)
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
  deviceStatusObserver?.disconnect()
  alarmTrendObserver?.disconnect()
  deviceTypeObserver?.disconnect()
  deviceStatusChart?.dispose()
  alarmTrendChart?.dispose()
  deviceTypeChart?.dispose()
  deviceStatusChart = null
  alarmTrendChart = null
  deviceTypeChart = null
})
</script>