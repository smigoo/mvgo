<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <!-- Fixed: 添加装饰图标 -->
      <div class="c-mc-1785568049021-62e3f812-title-icon"></div>
    </template>
    
    <!-- 业务内容放在默认插槽 -->
    <div class="c-mc-1785568049021-62e3f812-content">
      <!-- Section 1: 当日总流量 -->
      <div class="c-mc-1785568049021-62e3f812-section">
        <div class="c-mc-1785568049021-62e3f812-sub-header">
          <div class="c-mc-1785568049021-62e3f812-title-group">
            <div class="c-mc-1785568049021-62e3f812-section-icon"></div>
            <span class="c-mc-1785568049021-62e3f812-section-title">1当日总流量2222111112</span>
          </div>
          <div class="c-mc-1785568049021-62e3f812-select">
            <span>24小时</span>
          </div>
        </div>
        
        <!-- Stats Row with background -->
        <div class="c-mc-1785568049021-62e3f812-stats-row" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
          <!-- Stat Item 1: 江阴靖江长江隧道 -->
          <div class="c-mc-1785568049021-62e3f812-stat-item">
            <span class="c-mc-1785568049021-62e3f812-stat-label">江阴靖江长江隧道</span>
            <span class="c-mc-1785568049021-62e3f812-stat-value-main">34,620</span>
          </div>
          
          <!-- Car Icon -->
          <img :src="icon3" alt="汽车图标" class="c-mc-1785568049021-62e3f812-car-icon" />
          
          <!-- Stat Item 2: 江阴大桥 -->
          <div class="c-mc-1785568049021-62e3f812-stat-item">
            <span class="c-mc-1785568049021-62e3f812-stat-label">江阴大桥</span>
            <span class="c-mc-1785568049021-62e3f812-stat-value-tunnel">82,379</span>
          </div>
        </div>
        
        <!-- Chart 1: 江阴靖江长江隧道 -->
        <div class="c-mc-1785568049021-62e3f812-chart-wrapper">
          <div class="c-mc-1785568049021-62e3f812-chart-title-row">
            <div class="c-mc-1785568049021-62e3f812-chart-title-icon"></div>
            <span class="c-mc-1785568049021-62e3f812-chart-title">江阴靖江长江隧道</span>
          </div>
          <div ref="chart1Ref" class="c-mc-1785568049021-62e3f812-chart-container"></div>
        </div>
        
        <!-- Chart 2: 江阴大桥 -->
        <div class="c-mc-1785568049021-62e3f812-chart-wrapper">
          <div class="c-mc-1785568049021-62e3f812-chart-title-row">
            <div class="c-mc-1785568049021-62e3f812-chart-title-icon"></div>
            <span class="c-mc-1785568049021-62e3f812-chart-title">江阴大桥</span>
          </div>
          <div ref="chart2Ref" class="c-mc-1785568049021-62e3f812-chart-container"></div>
        </div>
      </div>
      
      <!-- Section 2: 车型分布 -->
      <div class="c-mc-1785568049021-62e3f812-section">
        <div class="c-mc-1785568049021-62e3f812-sub-header">
          <div class="c-mc-1785568049021-62e3f812-title-group">
            <img :src="icon2" alt="车型分布图标" class="c-mc-1785568049021-62e3f812-section-icon-img" />
            <span class="c-mc-1785568049021-62e3f812-section-title">车型分布</span>
          </div>
        </div>
        
        <div class="c-mc-1785568049021-62e3f812-distribution-row">
          <!-- Distribution Card 1: 江阴靖江长江隧道 -->
          <div class="c-mc-1785568049021-62e3f812-distribution-card">
            <div class="c-mc-1785568049021-62e3f812-stat-box-left">
              <span class="c-mc-1785568049021-62e3f812-stat-box-label">客车</span>
              <span class="c-mc-1785568049021-62e3f812-stat-box-value-blue">22350</span>
            </div>
            <img :src="icon23" alt="仪表盘图标" class="c-mc-1785568049021-62e3f812-dashboard-icon" />
            <div class="c-mc-1785568049021-62e3f812-stat-box-right">
              <span class="c-mc-1785568049021-62e3f812-stat-box-label">货车</span>
              <span class="c-mc-1785568049021-62e3f812-stat-box-value-orange">16270</span>
            </div>
          </div>
          
          <!-- Distribution Card 2: 江阴大桥 -->
          <div class="c-mc-1785568049021-62e3f812-distribution-card">
            <div class="c-mc-1785568049021-62e3f812-stat-box-left">
              <span class="c-mc-1785568049021-62e3f812-stat-box-label">客车</span>
              <span class="c-mc-1785568049021-62e3f812-stat-box-value-blue">66109</span>
            </div>
            <img :src="icon23" alt="仪表盘图标" class="c-mc-1785568049021-62e3f812-dashboard-icon" />
            <div class="c-mc-1785568049021-62e3f812-stat-box-right">
              <span class="c-mc-1785568049021-62e3f812-stat-box-label">货车</span>
              <span class="c-mc-1785568049021-62e3f812-stat-box-value-orange">16270</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Section 3: 流量预测 -->
      <div class="c-mc-1785568049021-62e3f812-section">
        <div class="c-mc-1785568049021-62e3f812-sub-header">
          <div class="c-mc-1785568049021-62e3f812-title-group">
            <div class="c-mc-1785568049021-62e3f812-section-icon"></div>
            <span class="c-mc-1785568049021-62e3f812-section-title">流量预测</span>
          </div>
          <div class="c-mc-1785568049021-62e3f812-tabs">
            <div class="c-mc-1785568049021-62e3f812-tab-active">江阴靖江长江隧道</div>
            <div class="c-mc-1785568049021-62e3f812-tab">江阴大桥</div>
          </div>
          <div class="c-mc-1785568049021-62e3f812-link">节假日预测&gt;</div>
        </div>
        
        <!-- Chart 3: 流量预测 -->
        <div class="c-mc-1785568049021-62e3f812-chart-wrapper">
          <div ref="chart3Ref" class="c-mc-1785568049021-62e3f812-chart-container"></div>
          <div class="c-mc-1785568049021-62e3f812-chart-footer">
            <span class="c-mc-1785568049021-62e3f812-accuracy-text">准确率98%</span>
            <span class="c-mc-1785568049021-62e3f812-accuracy-text">准确率96%</span>
            <span class="c-mc-1785568049021-62e3f812-accuracy-text">准确率92%</span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'
