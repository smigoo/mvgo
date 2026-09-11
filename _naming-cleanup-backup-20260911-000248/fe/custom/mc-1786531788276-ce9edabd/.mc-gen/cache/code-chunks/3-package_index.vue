<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[c-device-monitor] $mcComponentBuilder 失败:', e)
}

// --- 统计数据 ---
const totalDevices = ref(1250)
const onlineDevices = ref(1180)
const offlineDevices = ref(45)
const faultDevices = ref(25)

// --- 表格配置与数据 ---
const columns = [
  { title: '设备编号', dataIndex: 'deviceId', key: 'deviceId', width: 120 },
  { title: '设备名称', dataIndex: 'deviceName', key: 'deviceName' },
  { title: '设备类型', dataIndex: 'deviceType', key: 'deviceType', width: 120 },
  { title: '运行状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '最后更新时间', dataIndex: 'updateTime', key: 'updateTime', width: 180 }
]

const tableData = ref([
  { key: '1', deviceId: 'CAM-001', deviceName: '入口高清摄像机', deviceType: '视频监控', status: '在线', updateTime: '2023-10-27 10:00:00' },
  { key: '2', deviceId: 'CAM-002', deviceName: '出口高清摄像机', deviceType: '视频监控', status: '在线', updateTime: '2023-10-27 09:55:00' },
  { key: '3', deviceId: 'VMS-001', deviceName: '可变情报板', deviceType: '信息发布', status: '离线', updateTime: '2023-10-26 18:30:00' },
  { key: '4', deviceId: 'WDR-001', deviceName: '气象检测器', deviceType: '环境监测', status: '故障', updateTime: '2023-10-25 14:20:00' },
  { key: '5', deviceId: 'CAM-003', deviceName: '洞内球机', deviceType: '视频监控', status: '在线', updateTime: '2023-10-27 10:05:00' }
])

// --- 设备状态分布图表（环形图） ---
const statusChartRef = ref(null)
let statusChart = null
let statusChartObserver = null

const updateStatusChart = () => {
  if (!statusChart) return
  statusChart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      bottom: 10,
      left: 'center',
      textStyle: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '70%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' }
        },
        data: [
          { value: onlineDevices.value, name: '在线', itemStyle: { color: '#52c41a' } },
          { value: offlineDevices.value, name: '离线', itemStyle: { color: '#faad14' } },
          { value: faultDevices.value, name: '故障', itemStyle: { color: '#ff4d4f' } }
        ]
      }
    ]
  }, true)
}

const initStatusChart = () => {
  if (!statusChartRef.value) return
  const { clientWidth, clientHeight } = statusChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    statusChart = echarts.init(statusChartRef.value)
    updateStatusChart()
    return
  }
  statusChartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !statusChart) {
      statusChartObserver?.disconnect()
      statusChart = echarts.init(statusChartRef.value)
      updateStatusChart()
    }
  })
  statusChartObserver.observe(statusChartRef.value)
}

watch(statusChartRef, (newRef) => {
  if (newRef && !statusChart) initStatusChart()
})

// --- 设备在线趋势图表（折线图） ---
const trendChartRef = ref(null)
let trendChart = null
let trendChartObserver = null

const updateTrendChart = () => {
  if (!trendChart) return
  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#ffffff', fontSize: 12 }
    },
    grid: {
      left: 40,
      right: 20,
      top: 20,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.6)' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.6)' }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        data: [1100, 1050, 1150, 1180, 1190, 1170, 1180],
        areaStyle: { color: 'rgba(24, 144, 255, 0.2)' },
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: { color: '#1890ff' }
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

watch(trendChartRef, (newRef) => {
  if (newRef && !trendChart) initTrendChart()
})

// --- 窗口尺寸变化处理 ---
const handleResize = () => {
  statusChart?.resize()
  trendChart?.resize()
}

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('c-device-monitor-onload', {
      componentId: 'c-device-monitor',
      timestamp: Date.now()
    })
  }
  
  initStatusChart()
  initTrendChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  
  statusChart?.dispose()
  trendChart?.dispose()
  
  statusChartObserver?.disconnect()
  trendChartObserver?.disconnect()
})
</script>