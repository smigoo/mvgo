<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 资源变量声明（系统会自动注入实际值）
const bg1 = ref(null)
const bgm_3 = ref(null)

// 图表引用
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 图例状态
const legendState = ref({
  beijing: true,
  shanghai: true
})

// 图表数据
const chartData = ref({
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [350, 500, 420, 480, 580, 720, 880, 1000, 825, 800, 720, 600, 450],
  shanghai: [320, 480, 400, 450, 600, 750, 920, 1050, 831, 850, 780, 650, 480]
})

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '北京方向' ? 'beijing' : 'shanghai'
  legendState.value[key] = !legendState.value[key]
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
      textStyle: { color: '#333', fontSize: 12 },
      formatter: (params) => {
        const hour = params[0].name
        let result = `${hour}时<br/>`
        params.forEach(item => {
          result += `${item.seriesName} ${item.value}车<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      show: false // 使用自定义图例
    },
    grid: {
      left: 50,
      right: 20,
      top: 20,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.value.xAxis,
      name: '时',
      nameTextStyle: { fontSize: 12, color: '#666' },
      axisLabel: { show: true, fontSize: 12, color: '#666' },
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
        name: '北京方向',
        type: 'bar',
        data: chartData.value.beijing,
        itemStyle: { color: '#1890ff' },
        barWidth: 8,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#ff9800',
            type: 'dashed',
            width: 2
          },
          data: [{ yAxis: 3000, label: { show: true, position: 'end', formatter: '建议分流' } }]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: chartData.value.shanghai,
        itemStyle: { color: '#ff9800' },
        barWidth: 8
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
