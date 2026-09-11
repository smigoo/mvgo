<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab切换区域 -->
      <div class="c-env-monitor-tabs-section">
        <div class="c-env-monitor-tabs-list">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            class="c-env-monitor-tab-item"
            :class="{ 'c-env-monitor-tab-item--active': activeTab === tab.value }"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="c-env-monitor-tabs-icons">
          <img :src="icon1" class="c-env-monitor-icon-btn" alt="柱状图视图" title="柱状图视图" />
          <div class="c-env-monitor-icon-btn-wrapper">
            <img :src="icon2" class="c-env-monitor-icon-btn" alt="列表视图" title="列表视图" />
            <div class="c-env-monitor-badge">6</div>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-section">
        <div class="c-env-monitor-chart-legend">
          <div class="c-env-monitor-legend-item">
            <span class="c-env-monitor-legend-line"></span>
            <span class="c-env-monitor-legend-text">zk3+785CO浓度</span>
          </div>
        </div>
        <div class="c-env-monitor-chart-wrap" ref="chartRef"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab数据
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor' },
  { label: '洞外光强', value: 'outdoor' }
])

const activeTab = ref('co')

// 各Tab对应的模拟图表数据（趋势：先平缓，12-18时小幅隆起后回落）
const chartDataMap = {
  co: [5, 4, 3, 4, 5, 6, 8, 12, 18, 22, 25, 28, 32, 35, 30, 26, 20, 15, 10, 8, 6, 5, 4, 3],
  visibility: [30, 28, 25, 20, 18, 15, 12, 18, 22, 28, 32, 35, 38, 40, 36, 30, 25, 20, 18, 15, 12, 10, 8, 6],
  indoor: [10, 10, 10, 12, 15, 18, 20, 22, 25, 28, 30, 32, 35, 38, 35, 32, 28, 25, 20, 18, 15, 12, 10, 10],
  outdoor: [2, 2, 2, 3, 5, 8, 12, 18, 22, 28, 32, 35, 38, 40, 36, 30, 25, 18, 12, 8, 5, 3, 2, 2]
}

const chartRef = ref(null)
let chart = null
let chartObserver = null

// 构建ECharts配置
const buildOption = () => {
  const data = chartDataMap[activeTab.value] || chartDataMap.co
  const xAxisData = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20, 40, 60, 0.85)',
      borderColor: 'rgba(85,158,255,0.4)',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.axisValue}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    grid: {
      left: 40,
      right: 50,
      top: 12,
      bottom: 28,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.1)' }
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        align: 'right'
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        formatter: (val) => val
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.1)' }
      },
      axisLine: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0,0,0,0.08)',
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
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 1.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,205,125,0.5)' },
            { offset: 1, color: 'rgba(15,205,125,0.05)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          data: [
            {
              yAxis: 30,
              lineStyle: {
                color: '#d32f2f',
                width: 1.5,
                type: 'solid'
              },
              label: {
                show: true,
                position: 'end',
                formatter: '预警线',
                color: '#d32f2f',
                fontSize: 12,
                fontFamily: 'Source Han Sans CN'
              }
            }
          ]
        }
      }
    ]
  }
}

const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(), true)
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
      chartObserver = null
      chart = echarts.init(chartRef.value)
      updateChart()
    }
  })
  chartObserver.observe(chartRef.value)
}

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// Tab切换时更新图表数据
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  updateChart()
}

watch(activeTab, () => {
  updateChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  emitLoadEvent()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
  chartObserver?.disconnect()
  chartObserver = null
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-tabs-section {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 3px;
  padding: 3px;
  gap: 0;
}

.c-env-monitor-tab-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 10px;
  font-size: calc(@fontSize * 1);
  font-family: 'Source Han Sans CN', sans-serif;
  font-weight: 500;
  color: #2c9bea;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
  transition: background 0.2s, color 0.2s;
  line-height: 12px;

  &--active {
    background-image: v-bind("'url(' + bg2 + ')'");
    background-size: 100% 100%;
    background-position: center center;
    background-repeat: no-repeat;
    color: #ffffff;
    text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-tabs-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.c-env-monitor-icon-btn {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
  display: block;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'PingFang SC', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  color: #ffffff;
  line-height: 14px;
  pointer-events: none;
}

.c-env-monitor-chart-section {
  flex: 113 1 0;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-env-monitor-chart-legend {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  padding: 2px 4px 0 0;
  flex-shrink: 0;
}

.c-env-monitor-legend-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  background: #0fcd7d;
  border-radius: 1.6px;
  flex-shrink: 0;
}

.c-env-monitor-legend-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.8);
  font-weight: 400;
  color: #333333;
  line-height: calc(@fontSize * 1.2);
}

.c-env-monitor-chart-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
</style>