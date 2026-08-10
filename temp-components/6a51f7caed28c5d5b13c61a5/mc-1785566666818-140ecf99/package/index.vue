<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <img :src="icon1" class="c-mc-1785566666818-140ecf99-header-icon" />
    </template>
    
    <template #title-right>
      <span class="c-mc-1785566666818-140ecf99-header-tip">*数据实时更新</span>
    </template>

    <div class="c-mc-1785566666818-140ecf99-content">
      <!-- 当日总流量 -->
      <div class="c-mc-1785566666818-140ecf99-section">
        <div class="c-mc-1785566666818-140ecf99-sub-header">
          <div class="c-mc-1785566666818-140ecf99-section-title">
            <img :src="icon2" class="c-mc-1785566666818-140ecf99-title-icon" />
            当日总流量
          </div>
          <div class="c-mc-1785566666818-140ecf99-custom-select">24小时</div>
        </div>

        <div class="c-mc-1785566666818-140ecf99-data-display-row">
          <div class="c-mc-1785566666818-140ecf99-statistic-group left">
            <span class="c-mc-1785566666818-140ecf99-stat-label">江阴靖江长江隧道</span>
            <span class="c-mc-1785566666818-140ecf99-stat-value c-mc-1785566666818-140ecf99-stat-value-blue">34,620</span>
          </div>
          <div class="c-mc-1785566666818-140ecf99-car-icon"></div>
          <div class="c-mc-1785566666818-140ecf99-statistic-group right">
            <span class="c-mc-1785566666818-140ecf99-stat-label">江阴大桥</span>
            <span class="c-mc-1785566666818-140ecf99-stat-value c-mc-1785566666818-140ecf99-stat-value-cyan">82,379</span>
          </div>
        </div>

        <div class="c-mc-1785566666818-140ecf99-chart-wrapper">
          <div class="c-mc-1785566666818-140ecf99-chart-title">江阴靖江长江隧道</div>
          <div ref="barChart1Ref" class="c-mc-1785566666818-140ecf99-chart-container"></div>
        </div>

        <div class="c-mc-1785566666818-140ecf99-chart-wrapper">
          <div class="c-mc-1785566666818-140ecf99-chart-title">江阴大桥</div>
          <div ref="barChart2Ref" class="c-mc-1785566666818-140ecf99-chart-container"></div>
        </div>
      </div>

      <!-- 车型分布 -->
      <div class="c-mc-1785566666818-140ecf99-section">
        <div class="c-mc-1785566666818-140ecf99-sub-header">
          <div class="c-mc-1785566666818-140ecf99-section-title">
            <img :src="icon2" class="c-mc-1785566666818-140ecf99-title-icon" />
            车型分布
          </div>
        </div>

        <div class="c-mc-1785566666818-140ecf99-distribution-cards">
          <div class="c-mc-1785566666818-140ecf99-distribution-card">
            <div class="c-mc-1785566666818-140ecf99-card-title">江阴靖江长江隧道</div>
            <div class="c-mc-1785566666818-140ecf99-card-content">
              <div class="c-mc-1785566666818-140ecf99-stat-box c-mc-1785566666818-140ecf99-stat-box-blue">
                <span class="c-mc-1785566666818-140ecf99-box-label">客车</span>
                <span class="c-mc-1785566666818-140ecf99-box-value">22350</span>
              </div>
              <div ref="donutChart1Ref" class="c-mc-1785566666818-140ecf99-donut-chart"></div>
              <div class="c-mc-1785566666818-140ecf99-stat-box c-mc-1785566666818-140ecf99-stat-box-orange">
                <span class="c-mc-1785566666818-140ecf99-box-label">货车</span>
                <span class="c-mc-1785566666818-140ecf99-box-value">16270</span>
              </div>
            </div>
          </div>

          <div class="c-mc-1785566666818-140ecf99-distribution-card">
            <div class="c-mc-1785566666818-140ecf99-card-title">江阴大桥</div>
            <div class="c-mc-1785566666818-140ecf99-card-content">
              <div class="c-mc-1785566666818-140ecf99-stat-box c-mc-1785566666818-140ecf99-stat-box-blue">
                <span class="c-mc-1785566666818-140ecf99-box-label">客车</span>
                <span class="c-mc-1785566666818-140ecf99-box-value">66109</span>
              </div>
              <div ref="donutChart2Ref" class="c-mc-1785566666818-140ecf99-donut-chart"></div>
              <div class="c-mc-1785566666818-140ecf99-stat-box c-mc-1785566666818-140ecf99-stat-box-orange">
                <span class="c-mc-1785566666818-140ecf99-box-label">货车</span>
                <span class="c-mc-1785566666818-140ecf99-box-value">16270</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 流量预测 -->
      <div class="c-mc-1785566666818-140ecf99-section">
        <div class="c-mc-1785566666818-140ecf99-sub-header">
          <div class="c-mc-1785566666818-140ecf99-section-title">
            <img :src="icon2" class="c-mc-1785566666818-140ecf99-title-icon" />
            流量预测
          </div>
          <div class="c-mc-1785566666818-140ecf99-tabs">
            <div class="c-mc-1785566666818-140ecf99-tab-item c-mc-1785566666818-140ecf99-tab-active">江阴靖江长江隧道</div>
            <div class="c-mc-1785566666818-140ecf99-tab-item">江阴大桥</div>
          </div>
          <div class="c-mc-1785566666818-140ecf99-prediction-link">节假日预测></div>
        </div>

        <div class="c-mc-1785566666818-140ecf99-chart-wrapper">
          <div ref="lineChartRef" class="c-mc-1785566666818-140ecf99-chart-container c-mc-1785566666818-140ecf99-chart-lg"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-3552.png'
