<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-1785752098305-41f2ffab-root">
      <!-- 1. 当日总流量 -->
      <div class="c-mc-1785752098305-41f2ffab-section">
        <div class="c-mc-1785752098305-41f2ffab-sub-header">
          <div class="c-mc-1785752098305-41f2ffab-title-group">
            <img :src="icon3" class="c-mc-1785752098305-41f2ffab-title-icon" alt="icon" />
            <span class="c-mc-1785752098305-41f2ffab-title-text">当日总流量</span>
          </div>
          <!-- Fixed: 使用 margin-left: auto 右对齐，移除 justify-content: space-between -->
          <div class="c-mc-1785752098305-41f2ffab-select-wrapper">
            <div class="c-mc-1785752098305-41f2ffab-select-trigger" @click="showDropdown = !showDropdown">
              <span>{{ selectedTime }}</span>
              <span class="c-mc-1785752098305-41f2ffab-select-arrow" :class="{ up: showDropdown }"></span>
            </div>
            <div class="c-mc-1785752098305-41f2ffab-select-dropdown" v-show="showDropdown">
              <div 
                v-for="opt in timeOptions" 
                :key="opt" 
                class="c-mc-1785752098305-41f2ffab-select-option" 
                @click="selectTime(opt)"
              >
                {{ opt }}
              </div>
            </div>
          </div>
        </div>
        <div 
          class="c-mc-1785752098305-41f2ffab-stats-row" 
          :style="{ backgroundImage: `url(${bgm_2})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-mc-1785752098305-41f2ffab-stat-item">
            <span class="c-mc-1785752098305-41f2ffab-stat-label">江阴靖江长江隧道</span>
            <span class="c-mc-1785752098305-41f2ffab-stat-value tunnel">34,620</span>
          </div>
          <div class="c-mc-1785752098305-41f2ffab-stat-item">
            <span class="c-mc-1785752098305-41f2ffab-stat-label">江阴大桥</span>
            <span class="c-mc-1785752098305-41f2ffab-stat-value bridge">82,379</span>
          </div>
        </div>
      </div>

      <!-- 2. 江阴靖江长江隧道小时流量 -->
      <div class="c-mc-1785752098305-41f2ffab-section">
        <div class="c-mc-1785752098305-41f2ffab-sub-header">
          <div class="c-mc-1785752098305-41f2ffab-title-group">
            <span class="c-mc-1785752098305-41f2ffab-title-indicator"></span>
            <span class="c-mc-1785752098305-41f2ffab-title-text">江阴靖江长江隧道</span>
          </div>
        </div>
        <div class="c-mc-1785752098305-41f2ffab-chart-wrapper">
          <div ref="chartTunnelRef" class="c-mc-1785752098305-41f2ffab-chart-container"></div>
        </div>
      </div>

      <!-- 3. 江阴大桥小时流量 -->
      <div class="c-mc-1785752098305-41f2ffab-section">
        <div class="c-mc-1785752098305-41f2ffab-sub-header">
          <div class="c-mc-1785752098305-41f2ffab-title-group">
            <span class="c-mc-1785752098305-41f2ffab-title-indicator"></span>
            <span class="c-mc-1785752098305-41f2ffab-title-text">江阴大桥</span>
          </div>
        </div>
        <div class="c-mc-1785752098305-41f2ffab-chart-wrapper">
          <div ref="chartBridgeRef" class="c-mc-1785752098305-41f2ffab-chart-container"></div>
        </div>
      </div>

      <!-- 4. 车型分布 -->
      <div class="c-mc-1785752098305-41f2ffab-section">
        <div class="c-mc-1785752098305-41f2ffab-sub-header">
          <div class="c-mc-1785752098305-41f2ffab-title-group">
            <img :src="icon54" class="c-mc-1785752098305-41f2ffab-title-icon" alt="icon" />
            <span class="c-mc-1785752098305-41f2ffab-title-text">车型分布</span>
          </div>
        </div>
        <div class="c-mc-1785752098305-41f2ffab-vehicle-row">
          <div 
            class="c-mc-1785752098305-41f2ffab-vehicle-card" 
            :style="{ backgroundImage: `url(${bgm_3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
          >
            <div 
              class="c-mc-1785752098305-41f2ffab-vehicle-title" 
              :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
            >
              <span>江阴靖江长江隧道</span>
            </div>
            <div class="c-mc-1785752098305-41f2ffab-vehicle-stats">
              <div class="c-mc-1785752098305-41f2ffab-vehicle-item">
                <span class="c-mc-1785752098305-41f2ffab-vehicle-label">客车</span>
                <span class="c-mc-1785752098305-41f2ffab-vehicle-value passenger">22350</span>
              </div>
              <div class="c-mc-1785752098305-41f2ffab-vehicle-item">
                <span class="c-mc-1785752098305-41f2ffab-vehicle-label">货车</span>
                <span class="c-mc-1785752098305-41f2ffab-vehicle-value freight">16270</span>
              </div>
            </div>
          </div>
          <div 
            class="c-mc-1785752098305-41f2ffab-vehicle-card" 
            :style="{ backgroundImage: `url(${bgm_4})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
          >
            <div 
              class="c-mc-1785752098305-41f2ffab-vehicle-title" 
              :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
            >
              <span>江阴大桥</span>
            </div>
            <div class="c-mc-1785752098305-41f2ffab-vehicle-stats">
              <div class="c-mc-1785752098305-41f2ffab-vehicle-item">
                <span class="c-mc-1785752098305-41f2ffab-vehicle-label">客车</span>
                <span class="c-mc-1785752098305-41f2ffab-vehicle-value passenger">66109</span>
              </div>
              <div class="c-mc-1785752098305-41f2ffab-vehicle-item">
                <span class="c-mc-1785752098305-41f2ffab-vehicle-label">货车</span>
                <span class="c-mc-1785752098305-41f2ffab-vehicle-value freight">16270</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. 流量预测 -->
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
                :class="['c-mc-1785752098305-41f2ffab-tab-item', { active: activePredictTab === tab.value }]"
                @click="activePredictTab = tab.value"
              >
                {{ tab.label }}
              </div>
            </div>
            <span class="c-mc-1785752098305-41f2ffab-holiday-link">节假日预测></span>
          </div>
        </div>
        <div class="c-mc-1785752098305-41f2ffab-chart-wrapper">
          <div ref="chartPredictRef" class="c-mc-1785752098305-41f2ffab-chart-container"></div>
        </div>
        <div class="c-mc-1785752098305-41f2ffab-accuracy-row">
          <span class="c-mc-1785752098305-41f2ffab-accuracy-text">准确率98%</span>
          <span class="c-mc-1785752098305-41f2ffab-accuracy-text">准确率96%</span>
          <span class="c-mc-1785752098305-41f2ffab-accuracy-text">准确率92%</span>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon3 from '../resources/images/icon-3561.png'
