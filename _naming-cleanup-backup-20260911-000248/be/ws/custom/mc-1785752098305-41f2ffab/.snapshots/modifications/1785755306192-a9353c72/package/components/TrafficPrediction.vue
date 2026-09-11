<template>
  <div class="c-mc-1785752098305-41f2ffab-section">
    <div class="c-mc-1785752098305-41f2ffab-sub-header">
      <div class="c-mc-1785752098305-41f2ffab-title-group">
        <img :src="icon57" class="c-mc-1785752098305-41f2ffab-title-icon" alt="icon" />
        <span class="c-mc-1785752098305-41f2ffab-title-text">流量预测</span>
      </div>
      <div class="c-mc-1785752098305-41f2ffab-header-right">
        <div class="c-mc-1785752098305-41f2ffab-tabs">
          <div
            v-for="tab in predictTabs"
            :key="tab.value"
            :class="['c-mc-1785752098305-41f2ffab-tab-item', { active: activeTab === tab.value }]"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
        <span class="c-mc-1785752098305-41f2ffab-holiday-link">节假日预测></span>
      </div>
    </div>
    <div class="c-mc-1785752098305-41f2ffab-chart-wrapper">
      <div ref="chartRef" class="c-mc-1785752098305-41f2ffab-chart-container"></div>
    </div>
    <div class="c-mc-1785752098305-41f2ffab-accuracy-row">
      <span class="c-mc-1785752098305-41f2ffab-accuracy-text">准确率98%</span>
      <span class="c-mc-1785752098305-41f2ffab-accuracy-text">准确率96%</span>
      <span class="c-mc-1785752098305-41f2ffab-accuracy-text">准确率92%</span>
    </div>
  </div>
</template>

<script setup>
import icon57 from '../../resources/images/icon-3573.png'
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  predictData: { type: Object, required: true }
})

const activeTab = ref('tunnel')
const predictTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

const chartRef = ref(null)
let chart = null
let observer = null

const updateChart = (data) => {
  if (!chart) return
  const times = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['实际流量', '预测流量'], top: 0, right: 0, textStyle: { color: '#333', fontSize: 12 } },
    grid: { left: 40, right: 16, top: 30, bottom: 20, containLabel: true },
    xAxis: { type: 'category', data: times, boundaryGap: false, axisLine: { lineStyle: { color: '#ccc' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#eee' } }, axisLabel: { color: '#666' } },
    series: [
      { name: '实际流量', type: 'line', data: data.actual, smooth: true, lineStyle: { color: '#3385ff', width: 2 }, itemStyle: { color: '#3385ff' }, areaStyle: { color: 'rgba(51, 133, 255, 0.2)' } },
      { name: '预测流量', type: 'line', data: data.predict, smooth: true, lineStyle: { color: '#00cccc', width: 2 }, itemStyle: { color: '#00cccc' }, areaStyle: { color: 'rgba(0, 204, 204, 0.2)' } }
    ]
  }, true)
}

const initChart = () => {
  const el = chartRef.value
  if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
  chart = echarts.init(el)
  updateChart(props.predictData[activeTab.value])
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el)
}

watch(activeTab, () => {
  updateChart(props.predictData[activeTab.value])
})

watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

onMounted(() => {
  if (chartRef.value) initChart()
})

onUnmounted(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>
