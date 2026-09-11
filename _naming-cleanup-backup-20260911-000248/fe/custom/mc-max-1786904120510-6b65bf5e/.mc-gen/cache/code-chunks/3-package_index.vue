<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// --- 框架运行器初始化
let runtimeBuilder = null
let componentProps = {}
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-device-monitor] $mcComponentBuilder 初始化失败:', e)
}

const componentId = 'c-device-monitor'

// --- 资源图标安全获取
const emptyIcon = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
const kpiIcon1 = typeof icon1 !== 'undefined' && icon1 ? icon1 : emptyIcon
const kpiIcon2 = typeof icon2 !== 'undefined' && icon2 ? icon2 : emptyIcon
const kpiIcon3 = typeof icon3 !== 'undefined' && icon3 ? icon3 : emptyIcon
const kpiIcon4 = typeof icon4 !== 'undefined' && icon4 ? icon4 : emptyIcon
const deviceIcon1 = typeof icon5 !== 'undefined' && icon5 ? icon5 : kpiIcon1
const deviceIcon2 = typeof icon6 !== 'undefined' && icon6 ? icon6 : kpiIcon4
const deviceIcon3 = typeof icon7 !== 'undefined' && icon7 ? icon7 : kpiIcon2
const deviceIcon4 = typeof icon8 !== 'undefined' && icon8 ? icon8 : kpiIcon3
const deviceIcon5 = typeof icon9 !== 'undefined' && icon9 ? icon9 : kpiIcon1
const deviceIcon6 = typeof icon10 !== 'undefined' && icon10 ? icon10 : kpiIcon2

// --- KPI 卡片数据
const kpiList = ref([
  {
    key: 'online',
    label: '在线设备',
    value: '128',
    unit: '台',
    trendText: '+12',
    status: 'normal',
    icon: kpiIcon1
  },
  {
    key: 'offline',
    label: '离线设备',
    value: '6',
    unit: '台',
    trendText: '-2',
    status: 'normal',
    icon: kpiIcon2
  },
  {
    key: 'alarm',
    label: '告警设备',
    value: '3',
    unit: '台',
    trendText: '-1',
    status: 'alert',
    icon: kpiIcon3
  },
  {
    key: 'total',
    label: '设备总数',
    value: '134',
    unit: '台',
    trendText: '+15',
    status: 'normal',
    icon: kpiIcon4
  }
])

// --- 设备运行状态列表
const deviceList = ref([
  {
    id: 'dev-01',
    name: '隧道射流风机',
    code: 'FJ-01',
    location: '隧道东段',
    metric: '23.4 m/s',
    status: 'running',
    statusText: '运行中',
    icon: deviceIcon1
  },
  {
    id: 'dev-02',
    name: 'LED 照明',
    code: 'ZM-02',
    location: '隧道西段',
    metric: '82.1 lx',
    status: 'running',
    statusText: '运行中',
    icon: deviceIcon2
  },
  {
    id: 'dev-03',
    name: '消防水泵',
    code: 'SB-03',
    location: '隧道中部',
    metric: '0.62 MPa',
    status: 'alarm',
    statusText: '告警',
    icon: deviceIcon3
  },
  {
    id: 'dev-04',
    name: '视频监控',
    code: 'JK-04',
    location: '隧道入口',
    metric: '1080P',
    status: 'offline',
    statusText: '离线',
    icon: deviceIcon4
  },
  {
    id: 'dev-05',
    name: '环境检测器',
    code: 'HC-05',
    location: '隧道西段',
    metric: 'CO 12ppm',
    status: 'running',
    statusText: '运行中',
    icon: deviceIcon5
  },
  {
    id: 'dev-06',
    name: '应急电话',
    code: 'YJ-06',
    location: '隧道中段',
    metric: '在线',
    status: 'running',
    statusText: '运行中',
    icon: deviceIcon6
  }
])

// --- 监测趋势图表数据
const trendChartRef = ref(null)
let trendChart = null
let trendChartObserver = null
let refreshTimer = null

const trendLabels = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
const onlineSeries = ref([42, 45, 43, 48, 52, 58, 61, 63, 60, 57, 53, 49])
const alarmSeries = ref([3, 2, 4, 3, 2, 5, 4, 3, 2, 4, 3, 2])

