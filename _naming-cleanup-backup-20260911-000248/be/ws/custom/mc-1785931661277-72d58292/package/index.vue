<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1785931427277-447daf34-container">
      <!-- [Layout Refine] Header section - Figma header GROUP -->
      <div class="c-mc-max-1785931427277-447daf34-header">
        <img :src="icon1" class="c-mc-max-1785931427277-447daf34-title-icon" />
        <span class="c-mc-max-1785931427277-447daf34-title-text">环境监测</span>
      </div>
      
      <!-- [Layout Refine] Content area - Figma slot-con FRAME -->
      <div class="c-mc-max-1785931427277-447daf34-content">
        <!-- [Layout Refine] Tab bar - Figma sub-t FRAME -->
        <div class="c-mc-max-1785931427277-447daf34-tab-bar">
          <!-- [Layout Refine] Tabs list - Figma tabs-list GROUP -->
          <div class="c-mc-max-1785931427277-447daf34-tabs-list">
            <div 
              v-for="(tab, index) in tabs" 
              :key="index"
              :class="['c-mc-max-1785931427277-447daf34-tab-item', { active: activeTab === index }]"
              @click="activeTab = index"
            >
              {{ tab }}
            </div>
          </div>
          
          <!-- [Layout Refine] Right icons - Figma tabs-icon FRAME -->
          <div class="c-mc-max-1785931427277-447daf34-tab-icons">
            <!-- [Layout Refine] Chart icon - Figma icon GROUP: 24x24 -->
            <div class="c-mc-max-1785931427277-447daf34-icon-btn">
              <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 14h12v1H2v-1zm1-3h2v3H3v-3zm3-2h2v5H6V9zm3-3h2v8H9V6zm3-4h2v12h-2V2z"/>
              </svg>
              <!-- [Layout Refine] Badge - Figma num GROUP: 14x14 -->
              <div class="c-mc-max-1785931427277-447daf34-badge">
                <span class="c-mc-max-1785931427277-447daf34-badge-text">6</span>
              </div>
            </div>
            <!-- [Layout Refine] List icon - Figma icon GROUP: 24x24 -->
            <div class="c-mc-max-1785931427277-447daf34-icon-btn">
              <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 3h12v1.5H2V3zm0 4h12v1.5H2V7zm0 4h12v1.5H2V11z"/>
              </svg>
            </div>
          </div>
        </div>
        
        <!-- [Layout Refine] Chart area - Figma @echarts/line GROUP -->
        <div class="c-mc-max-1785931427277-447daf34-chart-area">
          <div ref="chartRef" class="c-mc-max-1785931427277-447daf34-chart"></div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import * as echarts from 'echarts'
import icon1 from '../resources/images/g-7883.png'

const chartRef = ref(null)
let chartInstance = null

const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强']
const activeTab = ref(0)

const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    grid: {
      top: 30,
      right: 20,
      bottom: 25,
      left: 35
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: {
        lineStyle: {
          color: 'rgb(189, 212, 232)'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: 'rgb(51, 51, 51)',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      name: '时',
      nameTextStyle: {
        color: 'rgb(102, 102, 102)',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        align: 'right'
      },
      nameLocation: 'end'
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgb(189, 212, 232)',
          type: 'solid'
        }
      },
      axisLabel: {
        color: 'rgb(51, 51, 51)',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      name: '',
      nameTextStyle: {
        color: 'rgb(102, 102, 102)',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: [5, 8, 12, 18, 25, 30, 28, 22, 15, 10, 8, 6],
        lineStyle: {
          color: 'rgb(15, 205, 125)',
          width: 1
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        }
      },
      {
        name: '预警线',
        type: 'line',
        symbol: 'none',
        data: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        lineStyle: {
          color: 'rgb(211, 47, 47)',
          type: 'dashed',
          width: 1
        }
      }
    ],
    legend: {
      show: true,
      top: 5,
      right: 10,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: 'rgb(51, 51, 51)',
        fontSize: 10,
        fontFamily: 'Source Han Sans CN'
      },
      data: [
        {
          name: 'zk3+785CO浓度',
          itemStyle: {
            color: 'rgb(15, 205, 125)'
          }
        }
      ]
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderColor: 'rgb(200, 200, 200)',
      textStyle: {
        color: 'rgb(51, 51, 51)'
      }
    }
  }
  
  chartInstance.setOption(option)
}

const handleResize = () => {
  chartInstance?.resize()
}

onMounted(() => {
  nextTick(() => {
    initChart()
  })
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})

watch(activeTab, () => {
  // Tab切换逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>