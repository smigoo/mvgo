<template>
  <section class="mv-lite-1786851177092-1aeb102b">
    <div class="dashboard">
      <header class="page-header">
        <h1>流量监测</h1>
        <div class="title-line"></div>
      </header>

      <section class="overview">
        <div class="overview-head">
          <div class="section-title"><span class="diamond"></span>当日总流量</div>
          <button class="select-btn" @click="handleSelect">24小时<span>⌄</span></button>
        </div>
        <div class="overview-body">
          <div class="metric metric-left">
            <div class="metric-name">江阴靖江长江隧道</div>
            <div class="metric-value blue">34,620</div>
          </div>
          <div class="car-glow">
            <div class="halo"></div>
            <div class="car">🚙</div>
          </div>
          <div class="metric metric-right">
            <div class="metric-name">江阴大桥</div>
            <div class="metric-value cyan">82,379</div>
          </div>
        </div>
      </section>

      <section class="bar-block">
        <div class="chart-head">
          <div class="sub-title"><span class="blue-stick"></span>江阴靖江长江隧道</div>
          <div class="legend"><i class="legend-blue"></i>北京方向<i class="legend-cyan"></i>上海方向</div>
        </div>
        <div class="bar-wrap">
          <div ref="tunnelBarRef" class="chart"></div>
          <div class="tooltip-card">
            <b>16时</b>
            <p><i class="legend-blue"></i>北京方向 <strong>825</strong> 辆</p>
            <p><i class="legend-cyan"></i>上海方向 <strong>831</strong> 辆</p>
          </div>
        </div>
      </section>

      <section class="bar-block bridge-block">
        <div class="chart-head">
          <div class="sub-title"><span class="blue-stick"></span>江阴大桥</div>
          <div class="legend"><i class="legend-blue"></i>北京方向<i class="legend-cyan"></i>上海方向</div>
        </div>
        <div class="bar-wrap">
          <div ref="bridgeBarRef" class="chart"></div>
          <div class="tooltip-card">
            <b>16时</b>
            <p><i class="legend-blue"></i>北京方向 <strong>825</strong> 辆</p>
            <p><i class="legend-cyan"></i>上海方向 <strong>831</strong> 辆</p>
          </div>
        </div>
      </section>

      <section class="vehicle-section">
        <div class="section-title"><span class="diamond"></span>车型分布</div>
        <div class="vehicle-grid">
          <div class="vehicle-card">
            <div class="card-title">江阴靖江长江隧道</div>
            <div class="triangle"></div>
            <div class="card-body">
              <div class="car-type passenger"><span>客车</span><b>22350</b></div>
              <div class="donut-box"><div ref="tunnelPieRef" class="chart"></div><span class="center-icon">🚙</span></div>
              <div class="car-type truck"><span>货车</span><b>16270</b></div>
            </div>
          </div>
          <div class="vehicle-card">
            <div class="card-title">江阴大桥</div>
            <div class="triangle"></div>
            <div class="card-body">
              <div class="car-type passenger"><span>客车</span><b>66109</b></div>
              <div class="donut-box"><div ref="bridgePieRef" class="chart"></div><span class="center-icon">🌉</span></div>
              <div class="car-type truck"><span>货车</span><b>16270</b></div>
            </div>
          </div>
        </div>
      </section>

      <section class="forecast-section">
        <div class="forecast-top">
          <div class="section-title"><span class="diamond"></span>流量预测</div>
          <div class="tabs">
            <button :class="{ active: activeTab === 'tunnel' }" @click="activeTab = 'tunnel'">江阴靖江长江隧道</button>
            <button :class="{ active: activeTab === 'bridge' }" @click="activeTab = 'bridge'">江阴大桥</button>
          </div>
          <button class="holiday" @click="handleHoliday">节假日预测&gt;</button>
        </div>
        <div class="forecast-chart">
          <div ref="lineRef" class="chart"></div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

defineOptions({ name: 'mv-lite-1786851177092-1aeb102b' })

const activeTab = ref('tunnel')

const tunnelBarRef = ref(null)
const bridgeBarRef = ref(null)
const tunnelPieRef = ref(null)
const bridgePieRef = ref(null)
const lineRef = ref(null)