import icon3 from '../resources/images/Group_2136636847-7493.png'
import icon2 from '../resources/images/icon-3561.png'
import icon23 from '../resources/images/Group_2136637486-3639.png'

import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// Fixed: 使用 try-catch 包裹 $mcComponentBuilder
let runtimeBuilder = null
try {
  const builder = typeof window !== 'undefined' && window.$mcComponentBuilder ? window.$mcComponentBuilder({
    componentId: 'mc-1785568049021-62e3f812',
    componentProps: {},
    componentName: '流量监测'
  }) : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[流量监测] $mcComponentBuilder 失败:', e)
}

// Chart refs
const chart1Ref = ref(null)
const chart2Ref = ref(null)
const chart3Ref = ref(null)

let chart1 = null
let chart2 = null
let chart3 = null
let chart1Observer = null
let chart2Observer = null
let chart3Observer = null

// Fixed: 实现 ECharts 图表初始化逻辑
const initChart1 = () => {
  if (!chart1Ref.value) return
  const { clientWidth, clientHeight } = chart1Ref.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart1 = echarts.init(chart1Ref.value)
    updateChart1()
    return
  }
  chart1Observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart1) {
      chart1Observer?.disconnect()
      chart1 = echarts.init(chart1Ref.value)
      updateChart1()
    }
  })
  chart1Observer.observe(chart1Ref.value)
}

const updateChart1 = () => {
  if (!chart1) return
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>{a0}: {c0} 辆<br/>{a1}: {c1} 辆'
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      textStyle: { color: '#666', fontSize: 12 }
    },
    grid: {
      left: '3%',
      right: '3%',
      bottom: '10%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLabel: { color: '#999', fontSize: 10 },
      axisLine: { lineStyle: { color: '#ddd' } }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      axisLabel: { color: '#999', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: [120, 200, 150, 80, 70, 110, 130, 825, 900, 600, 400, 200],
        itemStyle: { color: '#1990ff', borderRadius: [2, 2, 0, 0] },
        barWidth: '30%'
      },
      {
        name: '上海方向',
        type: 'bar',
        data: [100, 180, 140, 90, 80, 120, 140, 831, 850, 550, 380, 180],
        itemStyle: { color: '#00bcd4', borderRadius: [2, 2, 0, 0] },
        barWidth: '30%'
      }
    ]
  }
  chart1.setOption(option, true)
}

