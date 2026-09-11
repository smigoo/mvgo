<template>
  <div class="c-flow-prediction-root">
    <div class="c-sub-header">
      <div class="c-sub-header-title-group">
        <img :src="icon3" class="c-sub-header-icon" />
        <span class="c-sub-header-title">流量预测</span>
      </div>
      
      <div class="c-monitor-chart-controls">
        <div class="c-monitor-tab-group">
          <span 
            v-for="tab in predictionTabs" 
            :key="tab.value" 
            :class="['c-monitor-tab-item', { 'is-active': activePrediction === tab.value }]"
            @click="activePrediction = tab.value"
          >{{ tab.label }}</span>
        </div>
        <span class="c-monitor-holiday-link">节假日预测 ></span>
      </div>
    </div>

    <div class="c-monitor-chart-header" style="margin-bottom: 0;">
      <div class="c-monitor-legend">
        <span class="c-monitor-legend-item"><i class="c-monitor-legend-line" style="background:#3385ff"></i>实际流量</span>
        <span class="c-monitor-legend-item"><i class="c-monitor-legend-line" style="background:#00cccc"></i>预测流量</span>
      </div>
    </div>

    <div ref="predictionChartRef" class="c-monitor-chart-canvas" style="height: 140px;"></div>
    
    <div class="c-monitor-accuracy-bar">
      <span>准确率98%</span>
      <span>准确率96%</span>
      <span>准确率92%</span>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const predictionTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])
const activePrediction = ref('tunnel')

const predictionChartRef = ref(null)
let predictionChart = null
let resizeObserver = null

/* [Data Refine] 保留原文件具体数值 */
const getAreaOption = () => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 }
    },
    grid: { left: 10, right: 20, top: 10, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#333', fontSize: 12 }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: [1200, 1500, 1800, 2100, 2400],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#3385ff', width: 2 },
        itemStyle: { color: '#3385ff', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
            { offset: 1, color: 'rgba(51, 133, 255, 0)' }
          ])
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: [null, null, 1850, 2250, 2550],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#00cccc', width: 2 },
        itemStyle: { color: '#00cccc', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0)' }
          ])
        }
      }
    ]
  }
}

const initChart = () => {
  if (predictionChartRef.value && !predictionChart) {
    predictionChart = echarts.init(predictionChartRef.value)
    predictionChart.setOption(getAreaOption())
  }
}

onMounted(() => {
  initChart()
  resizeObserver = new ResizeObserver(() => {
    predictionChart?.resize()
  })
  if (predictionChartRef.value) resizeObserver.observe(predictionChartRef.value)
})

onUnmounted(() => {
  predictionChart?.dispose()
  resizeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-flow-prediction-root {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.c-monitor-legend {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #333333;
}

.c-monitor-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  border-radius: 1px;
  position: relative;
  
  &::after {
    content: '';
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid currentColor;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: inherit;
  }
}
</style>