// --- 图表 Option 更新
const updateTrendChart = () => {
  if (!trendChart) return

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      }
    },
    legend: {
      data: ['在线设备', '告警设备'],
      top: 0,
      textStyle: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 12
      }
    },
    grid: {
      left: 10,
      right: 16,
      top: 36,
      bottom: 8,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trendLabels,
      axisLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.2)' }
      },
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 11
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 11
      },
      splitLine: {
        lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    },
    series: [
      {
        name: '在线设备',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: onlineSeries.value,
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.25)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.02)' }
            ]
          }
        }
      },
      {
        name: '告警设备',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: alarmSeries.value,
        lineStyle: { color: '#ff4d4f', width: 2 },
        itemStyle: { color: '#ff4d4f' }
      }
    ]
  }

  trendChart.setOption(option, true)
}

// --- 图表初始化
const initTrendChart = () => {
  if (!trendChartRef.value) return

  const { clientWidth, clientHeight } = trendChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    if (!trendChart) {
      trendChart = echarts.init(trendChartRef.value)
    }
    updateTrendChart()
    return
  }

  if (!trendChartObserver) {
    trendChartObserver = new ResizeObserver((entries) => {
      const entry = entries && entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0 && !trendChart) {
        trendChartObserver?.disconnect()
        trendChartObserver = null
        trendChart = echarts.init(trendChartRef.value)
        updateTrendChart()
      }
    })
    trendChartObserver.observe(trendChartRef.value)
  }
}

// --- 窗口 resize 处理
const handleResize = () => {
  if (trendChart) {
    trendChart.resize()
  }
}

// --- 模拟实时数据刷新
const refreshMockData = () => {
  onlineSeries.value = trendLabels.map(() => 45 + Math.round(Math.random() * 18))
  alarmSeries.value = trendLabels.map(() => Math.max(1, Math.round(Math.random() * 6)))

  const onlineKpi = kpiList.value.find((item) => item.key === 'online')
  const offlineKpi = kpiList.value.find((item) => item.key === 'offline')
  const alarmKpi = kpiList.value.find((item) => item.key === 'alarm')
  const totalKpi = kpiList.value.find((item) => item.key === 'total')

  const onlineCount = 120 + Math.round(Math.random() * 15)
  const alarmCount = Math.round(1 + Math.random() * 5)
  const offlineCount = Math.round(Math.random() * 8)
  const totalCount = onlineCount + alarmCount + offlineCount

  if (onlineKpi) onlineKpi.value = String(onlineCount)
  if (offlineKpi) offlineKpi.value = String(offlineCount)
  if (alarmKpi) alarmKpi.value = String(alarmCount)
  if (totalKpi) totalKpi.value = String(totalCount)

  const runningMetricPool = ['23.4 m/s', '23.8 m/s', '24.1 m/s', '23.6 m/s']
  const alarmMetricPool = ['0.61 MPa', '0.58 MPa', '0.63 MPa', '0.60 MPa']

  deviceList.value = deviceList.value.map((device) => {
    if (device.status === 'running') {
      return {
        ...device,
        metric: runningMetricPool[Math.floor(Math.random() * runningMetricPool.length)]
      }
    }
    if (device.status === 'alarm') {
      return {
        ...device,
        metric: alarmMetricPool[Math.floor(Math.random() * alarmMetricPool.length)]
      }
    }
    return device
  })

  updateTrendChart()
}

// --- onload 事件发布
const publishLoadEvent = () => {
  if (!runtimeBuilder) return
  try {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId,
      timestamp: Date.now()
    })
  } catch (e) {
    console.warn('[c-device-monitor] onload 事件发布失败:', e)
  }
}

watch(trendChartRef, (newRef) => {
  if (newRef && !trendChart) {
    initTrendChart()
  }
})

onMounted(() => {
  initTrendChart()
  publishLoadEvent()

  // 模拟实时数据刷新
  refreshTimer = setInterval(refreshMockData, 30000)

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }

  window.removeEventListener('resize', handleResize)

  if (trendChartObserver) {
    trendChartObserver.disconnect()
    trendChartObserver = null
  }

  if (trendChart) {
    trendChart.dispose()
    trendChart = null
  }
})
</script>