const initChart2 = () => {
  if (!chart2Ref.value) return
  const { clientWidth, clientHeight } = chart2Ref.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart2 = echarts.init(chart2Ref.value)
    updateChart2()
    return
  }
  chart2Observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart2) {
      chart2Observer?.disconnect()
      chart2 = echarts.init(chart2Ref.value)
      updateChart2()
    }
  })
  chart2Observer.observe(chart2Ref.value)
}

const updateChart2 = () => {
  if (!chart2) return
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>{a0}: {c0} 辆<br/>{a1}: {c1} 辆'
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      textStyle: { color: '#666', fontSize: 12 }
    },
    grid: {
      left: '3%',
      right: '3%',
      bottom: '10%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLabel: { color: '#999', fontSize: 10 },
      axisLine: { lineStyle: { color: '#ddd' } }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      axisLabel: { color: '#999', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: [150, 250, 180, 100, 90, 140, 160, 950, 1050, 700, 500, 250],
        itemStyle: { color: '#1990ff', borderRadius: [2, 2, 0, 0] },
        barWidth: '30%'
      },
      {
        name: '上海方向',
        type: 'bar',
        data: [130, 230, 170, 110, 100, 150, 170, 980, 1000, 650, 480, 230],
        itemStyle: { color: '#00bcd4', borderRadius: [2, 2, 0, 0] },
        barWidth: '30%'
      }
    ]
  }
  chart2.setOption(option, true)
}

const initChart3 = () => {
  if (!chart3Ref.value) return
  const { clientWidth, clientHeight } = chart3Ref.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart3 = echarts.init(chart3Ref.value)
    updateChart3()
    return
  }
  chart3Observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && !chart3) {
      chart3Observer?.disconnect()
      chart3 = echarts.init(chart3Ref.value)
      updateChart3()
    }
  })
  chart3Observer.observe(chart3Ref.value)
}

const updateChart3 = () => {
  if (!chart3) return
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      textStyle: { color: '#666', fontSize: 12 }
    },
    grid: {
      left: '3%',
      right: '3%',
      bottom: '10%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
      axisLabel: { color: '#999', fontSize: 10 },
      axisLine: { lineStyle: { color: '#ddd' } }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      axisLabel: { color: '#999', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: [2800, 3200, 3500, null, null],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#1990ff' },
        lineStyle: { width: 2, color: '#1990ff' }
      },
      {
        name: '预测流量',
        type: 'line',
        data: [null, null, 3500, 3800, 3600],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#00bcd4' },
        lineStyle: { width: 2, color: '#00bcd4' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 188, 212, 0.3)' },
              { offset: 1, color: 'rgba(0, 188, 212, 0.05)' }
            ]
          }
        }
      }
    ]
  }
  chart3.setOption(option, true)
}

// Fixed: 使用 watch 处理 base-panel 渲染过程中销毁并重建 slot DOM 的场景
watch(chart1Ref, (newRef) => {
  if (newRef && !chart1) initChart1()
})

watch(chart2Ref, (newRef) => {
  if (newRef && !chart2) initChart2()
})

watch(chart3Ref, (newRef) => {
  if (newRef && !chart3) initChart3()
})

const handleResize = () => {
  chart1?.resize()
  chart2?.resize()
  chart3?.resize()
}

onMounted(() => {
  initChart1()
  initChart2()
  initChart3()
  window.addEventListener('resize', handleResize)
  
  // Fixed: 触发 onload 事件
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785568049021-62e3f812-onload', {
      componentId: 'mc-1785568049021-62e3f812',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart1?.dispose()
  chart2?.dispose()
  chart3?.dispose()
  chart1Observer?.disconnect()
  chart2Observer?.disconnect()
  chart3Observer?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>