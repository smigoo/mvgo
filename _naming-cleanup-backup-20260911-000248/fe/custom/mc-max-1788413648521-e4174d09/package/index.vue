<template>
  <base-panel class="c-mc-max-1788413648521-e4174d09" panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 顶部Tab切换栏 + 右侧图标区 -->
      <div class="c-env-monitor-sub-t">
        <div class="c-env-monitor-tabs-list" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <div
            v-for="(tab, index) in tabs"
            :key="tab.value"
            class="c-env-monitor-tab-item"
            :class="{ 'c-env-monitor-tab-item--active': activeTab === tab.value }"
            @click="handleTabChange(tab.value)"
          >
            <span
              v-if="activeTab === tab.value"
              class="c-env-monitor-tab-active-bg"
              :style="{ backgroundImage: 'url(' + bg2 + ')' }"
            ></span>
            <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
          </div>
        </div>
        <div class="c-env-monitor-tabs-icon">
          <img :src="icon1" class="c-env-monitor-icon-btn" alt="图表" />
          <img :src="icon2" class="c-env-monitor-icon-btn" alt="数据" />
          <span class="c-env-monitor-badge">6</span>
        </div>
      </div>

      <!-- 面积图区域 -->
      <div class="c-env-monitor-chart-area">
        <div ref="chartRef" class="c-env-monitor-chart-container"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-7890.png'
import bg2 from '../resources/images/bg-tab-active-7891.png'
import icon1 from '../resources/images/icon-7941.png'
import icon2 from '../resources/images/icon-7945.png'


import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null
let chartObserver = null

// Tab 选项（来自设计稿文字清单）
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor' },
  { label: '洞外光强', value: 'outdoor' },
])

const activeTab = ref('co')

// 各Tab对应的模拟数据（按设计稿 0-600 量程，波动趋势在8-12时达峰值）
const chartDataMap = {
  co: [80, 120, 160, 220, 280, 350, 420, 480, 560, 600, 520, 440, 380, 300, 260, 200, 180, 160, 140, 120, 100, 80, 60, 40],
  visibility: [200, 180, 220, 260, 300, 350, 400, 450, 500, 480, 420, 380, 320, 280, 260, 240, 220, 200, 180, 160, 140, 120, 100, 80],
  indoor: [100, 150, 200, 250, 300, 380, 460, 520, 580, 600, 540, 460, 400, 340, 300, 260, 240, 220, 200, 180, 160, 140, 120, 100],
  outdoor: [300, 280, 320, 360, 400, 440, 480, 520, 560, 580, 540, 500, 460, 420, 380, 340, 300, 260, 220, 180, 140, 100, 60, 20],
}

// Tab标签对应的系列名
const seriesNameMap = {
  co: 'zk3+785CO浓度',
  visibility: '能见度',
  indoor: '洞内照明',
  outdoor: '洞外光强',
}

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  updateChart()
}

watch(activeTab, () => {
  updateChart()
})

const updateChart = () => {
  if (!chart) return

  const data = chartDataMap[activeTab.value] || chartDataMap.co
  const seriesName = seriesNameMap[activeTab.value] || 'zk3+785CO浓度'

  const option = {
    grid: {
      left: 36,
      right: 16,
      top: 16,
      bottom: 28,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(0, 0, 0, 0.06)',
      borderWidth: 1,
      textStyle: {
        color: 'rgba(0, 0, 0, 0.65)',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.15)',
          width: 1,
        },
      },
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
      },
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Roboto',
      },
      axisTick: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' },
      },
      axisLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.15)' },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 600,
      interval: 200,
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        padding: [0, 0, 0, -20],
      },
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        formatter: (val) => String(val),
      },
      axisTick: { show: true, lineStyle: { color: 'rgba(0,0,0,0.15)' } },
      axisLine: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0,0,0,0.08)',
          type: 'solid',
        },
      },
    },
    series: [
      {
        name: seriesName,
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgba(15, 205, 125, 1)',
          width: 2,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.3)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0.02)' },
            ],
          },
        },
        // 预警线标注（Y轴30处对应600量程中约30/600的位置，但设计稿Y轴最大值是600，预警线用markLine）
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN',
          },
          lineStyle: {
            color: 'rgba(211, 47, 47, 0.8)',
            width: 1,
            type: 'dashed',
          },
          data: [{ yAxis: 300 }],
        },
      },
    ],
    // 图例（内置，使用 seriesName）
    legend: {
      show: true,
      bottom: 0,
      left: 20,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#333333',
        fontSize: 10,
        fontFamily: 'Source Han Sans CN',
      },
      data: [seriesName],
    },
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

const handleResize = () => {
  if (chart) chart.resize()
}

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now(),
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
  chartObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-env-monitor-root {width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-size: var(--fontSize, 14px);

}
.c-env-monitor-sub-t {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  flex-shrink: 0;
  padding: 0 2px;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  overflow: hidden;
  position: relative;
}

.c-env-monitor-tab-item {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  height: 27px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  inset: 3px 2px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center center;
  pointer-events: none;
}

.c-env-monitor-tab-text {
  position: relative;
  font-size: calc(var(--fontSize, 14px) * 1);
  font-family: 'Source Han Sans CN', sans-serif;
  font-weight: 500;
  color: #2c9bea;
  line-height: 12px;
  z-index: 1;
}

.c-env-monitor-tab-item--active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
}

.c-env-monitor-tabs-icon {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  position: relative;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-family: 'PingFang SC', sans-serif;
  font-weight: 500;
  color: #ffffff;
  line-height: 14px;
  text-align: center;
  padding: 0 3px;
  box-sizing: border-box;
  pointer-events: none;
}

.c-env-monitor-chart-area {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.c-env-monitor-chart-container {
  flex: 1 1 0;
  min-height: 100px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}
</style>