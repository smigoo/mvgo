<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-header-right">
        <!-- Tab切换栏 -->
        <div class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-tabs" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"><img :src="icon2" class="auto-mounted-icon" alt="icon" /><img :src="icon1" class="auto-mounted-icon" alt="icon" />
          <div
            v-for="tab in tabs"
            :key="tab.key"
            :class="['c-env-monitor-tab-item', { active: activeTab === tab.key }]"
            @click="activeTab = tab.key"
           :style="activeTab === tab.key ? { backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
            {{ tab.label }}
          </div>
        </div>

        <!-- 右侧控件区 -->
        <div class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-controls">
          <img class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-icon" />
          <img class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-icon" />
          <div class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-badge">8</div>
          <span class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-stat-text">2k3+78560×威</span>
        </div>
      </div>
    </template>

    <!-- 主内容区 -->
    <div class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-root">
      <div class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-chart-section">
        <div class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-threshold-label">阈值线</div>
        <div ref="chartRef" class="c-mc-max-1787927895814-2a5ea8f4-c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-7890.png'
import icon2 from '../resources/images/icon-7945.png'
import icon1 from '../resources/images/icon-7941.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'


// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 切换状态
const tabs = ref([
  { key: 'co', label: '气化版' },
  { key: 'visibility', label: '能见度' },
  { key: 'lighting', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])
const activeTab = ref('co')

// 图表引用
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据（按24小时生成）
const generateChartData = () => {
  const hours = Array.from({ length: 25 }, (_, i) => i)
  const data = hours.map(() => Math.floor(Math.random() * 20) + 10)
  return { hours, data }
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const { hours, data } = generateChartData()
  
  chart.setOption({
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
      data: hours.map(h => h),
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        interval: 1
      },
      axisLine: {
        lineStyle: { color: 'rgba(237,244,251,0.2)' }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(237,244,251,0.2)',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: data,
        smooth: true,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,197,255,0.3)' },
              { offset: 1, color: 'rgba(0,197,255,0.05)' }
            ]
          }
        },
        lineStyle: {
          color: 'rgba(0,197,255,1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(0,197,255,1)'
        }
      }
    ],
    graphic: [
      {
        type: 'line',
        shape: {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0
        },
        style: {
          stroke: '#f53f3f',
          lineWidth: 2,
          lineDash: [5, 5]
        },
        z: 100
      }
    ]
  }, true)
  
  // 绘制阈值线（Y=30）
  setTimeout(() => {
    if (!chart) return
    const yAxis = chart.getModel().getComponent('yAxis')
    const gridRect = chart.getModel().getComponent('grid').coordinateSystem.getRect()
    const y30 = gridRect.y + gridRect.height * (1 - 30 / 40)
    
    chart.setOption({
      graphic: [
        {
          type: 'line',
          shape: {
            x1: gridRect.x,
            y1: y30,
            x2: gridRect.x + gridRect.width,
            y2: y30
          },
          style: {
            stroke: '#f53f3f',
            lineWidth: 2,
            lineDash: [5, 5]
          },
          z: 100
        }
      ]
    })
  }, 100)
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

// 监听 Tab 切换
watch(activeTab, () => {
  updateChart()
})

// 窗口 resize 处理
const handleResize = () => {
  if (chart) chart.resize()
}

// 生命周期
onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  // 发布 onload 事件
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>