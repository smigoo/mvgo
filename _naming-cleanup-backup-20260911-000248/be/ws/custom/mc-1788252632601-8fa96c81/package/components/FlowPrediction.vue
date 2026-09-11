<template>
  <div class="c-monitor-c-flow-prediction">
    <div class="c-monitor-c-fp-header"><img :src="icon2" class="auto-mounted-icon" alt="icon" />
      <img class="c-monitor-c-fp-icon" :src="icon1" alt="" />
      <span class="c-monitor-c-fp-title">{{ businessProps.title }}</span>
    </div>
    <div class="c-monitor-c-fp-chart" ref="chartRef"></div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'


import { ref, onMounted, onBeforeUnmount, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)
let chart = null

function getOption() {
  const data = businessProps.predictionData || []
  return {
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.map(i => i.time),
      axisLine: { lineStyle: { color: '#3a5a8c' } },
      axisLabel: { color: '#a6c8ff' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(58,90,140,0.3)' } },
      axisLabel: { color: '#a6c8ff' }
    },
    series: [{
      type: 'line',
      smooth: true,
      data: data.map(i => i.value),
      lineStyle: { color: '#00e0ff', width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(0,224,255,0.4)' },
          { offset: 1, color: 'rgba(0,224,255,0)' }
        ])
      }
    }]
  }
}

function renderChart() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)
  chart.setOption(getOption())
}

function handleResize() {
  chart && chart.resize()
}

watch(() => businessProps.predictionData, () => {
  nextTick(renderChart)
}, { deep: true })

onMounted(() => {
  renderChart()
  window.addEventListener('resize', handleResize)
  runtimeBuilder.publishEvent('FlowPrediction-onload', {
    componentApi,
    props: componentProps
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<style scoped lang="less">
@fontSize: 0px;

@import '../../resources/styles/index.less';
.c-flow-prediction {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  background-image: url('~@/assets/bg1.png');
  background-size: 100% 100%;
  box-sizing: border-box;
  padding: 12px 16px;
}
.c-fp-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.c-fp-icon {
  width: 20px;
  height: 20px;
  margin-right: 8px;
}
.c-fp-title {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 600;
  color: #e6f2ff;
}
.c-fp-chart {
  flex: 1;
  width: 100%;
  min-height: 0;
}
</style>