<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor">
      <!-- Header -->
      <div class="c-env-header">
        <img :src="icon1" class="header-icon" alt="icon" />
        <span class="header-title">环境监测</span>
      </div>
      
      <!-- Content -->
      <div class="c-env-content">
        <!-- Sub Title / Tabs -->
        <div class="c-env-sub-t">
          <div class="tabs-list">
            <div 
              v-for="tab in tabs" 
              :key="tab" 
              class="tab-item" 
              :class="{ active: activeTab === tab }"
              @click="activeTab = tab"
            >
              {{ tab }}
            </div>
          </div>
          <div class="tabs-right">
            <div class="icon-btn">
              <img :src="icon2" alt="chart" />
            </div>
            <div class="icon-btn">
              <img :src="icon2" alt="list" />
              <div class="badge">6</div>
            </div>
          </div>
        </div>
        
        <!-- Chart -->
        <div class="c-env-chart">
          <div ref="chartRef" class="chart-instance"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import * as echarts from 'echarts'
import icon1 from '../resources/images/g-7883.png'
import icon2 from '../resources/images/tabs-icon-43.png'

import { ref, onMounted, onUnmounted, nextTick } from 'vue'

// 系统自动注入的资源变量
const icon1Res = (typeof window !== 'undefined' && window.icon1) || icon1
const icon2Res = (typeof window !== 'undefined' && window.icon2) || icon2

// $mcComponentBuilder 初始化
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 失败:', e)
}

// Tab 数据
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强']
const activeTab = ref('一氧化碳')

// 图表实例
const chartRef = ref(null)
let chartInstance = null

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    grid: {
      top: 30,
      right: 20,
      bottom: 30,
      left: 40
    },
    legend: {
      show: true,
      right: 10,
      top: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: 'rgb(51, 51, 51)',
        /* [Style Refine] typography.fontSize -> 9.6 */
        fontSize: 9.6
      },
      data: ['zk3+785CO浓度']
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      /* [Style Refine] typography.fontSize -> 12 */
      axisLabel: { color: 'rgb(51, 51, 51)', fontSize: 12 },
      name: '时',
      nameTextStyle: { color: 'rgb(102, 102, 102)', fontSize: 10, padding: [0, 0, 0, -10] }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      /* [Style Refine] typography.fontSize -> 12 */
      axisLabel: { color: 'rgb(51, 51, 51)', fontSize: 12 },
      /* [Style Refine] strokes.strokeWeight -> 0.8 */
      splitLine: { lineStyle: { color: 'rgba(189, 212, 231, 1)', type: 'dashed', width: 0.8 } },
      name: '辆',
      nameTextStyle: { color: 'rgb(102, 102, 102)', fontSize: 10 }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgb(15, 205, 125)',
          width: 1
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
              { offset: 1, color: 'rgba(15, 205, 125, 0)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: 'rgb(211, 47, 47)',
            type: 'dashed',
            /* [Style Refine] strokes.strokeWeight -> 0.8 */
            width: 0.8
          },
          label: {
            formatter: '预警线',
            color: 'rgb(211, 47, 47)',
            /* [Style Refine] typography.fontSize -> 12 */
            fontSize: 12,
            position: 'end'
          },
          data: [
            { yAxis: 30 }
          ]
        },
        // 静态示例数据，符合 Y 轴 0-40 范围
        data: [12, 18, 15, 25, 22, 32, 28, 19, 24, 16, 14, 10] 
      }
    ]
  }
  
  chartInstance.setOption(option)
}

// 生命周期
onMounted(() => {
  nextTick(() => {
    initChart()
  })
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1786072596911-a2f6d560-onload', {
      componentId: 'mc-max-1786072596911-a2f6d560',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>