import icon54 from '../resources/images/icon-3441.png'
import bg3 from '../resources/images/bg-3475.png'
import bg5 from '../resources/images/bg-3525.png'
import icon57 from '../resources/images/icon-3573.png'
import bgm_2 from '../resources/images/bg-_m-34.png'
import bgm_3 from '../resources/images/bg-_m-36.png'
import bgm_4 from '../resources/images/bg-_m-35.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// Fixed: $mcComponentBuilder 使用 try-catch 包裹
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// 状态管理
const selectedTime = ref('24小时')
const showDropdown = ref(false)
const timeOptions = ref(['24小时', '12小时', '6小时'])
const activePredictTab = ref('tunnel')
const predictTabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])

// 图表 refs
const chartTunnelRef = ref(null)
const chartBridgeRef = ref(null)
const chartPredictRef = ref(null)

let chartTunnel = null
let chartBridge = null
let chartPredict = null
const observers = []

// Mock 数据
const tunnelData = {
  '24小时': { beijing: [100, 200, 300, 400, 500, 600, 500, 400, 300, 200, 100, 50], shanghai: [150, 250, 350, 450, 550, 650, 550, 450, 350, 250, 150, 100] },
  '12小时': { beijing: [100, 200, 300, 400, 500, 600], shanghai: [150, 250, 350, 450, 550, 650] },
  '6小时': { beijing: [100, 200, 300], shanghai: [150, 250, 350] }
}
const bridgeData = {
  '24小时': { beijing: [200, 300, 400, 500, 600, 700, 600, 500, 400, 300, 200, 100], shanghai: [250, 350, 450, 550, 650, 750, 650, 550, 450, 350, 250, 150] },
  '12小时': { beijing: [200, 300, 400, 500, 600, 700], shanghai: [250, 350, 450, 550, 650, 750] },
  '6小时': { beijing: [200, 300, 400], shanghai: [250, 350, 450] }
}
const predictData = {
  tunnel: { actual: [300, 400, 500, 600, 550], predict: [320, 420, 520, 620, 580] },
  bridge: { actual: [400, 500, 600, 700, 650], predict: [420, 520, 620, 720, 680] }
}

