<template>
  <div class="env-monitor-container">
    <!-- 标题与工具栏区域 -->
    <div class="header-section">
      <h1 class="page-title">环境监测</h1>
      
      <div class="toolbar-row">
        <!-- 标签导航 -->
        <div class="tab-navigation">
          <div 
            v-for="(tab, index) in tabs" 
            :key="tab"
            :class="['tab-item', { active: activeTab === index }]"
            @click="activeTab = index"
          >
            {{ tab }}
          </div>
        </div>
        
        <!-- 右侧工具栏 -->
        <div class="action-buttons">
          <button class="icon-btn chart-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h4v8H3v-8zm6-6h4v14H9V7zm6 3h4v11h-4V10z"/>
            </svg>
          </button>
          <button class="icon-btn list-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
            </svg>
            <span class="badge">6</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- 图表主区域 -->
    <div class="chart-wrapper">
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

// 标签数据
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强']
const activeTab = ref(0)

// 图表数据（基于截图模拟）
const chartData = ref([5, 7, 6, 4, 3, 2, 3, 5, 10, 13, 13, 12, 8, 3, 1])
const timeLabels = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

// 图表引用
const chartRef = ref(null)
let chart = null
let resizeObserver = null

// 初始化图表
const initChart = () => {
  if (!chartRef.value || chart) return
  
  const container = chartRef.value
  if (container.clientWidth === 0 || container.clientHeight === 0) return
  
  chart = echarts.init(container)
  
  const option = {
    backgroundColor: 'transparent',
    grid: {
      top: 50,
      right: 60,
      bottom: 40,
      left: 55,
      containLabel: false
    },
    legend: {
      show: true,
      right: 20,
      top: 10,
      itemWidth: 25,
      itemHeight: 3,
      icon: 'roundRect',
      textStyle: {
        color: '#666',
        fontSize: 12
      },
      data: [{
        name: 'zk3+785CO浓度',
        icon: 'roundRect',
        itemStyle: { color: '#52C41A' }
      }]
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: {
        lineStyle: { color: '#E0E6ED' }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#666',
        fontSize: 12,
        margin: 10
      },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#999',
        padding: [0, 0, 0, 10]
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      splitLine: {
        lineStyle: {
          color: '#E0E6ED',
          type: 'dashed'
        }
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#666',
        fontSize: 12
      },
      name: '辆',
      nameLocation: 'start',
      nameTextStyle: {
        color: '#999',
        padding: [10, 0, 0, 35]
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#52C41A',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82, 196, 26, 0.4)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
          ])
        },
        data: chartData.value,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#FF4D4F',
            type: 'dashed',
            width: 1.5
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#FF4D4F',
            fontSize: 13,
            fontWeight: 500,
            offset: [15, 0]
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  }
  
  chart.setOption(option)
}

// ResizeObserver 监听
const setupResizeObserver = () => {
  if (!chartRef.value) return
  
  resizeObserver = new ResizeObserver(() => {
    if (chart && chartRef.value) {
      if (chartRef.value.clientWidth > 0 && chartRef.value.clientHeight > 0) {
        chart.resize()
      }
    }
  })
  
  resizeObserver.observe(chartRef.value)
}

onMounted(() => {
  // 使用 requestAnimationFrame 确保 DOM 渲染完成
  requestAnimationFrame(() => {
    initChart()
    setupResizeObserver()
  })
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<style scoped>
.env-monitor-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #F5F7FA;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.header-section {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.page-title {
  font-size: 22px;
  font-weight: 600;
  color: #3B9EFF;
  margin: 0 0 12px 0;
  letter-spacing: 1px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.tab-navigation {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.tab-item {
  padding: 6px 20px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  white-space: nowrap;
  border: 1.5px solid transparent;
  clip-path: polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%);
  background: linear-gradient(#fff, #fff) padding-box,
              linear-gradient(135deg, #89CFF0 0%, #B8E0F7 100%) border-box;
  color: #3B9EFF;
}

.tab-item.active {
  background: linear-gradient(135deg, #3B9EFF 0%, #5BA8F5 100%);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(59, 158, 255, 0.3);
  border: none;
}

.tab-item:hover:not(.active) {
  background: linear-gradient(#f0f7ff, #f0f7ff) padding-box,
              linear-gradient(135deg, #3B9EFF 0%, #5BA8F5 100%) border-box;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s ease;
}

.chart-btn {
  background-color: #E6F2FF;
  color: #3B9EFF;
}

.chart-btn:hover {
  background-color: #D6EBFF;
}

.list-btn {
  background-color: #3B9EFF;
  color: #ffffff;
}

.list-btn:hover {
  background-color: #2E8FEF;
}

.icon-btn svg {
  width: 20px;
  height: 20px;
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background-color: #FF4D4F;
  color: white;
  font-size: 11px;
  font-weight: 600;
  min-width: 17px;
  height: 17px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 2px solid #F5F7FA;
  line-height: 1;
}

.chart-wrapper {
  flex: 1;
  min-height: 0;
  background-color: #FFFFFF;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>