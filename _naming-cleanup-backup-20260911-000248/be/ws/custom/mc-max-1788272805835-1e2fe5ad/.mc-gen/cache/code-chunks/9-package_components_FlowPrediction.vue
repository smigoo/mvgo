<template>
  <div class="c-monitor-flow-prediction">
    <!-- 标题栏 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-group">
        <img :src="icon3" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-section-title">流量预测</span>
      </div>
      
      <!-- Tab 切换 -->
      <div class="c-monitor-location-tabs">
        <div
          v-for="tab in locationTabs"
          :key="tab.value"
          :class="['c-monitor-location-tab', { active: activeLocation === tab.value }]"
          @click="handleLocationChange(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>
      
      <!-- 节假日预测链接 -->
      <a class="c-monitor-holiday-link" href="javascript:void(0)">节假日预测</a>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-chart-body" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% auto', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }">
      <!-- 自定义图例 -->
      <div class="c-monitor-chart-legend">
        <span
          :class="['c-monitor-legend-item', { active: legendState.actual }]"
          @click="toggleLegend('实际流量')"
        >
          <i class="c-monitor-legend-dot actual"></i>实际流量
        </span>
        <span
          :class="['c-monitor-legend-item', { active: legendState.predicted }]"
          @click="toggleLegend('预测流量')"
        >
          <i class="c-monitor-legend-dot predicted"></i>预测流量
        </span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="c-monitor-chart-container"></div>

      <!-- 准确率标签 -->
      <div class="c-monitor-accuracy-labels">
        <span class="c-monitor-accuracy-label">准确率98%</span>
        <span class="c-monitor-accuracy-label">准确率96%</span>
        <span class="c-monitor-accuracy-label">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 接收父组件传入的资源
const props = defineProps({
  bg5: { type: String, default: '' },
  icon3: { type: String, default: '' }
})

const { bg5, icon3 } = props

// Tab 选项
const locationTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 当前选中的地点
const activeLocation = ref('tunnel')

// 图例状态
const legendState = ref({ actual: true, predicted: true })

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 模拟数据
const mockData = {
  tunnel: {
    actual: [3200, 3500, 3800, 4100, 4300],
    predicted: [3300, 3600, 3900, 4200, 4400]
  },
  bridge: {
    actual: [2800, 3100, 3400, 3700, 3900],
    predicted: [2900, 3200, 3500, 3800, 4000]
  }
}

// 切换地点
const handleLocationChange = (value) => {
  if (activeLocation.value === value) return
  activeLocation.value = value
  updateChart()
}

// 切换图例
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  const key = name === '实际流量' ? 'actual' : 'predicted'
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = mockData[activeLocation.value]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: (params) => {
        let result = params[0].name + '<br/>'
        params.forEach(p => {
          result += `${p.seriesName}: ${p.value} 辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      show: false
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12
      },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(51, 51, 51, 0.2)' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 5000,
      axisLabel: {
        show: true,
        color: 'rgba(51, 51, 51, 0.65)',
        fontSize: 12,
        formatter: '{value}'
      },
      axisTick: { show: true },
      axisLine: { lineStyle: { color: 'rgba(51, 51, 51, 0.2)' } },
      splitLine: { lineStyle: { color: 'rgba(51, 51, 51, 0.1)' } },
      name: '辆',
      nameTextStyle: { color: 'rgba(51, 51, 51, 0.65)', fontSize: 12 }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#3385ff', borderColor: '#3385ff', borderWidth: 1 },
        lineStyle: { color: '#3385ff', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
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
        data: data.predicted,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#00cccc', borderColor: '#00cccc', borderWidth: 1 },
        lineStyle: { color: '#00cccc', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.05)' }
            ]
          }
        },
        markLine: {
          data: [{ xAxis: 2, name: '当前时间' }],
          lineStyle: { color: '#5bbbef', width: 1, type: 'solid' },
          label: { show: false }
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

// 窗口大小变化
const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (chart) {
    chart.dispose()
    chart = null
  }
  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-flow-prediction {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-section-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}

.c-monitor-location-tabs {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.c-monitor-location-tab {
  padding: 6px 16px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  background: #6680a0;
  border: 0.73px solid rgba(172, 196, 225, 1);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(25, 144, 255, 0.8);
  }

  &.active {
    background: #1990ff;
    border-color: rgba(199, 224, 255, 1);
    color: #ffffff;
  }
}

.c-monitor-holiday-link {
  font-size: 12px;
  color: #1990ff;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
}

.c-monitor-chart-body {
  flex: 200 1 0;
  min-height: 160px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}

.c-monitor-chart-legend {
  display: flex;
  gap: 20px;
  margin-bottom: 12px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #333333;
  cursor: pointer;
  transition: opacity 0.3s;

  &:not(.active) {
    opacity: 0.4;
  }
}

.c-monitor-legend-dot {
  width: 14px;
  height: 2px;
  position: relative;
  flex-shrink: 0;

  &.actual {
    background: #3385ff;
  }

  &.predicted {
    background: #00cccc;
  }

  &::after {
    content: '';
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: inherit;
  }
}

.c-monitor-chart-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.c-monitor-accuracy-labels {
  display: flex;
  gap: 21px;
  justify-content: center;
  margin-top: 8px;
}

.c-monitor-accuracy-label {
  font-size: 12px;
  font-weight: 500;
  color: #333333;
}
</style>