const selectTime = (val) => {
  selectedTime.value = val
  showDropdown.value = false
}

// 图表更新逻辑
const updateBarChart = (chart, data) => {
  if (!chart) return
  const hours = data.beijing.map((_, i) => `${i * 2}`)
  // Fixed: 强制包含 tooltip 配置
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['北京方向', '上海方向'], top: 0, right: 0, textStyle: { color: '#333', fontSize: 12 } },
    grid: { left: 40, right: 16, top: 30, bottom: 20, containLabel: true },
    xAxis: { type: 'category', data: hours, axisLine: { lineStyle: { color: '#ccc' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#eee' } }, axisLabel: { color: '#666' } },
    series: [
      { name: '北京方向', type: 'bar', data: data.beijing, itemStyle: { color: '#1890ff' }, barWidth: 8 },
      { name: '上海方向', type: 'bar', data: data.shanghai, itemStyle: { color: '#69c0ff' }, barWidth: 8 }
    ]
  }, true)
}

const updateLineChart = (chart, data) => {
  if (!chart) return
  const times = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']
  // Fixed: 强制包含 tooltip 配置
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

// 初始化图表实例
const initChartInstance = (refEl, updateFn) => {
  if (!refEl) return null
  const { clientWidth, clientHeight } = refEl
  if (clientWidth > 0 && clientHeight > 0) {
    const c = echarts.init(refEl)
    updateFn(c)
    const observer = new ResizeObserver(() => c.resize())
    observer.observe(refEl)
    observers.push(observer)
    return c
  }
  return null
}

// Fixed: Select 和 Tab 切换必须实现数据联动
watch(selectedTime, () => {
  updateBarChart(chartTunnel, tunnelData[selectedTime.value])
  updateBarChart(chartBridge, bridgeData[selectedTime.value])
})

watch(activePredictTab, () => {
  updateLineChart(chartPredict, predictData[activePredictTab.value])
})

// Fixed: 使用 watch 监听 ref 变化处理 DOM 重建
watch(chartTunnelRef, (newRef) => {
  if (newRef && !chartTunnel) {
    chartTunnel = initChartInstance(newRef, (c) => updateBarChart(c, tunnelData[selectedTime.value]))
  }
})

watch(chartBridgeRef, (newRef) => {
  if (newRef && !chartBridge) {
    chartBridge = initChartInstance(newRef, (c) => updateBarChart(c, bridgeData[selectedTime.value]))
  }
})

watch(chartPredictRef, (newRef) => {
  if (newRef && !chartPredict) {
    chartPredict = initChartInstance(newRef, (c) => updateLineChart(c, predictData[activePredictTab.value]))
  }
})

onMounted(() => {
  // Fixed: 触发 onload 事件
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785752098305-41f2ffab-onload', {
      componentId: 'mc-1785752098305-41f2ffab',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  chartTunnel?.dispose()
  chartBridge?.dispose()
  chartPredict?.dispose()
  observers.forEach(o => o.disconnect())
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>