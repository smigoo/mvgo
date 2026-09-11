<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'

const componentId = 'env-monitor'
const componentProps = ref({})
let runtimeBuilder = null
let businessProps = {}
let componentApi = null

try {
  const builder = typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
    ? window.$mcComponentBuilder({
        componentId,
        componentProps: componentProps.value,
        componentName: componentId
      })
    : (typeof $mcComponentBuilder === 'function'
      ? $mcComponentBuilder({
          componentId,
          componentProps: componentProps.value,
          componentName: componentId
        })
      : null)
  runtimeBuilder = builder?.runtimeBuilder || null
  businessProps = builder?.businessProps || {}
  componentProps.value = builder?.componentProps || {}
  componentApi = builder?.componentApi || null
} catch (error) {
  console.warn('[环境监测] $mcComponentBuilder 初始化失败:', error)
}

const themeClass = computed(() => componentProps.value?.themeType || componentProps.value?.theme || 'dark')

const tabList = [
  { key: 'all', label: '全部', showIcon: true },
  { key: 'temperature', label: '温湿度', showIcon: false },
  { key: 'air', label: '空气', showIcon: false },
  { key: 'noise', label: '噪声', showIcon: false }
]

const timeRanges = [
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' }
]

const activeTab = ref('all')
const activeRange = ref('24h')
const updateTime = ref('更新于 14:30')
const trendChartRef = ref(null)
const qualityChartRef = ref(null)

let trendChart = null
let qualityChart = null
let trendChartObserver = null
let qualityChartObserver = null
let refreshTimer = null

const overviewDataMap = {
  all: [
    { key: 'temperature', label: '平均温度', value: '26.5', unit: '℃', useIcon: true },
    { key: 'humidity', label: '平均湿度', value: '58', unit: '%', useIcon: false },
    { key: 'pm25', label: 'PM2.5', value: '35', unit: 'μg/m³', useIcon: false },
    { key: 'noise', label: '噪声', value: '52', unit: 'dB', useIcon: false }
  ],
  temperature: [
    { key: 'temperature', label: '平均温度', value: '26.5', unit: '℃', useIcon: true },
    { key: 'maxTemperature', label: '最高温度', value: '31.2', unit: '℃', useIcon: false },
    { key: 'humidity', label: '平均湿度', value: '58', unit: '%', useIcon: false },
    { key: 'comfort', label: '舒适指数', value: '82', unit: '', useIcon: false }
  ],
  air: [
    { key: 'pm25', label: 'PM2.5', value: '35', unit: 'μg/m³', useIcon: true },
    { key: 'pm10', label: 'PM10', value: '68', unit: 'μg/m³', useIcon: false },
    { key: 'co2', label: 'CO₂', value: '420', unit: 'ppm', useIcon: false },
    { key: 'aqi', label: 'AQI', value: '48', unit: '', useIcon: false }
  ],
  noise: [
    { key: 'noise', label: '当前噪声', value: '52', unit: 'dB', useIcon: true },
    { key: 'avgNoise', label: '平均噪声', value: '49', unit: 'dB', useIcon: false },
    { key: 'maxNoise', label: '峰值噪声', value: '68', unit: 'dB', useIcon: false },
    { key: 'qualifiedRate', label: '达标率', value: '96', unit: '%', useIcon: false }
  ]
}

