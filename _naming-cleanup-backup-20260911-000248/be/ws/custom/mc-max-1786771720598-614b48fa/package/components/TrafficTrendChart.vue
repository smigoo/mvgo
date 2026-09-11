<template>
  <div class="c-traffic-predict-section">
    <div class="c-traffic-predict-header">
      <div class="c-traffic-section-title-wrapper">
        <span class="c-traffic-section-icon"></span>
        <span class="c-traffic-section-title">流量预测</span>
      </div>
      <div class="c-traffic-predict-tabs">
        <span 
          v-for="tab in predictTabs" 
          :key="tab.key" 
          :class="['c-traffic-predict-tab-item', { 'is-active': activePredictTab === tab.key }]"
          @click="activePredictTab = tab.key"
        >
          {{ tab.label }}
        </span>
      </div>
      <span class="c-traffic-predict-holiday-link">节假日预测 ></span>
    </div>
    <div class="c-traffic-predict-chart-wrapper">
      <div ref="predictChartRef" class="c-traffic-predict-chart"></div>
    </div>
    <div class="c-traffic-predict-accuracy">
      <span>准确率98%</span>
      <span>准确率96%</span>
      <span>准确率92%</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// --- 响应式状态 ---
const activePredictTab = ref('tunnel')
const predictTabs = [
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
]

// --- 图表 Refs ---
const predictChartRef = ref(null)
let predictChart = null
let resizeObserver = null

// --- Mock 数据 ---
const mockAreaData = {
  tunnel: {
    actual: [1000, 1200, 1500, 1800, 2000],
    predict: [1100, 1300, 1600, 1900, 2200]
  },
  bridge: {
    actual: [2000, 2200, 2500, 2800, 3000],
    predict: [2100, 2300, 2600, 2900, 3200]
  }
}

// --- 图表更新函数 ---
const updatePredictChart = () => {
  if (!predictChart) return
  const data = mockAreaData[activePredictTab.value]
  predictChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#eee', textStyle: { color: '#333', fontSize: 12 } },
    legend: { data: ['实际流量', '预测流量'], top: 0, right: 0, textStyle: { color: '#666', fontSize: 12 } },
    grid: { left: 10, right: 16, top: 20, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'], boundaryGap: false, axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#666', fontSize: 10 } },
    yAxis: { type: 'value', max: 4000, splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }, axisLabel: { color: '#666', fontSize: 10 } },
    series: [
      { 
        name: '实际流量', 
        type: 'line', 
        smooth: true, 
        data: data.actual, 
        lineStyle: { color: '#3385ff', width: 2 }, 
        itemStyle: { color: '#3385ff', borderColor: '#3385ff', borderWidth: 1 },
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
        smooth: true, 
        data: data.predict, 
        lineStyle: { color: '#00cccc', width: 2 }, 
        itemStyle: { color: '#00cccc', borderColor: '#00cccc', borderWidth: 1 },
        areaStyle: { 
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0)' }
          ]) 
        } 
      }
    ]
  }, true)
}

// --- 图表初始化函数 ---
const initPredictChart = () => {
  if (!predictChartRef.value || predictChart) return
  predictChart = echarts.init(predictChartRef.value)
  updatePredictChart()
}

// --- 监听 Tab 切换 ---
watch(activePredictTab, () => {
  updatePredictChart()
})

// --- 窗口 Resize ---
const handleResize = () => {
  if (predictChart) predictChart.resize()
}

// --- 生命周期 ---
onMounted(() => {
  initPredictChart()

  resizeObserver = new ResizeObserver(() => {
    handleResize()
  })

  if (predictChartRef.value) {
    resizeObserver.observe(predictChartRef.value)
  }

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', handleResize)
  predictChart?.dispose()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>