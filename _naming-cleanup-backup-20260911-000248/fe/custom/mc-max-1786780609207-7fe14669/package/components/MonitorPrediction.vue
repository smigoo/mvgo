<template>
  <div class="c-monitor-prediction-root">
    <div class="c-monitor-prediction-heading">
      <span class="c-monitor-heading-mark" aria-hidden="true"></span>
      <span>流量预测</span>
      <span class="c-monitor-prediction-tabs"><b>江阴靖江长江隧道</b><span>江阴大桥</span><em>节假日预测</em></span>
    </div>
    <div ref="chartRef" class="c-monitor-prediction-chart"></div>
    <div class="c-monitor-accuracy"><span>准确率98%</span><span>准确率96%</span><span>准确率92%</span></div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'

defineProps({ timeTab: { type: String, default: '24h' } })

const chartRef = ref(null)
let chart = null

const option = {
  animation: false,
  grid: { left: 34, right: 10, top: 20, bottom: 25, containLabel: true },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'], axisLabel: { color: '#34495e', fontSize: 10 }, axisLine: { lineStyle: { color: '#9bb5cc' } } },
  yAxis: { type: 'value', max: 4000, interval: 1000, axisLabel: { color: '#34495e', fontSize: 10 }, splitLine: { lineStyle: { color: '#c7dced', type: 'dashed' } } },
  series: [
    { name: '实际流量', type: 'line', data: [650, 2300, 2800, null, null], smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#238cff', width: 1.5 }, itemStyle: { color: '#fff', borderColor: '#238cff' }, areaStyle: { color: 'rgba(35,140,255,0.16)' } },
    { name: '预测流量', type: 'line', data: [600, 2100, 3000, 2200, 800], smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#08c5c8', width: 1.5 }, itemStyle: { color: '#fff', borderColor: '#08c5c8' }, areaStyle: { color: 'rgba(8,197,200,0.28)' } }
  ]
}

const resizeChart = () => chart?.resize()

onMounted(() => {
  nextTick(() => {
    if (chartRef.value) {
      chart = echarts.init(chartRef.value)
      chart.setOption(option)
    }
  })
  window.addEventListener('resize', resizeChart)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