const trendDataMap = {
  all: {
    '24h': {
      xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      temperature: [22, 21, 24, 28, 30, 27, 25],
      humidity: [66, 68, 61, 55, 52, 57, 60],
      pm25: [28, 30, 36, 42, 38, 34, 32]
    },
    '7d': {
      xAxis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      temperature: [25, 26, 27, 26, 28, 29, 27],
      humidity: [62, 60, 58, 61, 56, 54, 59],
      pm25: [34, 32, 38, 35, 42, 36, 33]
    },
    '30d': {
      xAxis: ['1日', '5日', '10日', '15日', '20日', '25日', '30日'],
      temperature: [24, 25, 27, 28, 26, 29, 27],
      humidity: [63, 61, 59, 56, 60, 55, 58],
      pm25: [36, 34, 39, 41, 37, 35, 33]
    }
  },
  temperature: {
    '24h': {
      xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      temperature: [22, 21, 24, 28, 30, 27, 25],
      humidity: [66, 68, 61, 55, 52, 57, 60],
      pm25: [28, 30, 36, 42, 38, 34, 32]
    },
    '7d': {
      xAxis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      temperature: [25, 26, 27, 26, 28, 29, 27],
      humidity: [62, 60, 58, 61, 56, 54, 59],
      pm25: [34, 32, 38, 35, 42, 36, 33]
    },
    '30d': {
      xAxis: ['1日', '5日', '10日', '15日', '20日', '25日', '30日'],
      temperature: [24, 25, 27, 28, 26, 29, 27],
      humidity: [63, 61, 59, 56, 60, 55, 58],
      pm25: [36, 34, 39, 41, 37, 35, 33]
    }
  },
  air: {
    '24h': {
      xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      temperature: [24, 23, 25, 27, 29, 26, 25],
      humidity: [64, 66, 62, 59, 55, 58, 61],
      pm25: [30, 31, 38, 45, 40, 36, 34]
    },
    '7d': {
      xAxis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      temperature: [24, 25, 26, 26, 27, 28, 26],
      humidity: [64, 62, 60, 61, 58, 56, 59],
      pm25: [35, 36, 40, 38, 44, 39, 34]
    },
    '30d': {
      xAxis: ['1日', '5日', '10日', '15日', '20日', '25日', '30日'],
      temperature: [24, 24, 26, 27, 26, 28, 26],
      humidity: [64, 63, 61, 58, 60, 57, 59],
      pm25: [37, 35, 41, 43, 39, 36, 34]
    }
  },
  noise: {
    '24h': {
      xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      temperature: [23, 22, 24, 27, 28, 26, 24],
      humidity: [65, 67, 62, 58, 56, 59, 62],
      pm25: [31, 32, 35, 39, 36, 34, 33]
    },
    '7d': {
      xAxis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      temperature: [25, 25, 26, 27, 27, 28, 26],
      humidity: [63, 61, 60, 58, 57, 56, 60],
      pm25: [34, 33, 36, 38, 37, 35, 32]
    },
    '30d': {
      xAxis: ['1日', '5日', '10日', '15日', '20日', '25日', '30日'],
      temperature: [23, 25, 26, 27, 26, 28, 27],
      humidity: [65, 62, 60, 58, 61, 57, 59],
      pm25: [35, 34, 37, 40, 38, 36, 33]
    }
  }
}

const overviewStats = ref(overviewDataMap.all)

const qualityItems = ref([
  { key: 'pm25', name: 'PM2.5', value: '35 μg/m³', status: '良', statusClass: 'c-env-monitor-quality-status-good' },
  { key: 'pm10', name: 'PM10', value: '68 μg/m³', status: '良', statusClass: 'c-env-monitor-quality-status-good' },
  { key: 'co2', name: 'CO₂', value: '420 ppm', status: '正常', statusClass: 'c-env-monitor-quality-status-normal' },
  { key: 'o2', name: 'O₂', value: '20.9%', status: '正常', statusClass: 'c-env-monitor-quality-status-normal' }
])

const alertList = ref([
  {
    id: 'alert-1',
    name: '温度偏高',
    desc: '西侧监测点温度接近阈值',
    time: '14:20',
    levelClass: 'c-env-monitor-alert-warning'
  },
  {
    id: 'alert-2',
    name: '空气质量波动',
    desc: 'PM2.5 指数短时上升',
    time: '13:48',
    levelClass: 'c-env-monitor-alert-info'
  },
  {
    id: 'alert-3',
    name: '噪声正常',
    desc: '当前区域噪声处于标准范围',
    time: '13:15',
    levelClass: 'c-env-monitor-alert-normal'
  }
])

const getCurrentTrendData = () => {
  const tabData = trendDataMap[activeTab.value] || trendDataMap.all
  return tabData[activeRange.value] || tabData['24h']
}

