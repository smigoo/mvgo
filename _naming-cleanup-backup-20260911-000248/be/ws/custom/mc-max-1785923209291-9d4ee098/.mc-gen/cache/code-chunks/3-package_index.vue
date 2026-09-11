<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 1. 初始化 $mcComponentBuilder
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[mc-max-1785923209291-9d4ee098] $mcComponentBuilder 初始化失败:', e)
}

// 2. 环境指标数据 (icon1~icon4 由系统自动注入，禁止 import)
const envStats = ref([
  { key: 'co', icon: icon1, label: 'CO浓度', value: '12.5', unit: 'ppm' },
  { key: 'vi', icon: icon2, label: '能见度', value: '85.0', unit: 'm' },
  { key: 'temp', icon: icon3, label: '温度', value: '24.5', unit: '℃' },
  { key: 'hum', icon: icon4, label: '湿度', value: '65.0', unit: '%' }
])

// 3. 图表 Tabs 及状态
const chartTabs = ref([
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' }
])
const activeTab = ref('24h')

// 4. 图表模拟数据
const chartDataMap = {
  '24h': {
    xAxis: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    co: [10, 12, 15, 14, 13, 11, 12],
    vi: [80, 85, 90, 88, 85, 82, 85]
  },
  '7d': {
    xAxis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    co: [12, 14, 13, 15, 16, 14, 13],
    vi: [85, 82, 88, 80, 78, 85, 86]
  },
  '30d': {
    xAxis: Array.from({ length: 30 }, (_, i) => `${i + 1}日`),
    co: Array.from({ length: 30 }, () => Math.floor(Math.random() * 10) + 10),
    vi: Array.from({ length: 30 }, () => Math.floor(Math.random() * 20) + 70)
  }
}

// 5. 图表实例相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const data = chartDataMap[activeTab.value]
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff' }
    },
    legend: {
      data: ['CO浓度', '能见度'],
      textStyle: { color: 'rgba(255,255,255,0.8)' },
      top: 0,
      right: 0
    },
    grid: {
      left: 40,
      right: 40,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.6)' }
    },
    yAxis: [
      {
        type: 'value',
        name: 'CO(ppm)',
        nameTextStyle: { color: 'rgba(255,255,255,0.6)' },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: 'rgba(255,255,255,0.6)' }
      },
      {
        type: 'value',
        name: 'VI(m)',
        nameTextStyle: { color: 'rgba(255,255,255,0.6)' },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.6)' }
      }
    ],
    series: [
      {
        name: 'CO浓度',
        type: 'line',
        smooth: true,
        data: data.co,
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.0)' }
            ]
          }
        }
      },
      {
        name: '能见度',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: data.vi,
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.0)' }
            ]
          }
        }
      }
    ]
  }
  chart.setOption(option, true)
}

const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart) {
      chartObserver?.disconnect()
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

// 6. 监听
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

// 7. 生命周期
const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  // 触发 onload 事件
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1785923209291-9d4ee098-onload', {
      componentId: 'mc-max-1785923209291-9d4ee098',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>