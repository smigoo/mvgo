<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 资源变量声明（系统会自动注入实际值）
const bg3 = ref(null)
const bg4 = ref(null)
const bg5 = ref(null)
const bgm_4 = ref(null)

// 图表引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let tunnelChartObserver = null
let bridgeChartObserver = null

// 车型统计数据
const vehicleData = ref({
  tunnel: {
    passenger: 22350,
    freight: 16270
  },
  bridge: {
    passenger: 66109,
    freight: 16270
  }
})

// 更新隧道图表
const updateTunnelChart = () => {
  if (!tunnelChart) return
  
  const { passenger, freight } = vehicleData.value.tunnel
  const total = passenger + freight
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: passenger, name: '客车', itemStyle: { color: '#1890ff' } },
          { value: freight, name: '货车', itemStyle: { color: '#ff9800' } }
        ]
      }
    ]
  }
  
  tunnelChart.setOption(option, true)
}

// 更新大桥图表
const updateBridgeChart = () => {
  if (!bridgeChart) return
  
  const { passenger, freight } = vehicleData.value.bridge
  const total = passenger + freight
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: passenger, name: '客车', itemStyle: { color: '#1890ff' } },
          { value: freight, name: '货车', itemStyle: { color: '#ff9800' } }
        ]
      }
    ]
  }
  
  bridgeChart.setOption(option, true)
}

// 初始化隧道图表
const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  
  const { clientWidth, clientHeight } = tunnelChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    tunnelChart = echarts.init(tunnelChartRef.value)
    updateTunnelChart()
    return
  }
  
  tunnelChartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !tunnelChart) {
      tunnelChartObserver?.disconnect()
      tunnelChart = echarts.init(tunnelChartRef.value)
      updateTunnelChart()
    }
  })
  tunnelChartObserver.observe(tunnelChartRef.value)
}

// 初始化大桥图表
const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  
  const { clientWidth, clientHeight } = bridgeChartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    bridgeChart = echarts.init(bridgeChartRef.value)
    updateBridgeChart()
    return
  }
  
  bridgeChartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !bridgeChart) {
      bridgeChartObserver?.disconnect()
      bridgeChart = echarts.init(bridgeChartRef.value)
      updateBridgeChart()
    }
  })
  bridgeChartObserver.observe(bridgeChartRef.value)
}

// 监听 chartRef
watch(tunnelChartRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})

watch(bridgeChartRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

// 窗口大小变化处理
const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
}

onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  tunnelChartObserver?.disconnect()
  bridgeChartObserver?.disconnect()
})
</script>