import icon2 from '../resources/images/icon-3561.png'

import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

let runtimeBuilder = null
try {
  const builderRes = typeof window !== 'undefined' && window.$mcComponentBuilder ? window.$mcComponentBuilder({
    componentId: 'mc-1785566666818-140ecf99',
    componentProps: {},
    componentName: '流量监测'
  }) : null
  runtimeBuilder = builderRes ? builderRes.runtimeBuilder : null
} catch (e) {
  console.warn('[流量监测] $mcComponentBuilder 失败:', e)
}

const barChart1Ref = ref(null)
const barChart2Ref = ref(null)
const donutChart1Ref = ref(null)
const donutChart2Ref = ref(null)
const lineChartRef = ref(null)

let barChart1 = null, barChart2 = null, donutChart1 = null, donutChart2 = null, lineChart = null
let observers = []

/* [Style Refine] Figma gradientStops for bar charts */
const barBlueGradient = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
  { offset: 0, color: '#18afff' },
  { offset: 1, color: '#006fe3' }
])
const barCyanGradient = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
  { offset: 0, color: '#00ffff' },
  { offset: 1, color: '#0099cc' }
])

const initBarChart = (el, title) => {
  if (!el) return
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(el)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      /* [Layout Refine] Figma legend position → top: 0, right: 0 */
      legend: { data: ['北京方向', '上海方向'], top: 0, right: 0, textStyle: { color: '#333', fontSize: 12 }, itemWidth: 10, itemHeight: 10 },
      grid: { top: 30, left: 10, right: 10, bottom: 20, containLabel: true },
      xAxis: { 
        type: 'category', 
        data: ['0', '4', '8', '12', '16', '20', '24'], 
        axisLine: { lineStyle: { color: '#ccc' } }, 
        axisLabel: { color: '#666', fontSize: 10 } 
      },
      yAxis: { 
        type: 'value', 
        axisLine: { show: false }, 
        splitLine: { lineStyle: { color: '#eee' } }, 
        axisLabel: { color: '#666', fontSize: 10 } 
      },
      series: [
        { name: '北京方向', type: 'bar', data: [100, 200, 150, 80, 825, 110, 130], itemStyle: { color: barBlueGradient }, barWidth: 4, barGap: '30%' },
        { name: '上海方向', type: 'bar', data: [120, 180, 160, 90, 831, 100, 140], itemStyle: { color: barCyanGradient }, barWidth: 4 }
      ]
    })
    return chart
  }
  return null
}

const initDonutChart = (el, data) => {
  if (!el) return
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(el)
    chart.setOption({
      series: [{
        type: 'pie',
        /* [Layout Refine] Figma radius → array ['55%', '75%'] */
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        data: data,
        label: { show: false },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2
        }
      }]
    })
    return chart
  }
  return null
}

/* [Style Refine] Figma gradientStops for line area */
const lineBlueArea = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
  { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
  { offset: 1, color: 'rgba(51, 133, 255, 0)' }
])
const lineCyanArea = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
  { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
  { offset: 1, color: 'rgba(0, 204, 204, 0)' }
])

