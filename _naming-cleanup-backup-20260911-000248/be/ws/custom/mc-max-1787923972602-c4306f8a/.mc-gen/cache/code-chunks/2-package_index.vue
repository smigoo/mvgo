<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root" :class="componentProps.themeType">
      <!-- Tab 切换栏 -->
      <div class="c-env-monitor-tabs-section">
        <div class="c-env-monitor-tabs-container" :style="{ backgroundImage: `url(${bg2})` }">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-env-monitor-tab-item', { active: activeTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>

        <div class="c-env-monitor-tabs-actions">
          <div class="c-env-monitor-icon-group">
            <div class="c-env-monitor-icon-btn" @click="handleViewChange('chart')">
              <img :src="icon1" class="c-env-monitor-icon" />
            </div>
            <div class="c-env-monitor-icon-btn" @click="handleViewChange('list')">
              <img :src="icon2" class="c-env-monitor-icon" />
            </div>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="c-env-monitor-chart-section">
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// ✅ 一次调用并直接解构
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab 选项
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活的 Tab
const activeTab = ref('co')

// 图表实例
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 不同 Tab 的模拟数据
const dataMap = {
  co: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [15, 20, 18, 25, 30, 28, 35, 32, 28, 22, 18, 12],
    thresholdValue: 30,
    unit: '辆'
  },
  visibility: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [200, 300, 250, 350, 400, 380, 420, 400, 350, 300, 280, 220],
    thresholdValue: 300,
    unit: 'm'
  },
  lighting: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [80, 85, 88, 90, 92, 95, 98, 95, 92, 88, 85, 80],
    thresholdValue: 85,
    unit: 'lx'
  },
  outdoor: {
    xData: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    yData: [1000, 2000, 3500, 5000, 6500, 8000, 9000, 8500, 7000, 5000, 3000, 1500],
    thresholdValue: 6000,
    unit: 'lx'
  }
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  const data = dataMap[activeTab.value]
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgba(85, 158, 255, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(85, 158, 255, 0.5)',
          width: 1
        }
      }
    },
    grid: {
      left: 50,
      right: 20,
      top: 40,
      bottom: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xData,
      boundaryGap: false,
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.15)'
        }
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: false
      },
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      nameGap: 5
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      },
      axisLine: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: false
      },
      name: data.unit,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right'
      }
    },
    series: [
      {
        name: tabs.value.find(t => t.value === activeTab.value)?.label || '',
        type: 'line',
        data: data.yData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 0,
        lineStyle: {
          color: 'rgba(85, 158, 255, 1)',
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
              { offset: 0, color: 'rgba(85, 158, 255, 0.3)' },
              { offset: 1, color: 'rgba(85, 158, 255, 0.05)' }
            ]
          }
        },
        emphasis: {
          itemStyle: {
            color: 'rgba(85, 158, 255, 1)',
            borderColor: '#fff',
            borderWidth: 2
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgba(245, 63, 63, 1)',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: 'rgba(245, 63, 63, 1)',
            fontSize: 12
          },
          data: [
            {
              yAxis: data.thresholdValue
            }
          ]
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

// Tab 切换处理
const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

// 视图切换处理（图表/列表）
const handleViewChange = (view) => {
  console.log('切换视图:', view)
  // TODO: 实现视图切换逻辑
}

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

// 监听 activeTab 变化
watch(activeTab, () => {
  updateChart()
})

// 窗口 resize 处理
const handleResize = () => {
  if (chart) chart.resize()
}

// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
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
@import '../resources/styles/index.less';
</style>
