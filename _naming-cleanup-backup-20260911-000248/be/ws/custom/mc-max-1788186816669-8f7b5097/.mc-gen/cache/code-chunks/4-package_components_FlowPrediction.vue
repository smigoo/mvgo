<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 图表引用
const chartRef = ref(null)
let chart = null
let chartObserver = null

// Tab 状态
const activeTab = ref(0)
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 0 },
  { label: '江阴大桥', value: 1 }
])

// 图表数据
const chartData = ref({
  xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
  actual: [2800, 3200, 3500, null, null],
  predict: [null, null, 3500, 3600, 3400],
  accuracy: ['准确率98%', '准确率96%', '准确率92%']
})

// 切换 Tab
const handleTabChange = (index) => {
  activeTab.value = index
  updateChart()
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.1)',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 10,
      right: 20,
      itemWidth: 14,
      itemHeight: 6,
      textStyle: { fontSize: 12, color: '#666' }
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 50,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.xAxis,
      axisLabel: { 
        show: true, 
        fontSize: 12, 
        color: '#666',
        formatter: (value, index) => {
          const accuracy = chartData.value.accuracy[index]
          return `{value|${value}}\n{accuracy|${accuracy || ''}}`
        },
        rich: {
          value: { fontSize: 12, color: '#666' },
          accuracy: { fontSize: 12, color: '#52c41a', padding: [5, 0, 0, 0] }
        }
      },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: '#ddd' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameTextStyle: { fontSize: 12, color: '#666' },
      axisLabel: { show: true, fontSize: 12, color: '#666' },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: '#ddd' } },
      splitLine: { lineStyle: { color: '#f0f0f0' } }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: chartData.value.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#fff', borderColor: '#3385ff', borderWidth: 2 },
        lineStyle: { color: '#3385ff', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: chartData.value.predict,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#fff', borderColor: '#00cccc', borderWidth: 2 },
        lineStyle: { color: '#00cccc', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.05)' }
            ]
          }
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 初始化图表
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

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 窗口大小变化处理
const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>
