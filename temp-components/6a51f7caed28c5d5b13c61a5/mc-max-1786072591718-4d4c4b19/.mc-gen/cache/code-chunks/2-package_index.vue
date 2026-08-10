<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1786072591718-4d4c4b19-content">
      <div class="c-mc-max-1786072591718-4d4c4b19-sub-header">
        <div 
          class="c-mc-max-1786072591718-4d4c4b19-tabs-list" 
          :style="{ 
            backgroundImage: `url(${bg1})`, 
            backgroundSize: '100% 100%', 
            backgroundPosition: 'center', 
            backgroundRepeat: 'no-repeat' 
          }"
        >
          <div
            v-for="(tab, index) in tabs"
            :key="tab"
            :class="['c-mc-max-1786072591718-4d4c4b19-tab-item', { 'is-active': activeTab === index }]"
            @click="activeTab = index"
          >
            <div 
              v-if="activeTab === index" 
              class="c-mc-max-1786072591718-4d4c4b19-tab-active-bg" 
              :style="{ 
                backgroundImage: `url(${bg2})`, 
                backgroundSize: '100% 100%', 
                backgroundPosition: 'center', 
                backgroundRepeat: 'no-repeat' 
              }"
            ></div>
            <span class="c-mc-max-1786072591718-4d4c4b19-tab-text">{{ tab }}</span>
          </div>
        </div>
        
        <div class="c-mc-max-1786072591718-4d4c4b19-view-tools">
          <img :src="icon2" class="c-mc-max-1786072591718-4d4c4b19-view-icon" alt="视图切换" />
          <div class="c-mc-max-1786072591718-4d4c4b19-badge">6</div>
        </div>
      </div>
      
      <div class="c-mc-max-1786072591718-4d4c4b19-chart-wrapper">
        <div ref="chartRef" class="c-mc-max-1786072591718-4d4c4b19-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 失败:', e)
}

const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强']
const activeTab = ref(0)

const chartRef = ref(null)
let chart = null
let chartObserver = null

const updateChart = () => {
  if (!chart) return
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
      top: 0,
      right: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#333333',
        fontSize: 10,
        fontFamily: 'Source Han Sans CN'
      }
    },
    grid: {
      left: 30,
      right: 16,
      top: 24,
      bottom: 24,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => i),
      boundaryGap: false,
      axisLine: {
        lineStyle: { color: '#e0e0e0' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Roboto',
        interval: 1
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: { color: 'rgba(0,0,0,0.05)', type: 'dashed' }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
          color: '#52C41A'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82, 196, 26, 0.4)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
          ])
        },
        data: [10, 12, 15, 18, 22, 25, 28, 26, 24, 20, 18, 15, 14, 16, 19, 22, 25, 28, 32, 29, 25, 20, 15, 12],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#F53F3F',
            width: 1
          },
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线',
                color: '#d32f2f',
                fontSize: 12,
                fontFamily: 'Source Han Sans CN',
                position: 'insideEndTop'
              }
            }
          ]
        }
      }
    ]
  }
  chart.setOption(option, true)
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

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1786072591718-4d4c4b19-onload', {
      componentId: 'mc-max-1786072591718-4d4c4b19',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-mc-max-1786072591718-4d4c4b19-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-mc-max-1786072591718-4d4c4b19-sub-header {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.c-mc-max-1786072591718-4d4c4b19-tabs-list {
  width: 295px;
  height: 27px;
  display: flex;
  align-items: center;
  padding: 3px;
  box-sizing: border-box;
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 2px;
  position: relative;
}

.c-mc-max-1786072591718-4d4c4b19-tab-item {
  flex: 1;
  height: 21px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  z-index: 1;
}

.c-mc-max-1786072591718-4d4c4b19-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 0.6px solid rgba(255, 255, 255, 1);
  border-radius: 1.6px;
  z-index: -1;
}

.c-mc-max-1786072591718-4d4c4b19-tab-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  transition: all 0.3s;
  line-height: 12px;
}

.c-mc-max-1786072591718-4d4c4b19-tab-item.is-active .c-mc-max-1786072591718-4d4c4b19-tab-text {
  color: #ffffff;
  text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
}

.c-mc-max-1786072591718-4d4c4b19-view-tools {
  width: 52px;
  height: 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-mc-max-1786072591718-4d4c4b19-view-icon {
  width: 52px;
  height: 24px;
  cursor: pointer;
}

.c-mc-max-1786072591718-4d4c4b19-badge {
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
  font-size: 12px;
  font-weight: 500;
  color: #ffffff;
  line-height: 1;
}

.c-mc-max-1786072591718-4d4c4b19-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 0 16px 8px;
  box-sizing: border-box;
}

.c-mc-max-1786072591718-4d4c4b19-chart-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>