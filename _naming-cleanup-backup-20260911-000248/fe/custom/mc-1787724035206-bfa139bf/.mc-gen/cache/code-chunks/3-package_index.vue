<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// ==================== Tab 切换配置 ====================
const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
]

const activeTab = ref('co')

// 各监测指标对应的系列名称与演示数据（面积图趋势：14-18 时轻微隆起）
const seriesConfig = {
  co: {
    name: 'zk3+785CO浓度',
    data: [8, 6, 10, 15, 18, 22, 28, 32, 26, 20, 14, 10]
  },
  visibility: {
    name: '能见度',
    data: [28, 26, 22, 18, 16, 14, 12, 14, 18, 24, 30, 35]
  },
  lighting: {
    name: '洞内照明',
    data: [22, 20, 18, 16, 14, 12, 10, 8, 10, 14, 18, 22]
  },
  outdoor: {
    name: '洞外光强',
    data: [2, 4, 10, 20, 32, 38, 40, 36, 26, 14, 6, 2]
  }
}

// X 轴时间刻度（2-24 时）
const xAxisData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// ==================== 图例状态与切换 ====================
const legendState = ref({ co: true })

const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  legendState.value.co = !legendState.value.co
}

// ==================== ECharts 图表 ====================
const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
  const current = seriesConfig[activeTab.value]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#E5E6EB',
      borderWidth: 1,
      padding: [6, 10, 6, 10],
      textStyle: {
        color: '#1D2129',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: '#00B42A',
          opacity: 0.4
        }
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    legend: {
      show: false,
      data: [current.name]
    },
    grid: {
      left: 46,
      right: 16,
      top: 20,
      bottom: 24,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData,
      axisLine: {
        lineStyle: { color: '#C9CDD4' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#86909C',
        fontSize: 10,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#86909C',
        fontSize: 10,
        align: 'right',
        padding: [0, 0, 0, -36]
      },
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: 'rgba(201, 205, 212, 0.4)',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#86909C',
        fontSize: 10
      }
    },
    series: [
      {
        name: current.name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: current.data,
        lineStyle: {
          color: '#00B42A',
          width: 2
        },
        itemStyle: {
          color: '#00B42A'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 180, 42, 0.25)' },
              { offset: 1, color: 'rgba(0, 180, 42, 0.02)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            formatter: '预警线',
            color: '#F53F3F',
            fontSize: 10,
            position: 'right'
          },
          lineStyle: {
            type: 'dashed',
            color: '#F53F3F',
            width: 1
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  }

  chart.setOption(option, true)

  // 恢复图例可见状态（setOption 重置后重新应用）
  if (!legendState.value.co) {
    chart.dispatchAction({ type: 'legendToggleSelect', name: current.name })
  }
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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// ==================== Tab 切换 ====================
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

// 监听 Tab 变化：更新图表数据并重置图例状态
watch(activeTab, () => {
  legendState.value.co = true
  updateChart()
})

// ==================== 窗口缩放 ====================
const handleResize = () => {
  if (chart) chart.resize()
}

// ==================== 生命周期 ====================
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)

  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>