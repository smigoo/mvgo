<template>
  <div class="c-monitor-forecast-section">
    <!-- 区块标题 -->
    <div class="c-monitor-forecast-header">
      <div class="c-monitor-forecast-title-group">
        <img v-if="iconTitle" :src="iconTitle" class="c-monitor-forecast-icon" alt="icon" />
        <span class="c-monitor-forecast-title">流量预测</span>
      </div>
      
      <div class="c-monitor-forecast-controls">
        <!-- 地点切换Tab -->
        <div class="c-monitor-forecast-tabs">
          <div
            v-for="(tab, index) in locationTabs"
            :key="index"
            :class="['c-monitor-forecast-tab-item', { active: activeLocationIndex === index }]"
            @click="handleLocationChange(index)"
           :style="activeLocationIndex === index ? { backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null">
            {{ tab }}
          </div>
        </div>
        
        <!-- 节假日预测链接 -->
        <a href="javascript:void(0)" class="c-monitor-forecast-link">节假日预测&gt;</a>
      </div>
    </div>

    <!-- 区块内容 -->
    <div class="c-monitor-forecast-body" :style="bodyBackgroundStyle">
      <!-- 图表容器 -->
      <div class="c-monitor-forecast-chart-wrapper">
        <div ref="chartRef" class="c-monitor-forecast-chart-container"></div>
      </div>

      <!-- 准确率指标 -->
      <div class="c-monitor-forecast-accuracy-row">
        <span class="c-monitor-forecast-accuracy-item">准确率98%</span>
        <span class="c-monitor-forecast-accuracy-item">准确率96%</span>
        <span class="c-monitor-forecast-accuracy-item">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-3475.png'
import bg5 from '../../resources/images/bg-3525.png'


import * as echarts from 'echarts'

const props = defineProps({
  iconTitle: { type: String, default: '' }
})

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 选项
const locationTabs = ref(['江阴靖江长江隧道', '江阴大桥'])
const activeLocationIndex = ref(0)

// 图表
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 背景样式（使用 bg5）
const bodyBackgroundStyle = computed(() => {
  // 注意：bg5 需要在父组件中通过 provide 传递，或者直接在这里声明
  // 根据资源归属提示，bg5 应该用于这个区域
  return {
    backgroundImage: `url(${bg5})`,
    backgroundSize: '100% auto',
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat'
  }
})

// 模拟数据
const chartDataMap = {
  0: { // 江阴靖江长江隧道
    xData: ['-2h', '-1.5h', '-1h', '-0.5h', '当前', '0.5h', '1h', '1.5h', '2h'],
    actual: [1200, 1350, 1500, 1680, 1800, null, null, null, null],
    forecast: [null, null, null, null, 1800, 1750, 1650, 1500, 1400]
  },
  1: { // 江阴大桥
    xData: ['-2h', '-1.5h', '-1h', '-0.5h', '当前', '0.5h', '1h', '1.5h', '2h'],
    actual: [2800, 3000, 3200, 3400, 3500, null, null, null, null],
    forecast: [null, null, null, null, 3500, 3400, 3200, 3000, 2800]
  }
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

// 更新图表
const updateChart = () => {
  if (!chart) return
  
  const data = chartDataMap[activeLocationIndex.value]
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      axisPointer: { type: 'cross', lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 10,
      right: 20,
      textStyle: { color: '#333333', fontSize: 12 },
      itemWidth: 20,
      itemHeight: 10
    },
    grid: {
      left: 50,
      right: 20,
      top: 50,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(51, 51, 51, 0.2)' } },
      axisLabel: { color: '#666666', fontSize: 12 },
      axisTick: { show: true, lineStyle: { color: 'rgba(51, 51, 51, 0.2)' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      axisLine: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 },
      axisTick: { show: true },
      splitLine: { lineStyle: { color: 'rgba(51, 51, 51, 0.1)', type: 'dashed' } }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.forecast,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#52c41a', width: 2, type: 'dashed' },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
            ]
          }
        }
      }
    ]
  }
  
  chart.setOption(option, true)
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 地点切换处理
const handleLocationChange = (index) => {
  if (activeLocationIndex.value === index) return
  activeLocationIndex.value = index
  updateChart()
}

// 监听地点切换
watch(activeLocationIndex, () => {
  updateChart()
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

<style lang="less" scoped>
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-monitor-forecast-section {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-forecast-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  height: 32px;
  margin-bottom: 12px;
}

.c-monitor-forecast-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-forecast-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-forecast-title {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
}

.c-monitor-forecast-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-forecast-tabs {
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 4px;
  padding: 2px;
}

.c-monitor-forecast-tab-item {
  padding: 4px 12px;
  font-size: @fontSize;
  color: #666666;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    color: #333333;
  }

  &.active {
    background: #1890ff;
    color: #ffffff;
  }
}

.c-monitor-forecast-link {
  font-size: @fontSize;
  color: #1890ff;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    color: #40a9ff;
  }
}

.c-monitor-forecast-body {
  flex: 174 1 0;
  min-height: 160px;
  overflow: hidden;
}

.c-monitor-forecast-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-forecast-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-forecast-accuracy-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-shrink: 0;
  height: 32px;
  padding: 0 20px;
}

.c-monitor-forecast-accuracy-item {
  font-size: calc(@fontSize * 0.8571);
  color: #52c41a;
  font-weight: 500;
}
</style>