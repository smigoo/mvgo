<template>
  <div class="c-traffic-prediction-root">
    <div class="c-section-header">
      <div class="c-section-title">
        <img :src="icon5" class="c-title-icon" alt="" />
        <span>流量预测</span>
      </div>
      <div class="c-tab-group">
        <span
          v-for="tab in tabs"
          :key="tab.key"
          :class="['c-tab-item', { 'c-tab-item--active': activeTab === tab.key }]"
          @click="handleTabChange(tab.key)"
        >
          {{ tab.label }}
        </span>
      </div>
      <span class="c-holiday-link" @click="handleHolidayClick">节假日预测&gt;</span>
    </div>

    <div class="c-prediction-chart-wrapper">
      <div ref="chartRef" class="c-prediction-chart"></div>
    </div>

    <div class="c-accuracy-labels">
      <span>准确率98%</span>
      <span>准确率96%</span>
      <span>准确率92%</span>
    </div>
  </div>
</template>

<script setup>
import icon5 from '../../resources/images/icon-3573.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// --- 状态定义 ---
const activeTab = ref('tunnel')
const tabs = [
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
]

const chartRef = ref(null)
let chart = null
let chartObserver = null

// --- 模拟数据 ---
const forecastDataMap = {
  tunnel: {
    categories: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [1200, 1800, 2400, 2100, 1600],
    forecast: [1200, 1750, 2300, 2150, 1500]
  },
  bridge: {
    categories: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2000, 2600, 3200, 2800, 2200],
    forecast: [1900, 2500, 3100, 2900, 2100]
  }
}

// --- 图表配置 ---
const buildOption = () => {
  const data = forecastDataMap[activeTab.value]
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e0e6f0',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        const p = Array.isArray(params) ? params : [params]
        let html = `<div style="font-weight:600;margin-bottom:4px;">${p[0].name}</div>`
        p.forEach(item => {
          html += `<div style="display:flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};"></span>
            ${item.seriesName}：${item.value} 辆
          </div>`
        })
        return html
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 6,
      itemGap: 12,
      textStyle: {
        fontSize: 12,
        color: '#333333'
      }
    },
    grid: {
      top: 28,
      left: 40,
      right: 16,
      bottom: 20,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.categories,
      boundaryGap: false,
      axisLine: {
        lineStyle: { color: '#d9e2f0' }
      },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 12,
        color: '#666666'
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 9.6,
        color: '#999999'
      },
      splitLine: {
        lineStyle: {
          color: '#e8f0fa',
          type: 'dashed'
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
        lineStyle: {
          width: 2,
          color: '#1890ff'
        },
        itemStyle: {
          color: '#1890ff'
        },
        areaStyle: {
          color: 'rgba(24,144,255,0.18)'
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.forecast,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: '#52c41a'
        },
        itemStyle: {
          color: '#52c41a'
        },
        areaStyle: {
          color: 'rgba(82,196,26,0.12)'
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

const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
}

const handleHolidayClick = () => {
  // 预留：节假日预测跳转逻辑
}

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
  chart = null
  chartObserver?.disconnect()
  chartObserver = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-traffic-prediction-root {  width: 100%;

  height: 174px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.c-section-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.c-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

.c-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-tab-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}

.c-tab-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 12px;
  height: 19px;
  border-radius: 20.4615px;
  border: 0.7308px solid rgba(172, 196, 225, 1);
  background: #6680a0;
  color: #ffffff;
  font-size: 14px;
  font-weight: 400;
  line-height: 19px;
  cursor: pointer;
  transition: all 0.2s;
}

.c-tab-item--active {
  background: #1990ff;
  border-color: rgba(199, 224, 255, 1);
  font-weight: 500;
}

.c-holiday-link {
  margin-left: auto;
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  line-height: 18px;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}

.c-prediction-chart-wrapper {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
}

.c-prediction-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.c-accuracy-labels {
  display: flex;
  justify-content: space-around;
  align-items: center;
  margin-top: 4px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 12px;
  color: #52c41a;
}
</style>