const hourLabels = ref(['', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
const tunnelBeijing = ref([260, 310, 360, 540, 700, 520, 1780, 620, 2160, 620, 520, 430, 360])
const tunnelShanghai = ref([330, 390, 450, 680, 620, 1120, 1540, 1440, 980, 520, 450, 360, 300])
const bridgeBeijing = ref([260, 330, 360, 610, 720, 1180, 1800, 440, 2180, 520, 470, 390, 330])
const bridgeShanghai = ref([320, 360, 430, 700, 620, 1680, 1260, 1420, 980, 500, 430, 350, 280])
const tunnelPieData = ref([{ value: 22350, name: '客车' }, { value: 16270, name: '货车' }])
const bridgePieData = ref([{ value: 66109, name: '客车' }, { value: 16270, name: '货车' }])
const lineLabels = ref(['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'])
const actualData = ref([560, 2050, 2860, null, null])
const predictTunnelData = ref([420, 2450, 3350, 2240, 720])
const predictBridgeData = ref([620, 2350, 3180, 2350, 820])
const accuracyLabels = ref(['准确率98%', '准确率96%', '准确率92%'])

let charts = []
let observers = []

const gridColor = 'rgba(255,255,255,.36)'
const axisColor = '#303a3e'

function createObserver(el, chart) {
  const observer = new ResizeObserver(() => chart.resize())
  observer.observe(el)
  observers.push(observer)
}

function initChart(el, option) {
  if (!el) return null
  const chart = echarts.init(el)
  chart.setOption(option)
  charts.push(chart)
  createObserver(el, chart)
  return chart
}

function barOption(beijing, shanghai) {
  return {
    animation: false,
    grid: { left: 38, right: 30, top: 22, bottom: 24 },
    xAxis: {
      type: 'category',
      data: hourLabels.value,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(67,82,88,.55)' } },
      axisLabel: { color: axisColor, fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: { color: axisColor, fontSize: 12, padding: [0, 28, 0, 0] },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
      axisLabel: { color: axisColor, fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      { name: '北京方向', type: 'bar', data: beijing.value, barWidth: 5, itemStyle: { color: '#178cff' } },
      { name: '上海方向', type: 'bar', data: shanghai.value, barWidth: 5, itemStyle: { color: '#18d6eb' } }
    ],
    graphic: [
      { type: 'text', left: 38, top: 28, style: { text: '即时流量', fill: '#e99146', font: 'bold 13px sans-serif' } },
      { type: 'text', right: 2, bottom: 14, style: { text: '时', fill: axisColor, font: '12px sans-serif' } }
    ]
  }
}

function pieOption(dataRef) {
  return {
    animation: false,
    series: [{
      type: 'pie',
      radius: ['58%', '78%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      data: dataRef.value,
      itemStyle: { borderWidth: 3, borderColor: '#cfd6d8' },
      color: ['#16a6ff', '#ff9d1e']
    }]
  }
}

function lineOption() {
  const predictData = activeTab.value === 'tunnel' ? predictTunnelData.value : predictBridgeData.value
  return {
    animation: false,
    grid: { left: 38, right: 12, top: 30, bottom: 44 },
    legend: {
      right: 10,
      top: 0,
      itemWidth: 16,
      itemHeight: 8,
      textStyle: { color: axisColor, fontSize: 12 },
      data: ['实际流量', '预测流量']
    },
    xAxis: {
      type: 'category',
      data: lineLabels.value,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(67,82,88,.55)' } },
      axisLabel: { color: axisColor, fontSize: 12, margin: 12 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 4000,
      interval: 1000,
      name: '辆',
      nameTextStyle: { color: axisColor, fontSize: 12, padding: [0, 28, 0, 0] },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
      axisLabel: { color: axisColor, fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        smooth: true,
        data: actualData.value,
        symbol: 'circle',
        symbolSize: 7,
        connectNulls: false,
        lineStyle: { color: '#2b7dff', width: 2 },
        itemStyle: { color: '#2b7dff', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: 'rgba(34,137,255,.26)' }
      },
      {
        name: '预测流量',
        type: 'line',
        smooth: true,
        data: predictData,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: '#25d6d2', width: 2 },
        itemStyle: { color: '#25d6d2', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: 'rgba(37,214,210,.24)' }
      }
    ],
    graphic: accuracyLabels.value.map((text, index) => ({
      type: 'text',
      left: `${15 + index * 22}%`,
      bottom: 2,
      style: { text, fill: '#21d74e', font: 'bold 12px sans-serif' }
    }))
  }
}

function initAllCharts() {
  initChart(tunnelBarRef.value, barOption(tunnelBeijing, tunnelShanghai))
  initChart(bridgeBarRef.value, barOption(bridgeBeijing, bridgeShanghai))
  initChart(tunnelPieRef.value, pieOption(tunnelPieData))
  initChart(bridgePieRef.value, pieOption(bridgePieData))
  initChart(lineRef.value, lineOption())
}

watch(activeTab, () => {
  const lineChart = charts.find(chart => chart.getDom() === lineRef.value)
  lineChart?.setOption(lineOption(), true)
})

function handleSelect() {
  console.log('select 24小时')
}

function handleHoliday() {
  console.log('节假日预测')
}

onMounted(async () => {
  await nextTick()
  requestAnimationFrame(() => initAllCharts())
})

onUnmounted(() => {
  observers.forEach(observer => observer.disconnect())
  charts.forEach(chart => chart.dispose())
  observers = []
  charts = []
})
</script>

<style scoped>
.mv-lite-1786851177092-1aeb102b {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #0b0f11;
  padding: 8px 14px;
  font-family: Arial, "Microsoft YaHei", sans-serif;
  color: #1f2a2e;
}

*, *::before, *::after { box-sizing: border-box; }

.dashboard {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 16px 24px 12px;
  display: flex;
  flex-direction: column;
  background: #aeb7ba;
  box-shadow: inset 0 0 22px rgba(255,255,255,.2), 0 8px 16px rgba(0,0,0,.35);
  overflow: hidden;
}

.page-header { height: 55px; flex: 0 0 55px; }
.page-header h1 {
  margin: 0;
  color: #168bff;
  font-size: 20px;
  font-weight: 800;
  line-height: 28px;
}
.title-line {
  width: 100%;
  height: 7px;
  margin-top: 7px;
  background: linear-gradient(90deg, #168bff 0 2%, rgba(143,208,255,.75) 3% 100%);
  clip-path: polygon(0 50%, 1.6% 0, 3.2% 50%, 100% 50%, 100% 75%, 3.2% 75%, 1.6% 100%, 0 75%);
  opacity: .75;
}

.overview { flex: 0 0 168px; min-height: 0; }
.overview-head, .chart-head, .forecast-top {
  display: flex;
  align-items: center;
}
.overview-head { justify-content: space-between; }
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 22px;
  font-weight: 800;
  white-space: nowrap;
}
.diamond {
  width: 17px;
  height: 17px;
  border: 3px solid #168bff;
  background: #fff;
  transform: rotate(45deg);
  box-shadow: inset 0 0 0 3px #168bff;
}
.select-btn {
  width: 144px;
  height: 44px;
  border: 1px solid #8fd0ff;
  border-radius: 5px;
  background: #edf8ff;
  color: #2c363a;
  font-size: 19px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  box-shadow: 0 0 8px rgba(22,139,255,.35);
  cursor: pointer;
}
.select-btn span { color: #8aa0a8; font-size: 22px; }
.overview-body {
  position: relative;
  height: 114px;
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 120px 1fr;
  align-items: center;
  background: linear-gradient(90deg, rgba(162,197,214,.32), rgba(184,197,200,.05), rgba(162,197,214,.28));
}
.metric { text-align: center; z-index: 2; }
.metric-name { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
.metric-value { font-size: 30px; font-weight: 900; letter-spacing: .5px; }
.blue { color: #098dff; }
.cyan { color: #009cc7; }
.car-glow {
  position: relative;
  width: 112px;
  height: 112px;
  display: grid;
  place-items: center;
}
.halo {
  position: absolute;
  inset: 7px;
  border-radius: 50%;
  background: radial-gradient(circle, #eefbff 0 28%, #7ed8ff 48%, rgba(38,177,255,.12) 70%);
  box-shadow: 0 0 0 8px rgba(28,164,255,.18), 0 0 26px rgba(0,191,255,.55);
}
.car { position: relative; font-size: 40px; filter: hue-rotate(165deg) saturate(1.7); }

.bar-block { flex: 0 0 139px; min-height: 0; }
.bridge-block { flex-basis: 136px; }
.chart-head { height: 26px; justify-content: space-between; }
.sub-title { font-size: 17px; display: flex; align-items: center; gap: 4px; }
.blue-stick { width: 5px; height: 18px; background: linear-gradient(#168bff, transparent); display: inline-block; }
.legend { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.legend i, .tooltip-card i { width: 11px; height: 11px; display: inline-block; border-radius: 2px; margin-right: 4px; }
.legend-blue { background: #178cff; }
.legend-cyan { background: #18d6eb; }
.bar-wrap { position: relative; height: calc(100% - 26px); min-height: 0; }
.chart { width: 100%; height: 100%; }
.tooltip-card {
  position: absolute;
  right: 12px;
  top: 22px;
  width: 146px;
  padding: 9px 10px;
  border: 1px solid #8fd0ff;
  border-radius: 6px;
  background: linear-gradient(135deg, #ecf9ff, #c8edff);
  box-shadow: 0 2px 9px rgba(28,117,180,.45);
  font-size: 14px;
  color: #243136;
}
.tooltip-card b { display: block; font-size: 15px; margin-bottom: 4px; }
.tooltip-card p { margin: 3px 0; white-space: nowrap; }
.tooltip-card strong { color: #168bff; font-size: 18px; }

.vehicle-section { flex: 0 0 150px; min-height: 0; padding-top: 4px; }
.vehicle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; height: 112px; margin-top: 7px; }
.vehicle-card { position: relative; min-width: 0; }
.card-title {
  height: 30px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  line-height: 26px;
  border-bottom: 9px solid transparent;
  border-image: linear-gradient(90deg, transparent, #eaf8ff, #79bfe6, transparent) 1;
}
.triangle {
  width: 0;
  height: 0;
  margin: -2px auto 3px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #168bff;
  opacity: .65;
}
.card-body {
  height: 76px;
  display: grid;
  grid-template-columns: 1fr 62px 1fr;
  align-items: center;
}
.car-type {
  height: 54px;
  padding: 9px 4px;
  border: 1px solid rgba(22,139,255,.28);
  background: linear-gradient(120deg, rgba(80,178,255,.22), rgba(255,255,255,.08));
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0 100%);
}
.car-type.truck {
  border-color: rgba(255,123,37,.28);
  background: linear-gradient(120deg, rgba(255,255,255,.06), rgba(255,141,30,.2));
  clip-path: polygon(0 0, 90% 0, 100% 100%, 10% 100%);
  text-align: right;
}
.car-type span { display: block; font-size: 14px; }
.car-type b { font-size: 22px; line-height: 24px; color: #168bff; }
.truck b { color: #ff6f16; }
.donut-box { position: relative; width: 62px; height: 62px; }
.center-icon { position: absolute; inset: 0; display: grid; place-items: center; font-size: 20px; }

.forecast-section { flex: 1 1 auto; min-height: 0; padding-top: 2px; }
.forecast-top { height: 32px; gap: 8px; }
.tabs { display: flex; gap: 6px; flex: 1; min-width: 0; }
.tabs button {
  height: 27px;
  padding: 0 9px;
  border: 1px solid rgba(59,78,86,.45);
  border-radius: 14px;
  background: rgba(221,227,228,.55);
  color: #253035;
  font-size: 15px;
  white-space: nowrap;
  cursor: pointer;
}
.tabs button.active {
  border-color: #8fd0ff;
  background: #168bff;
  color: #fff;
  box-shadow: 0 0 8px rgba(22,139,255,.45);
}
.holiday {
  border: 0;
  background: transparent;
  color: #168bff;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
}
.forecast-chart { height: calc(100% - 32px); min-height: 0; }

@media (max-width: 380px) {
  .dashboard { padding-left: 18px; padding-right: 18px; }
  .section-title { font-size: 19px; }
  .metric-name { font-size: 17px; }
  .metric-value { font-size: 26px; }
  .tooltip-card { right: 4px; transform: scale(.92); transform-origin: right top; }
  .tabs button { padding: 0 6px; font-size: 13px; }
}
</style>