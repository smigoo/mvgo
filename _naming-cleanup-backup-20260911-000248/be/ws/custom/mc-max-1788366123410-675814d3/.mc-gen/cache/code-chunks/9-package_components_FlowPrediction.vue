<template>
  <div class="c-monitor-flow-prediction">
    <!-- 区域标题 -->
    <div class="c-monitor-section-header">
      <div class="c-monitor-title-wrapper">
        <img :src="icon3" class="c-monitor-title-icon" alt="icon" />
        <span class="c-monitor-section-title">流量预测</span>
      </div>
      <div class="c-monitor-header-controls">
        <!-- Tab切换：地点选择 -->
        <div class="c-monitor-location-tabs">
          <div
            v-for="tab in locationTabs"
            :key="tab.value"
            :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeLocation === tab.value }]"
            @click="handleLocationChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        <!-- 节假日预测按钮 -->
        <a-button type="link" class="c-monitor-holiday-btn">节假日预测</a-button>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-chart-body" :style="{ backgroundImage: `url(${bg4})` }">
      <div ref="chartRef" class="c-monitor-chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 接收资源变量（由父组件通过 provide 传递或系统注入）
const icon3 = ref(null)
const bg4 = ref(null)

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 地点Tab选项
const locationTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 当前激活的地点
const activeLocation = ref('tunnel')

// 模拟数据
const chartDataMap = {
  tunnel: {
    actual: [2800, 2900, 3100, 3200, 3400, 3300, 3100],
    predict: [3100, 3200, 3300, 3400, 3500, 3600, 3700],
    accuracy: ['98%', '98%', '96%', '96%', '92%', '92%', '']
  },
  bridge: {
    actual: [2600, 2700, 2800, 2900, 3000, 3100, 3200],
    predict: [2900, 3000, 3100, 3200, 3300, 3400, 3500],
    accuracy: ['97%', '97%', '95%', '95%', '93%', '93%', '']
  }
}

// Tab切换处理
const handleLocationChange = (value) => {
  if (activeLocation.value === value) return
  activeLocation.value = value
  updateChart()
}

// 监听activeLocation变化
watch(activeLocation, () => {
  updateChart()
})

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

// 监听chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = chartDataMap[activeLocation.value]
  const xAxisData = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后', '3小时后', '4小时后']

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `<div style="padding:4px 8px;">
          <div style="font-weight:500;margin-bottom:4px;">${params[0].axisValue}</div>`
        params.forEach((p) => {
          result += `<div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};"></span>
            <span>${p.seriesName}: ${p.value} 辆</span>
          </div>`
        })
        result += `</div>`
        return result
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      right: 20,
      top: 10,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      itemWidth: 10,
      itemHeight: 10
    },
    grid: {
      left: 50,
      right: 20,
      top: 50,
      bottom: 80,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(51, 51, 51, 0.15)' }
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(51, 51, 51, 0.15)' }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(51, 51, 51, 0.15)' }
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(51, 51, 51, 0.15)' }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 51, 51, 0.1)',
          type: 'solid'
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
          color: 'rgba(25, 144, 255, 1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(25, 144, 255, 1)'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(25, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(25, 144, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predict,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: 'rgba(82, 196, 154, 1)',
          width: 2
        },
        itemStyle: {
          color: 'rgba(82, 196, 154, 1)'
        }
      }
    ]
  }

  chart.setOption(option, true)

  // 渲染准确率标签（放在X轴下方）
  renderAccuracyLabels(data.accuracy)
}

// 渲染准确率标签
const renderAccuracyLabels = (accuracy) => {
  // 准确率标签通过echarts的graphic组件实现
  if (!chart) return

  const graphic = accuracy.map((label, index) => {
    if (!label) return null
    return {
      type: 'text',
      left: 50 + (index / 6) * (chartRef.value.clientWidth - 70),
      bottom: 40,
      style: {
        text: `准确率${label}`,
        fill: 'rgba(82, 196, 154, 1)',
        fontSize: 12,
        fontWeight: 500
      }
    }
  }).filter(Boolean)

  chart.setOption({
    graphic: graphic
  })
}

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
@import '../../resources/styles/index.less';

.c-monitor-flow-prediction {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.c-monitor-title-wrapper {
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
  line-height: 24px;
}

.c-monitor-header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-location-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-tab-item {
  padding: 6px 16px;
  font-size: 14px;
  color: rgba(51, 51, 51, 0.65);
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(25, 144, 255, 0.08);
    color: rgba(25, 144, 255, 1);
  }

  &--active {
    background: rgba(25, 144, 255, 1);
    color: #ffffff;

    &:hover {
      background: rgba(25, 144, 255, 1);
    }
  }
}

.c-monitor-holiday-btn {
  padding: 0;
  font-size: 14px;
  color: rgba(25, 144, 255, 1);
  flex-shrink: 0;

  &:hover {
    color: rgba(25, 144, 255, 0.8);
  }
}

.c-monitor-chart-body {
  flex: 1;
  min-height: 0;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  overflow: hidden;
}

.c-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
