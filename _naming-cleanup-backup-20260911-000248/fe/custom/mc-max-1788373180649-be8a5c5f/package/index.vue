<template>
  <base-panel class="c-mc-max-1788373180649-be8a5c5f" panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Tab切换栏 -->
      <div class="c-env-monitor-tabs-section">
        <div 
          class="c-env-monitor-tabs-container" 
          :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-env-monitor-tab-item', {'is-active': currentTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </div>
        </div>
        
        <!-- 右侧图标按钮 -->
        <div class="c-env-monitor-tabs-icons" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <div class="c-env-monitor-icon-btn is-active">
            <img :src="icon1" class="c-env-monitor-icon" />
          </div>
          <div class="c-env-monitor-icon-btn">
            <img :src="icon2" class="c-env-monitor-icon" />
            <span class="c-env-monitor-badge">6</span>
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
import bg2 from '../resources/images/bg-tab-active-7891.png'
import bg1 from '../resources/images/bg-7890.png'
import icon1 from '../resources/images/icon-7941.png'
import icon2 from '../resources/images/icon-7945.png'
const bgtabActive = bg2


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// Tab选项
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活的tab
const currentTab = ref('co')

// 图表相关
const chartRef = ref(null)
let chart = null
let chartObserver = null

// 资源引用（系统自动注入，无需import）

// Tab切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  updateChart()
}

// 更新图表
const updateChart = () => {
  if (!chart) return

  // 根据不同tab显示不同数据（Mock数据）
  const dataMap = {
    co: [12, 18, 15, 22, 28, 25, 20, 18, 15, 12, 10, 8],
    visibility: [80, 85, 82, 88, 90, 87, 85, 83, 80, 78, 75, 72],
    lighting: [300, 320, 310, 330, 340, 335, 325, 315, 305, 295, 285, 280],
    outdoor: [5000, 5200, 5100, 5300, 5400, 5350, 5250, 5150, 5050, 4950, 4850, 4800]
  }

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
    legend: {
      data: ['zk3+785CO浓度'],
      top: 10,
      right: 20,
      textStyle: {
        color: '#333333',
        fontSize: 10
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
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameGap: 5,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisTick: {
        show: true
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: '#e0e0e0'
        }
      },
      axisTick: {
        show: true
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#f0f0f0',
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: dataMap[currentTab.value],
        smooth: false,
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        itemStyle: {
          color: '#0fcd7d'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
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
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          data: [
            { yAxis: 30 }
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

// 监听 chartRef
watch(chartRef, (newRef) => {
  if (newRef && !chart) {
    initChart()
  }
})

// 监听 currentTab 变化
watch(currentTab, () => {
  updateChart()
})

// 窗口大小变化处理
const handleResize = () => {
  if (chart) {
    chart.resize()
  }
}

// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  initChart()
  emitLoadEvent()
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
@fontSize: 14px;

@import '../resources/styles/index.less';

.c-env-monitor-root {width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  font-size: var(--fontSize, 14px);

}
.c-env-monitor-tabs-section {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.c-env-monitor-tabs-container {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 3px;
  flex-shrink: 0;
}

.c-env-monitor-tab-item {
  padding: 6px 11px;
  font-size: @fontSize;
  font-weight: 500;
  color: #2c9bea;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  user-select: none;
  line-height: 12px;
}

.c-env-monitor-tab-item.is-active {
  color: #ffffff;
  background: linear-gradient(180deg, #1099b1 0%, #038fff 100%);
  border-radius: 3px;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-tabs-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.3s;
}

.c-env-monitor-icon-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.c-env-monitor-icon-btn.is-active {
  background: rgba(255, 152, 0, 0.1);
}

.c-env-monitor-icon {
  width: 18px;
  height: 18px;
  display: block;
}

.c-env-monitor-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #f53f3f;
  color: #ffffff;
  font-size: calc(@fontSize * 0.8571);
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  border-radius: 29px;
  box-sizing: border-box;
}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.c-env-monitor-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>