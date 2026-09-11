<template>
  <div class="c-monitor-prediction">
    <!-- 头部区域 -->
    <div class="c-monitor-prediction-header">
      <div class="c-monitor-prediction-title-group">
        <span class="c-monitor-prediction-title">流量预测</span>
        <img :src="icon3" class="c-monitor-prediction-info-icon" alt="信息" />
      </div>
      <div class="c-monitor-prediction-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="['c-monitor-prediction-tab', { 'c-monitor-prediction-tab--active': activeTab === tab.value }]"
          @click="handleTabChange(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="c-monitor-prediction-holiday-btn" @click="handleHolidayPrediction">
        节假日预测
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-prediction-chart-wrapper">
      <div ref="chartRef" class="c-monitor-prediction-chart"></div>
    </div>

    <!-- 图例 -->
    <div class="c-monitor-prediction-legend">
      <span
        :class="['c-monitor-prediction-legend-item', { 'c-monitor-prediction-legend-item--active': legendState.actual }]"
        @click="toggleLegend('实际流量', 'actual')"
      >
        <span class="c-monitor-prediction-legend-line c-monitor-prediction-legend-line--actual"></span>
        <span class="c-monitor-prediction-legend-dot c-monitor-prediction-legend-dot--actual"></span>
        实际流量
      </span>
      <span
        :class="['c-monitor-prediction-legend-item', { 'c-monitor-prediction-legend-item--active': legendState.predicted }]"
        @click="toggleLegend('预测流量', 'predicted')"
      >
        <span class="c-monitor-prediction-legend-line c-monitor-prediction-legend-line--predicted"></span>
        <span class="c-monitor-prediction-legend-dot c-monitor-prediction-legend-dot--predicted"></span>
        预测流量
      </span>
    </div>

    <!-- 时间轴 -->
    <div class="c-monitor-prediction-timeline">
      <div class="c-monitor-prediction-timeline-labels">
        <span class="c-monitor-prediction-timeline-label">2小时前</span>
        <span class="c-monitor-prediction-timeline-label">1小时前</span>
        <span class="c-monitor-prediction-timeline-label">当前时间</span>
        <span class="c-monitor-prediction-timeline-label">1小时后</span>
        <span class="c-monitor-prediction-timeline-label">2小时后</span>
      </div>
      <div class="c-monitor-prediction-timeline-accuracy">
        <span class="c-monitor-prediction-accuracy">准确率98%</span>
        <span class="c-monitor-prediction-accuracy">准确率96%</span>
        <span class="c-monitor-prediction-accuracy">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 配置
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])
const activeTab = ref('tunnel')

// 图例状态
const legendState = ref({ actual: true, predicted: true })

// 图表数据
const dataMap = {
  tunnel: {
    actual: [1200, 1800, 2400, null, null],
    predicted: [1150, 1750, 2350, 2800, 3200]
  },
  bridge: {
    actual: [2800, 3500, 3800, null, null],
    predicted: [2750, 3450, 3750, 3900, 4100]
  }
}

const xLabels = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 切换 Tab
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  updateChart()
}

// 节假日预测按钮
const handleHolidayPrediction = () => {
  runtimeBuilder?.publishEvent?.('holiday-prediction-click', {
    location: activeTab.value,
    timestamp: Date.now()
  })
}

// 切换图例
const toggleLegend = (seriesName, key) => {
  chart?.dispatchAction({ type: 'legendToggleSelect', name: seriesName })
  legendState.value[key] = !legendState.value[key]
}

// 更新图表
const updateChart = () => {
  if (!chart) return
  const data = dataMap[activeTab.value]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.1)',
      borderWidth: 1,
      borderRadius: 4,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let html = `<div style="font-weight:500;margin-bottom:4px">${params[0]?.axisValue || ''}</div>`
        params.forEach((p) => {
          if (p.value !== null && p.value !== undefined) {
            html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
              <span>${p.seriesName}: ${p.value} 辆</span>
            </div>`
          }
        })
        return html
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: 40,
      right: 16,
      top: 12,
      bottom: 24,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      boundaryGap: false,
      axisLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.1)' }
      },
      axisTick: { show: false },
      axisLabel: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: { color: 'rgba(0, 0, 0, 0.06)', type: 'dashed' }
      },
      axisLabel: {
        color: '#999999',
        fontSize: 10,
        formatter: (val) => {
          if (val === 0) return '0'
          return val >= 1000 ? (val / 1000) + 'k' : val
        }
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        connectNulls: false,
        lineStyle: {
          width: 2,
          color: 'rgba(51, 133, 255, 1)'
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: 'rgba(51, 133, 255, 1)',
          borderWidth: 1.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
            { offset: 1, color: 'rgba(51, 133, 255, 0.02)' }
          ])
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predicted,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: 'rgba(0, 204, 204, 1)'
        },
        itemStyle: {
          color: '#ffffff',
          borderColor: 'rgba(0, 204, 204, 1)',
          borderWidth: 1.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 204, 204, 0.25)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0.02)' }
          ])
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

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

watch(activeTab, () => {
  updateChart()
})

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
@import '../../resources/styles/index.less';

.c-monitor-prediction {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 174 1 0;
  min-height: 0;
  min-width: 0;
}

.c-monitor-prediction-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 24px;
  margin-bottom: 8px;
}

.c-monitor-prediction-title-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-monitor-prediction-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-monitor-prediction-info-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}

.c-monitor-prediction-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.c-monitor-prediction-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  height: 19px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  cursor: pointer;
  white-space: nowrap;
  background: #6680a0;
  color: #ffffff;
  border: 0.73px solid rgba(172, 196, 225, 1);
  transition: all 0.3s ease;

  &--active {
    background: #1990ff;
    color: #ffffff;
    font-weight: 500;
    border: 0.73px solid rgba(199, 224, 255, 1);
  }
}

.c-monitor-prediction-holiday-btn {
  flex-shrink: 0;
  margin-left: 12px;
  font-size: 12px;
  font-weight: 400;
  color: #1990ff;
  line-height: 18px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    opacity: 0.8;
  }
}

.c-monitor-prediction-chart-wrapper {
  flex: 140 1 0;
  min-height: 100px;
  min-width: 0;
  overflow: hidden;
}

.c-monitor-prediction-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-monitor-prediction-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-top: 4px;
}

.c-monitor-prediction-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 400;
  color: #333333;
  line-height: 18px;
  cursor: pointer;
  white-space: nowrap;
  opacity: 1;
  transition: opacity 0.3s ease;

  &--active {
    opacity: 1;
  }

  &:not(&--active) {
    opacity: 0.4;
  }
}

.c-monitor-prediction-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;

  &--actual {
    background: rgba(51, 133, 255, 1);
  }

  &--predicted {
    background: rgba(0, 204, 204, 1);
  }
}

.c-monitor-prediction-legend-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: -10px;

  &--actual {
    background: #ffffff;
    border: 1px solid rgba(51, 133, 255, 1);
  }

  &--predicted {
    background: #ffffff;
    border: 1px solid rgba(0, 204, 204, 1);
  }
}

.c-monitor-prediction-timeline {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  margin-top: 4px;
}

.c-monitor-prediction-timeline-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.c-monitor-prediction-timeline-label {
  font-size: 12px;
  font-weight: 400;
  color: #666666;
  line-height: 12px;
  text-align: center;
}

.c-monitor-prediction-timeline-accuracy {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  padding: 0 10%;
}

.c-monitor-prediction-accuracy {
  font-size: 12px;
  font-weight: 500;
  color: rgba(82, 196, 26, 1);
  line-height: 12px;
  text-align: center;
}
</style>