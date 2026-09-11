<template>
  <div class="c-vehicle-distribution-root">
    <div class="c-sub-header" style="width: 100%;">
      <div class="c-sub-header-title-group">
        <img :src="icon3" class="c-sub-header-icon" />
        <span class="c-sub-header-title">车型分布</span>
      </div>
    </div>
    
    <div class="c-vehicle-distribution-cards">
      <div 
        v-for="(item, index) in distributionData" 
        :key="index" 
        class="c-vehicle-distribution-card"
      >
        <div 
          class="c-vehicle-distribution-card-bg"
          :style="{ backgroundImage: `url(${item.bg})` }"
        ></div>
        
        <div class="c-vehicle-distribution-title-wrapper">
          <div 
            class="c-vehicle-distribution-title-bg"
            :style="{ backgroundImage: `url(${item.titleBg})` }"
          ></div>
          <span class="c-vehicle-distribution-title-text">{{ item.name }}</span>
        </div>

        <div class="c-vehicle-distribution-content">
          <div class="c-vehicle-distribution-stats">
            <div class="c-vehicle-distribution-stat-item">
              <span class="c-vehicle-distribution-stat-label">{{ item.stats[0].label }}</span>
              <span class="c-vehicle-distribution-stat-value" :style="{ color: item.stats[0].color }">{{ item.stats[0].value }}</span>
            </div>
            
            <img :src="icon5" class="c-vehicle-distribution-divider-icon" />
            
            <div class="c-vehicle-distribution-stat-item">
              <span class="c-vehicle-distribution-stat-label">{{ item.stats[1].label }}</span>
              <span class="c-vehicle-distribution-stat-value" :style="{ color: item.stats[1].color }">{{ item.stats[1].value }}</span>
            </div>
          </div>
          
          <div class="c-vehicle-distribution-chart-wrapper">
            <div :ref="el => setChartRef(el, index)" class="c-vehicle-distribution-chart"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import icon5 from '../../resources/images/icon-3573.png'
import bg3 from '../../resources/images/bg-3475.png'
import bg5 from '../../resources/images/bg-3525.png'
import bgm_3 from '../../resources/images/bg-_m-36.png'
import bgm_4 from '../../resources/images/bg-_m-35.png'

import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

/* [Data Refine] 使用 Figma 真实数据 */
const distributionData = ref([
  {
    name: '江阴靖江长江隧道',
    bg: bgm_3,
    titleBg: bg3,
    stats: [
      { label: '客车', value: '22350', color: '#1990ff' },
      { label: '货车', value: '16270', color: '#fa8c16' }
    ],
    chartData: [
      { value: 22350, name: '客车', itemStyle: { color: '#1990ff' } },
      { value: 16270, name: '货车', itemStyle: { color: '#fa8c16' } }
    ]
  },
  {
    name: '江阴大桥',
    bg: bgm_4,
    titleBg: bg5,
    stats: [
      { label: '客车', value: '66109', color: '#1990ff' },
      { label: '货车', value: '16270', color: '#fa8c16' }
    ],
    chartData: [
      { value: 66109, name: '客车', itemStyle: { color: '#1990ff' } },
      { value: 16270, name: '货车', itemStyle: { color: '#fa8c16' } }
    ]
  }
])

const chartInstances = ref([])
const chartElements = ref([])
let resizeObserver = null

const setChartRef = (el, index) => {
  if (el) {
    chartElements.value[index] = el
    if (!chartInstances.value[index]) {
      initSingleChart(el, index)
    }
  }
}

const initSingleChart = (el, index) => {
  const chart = echarts.init(el)
  const item = distributionData.value[index]
  
  chart.setOption({
    tooltip: { trigger: 'item', show: false },
    series: [
      {
        type: 'pie',
        radius: ['60%', '80%'],
        center: ['50%', '50%'],
        data: item.chartData,
        label: { show: false },
        emphasis: { scaleSize: 2 },
        animation: false
      },
      {
        type: 'pie',
        radius: ['40%', '50%'],
        center: ['50%', '50%'],
        data: [{ value: 1, itemStyle: { color: 'rgba(25, 144, 255, 0.2)' } }],
        label: { show: false },
        silent: true,
        animation: false
      }
    ]
  })
  
  chartInstances.value[index] = chart
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    chartInstances.value.forEach(c => c?.resize())
  })
  
  chartElements.value.forEach(el => {
    if (el) resizeObserver.observe(el)
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chartInstances.value.forEach(c => c?.dispose())
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-vehicle-distribution-root {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.c-vehicle-distribution-cards {
  display: flex;
  gap: 3px;
  width: 100%;
}
</style>