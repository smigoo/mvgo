<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 🔴 $mcComponentBuilder 直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 资源变量（系统自动注入，无需手写 import） ===
// bg1, bg2, bgtabActive, icon1, icon2
// === Tab 切换状态 ===
const tabs = ref(['氨化物', '能见度', '洞内照明', '洞外光强'])
const currentTab = ref(0)
// === 图表状态 ===
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟不同 Tab 对应的数据
const chartDataMap = {
  0: { // 氨化物
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [8, 12, 18, 25, 28, 32, 30, 28, 24, 20, 15, 10]
  },
  1: { // 能见度
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [15, 18, 22, 28, 30, 32, 30, 28, 25, 22, 18, 15]
  },
  2: { // 洞内照明
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [10, 12, 15, 18, 22, 25, 28, 30, 28, 25, 20, 15]
  },
  3: { // 洞外光强
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [5, 8, 12, 18, 25, 30, 35, 32, 28, 22, 15, 10]
  }
}
// === Tab 切换处理 ===
const handleTabChange = (index) => {
  if (currentTab.value === index) return
  currentTab.value = index
  updateChart()
}
// === 更新图表 ===
const updateChart = () => {
  if (!chart) return
  
  const data = chartDataMap[currentTab.value]
  
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
    grid: {
      left: 40,
      right: 16,
      top: 30,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xData,
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    series: [
      {
        type: 'line',
        data: data.yData,
        smooth: true,
        lineStyle: {
          color: '#5dc9a5',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: 'rgba(93, 201, 165, 0.3)'
              },
              {
                offset: 1,
                color: 'rgba(93, 201, 165, 0.05)'
              }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          lineStyle: {
            type: 'dashed',
            color: '#ff6b6b',
            width: 2
          },
          data: [
            {
              yAxis: 30
            }
          ]
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}
// === 初始化图表 ===
const initChart = () => {
  if (!chartRef.value) return
  
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  
  // 使用 ResizeObserver 等待容器就绪
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
// === 监听 chartRef ===
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})
// === 监听 currentTab 变化 ===
watch(currentTab, () => {
  updateChart()
})
// === 窗口 resize 处理 ===
const handleResize = () => {
  if (chart) {
    chart.resize()
  }
}
// === 生命周期 ===
onMounted(() => {
  // 触发 onload 事件
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
  
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>