const initLineChart = (el) => {
  if (!el) return
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(el)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      /* [Layout Refine] Figma legend position → top: 0, right: 0 */
      legend: { data: ['实际流量', '预测流量'], top: 0, right: 0, textStyle: { color: '#333', fontSize: 12 }, itemWidth: 14, itemHeight: 2 },
      grid: { top: 30, left: 10, right: 10, bottom: 20, containLabel: true },
      xAxis: { 
        type: 'category', 
        data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'], 
        boundaryGap: false, 
        axisLine: { lineStyle: { color: '#ccc' } }, 
        axisLabel: { color: '#666', fontSize: 10 } 
      },
      yAxis: { 
        type: 'value', 
        axisLine: { show: false }, 
        splitLine: { lineStyle: { color: '#eee' } }, 
        axisLabel: { color: '#666', fontSize: 10 } 
      },
      series: [
        { 
          name: '实际流量', 
          type: 'line', 
          smooth: true, 
          data: [1000, 1200, 1500, null, null], 
          areaStyle: { color: lineBlueArea }, 
          lineStyle: { color: '#3385ff', width: 2 }, 
          itemStyle: { color: '#3385ff', borderWidth: 2, borderColor: '#fff' },
          symbol: 'circle',
          symbolSize: 6
        },
        { 
          name: '预测流量', 
          type: 'line', 
          smooth: true, 
          data: [null, null, 1500, 1800, 2000], 
          areaStyle: { color: lineCyanArea }, 
          lineStyle: { color: '#00cccc', width: 2, type: 'dashed' }, 
          itemStyle: { color: '#00cccc', borderWidth: 2, borderColor: '#fff' },
          symbol: 'circle',
          symbolSize: 6
        }
      ]
    })
    return chart
  }
  return null
}

const setupObserver = (el, initFn, chartRef) => {
  if (!el) return
  const obs = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chartRef.value) {
      chartRef.value = initFn(el)
      obs.disconnect()
    }
  })
  obs.observe(el)
  observers.push(obs)
}

const initAllCharts = () => {
  barChart1 = initBarChart(barChart1Ref.value)
  barChart2 = initBarChart(barChart2Ref.value)
  donutChart1 = initDonutChart(donutChart1Ref.value, [
    { value: 22350, name: '客车', itemStyle: { color: '#1890ff' } },
    { value: 16270, name: '货车', itemStyle: { color: '#ff6a00' } }
  ])
  donutChart2 = initDonutChart(donutChart2Ref.value, [
    { value: 66109, name: '客车', itemStyle: { color: '#1890ff' } },
    { value: 16270, name: '货车', itemStyle: { color: '#ff6a00' } }
  ])
  lineChart = initLineChart(lineChartRef.value)

  if (!barChart1) setupObserver(barChart1Ref.value, initBarChart, { value: barChart1 })
  if (!barChart2) setupObserver(barChart2Ref.value, initBarChart, { value: barChart2 })
  if (!donutChart1) setupObserver(donutChart1Ref.value, (el) => initDonutChart(el, [{ value: 22350, name: '客车', itemStyle: { color: '#1890ff' } }, { value: 16270, name: '货车', itemStyle: { color: '#ff6a00' }}]), { value: donutChart1 })
  if (!donutChart2) setupObserver(donutChart2Ref.value, (el) => initDonutChart(el, [{ value: 66109, name: '客车', itemStyle: { color: '#1890ff' } }, { value: 16270, name: '货车', itemStyle: { color: '#ff6a00' }}]), { value: donutChart2 })
  if (!lineChart) setupObserver(lineChartRef.value, initLineChart, { value: lineChart })
}

watch([barChart1Ref, barChart2Ref, donutChart1Ref, donutChart2Ref, lineChartRef], () => {
  initAllCharts()
})

const handleResize = () => {
  barChart1?.resize()
  barChart2?.resize()
  donutChart1?.resize()
  donutChart2?.resize()
  lineChart?.resize()
}

onMounted(() => {
  initAllCharts()
  window.addEventListener('resize', handleResize)
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785566666818-140ecf99-onload', {
      componentId: 'mc-1785566666818-140ecf99',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  observers.forEach(obs => obs.disconnect())
  barChart1?.dispose()
  barChart2?.dispose()
  donutChart1?.dispose()
  donutChart2?.dispose()
  lineChart?.dispose()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>