const updateTrendChart = () => {
  if (!trendChart) return
  const data = getCurrentTrendData()
  trendChart.setOption({
    color: ['#19d6ff', '#31d98b', '#ffb84d'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(6, 22, 38, 0.92)',
      borderColor: 'rgba(25, 214, 255, 0.45)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      axisPointer: {
        type: 'line',
        lineStyle: { color: 'rgba(25, 214, 255, 0.45)', width: 1 }
      }
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 6,
      textStyle: { color: 'rgba(255, 255, 255, 0.78)', fontSize: 12 },
      data: ['温度', '湿度', 'PM2.5']
    },
    grid: {
      left: 8,
      right: 8,
      top: 34,
      bottom: 4,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.xAxis,
      axisLine: { lineStyle: { color: 'rgba(125, 206, 255, 0.32)' } },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(255, 255, 255, 0.62)', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      axisLabel: { color: 'rgba(255, 255, 255, 0.62)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(125, 206, 255, 0.16)', type: 'dashed' } }
    },
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: data.temperature,
        lineStyle: { width: 2 },
        areaStyle: { color: 'rgba(25, 214, 255, 0.12)' }
      },
      {
        name: '湿度',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: data.humidity,
        lineStyle: { width: 2 },
        areaStyle: { color: 'rgba(49, 217, 139, 0.10)' }
      },
      {
        name: 'PM2.5',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: data.pm25,
        lineStyle: { width: 2 },
        areaStyle: { color: 'rgba(255, 184, 77, 0.10)' }
      }
    ]
  }, true)
}

const updateQualityChart = () => {
  if (!qualityChart) return
  qualityChart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(6, 22, 38, 0.92)',
      borderColor: 'rgba(25, 214, 255, 0.45)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 }
    },
    series: [
      {
        name: '空气质量',
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '86%',
        center: ['50%', '54%'],
        progress: {
          show: true,
          roundCap: true,
          width: 10,
          itemStyle: { color: '#19d6ff' }
        },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 10,
            color: [[1, 'rgba(125, 206, 255, 0.16)']]
          }
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        title: {
          show: true,
          offsetCenter: [0, '30%'],
          color: 'rgba(255, 255, 255, 0.68)',
          fontSize: 12
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '-8%'],
          color: '#ffffff',
          fontSize: 24,
          fontWeight: 600,
          formatter: '{value}'
        },
        data: [{ value: 86, name: '优良率' }]
      }
    ]
  }, true)
}

const initTrendChart = () => {
  if (!trendChartRef.value) return
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

const initQualityChart = () => {
  if (!qualityChartRef.value) return
  const { clientWidth, clientHeight } = qualityChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    qualityChart = echarts.init(qualityChartRef.value)
    updateQualityChart()
    return
  }
  qualityChartObserver?.disconnect()
  qualityChartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !qualityChart) {
      qualityChartObserver?.disconnect()
      qualityChart = echarts.init(qualityChartRef.value)
      updateQualityChart()
    }
  })
  qualityChartObserver.observe(qualityChartRef.value)
}

const handleResize = () => {
  trendChart?.resize()
  qualityChart?.resize()
}

const updateTimeText = () => {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  updateTime.value = `更新于 ${hours}:${minutes}`
}

const fetchMonitorData = async () => {
  updateTimeText()
  if (!componentApi) return
  try {
    const result = await componentApi.getCommonApiFindOne({}, 'envMonitorData')
    if (!result) return
    if (Array.isArray(result.overviewStats)) overviewStats.value = result.overviewStats
    if (Array.isArray(result.qualityItems)) qualityItems.value = result.qualityItems
    if (Array.isArray(result.alertList)) alertList.value = result.alertList
    updateTrendChart()
    updateQualityChart()
  } catch (error) {
    console.warn('[环境监测] 获取监测数据失败:', error)
  }
}

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
  overviewStats.value = overviewDataMap[key] || overviewDataMap.all
}

const handleRangeChange = (key) => {
  if (activeRange.value === key) return
  activeRange.value = key
}

watch(trendChartRef, (newRef) => {
  if (newRef && !trendChart) initTrendChart()
})

watch(qualityChartRef, (newRef) => {
  if (newRef && !qualityChart) initQualityChart()
})

watch(activeTab, () => {
  updateTrendChart()
})

watch(activeRange, () => {
  updateTrendChart()
})

onMounted(() => {
  runtimeBuilder?.publishEvent('env-monitor-onload', {
    componentId,
    timestamp: Date.now()
  })
  initTrendChart()
  initQualityChart()
  fetchMonitorData()
  window.addEventListener('resize', handleResize)
  refreshTimer = window.setInterval(fetchMonitorData, Number(businessProps?.dataRefreshInterval ?? 60000))
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
  trendChart?.dispose()
  qualityChart?.dispose()
  trendChart = null
  qualityChart = null
  trendChartObserver?.disconnect()
  qualityChartObserver?.disconnect()
})
</script>